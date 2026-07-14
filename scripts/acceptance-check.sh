#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# acceptance-check — verificación DETERMINISTA de trazabilidad (FR-P08, M9).
#
# Constitution VI: docs/traceability.md es la matriz canónica RF→tarea→test. Un FR
# "huérfano" es una fila de la matriz sin tarea O sin test. Este gate falla si la
# matriz tiene HUECOS (filas incompletas). NO llama a ningún LLM ni API (NFR-P03).
# Exit 0 = ok · Exit 1 = FR huérfano (fila incompleta).
#
# Fila esperada:  | FR-001 | descripción | T037/T039 | `unit/login`, ... |
#                   \ FR /   \  desc   /   \ tarea /   \      test      /
#
# Por qué la integridad de la matriz (y no el cruce libre spec.md↔matriz): los FR se
# renumeran por spec y hay filas con ID combinado (`FR-007/008/009`), así que un
# matcher por token daría falsos positivos. La matriz es la fuente de verdad (VI):
# si está completa y las specs la referencian, un hueco = un FR sin verificar.
# La cobertura por-spec se reporta como AVISO no-bloqueante (visibilidad, no gate).
#
# Uso:  bash scripts/acceptance-check.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")/.."

trace="${TRACE_FILE:-docs/traceability.md}" # override por fixture en los tests (T022)

if [ ! -f "$trace" ]; then
  echo "❌ acceptance-check: no existe $trace (matriz de trazabilidad, Constitution VI)."
  exit 1
fi

# ── Integridad de la matriz: ninguna fila FR-* sin tarea o sin test ───────────
# La matriz tiene DOS disposiciones válidas (split '|', extremos vacíos):
#   4-col:  | FR | desc | tarea | test |            → NF=6
#   5-col:  | FR | desc | método | tarea | test |   → NF=7  (algunas secciones)
# Invariante robusto: tarea = penúltima celda de contenido = $(NF-2); test = última =
# $(NF-1) (el $NF es el vacío tras el '|' final). Leer $4/$5 fijos daría FALSO VERDE
# en las filas de 5 columnas (D-007). NF<6 = fila truncada → MALFORMADA (falla).
report=$(awk -F'|' '
  /^\|[[:space:]]*FR-/ {
    rows++;
    fr=$2;
    gsub(/^[[:space:]]+|[[:space:]]+$/,"",fr);
    if (NF < 6) {
      malformed++; printf "  \033[31m✗\033[0m fila MALFORMADA (%d campos, mínimo 6): %s\n", NF, fr;
      next;
    }
    task=$(NF-2); test=$(NF-1);
    gsub(/^[[:space:]]+|[[:space:]]+$/,"",task);
    gsub(/^[[:space:]]+|[[:space:]]+$/,"",test);
    if (task=="" || task=="—" || test=="" || test=="—") {
      holes++; printf "  \033[31m✗\033[0m fila incompleta: %s | tarea=[%s] test=[%s]\n", fr, task, test;
    }
  }
  END { printf "ROWS=%d HOLES=%d MALFORMED=%d\n", rows, holes+0, malformed+0 }
' "$trace")

rows=$(sed -n 's/.*ROWS=\([0-9]*\).*/\1/p' <<< "$report" | tail -1)
holes=$(sed -n 's/.*HOLES=\([0-9]*\).*/\1/p' <<< "$report" | tail -1)
malformed=$(sed -n 's/.*MALFORMED=\([0-9]*\).*/\1/p' <<< "$report" | tail -1)

echo "· Matriz $trace: $rows filas FR·"
grep -E 'fila (incompleta|MALFORMADA)' <<< "$report" || true

# ── AVISO no-bloqueante: FR declarados en specs y ausentes de la matriz ───────
# (informativo — la cobertura documental es responsabilidad de cada gate G2/G3;
#  aquí solo se hace visible, no se bloquea, para no dar falsos positivos por
#  renumeración/IDs combinados. Memoria: "no diferir en silencio".)
declared=$(grep -rhoE '\bFR-[0-9]+[a-z]?\b' specs/*/spec.md 2>/dev/null | sort -u)
matrix_tokens=$(grep -oE '\bFR-[0-9]+[a-z]?\b' "$trace" | sort -u)
missing=$(comm -23 <(printf '%s\n' "$declared") <(printf '%s\n' "$matrix_tokens") | grep -c . || true)
if [ "${missing:-0}" -gt 0 ]; then
  printf '  \033[33m·\033[0m aviso: %s FR declarado(s) en specs sin token exacto en la matriz (revisión documental, no bloqueante)\n' "$missing"
fi

echo
if [ "${malformed:-0}" -ne 0 ]; then
  echo "❌ acceptance-check: $malformed fila(s) FR con formato inesperado — revisa la tabla de $trace (FR-P08)."
  exit 1
fi
if [ "${holes:-0}" -ne 0 ]; then
  echo "❌ acceptance-check: $holes fila(s) FR sin tarea o sin test — trazabilidad incompleta (FR-P08)."
  exit 1
fi
printf '  \033[32m✓\033[0m las %s filas FR de la matriz tienen tarea Y test (0 malformadas)\n' "$rows"
echo "✅ acceptance-check: OK."
