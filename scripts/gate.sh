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

# Ejecuta un agente (build prompt + claude -p) y escribe su salida CRUDA al fichero indicado. Reutilizable
# en el lanzamiento paralelo y en el reintento secuencial.
run_agent() {
  local agent="$1" out="$2" role prompt
  role="$(cat "$AGENTS_DIR/$agent.md")"
  prompt=$'Adopta EXACTAMENTE el rol siguiente y devuelve SOLO el JSON que especifica.\n\n'"$role"$'\n\n===== ARTEFACTOS A REVISAR =====\n'"$ARTIFACTS""$DISPOSITIONED"
  claude -p "$prompt" --output-format json > "$out" 2>/dev/null || true
}

# Fase 1 — EJECUTAR LOS AGENTES. Por defecto EN SERIE (operativo/fiable): el CLI `claude -p` throttlea las
# llamadas grandes concurrentes y el paralelo daba INCONCLUSO. Con GATE_PARALLEL=1 se lanzan en paralelo
# (más rápido; úsese sólo si los prompts son pequeños o el CLI no throttlea). Reliability por defecto.
if [[ "${GATE_PARALLEL:-0}" == "1" ]]; then
  pids=()
  for agent in "${AGENTS[@]}"; do
    echo "  - lanzando $agent (paralelo) ..."
    run_agent "$agent" "$TMP_DIR/$agent.raw" &
    pids+=("$!")
  done
  wait "${pids[@]}" 2>/dev/null || true
else
  for agent in "${AGENTS[@]}"; do
    echo "  - ejecutando $agent (serie) ..."
    run_agent "$agent" "$TMP_DIR/$agent.raw"
  done
fi

# Fase 2 — CONSOLIDAR: parsea/valida cada salida. Si un agente NO devuelve JSON válido, se REINTENTA una
# vez en secuencial (posible contención del CLI bajo concurrencia); si sigue inválido, el gate es
# INCONCLUSO (exit 3) — NUNCA se cuenta como "0 huecos" en silencio (integridad del panel).
ALL_HUECOS="[]"
FAILED_AGENTS=()
for agent in "${AGENTS[@]}"; do
  json="$(extract_json "$(cat "$TMP_DIR/$agent.raw" 2>/dev/null || echo '')")"
  if ! printf '%s' "$json" | jq -e '.huecos' >/dev/null 2>&1; then
    echo "    aviso: $agent sin JSON válido; REINTENTO secuencial ..." >&2
    run_agent "$agent" "$TMP_DIR/$agent.retry"
    json="$(extract_json "$(cat "$TMP_DIR/$agent.retry" 2>/dev/null || echo '')")"
  fi
  if ! printf '%s' "$json" | jq -e '.huecos' >/dev/null 2>&1; then
    echo "    ERROR: $agent no devolvió JSON válido tras reintento" >&2
    FAILED_AGENTS+=("$agent")
    continue
  fi
  printf '%s' "$json" > "$TMP_DIR/$agent.json"
  ALL_HUECOS="$(jq -s '.[0] + (.[1].huecos // [] | map(. + {agente: "'"$agent"'"}))' <(printf '%s' "$ALL_HUECOS") "$TMP_DIR/$agent.json")"
done

if [[ "${#FAILED_AGENTS[@]}" -gt 0 ]]; then
  echo "== Gate $PHASE: INCONCLUSO — agentes sin salida válida: ${FAILED_AGENTS[*]} (NO se cuenta como 0 huecos) ==" >&2
  echo "   Re-ejecuta el gate; si persiste, baja la concurrencia (lanza en serie)." >&2
  exit 3
fi

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
