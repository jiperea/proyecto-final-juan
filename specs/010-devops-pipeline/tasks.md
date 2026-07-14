# Tasks: Pipeline CI/CD (reto M12) — feature 010-devops-pipeline

**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Research**: [research.md](./research.md)

> **Contexto de reconciliación:** la Capa 1 (DO-2..DO-6) ya está implementada y commiteada; sus tareas se
> marcan **[X]**. El trabajo pendiente es el **delta de conformidad con la spec remediada (G1→G3)** y la
> **Fase 2 (pre/prod)**. Tests: los únicos artefactos unit-testeables son los 2 scripts bash (ver Polish).

## Phase 1 · Setup (compartido)

- [X] T001 Contenerización back/front (`backend/Dockerfile`, `frontend/Dockerfile` etapa `runtime`, `.dockerignore`) — DO-2
- [X] T002 `docker-compose.yml` (db·db-test·backend·frontend) para paridad local — DO-2
- [X] T003 `.gitleaks.toml` (allowlist acotado de fixtures) y `.spectral.yaml` (extiende `spectral:oas`)

## Phase 2 · Foundational (guardián + verificador, bloquean los PR-gates)

- [X] T004 `scripts/validate-constitution.sh` — guardián determinista (FR-008): spec→YAML sobre TODOS los `.github/workflows/*.yml`, gates G1/G2/G3 por spec (excepciones en `.specify/gate-exceptions.txt` con fecha+owner+caducidad), `domain/` sin infra, sin `[NEEDS CLARIFICATION]`
- [X] T005 `scripts/acceptance-check.sh` — verificador de trazabilidad (FR-007): integridad de `docs/traceability.md`, tolerante a filas de 4/5 columnas
- [X] T006 `.specify/gate-exceptions.txt` — excepciones documentadas al guardián

## Phase 3 · US1 — PR-gate bloquea merges (P1) · SC-001/002/003

**Objetivo:** toda PR pasa la batería M9 del componente tocado; bloquea el merge si falla.
**Test independiente:** PR con fallo inyectado → check rojo → no mergeable; PR limpia → verde.

- [X] T007 [US1] `.github/workflows/secrets-scan.yml` — gitleaks universal (todo PR + push develop/main), versión+checksum fijados (FR-004)
- [X] T008 [US1] `.github/workflows/pr-validation-back.yml` — guardian + lint·typecheck·test (Postgres servicio) + contracts (Spectral+oasdiff) + image-scan (Trivy `--ignore-unfixed`) (FR-002/003/005/007/008)
- [X] T009 [US1] `.github/workflows/pr-validation-front.yml` — guardian + lint(eslint+stylelint)·typecheck(codegen:check)·test(axe)·build + image-scan front (FR-006)
- [ ] T010 [US1] Crear `scripts/constitution-agent-review.sh` — guardián-agente (patrón M9: `claude -p … --output-format json`, devuelve `{aprobado:bool}`, exit 0/1), envía SOLO artefactos SDD (minimización) (FR-009/FR-P21)
- [ ] T011 [P] [US1] Añadir job `guardian-agent` **gated** (`if: ${{ secrets.ANTHROPIC_API_KEY != '' }}`) a `pr-validation-back.yml` y `pr-validation-front.yml`, que corre T010 y bloquea si `aprobado=false` (FR-009)
- [ ] T012 [P] [US1] Añadir job `code-review-gate` (certificador dummy, marcador en step summary, exit 0) a ambos PR-gates (FR-010/FR-P22)

## Phase 4 · US2 — imagen trazable y reproducible (P1) · SC-005/006/007

**Objetivo:** cada integración publica una imagen versionada en GHCR + `dist`; no-rebuild.
**Test independiente:** merge develop → `:x.y.z-snapshot.{sha}`+`:develop` en GHCR + dist artifact; tag → `:x.y.z`+Release.

