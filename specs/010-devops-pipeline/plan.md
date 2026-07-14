# Implementation Plan: Pipeline CI/CD (reto M12)

**Branch**: `chore/devops-do1-pipeline` (transversal, ADR-0004) | **Date**: 2026-07-14 | **Spec**: [spec.md](./spec.md)

**Input**: `specs/010-devops-pipeline/spec.md` (+ `docs/pipeline-spec.md` como detalle, `docs/pipeline-constitution.md` como gobernanza).

## Summary

Pipeline CI/CD de FieldOps que lleva el código de `feature/*` → `develop` → `main` de forma gobernada,
reproducible y trazable, con **flujos separados por componente** (back/front, filtros `paths:`). PR-gate con
la batería M9 + guardián de Constitución; CI de `develop` (imagen snapshot→GHCR + dist artifact) y de `main`
(imagen semver + GitHub Release); **no-rebuild** en CD; **CD a Render + Neon** en 3 entornos (dev auto / pre
auto / prod manual), faseado (**Fase 1 = dev**; **Fase 2 = pre+prod**). Enfoque técnico: GitHub Actions con
actions **pineadas por SHA**, permisos mínimos por job, y scripts **deterministas** (`validate-constitution.sh`,
`acceptance-check.sh`) como guardián/verificador; el guardián-agente vía API queda **opt-in y desactivado**.

## Technical Context

**Language/Version**: GitHub Actions (workflow YAML) + Bash (scripts) · Node 20 (jobs de CI) · Docker.
**Primary Dependencies**: actions pineadas por SHA (checkout, setup-node, upload/download-artifact, trivy-action,
softprops/action-gh-release); CLIs: gitleaks, oasdiff, Spectral (`@stoplight/spectral-cli`), Trivy, `gh`.
**Storage**: N/A en el pipeline (la app usa Postgres/Neon; el pipeline solo levanta Postgres de servicio para tests).
**Testing**: **no aplica cobertura de app.** Verificación = (a) validación estática (YAML válido, `grep` de
SHAs/permisos/`pull_request_target`), (b) **tests de los scripts** bash (`validate-constitution.sh`,
`acceptance-check.sh`) — único artefacto unit-testeable, (c) **ejecución real en Actions** como integración.
**Target Platform**: GitHub-hosted runners (`ubuntu-latest`); despliegue a Render; Postgres gestionada en Neon.
**Project Type**: pipeline CI/CD transversal (no es feature de app; ADR-0004).
**Performance Goals**: cada workflow de PR **< 10 min** (P95, NFR-P01) con caché npm + Postgres de servicio.
**Constraints**: **API-free/token-free** en CI (NFR-P03; excepción única opt-in = guardián-agente); **no-rebuild**
(FR-014); **SHA-pin** de 40 chars (FR-016); **permisos mínimos** por job (FR-017); paridad Postgres 16/Node 20.
**Scale/Scope**: 2 componentes × 3 tipos de workflow (pr-validation, ci-develop, ci-main) + `secrets-scan`
universal + `cd-prod` manual + (Fase 2) `cd-pre`; 3 entornos.

## Constitution Check

*GATE: los principios de la constitución del PROYECTO se evalúan contra una feature de PIPELINE. Los gates
pensados para features de app (contract-first, RBAC, hexagonal, TDD-coverage) **no aplican** al YAML de CI/CD
y se marcan N/A con justificación; los principios transversales (XVI, XIII, IX, VI) SÍ aplican y pasan.*

### Gate · Contract-First (Principio II) — **N/A (justificado)**

- [x] N/A: el pipeline no expone endpoints HTTP → no hay `contracts/*.openapi.yaml`. El "contrato" del
  pipeline es su **spec** (`spec.md` + `pipeline-spec.md`, FR-P en EARS), escrita **antes** que el YAML
  (SC-004/AC-1). Los contratos OpenAPI de la app (`contracts/auth|orders`) los **consume** el pipeline
  (Spectral/oasdiff en el PR-gate de back), no los define.

### Gate · RBAC y seguridad (Principios IV, IX, XI)

- [x] N/A RBAC de app (el pipeline no tiene roles de usuario). **Aplica** superficie de seguridad de la
  cadena CI/CD: SHA-pin (FR-016), permisos mínimos por job (FR-017), GHCR con `GITHUB_TOKEN` + packages
  privados (FR-018), higiene de secretos y `pull_request` no `_target` (FR-018b), autorización de prod
  (FR-021/022b). **Principio IX (ningún secreto en código):** gitleaks universal + secretos en GitHub
  Environment (FR-004/022). ✅
- [x] Distinción de fallos: los gates fallan con exit≠0 y bloquean el merge (FR-011). ✅

### Gate · Arquitectura Hexagonal (Principio III) — **N/A + verificado como gate**

- [x] N/A para el YAML, pero el **guardián** (FR-008) verifica que `domain/` de la app no importa infra —
  el pipeline **protege** la hexagonalidad, no la implementa.

### Gate · Calidad y verificación (Principios V, VI, VII, XIII, XIV)

- [x] **FRs en EARS** + trazabilidad: FR-001..022 en EARS; los FR-P se trazan por ACs (no por la matriz RF,
  §Verificación). ✅
- [x] **TDD/cobertura**: adaptado (Technical Context) — no hay cobertura de app; sí **tests de los 2 scripts**
  bash y validación estática. Se marca la desviación como consciente (YAML no es unit-testeable). ✅
- [x] **SC medibles** con oráculo objetivo (SC-001..009, tras remediación G1). **Evals promptfoo: N/A** (sin
  IA; §Verificación). **Gates adversariales G1/G2/G3**: G1 ✅ PASS; G2/G3 previstos. **0 bloqueantes** (XIII). ✅
