#!/usr/bin/env bash
# gate.sh — Gate adversarial acumulativo (variante headless / CI)
# Ejecuta el panel de agentes de la fase, consolida hallazgos y devuelve exit 0/1
# según el nº de BLOQUEANTES. Patrón Módulo 8 (claude -p --output-format json).
#
# Uso:
#   scripts/gate.sh --phase G1|G2|G3 --feature-dir specs/NNN-feature [--reports-dir specs/NNN-feature/gates]
#
# Requisitos: claude, jq
set -euo pipefail

PHASE=""
FEATURE_DIR=""
REPORTS_DIR=""   # por defecto: <feature-dir>/gates (co-localizado con la feature)

while [[ $# -gt 0 ]]; do
  case "$1" in
    --phase) PHASE="$2"; shift 2 ;;
    --feature-dir) FEATURE_DIR="$2"; shift 2 ;;
    --reports-dir) REPORTS_DIR="$2"; shift 2 ;;
    *) echo "Argumento desconocido: $1" >&2; exit 2 ;;
  esac
done

command -v claude >/dev/null || { echo "ERROR: 'claude' no está en PATH" >&2; exit 2; }
command -v jq >/dev/null || { echo "ERROR: 'jq' no está en PATH" >&2; exit 2; }
[[ -n "$PHASE" && -n "$FEATURE_DIR" ]] || { echo "ERROR: --phase y --feature-dir son obligatorios" >&2; exit 2; }
[[ -d "$FEATURE_DIR" ]] || { echo "ERROR: no existe $FEATURE_DIR" >&2; exit 2; }
[[ -z "$REPORTS_DIR" ]] && REPORTS_DIR="$FEATURE_DIR/gates"

AGENTS_DIR=".claude/agents"

# Panel FOCALIZADO por fase (cada gate revisa el DELTA de su fase, no re-ataca todo).
# G1 = calidad de spec (generalista); G2 = consistencia cruzada + seguridad del diseño;
# G3 = implementación vs spec + seguridad del código + consistencia. Los residuales ya
# dispuestos se siembran (dispositioned.md) para que el panel no los re-levante.
case "$PHASE" in
  G1) AGENTS=(revisor-cinico auditor-spec-theater revisor-rbac-seguridad) ;;
  G2) AGENTS=(revisor-consistencia revisor-rbac-seguridad) ;;
  G3) AGENTS=(revisor-implementacion revisor-rbac-seguridad revisor-consistencia) ;;
  *) echo "ERROR: phase debe ser G1|G2|G3" >&2; exit 2 ;;
esac

# Artefactos a revisar según la fase
gather_artifacts() {
  local out=""
  add() { [[ -f "$1" ]] && out+=$'\n\n===== '"$1"' =====\n'"$(cat "$1")"; }
  add "$FEATURE_DIR/spec.md"
  if [[ "$PHASE" == "G2" || "$PHASE" == "G3" ]]; then
    add "$FEATURE_DIR/plan.md"; add "$FEATURE_DIR/tasks.md"
  fi
  if [[ "$PHASE" == "G3" ]]; then
    for f in "$FEATURE_DIR"/contracts/*.y*ml; do add "$f"; done
    out+=$'\n\n===== git diff (main..HEAD) =====\n'"$(git diff main...HEAD --stat 2>/dev/null || echo 'n/a')"
  fi
  printf '%s' "$out"
}

ARTIFACTS="$(gather_artifacts)"

# Sembrado de residuales YA dispuestos (convergencia): si existe, se pasa al panel con
# instrucción de NO re-levantarlos (ya tienen destino trazable / aceptación explícita).
DISPOSITIONED=""
if [[ -f "$FEATURE_DIR/gates/dispositioned.md" ]]; then
  DISPOSITIONED=$'\n\n===== RESIDUALES YA DISPUESTOS — NO RE-LEVANTAR (solo reportar problemas NUEVOS o regresiones reales) =====\n'"$(cat "$FEATURE_DIR/gates/dispositioned.md")"
fi

mkdir -p "$REPORTS_DIR"
FEATURE_NAME="$(basename "$FEATURE_DIR")"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

# Extrae el JSON del wrapper de claude -p y limpia posibles vallas ```json
extract_json() {
  local raw="$1" res
  res="$(printf '%s' "$raw" | jq -r '.result // empty' 2>/dev/null || true)"
  [[ -z "$res" ]] && res="$raw"
  # quitar vallas de código si las hay
  printf '%s' "$res" | sed -n '/^```/,/^```$/p' | sed '1d;$d' > "$TMP_DIR/unfenced" 2>/dev/null || true
  if [[ -s "$TMP_DIR/unfenced" ]]; then cat "$TMP_DIR/unfenced"; else printf '%s' "$res"; fi
}

echo "== Gate $PHASE sobre $FEATURE_NAME =="
ALL_HUECOS="[]"
for agent in "${AGENTS[@]}"; do
  role="$(cat "$AGENTS_DIR/$agent.md")"
  prompt=$'Adopta EXACTAMENTE el rol siguiente y devuelve SOLO el JSON que especifica.\n\n'"$role"$'\n\n===== ARTEFACTOS A REVISAR =====\n'"$ARTIFACTS""$DISPOSITIONED"
  echo "  - ejecutando $agent ..."
  raw="$(claude -p "$prompt" --output-format json 2>/dev/null || echo '')"
  json="$(extract_json "$raw")"
  if ! printf '%s' "$json" | jq -e '.huecos' >/dev/null 2>&1; then
    echo "    aviso: $agent no devolvió JSON válido; se cuenta como 0 huecos" >&2
    json='{"huecos":[],"veredicto":"APROBADA_CON_COMENTARIOS","resumen":"sin salida válida"}'
  fi
  printf '%s' "$json" > "$TMP_DIR/$agent.json"
  ALL_HUECOS="$(jq -s '.[0] + (.[1].huecos // [] | map(. + {agente: "'"$agent"'"}))' <(printf '%s' "$ALL_HUECOS") "$TMP_DIR/$agent.json")"
done

BLOQUEANTES="$(printf '%s' "$ALL_HUECOS" | jq '[.[] | select(.severidad=="BLOQUEANTE")] | length')"
ALTAS="$(printf '%s' "$ALL_HUECOS" | jq '[.[] | select(.severidad=="ALTA")] | length')"
TOTAL="$(printf '%s' "$ALL_HUECOS" | jq 'length')"

REPORT="$REPORTS_DIR/gate-$PHASE-$FEATURE_NAME.json"
jq -n --argjson huecos "$ALL_HUECOS" --arg phase "$PHASE" --arg feature "$FEATURE_NAME" \
  --argjson bloq "$BLOQUEANTES" --argjson alta "$ALTAS" --argjson total "$TOTAL" \
  '{phase:$phase, feature:$feature, bloqueantes:$bloq, altas:$alta, total:$total,
    veredicto: (if $bloq>0 then "BLOQUEADA" else "APROBADA_CON_COMENTARIOS" end), huecos:$huecos}' \
  > "$REPORT"

echo "== Resultado: $TOTAL huecos ($BLOQUEANTES bloqueantes, $ALTAS altas) -> $REPORT =="
if [[ "$BLOQUEANTES" -gt 0 ]]; then
  echo "GATE $PHASE: FAIL (resuelve los bloqueantes; puedes usar el agente 'remediador' para proponer cambios)"
  exit 1
fi
echo "GATE $PHASE: PASS"
exit 0
