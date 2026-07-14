# Plan: PR Gate agregador (013)

**Branch**: `013-universal-governance-checks` | **Date**: 2026-07-14 | **Spec**: [spec.md](./spec.md)

## Summary
Consolidar `pr-validation-back.yml` + `pr-validation-front.yml` en un único **`pr-gate.yml`** sin `paths:`,
con un job final **`PR Gate`** que agrega el resultado de gobernanza (siempre) + los jobs del componente
tocado (skip resto). Único required (con `gitleaks`) → sin deadlock y con calidad preservada. Migración
"Settings primero". Sin cambios de **lógica** de ningún job; solo orquestación. API-free (NFR-P03) intacto.

## Technical Context
- **Nuevo `.github/workflows/pr-gate.yml`** (on: `pull_request` a develop/main, **sin `paths:`**; `concurrency`
  por `github.ref` + `cancel-in-progress`; `permissions: contents: read` a nivel workflow):
  - `changes` — `dorny/paths-filter` (SHA-pin) → outputs `back`/`front`/`contracts`. Fail-safe: si falla o el
    PR toca `.github/workflows/**` → tratar todo como tocado (correr todo).
  - **Gobernanza (siempre):** `guardian` (validate-constitution.sh + acceptance-check.sh), `guardian-agent`
    (opt-in, gated a `ANTHROPIC_API_KEY`), `code-review-gate` (`$GITHUB_STEP_SUMMARY`, `contents:read`).
  - **Back (`if:` back∨contracts):** `lint · typecheck · test (Postgres)` (servicio Postgres 16 + migrate +
    seed, de 011), `Contratos (Spectral + oasdiff)` (`checks:write` por job), `Imagen backend + Trivy`.
  - **Front (`if:` front∨contracts):** `lint · typecheck · test · build`, `Imagen frontend + Trivy` (+ el
    smoke-test de 012).
  - `gate-selfcheck` — verifica que el `needs` de `PR Gate` cubre todos los `jobs:` (SC-006).
  - `PR Gate` — `needs:` **todos** los anteriores (incl. `changes` y `gate-selfcheck`), `if: always()`; falla
    si algún `needs.*.result ∈ {failure, cancelled}`; pasa si todos ∈ {success, skipped}.
- **`pr-validation-back.yml` / `pr-validation-front.yml`:** se **eliminan** (todo su contenido migra a
  `pr-gate.yml`). `secrets-scan.yml` (gitleaks) se mantiene igual (universal).
- **Actions nuevas:** solo `dorny/paths-filter` → **SHA-pin de 40 chars** (FR-P13/AC-6). El resto ya venían
  pinadas y se reutilizan (checkout, setup-node, trivy-action, spectral-action).
- **Docs:** `pipeline-spec.md` (FR-P01/P07/P08/P21/P22, NFR-P01), `branch-protection.md` (required + migración
  + lección deadlock + huérfano), `15-devops-bitacora.md`.

## Constitution Check
- **XVI (pipeline gobernado)**: ✅ spec-antes-que-YAML (spec+G1 preceden); SHA-pin mantenido (nueva action
  pinada); permisos mínimos; **FR-P01 reformulado** (componente por `if:` interno; gobernanza transversal) →
  el guardián determinista no debe marcar `pr-gate.yml` como violación (ver riesgo abajo).
- **FR-P09/XIII (gates que bloquean)**: ✅ el agregador **preserva** el bloqueo por calidad (a diferencia del
  enfoque descartado en G1 r1).
- **NFR-P03 (API-free)**: ✅ guardián-agente opt-in desactivado sin la key.
- Gates de app: **N/A** (pipeline).

## Fases (para tasks)
1. Crear `pr-gate.yml`: `changes` + gobernanza + back + front + `gate-selfcheck` + `PR Gate` (migrando los
   jobs tal cual de los dos PR-gates; SHA-pin de `dorny/paths-filter`).
2. Eliminar `pr-validation-back.yml` y `pr-validation-front.yml`.
3. Verificar que el guardián determinista (`validate-constitution.sh`) sigue en 0 con `pr-gate.yml` (que su
   comprobación de FR-P01/estructura no lo marque como violación); ajustar el script SOLO si su regla choca.
4. Docs: `pipeline-spec.md` (FR-P01/P07/P08/P21/P22, NFR-P01) + `branch-protection.md` (required, migración
   "Settings primero", lección) + bitácora (incluye constancia de 012 superseída).
5. Verificación estática/local (YAML válido, `needs` completo, SHA-pin, permisos, agregador `if: always()`).
6. (usuario) Migración "Settings primero" (Paso 1→2→3 de FR-007) + PR → SC-001..006 en Actions real.

## Complexity Tracking
| Desviación | Por qué | Alternativa rechazada |
|---|---|---|
| Consolidar 2 PR-gates en 1 workflow | el agregador necesita `needs` cruzado (imposible entre workflows) | mantener separados (no se puede agregar cross-workflow) |
| Reformular FR-P01 (paths→if interno) | GitHub required+paths=deadlock (clásica); el `if:` preserva el efecto | mantener paths por workflow (el deadlock que motiva 013) |
| Migración manual "Settings primero" | GitHub no permite cambio de required atómico | 2 fases (dejaba ventana, G1 r3) / all-at-once (deadlock, G1 r2) |
| Componente NO-required (solo PR Gate) | el agregador ya los exige vía needs | requerirlos por nombre (reintroduce el deadlock) |

## Artefactos de diseño
- **research/data-model/contracts**: N/A (pipeline, como 010-012).
- **quickstart.md**: validación local (act/validación estática) + secuencia de verificación real.
