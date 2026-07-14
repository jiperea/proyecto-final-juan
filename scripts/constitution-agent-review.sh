#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Guardián de Constitución — modo AGENTE (FR-009 / FR-P21). Patrón M9/M10.
#
# El reto M12 pide el guardián como "Claude Code Action (API del agente)". Este
# script lo implementa con `claude -p … --output-format json` (headless). Es la
# ÚNICA excepción a NFR-P03 (API-free) y por eso es **opt-in**: el job de CI que lo
# invoca está gated a `secrets.ANTHROPIC_API_KEY`; sin esa key, ni se ejecuta.
#
# COMPLEMENTA (no sustituye) al guardián determinista `validate-constitution.sh`.
# Minimización (FR-009): envía SOLO los artefactos SDD de gobernanza (constitución +
# pipeline-spec); NUNCA .env, logs ni secretos.
#
# Salida: JSON del agente. Exit 0 = aprobado · Exit 1 = incoherencia (bloquea merge).
# Uso local (con `claude login`) o en CI (con ANTHROPIC_API_KEY):
#   bash scripts/constitution-agent-review.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

command -v claude >/dev/null 2>&1 || { echo "::error::claude CLI no disponible"; exit 1; }

# Artefactos SDD de gobernanza (minimizados — solo gobernanza, sin secretos).
constitucion=$(cat .specify/memory/constitution.md 2>/dev/null || true)
pipeline_const=$(cat docs/pipeline-constitution.md 2>/dev/null || true)
pipeline_spec=$(cat docs/pipeline-spec.md 2>/dev/null || true)

prompt="Eres un auditor de gobernanza de un pipeline CI/CD gobernado por SDD. Revisa si los
artefactos SDD adjuntos (constitución del proyecto + constitución y spec del pipeline) son
COHERENTES entre sí y respetan el Principio XVI (pipeline como gate gobernado): spec-antes-que-YAML,
no-rebuild en CD, pin por SHA, permisos mínimos, flujos por componente, y la regla 'sin API de pago'
en CI (con la excepción opt-in de este propio guardián-agente).

Responde ÚNICAMENTE con JSON válido, sin texto adicional:
{
  \"criterios\": [ { \"id\": \"...\", \"estado\": \"PASS|FAIL\", \"observacion\": \"...\" } ],
  \"aprobado\": true|false,
  \"resumen\": \"una frase\"
}

=== CONSTITUCIÓN DEL PROYECTO ===
$constitucion

=== CONSTITUCIÓN DEL PIPELINE ===
$pipeline_const

=== SPEC DEL PIPELINE ===
$pipeline_spec"

resultado=$(claude -p "$prompt" --output-format json 2>&1)
# Claude envuelve el JSON en {result: "..."}; extraer.
json_result=$(echo "$resultado" | jq -r '.result // empty' 2>/dev/null)
[ -z "$json_result" ] && json_result="$resultado"
# Limpiar posible bloque ```json ... ```
json_limpio=$(echo "$json_result" | sed -n '/^```json$/,/^```$/p' | sed '1d;$d' 2>/dev/null)
[ -z "$json_limpio" ] && json_limpio="$json_result"

echo "$json_limpio"
aprobado=$(echo "$json_limpio" | jq -r '.aprobado // empty' 2>/dev/null)
if [ "$aprobado" = "true" ]; then
  echo "✅ Guardián-agente: aprobado."
  exit 0
fi
echo "::error::Guardián-agente: incoherencia detectada (aprobado=$aprobado). Bloquea el merge."
exit 1
