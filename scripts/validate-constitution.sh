#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Guardián de Constitución — verificador DETERMINISTA del PR-gate (FR-P07, M9).
#
# Implementa el "verificador determinista de constitución" que quedó en backlog
# (docs/13) como gate real del pipeline. NO llama a ningún LLM ni API (NFR-P03).
# Exit 0 = ok · Exit 1 = violación (bloquea el merge, sin excepción automática, XIII).
#
# Comprueba (Principio XVI · pipeline-spec.md FR-P07):
#   (a) spec-antes-que-YAML: docs/pipeline-spec.md es ANTERIOR en git a cualquier
#       workflow *-validation-*.yml (AC-1).
#   (b) trazabilidad de gates: cada spec con spec.md tiene informes de gate
#       G1/G2/G3 (salvo excepciones DOCUMENTADAS en .specify/gate-exceptions.txt).
#   (c) sin [NEEDS CLARIFICATION] en specs activas (specs/*/spec.md).
#   (d) arquitectura hexagonal: domain/ no importa Express/Prisma/SDK-IA.
#
# Uso:  bash scripts/validate-constitution.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")/.."

fail=0
note() { printf '  \033[31m✗\033[0m %s\n' "$1"; fail=1; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }

# ── (a) spec-antes-que-YAML (AC-1) ───────────────────────────────────────────
# Cobertura TOTAL: cualquier .yml de .github/workflows/ debe ser posterior en git a
# la spec del pipeline (no solo los *-validation-*). Así los futuros ci-develop/
# ci-main/front (DO-4/5/6) y cualquier workflow nuevo caen también bajo la regla.
echo "· (a) spec-antes-que-YAML (FR-P07a / AC-1)"
spec_epoch=$(git log --diff-filter=A --format=%ct -- docs/pipeline-spec.md | tail -1)
if [ -z "${spec_epoch:-}" ]; then
  note "docs/pipeline-spec.md no existe en git (la spec del pipeline debe preceder a los .yml)"
else
  offenders=0
  while IFS= read -r wf; do
    [ -z "$wf" ] && continue
    wf_epoch=$(git log --diff-filter=A --format=%ct -- "$wf" | tail -1)
    [ -z "$wf_epoch" ] && continue # aún no commiteado: no evaluable en git
    if [ "$wf_epoch" -lt "$spec_epoch" ]; then
      note "workflow '$wf' fue añadido ANTES que docs/pipeline-spec.md (viola spec-antes-que-YAML)"
      offenders=$((offenders + 1))
    fi
  done < <(git ls-files '.github/workflows/*.yml' '.github/workflows/*.yaml')
  [ "$offenders" -eq 0 ] && ok "la spec del pipeline precede a todo workflow de .github/workflows/"
fi

# ── (b) trazabilidad de gates adversariales por spec (FR-P07b) ────────────────
echo "· (b) informes de gate por spec (FR-P07b)"
exceptions_file=".specify/gate-exceptions.txt"
is_excepted() { # $1=spec-basename  $2=phase(G1|G2|G3)
  [ -f "$exceptions_file" ] || return 1
  grep -Eq "^[[:space:]]*$1[[:space:]]+$2([[:space:]]|$)" "$exceptions_file"
}
# Fecha de alta (3.er campo) de una excepción; vacío si no la encuentra.
exception_date() { # $1=spec  $2=phase
  awk -v s="$1" -v p="$2" '!/^[[:space:]]*#/ && $1==s && $2==p {print $3; exit}' "$exceptions_file"
}
# Epoch de una fecha YYYY-MM-DD, portable GNU/BSD; vacío si no parsea.
date_epoch() {
  date -d "$1" +%s 2>/dev/null || date -j -f "%Y-%m-%d" "$1" +%s 2>/dev/null || true
}
now_epoch=$(date +%s)
for spec_md in specs/*/spec.md; do
  [ -e "$spec_md" ] || continue
  d=$(dirname "$spec_md"); name=$(basename "$d")
  for phase in G1 G2 G3; do
    # informe presente si existe cualquier gates/gate-<phase>-*.{md,json}
    if compgen -G "$d/gates/gate-$phase-*" >/dev/null; then
      continue
    fi
    if is_excepted "$name" "$phase"; then
      d=$(exception_date "$name" "$phase"); e=$(date_epoch "${d:-}")
      stale=""
      if [ -n "$e" ] && [ $(( (now_epoch - e) / 86400 )) -gt 30 ]; then
        stale=" — ⚠ ALTA: excepción con > 30 días ($d); re-materializa el informe o justifícala"
      fi
      printf '  \033[33m·\033[0m %s: sin informe %s — excepción documentada (%s)%s\n' "$name" "$phase" "${d:-sin fecha}" "$stale"
      continue
    fi
    note "$name: falta el informe de gate $phase (specs/$name/gates/gate-$phase-*)"
  done
done
[ "$fail" -eq 0 ] && ok "toda spec activa tiene sus informes de gate G1/G2/G3 (o excepción documentada)"

# ── (c) sin marcadores [NEEDS CLARIFICATION] en specs activas (FR-P07c) ───────
echo "· (c) sin [NEEDS CLARIFICATION] en specs activas (FR-P07c)"
pending=$(grep -rl "\[NEEDS CLARIFICATION" specs/*/spec.md 2>/dev/null || true)
if [ -n "$pending" ]; then
  while IFS= read -r f; do note "quedan marcadores [NEEDS CLARIFICATION] en $f"; done <<< "$pending"
else
  ok "ninguna spec.md conserva marcadores [NEEDS CLARIFICATION]"
fi

# ── (d) hexagonal: domain/ no importa infra (FR-P07d) ─────────────────────────
echo "· (d) arquitectura hexagonal: domain/ sin imports de infra (FR-P07d)"
dom_violations=$(grep -rEn "from ['\"](express|@prisma/client|@prisma|prisma|@anthropic-ai)" backend/src/domain 2>/dev/null || true)
if [ -n "$dom_violations" ]; then
  while IFS= read -r l; do note "domain/ importa infra: $l"; done <<< "$dom_violations"
else
  ok "domain/ no importa Express/Prisma/SDK-IA"
fi

echo
if [ "$fail" -ne 0 ]; then
  echo "❌ Guardián de Constitución: BLOQUEA (violaciones arriba)."
  exit 1
fi
echo "✅ Guardián de Constitución: OK."
