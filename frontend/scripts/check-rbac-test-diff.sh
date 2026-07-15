#!/usr/bin/env bash
# FE-5 (017) · Guardián determinista de SC-004 / FR-015.
# Falla (exit 1) si el reskin cambia una LÍNEA DE ASERCIÓN en los tests de RBAC/comportamiento de UI.
# Único cambio permitido en esos ficheros: literales de clase CSS (className=..., .btn--*).
#
# Uso:  bash scripts/check-rbac-test-diff.sh [base_ref]
#   base_ref por defecto: origin/develop → develop → merge-base con HEAD.
set -euo pipefail

cd "$(dirname "$0")/.." # frontend/

BASE="${1:-}"
if [ -z "$BASE" ]; then
  if git rev-parse --verify -q origin/develop >/dev/null; then BASE="origin/develop";
  elif git rev-parse --verify -q develop >/dev/null; then BASE="develop";
  else BASE="$(git rev-parse HEAD)"; fi
fi
MERGE_BASE="$(git merge-base "$BASE" HEAD 2>/dev/null || echo "$BASE")"

# Ficheros de test de RBAC/comportamiento PREEXISTENTES protegidos (se excluye el test nuevo del reskin,
# que sí puede añadir aserciones: es la regresión propia de FR-015/SC-010).
GLOBS=(
  'tests/unit/fe*-detail-rbac.*'
  'tests/unit/fe*-review-actions.*'
  'tests/unit/fe*-reassign*'
  'tests/unit/*rbac*'
  ':(exclude)tests/unit/rbac-reskin-regression.*'
)

# Patrón de "línea de aserción" (protegida): expect(...), matchers, o queries con nombre accesible.
ASSERT_RE='expect\(|toBeVisible|toBeDisabled|toBeEnabled|toBeInTheDocument|toHaveAttribute|toHaveTextContent|not\.to|getByRole|queryByRole|findByRole|getByText|queryByText'

violations=0
# Diff con contexto 0; solo líneas +/- (no cabeceras +++/---).
while IFS= read -r line; do
  content="${line:1}"
  # Una línea es VIOLACIÓN si contiene un patrón de aserción, INDEPENDIENTEMENTE de que también toque una
  # clase (evita el blind spot de líneas que mezclan className + aserción, I-003). Solo se permite (skip)
  # una línea que NO matchee ningún patrón de aserción.
  if printf '%s' "$content" | grep -Eq "$ASSERT_RE"; then
    echo "SC-004 VIOLACIÓN (línea de aserción cambiada): $line"
    violations=$((violations + 1))
  fi
done < <(git diff --unified=0 "$MERGE_BASE" -- "${GLOBS[@]}" 2>/dev/null | grep -E '^[+-]' | grep -Ev '^(\+\+\+|---)')

if [ "$violations" -gt 0 ]; then
  echo "FALLO: $violations línea(s) de aserción RBAC modificada(s) por el reskin (SC-004)."
  exit 1
fi
echo "OK: ninguna aserción RBAC/comportamiento cambiada (SC-004)."
