# Tasks: PR Gate agregador (013)

**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Quickstart**: [quickstart.md](./quickstart.md)

Feature de pipeline (US única, P1). Sin tests de app; se valida por estática + ejecución real en Actions.

## Phase 1 · Construir `pr-gate.yml` (FR-001..006)
- [ ] T001 [US1] Crear `.github/workflows/pr-gate.yml`: `on: pull_request` a `develop`/`main` **sin `paths:`**; `permissions: contents: read`; `concurrency: group: pr-gate-${{ github.ref }}` + `cancel-in-progress: true`.
- [ ] T002 [US1] Job `changes` (`dorny/paths-filter`, **SHA-pin 40 chars**) → outputs `back`/`front`/`contracts`. Fail-safe (FR-002): si el filtro falla o el PR toca `.github/workflows/**`, marcar los tres como `true` (correr todo).
- [ ] T003 [US1] Migrar los 3 jobs de **gobernanza** desde `pr-validation-back.yml` a `pr-gate.yml` **sin cambiar su lógica**: `guardian` (validate-constitution.sh + acceptance-check.sh), `guardian-agent` (opt-in, `if` a la key), `code-review-gate` (`$GITHUB_STEP_SUMMARY`, sin permisos elevados). Corren **siempre** (sin `if:` de componente). Nombres de check idénticos.
- [ ] T004 [US1] Migrar los jobs de **back** con `if: needs.changes.outputs.back == 'true' || needs.changes.outputs.contracts == 'true'`: `lint · typecheck · test (Postgres)` (servicio Postgres 16 + migrate + `npm run seed` de 011), `Contratos (Spectral + oasdiff)` (`permissions: checks: write` por job), `Imagen backend + Trivy`. `needs: changes`.
- [ ] T005 [US1] Migrar los jobs de **front** con `if: ...front... || ...contracts...`: `lint · typecheck · test · build`, `Imagen frontend + Trivy` (con el smoke-test de 012, `--add-host` + `docker inspect` USER + curl `/`+asset). `needs: changes`.
- [ ] T006 [US1] Job `gate-selfcheck` (SC-006): parsea `pr-gate.yml` y **falla** si el `needs` de `PR Gate` no incluye todos los `jobs:` del fichero. Determinista, sin actions nuevas.
- [ ] T007 [US1] Job final `PR Gate`: `needs:` **enumera TODOS** (`changes`, gobernanza×3, back×3, front×2, `gate-selfcheck`); `if: always()`; recorre `needs.*.result` y **falla** si algún resultado ∈ {failure, cancelled}, pasa si ∈ {success, skipped}.

## Phase 2 · Retirar los PR-gates viejos (FR-002)
- [ ] T008 [US1] Eliminar `.github/workflows/pr-validation-back.yml` y `pr-validation-front.yml` (contenido absorbido en `pr-gate.yml`). `secrets-scan.yml` intacto.

## Phase 3 · Guardián determinista y docs (FR-008)
- [ ] T009 Verificar que `scripts/validate-constitution.sh` y `acceptance-check.sh` siguen **exit 0** con `pr-gate.yml` (que su chequeo de FR-P01/estructura no marque el nuevo workflow como violación). Ajustar el script **solo** si su regla choca con la nueva arquitectura (documentando el cambio).
- [ ] T010 Enmendar `docs/pipeline-spec.md`: **FR-P01** (checks de componente por `if:` interno; gobernanza transversal), **FR-P07/P08/P22** ("PR Gate"), **FR-P21** (guardián-agente reporta `success`, no skipped), **NFR-P01** (un workflow, jobs en paralelo <10 min).
- [ ] T011 Actualizar `docs/branch-protection.md`: required = `{PR Gate, gitleaks}`; secuencia de migración "Settings primero" (FR-007); lección del deadlock (required+`paths:`=Expected que bloquea, no skipped→neutral); retirada del huérfano `Lint (pull_request)`. **Supersede** la constancia de 012 (`05875bf`).
- [ ] T012 Nota en `docs/15-devops-bitacora.md` (013: raíz del deadlock + PR Gate agregador + migración; incluye la constancia de 012 superseída).

## Phase 4 · Verificación y cierre
- [ ] T013 Verificación estática/local (quickstart §1): YAML válido; 0 `uses: …@v[0-9]` (AC-6); `needs` de `PR Gate` cubre todos los jobs; guardián+acceptance exit 0; permisos mínimos declarados.
- [ ] T014 Gate G3 (panel reducido: revisor-devops/implementacion) + informe en `specs/013-universal-governance-checks/gates/`.
- [ ] T015 (usuario) Migración "Settings primero" (Paso 1→2→3 de FR-007) + push/PR → confirmar SC-001..006 en Actions (PR solo-docs mergeable; PR de componente con fallo bloquea; jobs del otro componente skipped).

## Dependencias
- T001 antes de T002-T007 (mismo fichero). T007 (agregador) tras todos los jobs. T006/T007 juntos (self-check ↔ needs).
- T008 tras T001-T007 (no borrar los viejos hasta que el nuevo esté completo).
- T009 tras T008. Docs (T010-T012) paralelizables. Phase 4 tras 1-3.

## MVP
US1 = T001-T008 (pr-gate.yml completo + viejos retirados) + T013 (estática). T015 (real, tras migración) confirma.
