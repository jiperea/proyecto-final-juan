# Tasks: Endurecimiento del pipeline (011)

**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md)

## Phase 1 · Seed del entorno de test (FR-001)
- [X] T001 [US1] Añadir paso `Seed` (`npm run seed`) tras `Migraciones` y antes de `Tests` en el job de tests de `pr-validation-back.yml`.
- [X] T002 [US1] Ídem en el job `ci` de `ci-develop-back.yml` (tras migrar, antes de tests).
- [X] T003 [US1] Ídem en el job `ci` de `ci-main-back.yml`.

## Phase 2 · Spectral fiable (FR-002)
- [X] T004 [US1] En `pr-validation-back.yml` job `contracts`: sustituir el paso `npx @stoplight/spectral-cli@6.14.2 …` por la action `stoplightio/spectral-action@6416fd018ae38e60136775066eb3e98172143141` (v0.8.13, SHA-pin), con `file_glob: contracts/*.yaml` y ruleset `.spectral.yaml`. Mantener `oasdiff` igual.

## Phase 3 · Política de Trivy (FR-003, enmienda FR-P05)
- [X] T005 [US1] Añadir `skip-dirs: usr/local/lib/node_modules/npm` al step Trivy **solo en los 3 jobs de BACK** (`pr-validation-back` image-scan, `ci-develop-back`, `ci-main-back`). **Front NO** (nginx sin npm — D-004). Prerequisito: CMD del Dockerfile sin npx (FR-003a).
- [X] T006 Enmendar `docs/pipeline-spec.md` **FR-P05** (política de Trivy: bloquea deps de app; excluye npm del base image; residuo documentado).

## Phase 4 · Verificación y cierre
- [X] T007 Verificación estática: 9 YAML válidos, AC-6 (0 `@v[0-9]`, +1 SHA verificado = spectral-action), guardián+acceptance exit 0.
- [X] T008 Gate G3 (panel reducido: revisor-devops/implementacion) + informe en `specs/011-pipeline-hardening/gates/`.
- [X] T009 Nota en `docs/15-devops-bitacora.md` (hallazgos de la 1ª ejecución real + fixes 011).
- [X] T010 (usuario) push al fork → **CI capa 1 en VERDE** (run 29328465834): Tests ✓, Contratos/Spectral ✓, guardián+code-review ✓, **build + Trivy ✓** (apt upgrade cerró CVEs del SO), imagen→GHCR ✓ → **SC-001/002/003 confirmados**. (El único job rojo, *Deploy dev Render*, es CD/DO-7 y falla fail-fast por falta del secret `RENDER_DEPLOY_HOOK_BACKEND` — configuración manual del usuario, no es 011.)

## Dependencias
Phase 1/2/3 independientes entre sí (ficheros/steps distintos) → paralelizables. Phase 4 tras 1-3.