- [x] **Principio XVI (pipeline gobernado)**: spec-antes-que-YAML, no-rebuild, SHA-pin, permisos mínimos,
  flujos por componente, ramas develop/main, CI<10min — todo en la spec y verificable. ✅

**Resultado**: PASS. Desviaciones (N/A de gates de app, cobertura adaptada, excepción opt-in a NFR-P03)
justificadas en Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/010-devops-pipeline/
├── plan.md              # este fichero
├── research.md          # decisiones técnicas (Phase 0)
├── quickstart.md        # cómo verificar el pipeline (Phase 1)
├── checklists/requirements.md
├── gates/               # gate-G1-*.json (PASS), G2/G3 futuros
└── tasks.md             # /speckit-tasks (Phase 2, siguiente)
```
*(Sin `data-model.md` ni `contracts/`: el pipeline no tiene entidades de datos ni contrato OpenAPI —
las "entidades" conceptuales — Componente/Imagen/Entorno/Gate — están en spec.md §Key Entities.)*

### Source Code (repository root)

```text
.github/
├── workflows/
│   ├── secrets-scan.yml            # gitleaks universal (todo PR + push develop/main)   [hecho]
│   ├── pr-validation-back.yml      # PR-gate back: gates M9 + guardián + code-review    [hecho, ajustes G3]
│   ├── pr-validation-front.yml     # PR-gate front: FR-P06 + image-scan + guardián      [hecho, ajustes G3]
│   ├── ci-develop-back.yml         # develop: CI + imagen snapshot :develop + deploy dev [hecho, ajustes G3]
│   ├── ci-develop-front.yml        # develop: idem front                                 [hecho, ajustes G3]
│   ├── ci-main-back.yml            # tag: CI + imagen semver + Release + guarda lockstep  [ajustes G3]
│   ├── ci-main-front.yml           # tag: idem front + guarda lockstep cruzada           [ajustes G3]
│   ├── cd-prod.yml                 # prod manual (workflow_dispatch) + validación vs pre  [ajustes G3]
│   └── cd-pre.yml                  # pre auto tras release (Fase 2)                       [PENDIENTE]
├── actions/                        # composite (si se refactoriza; SHA-pin aplica, FR-016)
└── branch-protection.md            # checks requeridos + tag/env rulesets (doc)          [hecho]
scripts/
├── validate-constitution.sh        # guardián determinista (FR-008)                      [hecho]
├── acceptance-check.sh             # verificador de trazabilidad (FR-007)                [hecho]
└── constitution-agent-review.sh    # guardián-agente opt-in (FR-009/FR-P21)              [PENDIENTE]
.spectral.yaml · .gitleaks.toml · .specify/gate-exceptions.txt                            [hecho]
docs/pipeline-spec.md · pipeline-constitution.md · 15-devops-bitacora.md · 16-devops-setup-manual.md [16 PENDIENTE]
```

**Structure Decision**: monorepo con flujos separados por componente (back/front) mediante `paths:`; scripts
deterministas en `scripts/`; gobernanza en `docs/pipeline-*`; sin carpeta `infra/` (no hay IaC en v1).

## Fases de implementación (orden para `/speckit-tasks`)

- **Fase 1 (cerrar ahora):** conformidad de lo ya implementado con la spec remediada + CD a **dev**:
  1. **[G3-H-005]** guarda de lockstep **cruzada** en `ci-main-back.yml` y `ci-main-front.yml` (verificar
     AMBOS `package.json` == tag).
  2. `softprops/action-gh-release` en `ci-main-*` (clarify #4) con assets de nombre distinto (FR-013 append).
  3. `constitution-agent-review.sh` + job `guardian-agent` **gated** (`if: secrets.ANTHROPIC_API_KEY != ''`)
     en los PR-gates (FR-009/FR-P21).
  4. job `code-review-gate` (dummy certificador) en los PR-gates (FR-010/FR-P22).
  5. CD dev: ya hecho (`deploy-dev` + `:develop` + smoke-test opcional).
  6. Alinear formato de imagen a `ghcr.io/<owner>/<repo>/fieldops-<comp>` (reto §4) y `--ignore-unfixed` (ya).
- **Fase 2 (siguiente):** `cd-pre.yml` (deploy auto a pre + **GitHub Deployment** que registra el semver,
  FR-020) **[G3-H-007]**; validación en `cd-prod.yml` de `version` == deployment de pre **[G3-H-006]`**;
  `environment` protection (dev/pre/prod) + `deployment_branch_policy` prod=main (FR-022b).
- **Transversal:** `docs/16-devops-setup-manual.md` (manual de configuración manual) como entregable final.

## Complexity Tracking

| Desviación | Por qué necesaria | Alternativa simple rechazada porque |
|-----------|-------------------|-------------------------------------|
| N/A de gates de app (contract/RBAC/hexagonal) | El pipeline es CI/CD, no una feature de dominio | Forzar OpenAPI/RBAC en YAML no tiene sentido; el pipeline los *protege*, no los implementa |
| Cobertura de tests adaptada (scripts + estático + Actions) | Un workflow YAML no es unit-testeable localmente | Exigir "80% cobertura del pipeline" es una métrica sin significado |
| Excepción opt-in a NFR-P03 (guardián-agente) | El reto pide Claude Code Action; el proyecto prohíbe API de pago | Cumplir la letra del reto siempre rompería "sin API de pago"; el opt-in reconcilia ambos |
| Formalización SDD retroactiva (spec tras YAML de DO-1..6) | La fase se gobernaba por XVI+pipeline-spec; se formaliza a Spec Kit a posteriori | "spec-antes-que-YAML" se ancla a pipeline-spec.md (anterior a todo .yml, SC-004) |
