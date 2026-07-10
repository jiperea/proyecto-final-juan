#!/usr/bin/env bash
# token-report.sh — hook SessionEnd: registra consumo (ccusage) + ahorro (RTK) por sesión.
# Token-free (solo shell, sin API). Append a informes/costs.jsonl, etiquetado por rama (=spec).
# Robusto: nunca aborta la sesión (siempre exit 0); campos que fallan quedan como {}.
set -uo pipefail

payload=$(cat 2>/dev/null || echo '{}')
sid=$(printf '%s' "$payload" | jq -r '.session_id // "unknown"' 2>/dev/null || echo unknown)
cwd=$(printf '%s' "$payload" | jq -r '.cwd // empty' 2>/dev/null || echo "")
[ -z "$cwd" ] && cwd="$(pwd)"

branch=$(git -C "$cwd" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "n/a")
ts=$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo "")
today=$(date -u +%Y-%m-%d 2>/dev/null || echo "")

out_dir="$cwd/informes"
mkdir -p "$out_dir" 2>/dev/null || true

# Consumo del día (ccusage, local, sin API). Estructura tolerante: buscamos el registro de hoy.
consumo=$(ccusage daily -j 2>/dev/null \
  | jq -c --arg d "$today" '([.. | objects | select(.date==$d)] | .[0]) // {}' 2>/dev/null \
  || echo '{}')
[ -z "$consumo" ] && consumo='{}'

# Ahorro RTK por proyecto (json).
ahorro=$( (cd "$cwd" 2>/dev/null && rtk gain --project -f json 2>/dev/null) \
  | jq -c '{saved: (.tokens_saved // .saved // .total_saved // null), commands: (.total_commands // .commands // null)}' 2>/dev/null \
  || echo '{}')
[ -z "$ahorro" ] && ahorro='{}'

row=$(jq -nc \
  --arg ts "$ts" --arg sid "$sid" --arg branch "$branch" \
  --argjson consumo "$consumo" --argjson ahorro "$ahorro" \
  '{ts:$ts, session:$sid, branch:$branch, consumo_dia_ccusage:$consumo, ahorro_rtk_proyecto:$ahorro}' \
  2>/dev/null || printf '{"ts":"%s","session":"%s","branch":"%s"}' "$ts" "$sid" "$branch")

printf '%s\n' "$row" >> "$out_dir/costs.jsonl" 2>/dev/null || true
exit 0
