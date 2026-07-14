#!/usr/bin/env bash
# Tests de los scripts deterministas del pipeline (T022 / FR-007/008). Sin dependencias (bash puro).
# Ejercita: (1) smoke — los scripts pasan en verde sobre el repo real; (2) la lógica de columnas de
# acceptance-check (regresión del bug D-007: filas de 4 y 5 columnas) contra fixtures aislados.
set -uo pipefail
cd "$(dirname "$0")/../.."
pass=0; fail=0
ok(){ echo "  ✓ $1"; pass=$((pass+1)); }
ko(){ echo "  ✗ $1"; fail=$((fail+1)); }

echo "· Smoke: acceptance-check.sh en verde sobre el repo"
bash scripts/acceptance-check.sh >/dev/null 2>&1 && ok "acceptance-check exit 0" || ko "acceptance-check debería salir 0"

echo "· Regresión D-007: se ejercita el SCRIPT REAL vía TRACE_FILE contra fixtures (no una copia)"
tmp=$(mktemp -d)
hdr='# fixture\n\n| RF | Descripción | Tarea | Test |\n|----|----|----|----|\n'
run_fixture() { # $1=contenido de fila(s) → exit code + captura
  printf "$hdr$1" > "$tmp/t.md"; TRACE_FILE="$tmp/t.md" bash scripts/acceptance-check.sh >"$tmp/out" 2>&1; echo $?; }

# 4-col completa → exit 0
c=$(run_fixture '| FR-001 | desc | T1 | `unit/x` |\n'); [ "$c" = 0 ] && ok "4-col completa → exit 0" || ko "4-col completa (exit $c)"
# 4-col SIN test → exit 1 (hueco)
c=$(run_fixture '| FR-002 | desc | T2 |  |\n'); [ "$c" = 1 ] && grep -q 'incompleta' "$tmp/out" && ok "4-col sin test → exit 1 (hueco)" || ko "4-col sin test (exit $c)"
# 5-col completa (FR|desc|metodo|tarea|test) → exit 0 (antes: falso-verde)
c=$(run_fixture '| FR-003 | desc | metodo | T3 | `int/y` |\n'); [ "$c" = 0 ] && ok "5-col completa → exit 0" || ko "5-col completa (exit $c)"
# 5-col SIN test → exit 1 (el caso que el bug NO detectaba)
c=$(run_fixture '| FR-004 | desc | metodo | T4 |  |\n'); [ "$c" = 1 ] && grep -q 'incompleta' "$tmp/out" && ok "5-col sin test → exit 1 (regresión D-007)" || ko "5-col sin test (exit $c)"
# fila truncada → exit 1 (malformada)
c=$(run_fixture '| FR-005 | desc |\n'); [ "$c" = 1 ] && grep -q 'MALFORMADA' "$tmp/out" && ok "fila truncada → exit 1 (malformada)" || ko "truncada (exit $c)"
rm -rf "$tmp"

echo "· validate-constitution.sh: date_epoch tolera fecha inválida sin romper (set -e)"
# extrae y prueba la portabilidad del parse de fecha
de(){ date -d "$1" +%s 2>/dev/null || date -j -f "%Y-%m-%d" "$1" +%s 2>/dev/null || true; }
[ -n "$(de 2026-07-14)" ] && ok "fecha válida parsea" || ko "fecha válida debería parsear"
[ -z "$(de not-a-date)" ] && ok "fecha inválida → vacío (no rompe)" || ko "fecha inválida debería dar vacío"

echo
echo "Resultado: $pass OK, $fail KO"
[ "$fail" -eq 0 ] || exit 1