- [X] T013 [US2] `ci-develop-back.yml` / `ci-develop-front.yml` — CI + build único + Trivy + `save/load` + push `:x.y.z-snapshot.{sha}` **y** `:develop` + dist artifact 90 d (FR-012/014)
- [X] T014 [US2] `ci-main-back.yml` / `ci-main-front.yml` — trigger tag semver, procedencia `merge-base main`, imagen `:x.y.z`+`:latest`, GitHub Release (FR-013/015), pin SHA + permisos mínimos (FR-016/017/018)
- [ ] T015 [US2] **[G3-H-005]** Guarda de lockstep **cruzada** en `ci-main-back.yml` y `ci-main-front.yml`: el paso de verificación lee **AMBOS** `backend/package.json` y `frontend/package.json` == `${GITHUB_REF_NAME#v}`; si cualquiera diverge, falla (evita release parcial) (FR-013b)
- [ ] T016 [US2] Sustituir `gh release create` por **`softprops/action-gh-release@<sha>`** en `ci-main-{back,front}.yml`, con assets de nombre distinto (`fieldops-<comp>-{tag}.tar.gz`) al mismo Release (append) (FR-013, clarify #4)
- [ ] T017 [P] [US2] Alinear el nombre de imagen a `ghcr.io/${owner}/${repo}/fieldops-<comp>` (con segmento repo) en todos los `ci-*` y en los deploy (reto §4)

## Phase 5 · US3 — CD gobernado por entornos (P2) · SC-008/009 · Capa 2

**Objetivo:** dev auto (Fase 1), pre auto + prod manual (Fase 2), no-rebuild, URL pública.
**Test independiente:** merge develop → dev responde 200; release → pre 200; prod solo por dispatch.

**Fase 1 (dev):**
- [X] T018 [US3] Job `deploy-dev` en `ci-develop-{back,front}.yml` (`environment: dev`, deploy-hook Render, `:develop`, smoke-test opcional) (FR-019)

**Fase 2 (pre + prod):**
- [ ] T019 [US3] **[G3-H-007]** Crear `.github/workflows/cd-pre.yml` — deploy auto a **pre** tras release semver (`environment: pre`), verifica que existen AMBAS imágenes `:x.y.z`, consume el **semver** (no `:latest`), y **registra GitHub Deployment** del entorno pre con el semver (FR-020/AC-11)
- [ ] T020 [US3] **[G3-H-006]** En `cd-prod.yml`: input `version` **obligatorio**; validar que `version` == último GitHub Deployment de `pre` **y** que la imagen existe en GHCR; abortar si no coincide (FR-021)
- [ ] T021 [P] [US3] Documentar/parametrizar la protección de `environment` (`deployment_branch_policy` prod=main) y secretos por entorno dev/pre/prod (FR-022/022b) — se aplica a mano (manual)

## Phase 6 · Polish & cross-cutting

- [ ] T022 [P] Tests de los scripts bash (`bats` o fixtures): `validate-constitution.sh` (caso excepción, workflow sin spec) y `acceptance-check.sh` (fila incompleta, fila de 5 columnas) — único artefacto unit-testeable
- [ ] T023 **`docs/16-devops-setup-manual.md`** — manual de configuración manual (GitHub Environments+secrets, servicios Render por imagen GHCR, Neon por entorno, credencial de pull GHCR, branch/tag rulesets, protección de prod)
- [ ] T024 Actualizar `docs/15-devops-bitacora.md` con el cierre SDD (010) y el estado de Fase 1/Fase 2
- [ ] T025 Verificación estática final (quickstart §0) + gate **G3** (panel: revisor-implementacion + regresión G1/G2)

## Dependencias y orden

- Phase 1 → Phase 2 → (Phase 3, 4 en paralelo) → Phase 5 (Fase 1 dev ya hecha; Fase 2 tras Phase 4).
- **MVP (Capa 1):** Phases 1–4 (ya implementadas + T010/011/012/015/016/017 de conformidad).
- **Fase 2:** T019/T020/T021. **Manual + G3:** T022–T025.

## Paralelizables ([P])
T011, T012 (jobs independientes en ficheros ya existentes) · T017 · T021 · T022. El resto toca ficheros
compartidos (ci-main-*) o tiene dependencias de orden.
