# Pipeline Spec — CI/CD de FieldOps (DO-1)

> Spec **ejecutable** del pipeline (Principio XVI + [`pipeline-constitution.md`](pipeline-constitution.md)).
> **Contract-first del pipeline**: este documento es **anterior en git** a cualquier `.yml` real (regla de
> oro). FRs en **EARS**, NFR cuantificado, **ACs** verificables. Alinea con **M9** (batería de gates de PR)
> y **M12** (contenerización, imágenes en GHCR, flujos por componente, ramas develop/main).
>
> Alcance actual: **Mínima DO-1→DO-6** (sin CD). CD = DO-7 (diferido).

## Qué se implementa (el reto) vs. qué es referencia (teoría)

- **Driver = el RETO M12**, tal como está **destilado en `docs/06-roadmap.md` §Fase DevOps** (DO-1..DO-6 =
  "Mínima del reto"; DO-7 CD = opcional). Es lo que hay que **entregar**: contenerización (Dockerfile
  multi-stage + `docker-compose` de las 3 capas), **PR-gate con guardián de Constitución**, CI en
  `develop`/`main` con **imágenes en GHCR** (`x.y.z-snapshot.{sha}` / semver), **flujos separados por
  componente** (`paths:`) y branch protection. La aprobación a prod topa con el muro de **repo privado
  Free** (por eso el CD es opcional).
- **M9/M10 = teoría y ejemplo de referencia** (no el entregable): la batería de gates de PR (lint/test ·
  Spectral · oasdiff · gitleaks · acceptance-check · Trivy) y el *verificador determinista de constitución*
  (`validate-constitution.sh`, que en su día quedó en backlog, docs/13) **inspiran** el contenido de los
  gates del reto. Se implementan **porque el roadmap del reto los pide** (DO-3), usando M9 como plantilla de
  cómo hacerlos — no como fin en sí mismos.

## Entregables y su orden (DO-1→DO-6)

| ID | Entregable | Fichero(s) | Depende |
|----|-----------|-----------|---------|
| DO-1 | Gobernanza + esta spec + bitácora | `docs/pipeline-{constitution,spec}.md`, `docs/15-devops-bitacora.md` | — |
| DO-2 | Contenerización | `backend/Dockerfile`, `frontend/Dockerfile`, `.dockerignore`, `docker-compose.yml` (db·back·front) | DO-1 |
| DO-3 | PR-gate backend | `.github/workflows/pr-validation-back.yml` + `scripts/validate-constitution.sh` + `scripts/acceptance-check.sh` | DO-1, DO-2 |
| DO-4 | CI develop backend | `.github/workflows/ci-develop-back.yml` (imagen snapshot→GHCR) | DO-3 |
| DO-5 | CI main backend | `.github/workflows/ci-main-back.yml` (imagen semver + Release) | DO-4 |
| DO-6 | Workflows de front | `.github/workflows/pr-validation-front.yml`, `ci-develop-front.yml`, `ci-main-front.yml` | FE-1, DO-3 |

## Requisitos funcionales (EARS)

### Gates de PR (M9) — DO-3 (back) / DO-6 (front)
- **FR-P01**: WHEN se abre/actualiza un PR que toca `backend/**` o `contracts/**` THE pipeline SHALL
  ejecutar el workflow de back (y NO el de front); y viceversa para `frontend/**` (filtros `paths:`).
- **FR-P02**: WHEN corre el PR-gate de back THE pipeline SHALL ejecutar `lint` + `typecheck` + `test`
  (Vitest con Postgres de servicio) y **fallar el check** si alguno no pasa.
- **FR-P03**: WHEN el PR toca `contracts/**` THE pipeline SHALL ejecutar **Spectral** (lint del OpenAPI) y
  **oasdiff** (detección de cambios **incompatibles** contra la base) y fallar ante violaciones o breaking
  changes no versionados.
- **FR-P04**: WHEN corre cualquier PR-gate THE pipeline SHALL ejecutar **gitleaks** (secretos, con
  `.gitleaks.toml` para fixtures) y fallar si detecta secretos.
- **FR-P05**: WHEN corre el PR-gate de back THE pipeline SHALL construir la imagen y ejecutar **Trivy**;
  SHALL fallar si hay vulnerabilidades `CRITICAL`/`HIGH` corregibles.
- **FR-P06**: WHEN corre el PR-gate de front THE pipeline SHALL ejecutar `lint` (eslint+stylelint),
  `typecheck` (incl. `codegen:check` y la aserción Zod↔contrato), `test` (Vitest+axe) y `build`.
- **FR-P07 (guardián de Constitución, M9)**: WHEN corre cualquier PR-gate THE pipeline SHALL ejecutar
  `scripts/validate-constitution.sh`, que **falla el merge** si: (a) hay un `.yml` de workflow **sin** spec
  de pipeline previa en git; (b) una feature con `.yml`/código carece de sus informes de gate G1/G2/G3;
  (c) quedan marcadores `[NEEDS CLARIFICATION]` en specs activas; (d) se importa infra desde `domain/`
  (arch). Determinista, exit 0/1.
- **FR-P08 (acceptance-check, M9)**: WHEN corre el PR-gate THE pipeline SHALL ejecutar
  `scripts/acceptance-check.sh`, que verifica la **trazabilidad**: cada FR de la spec de la feature tocada
  tiene ≥1 tarea y ≥1 test nombrable (`docs/traceability.md`); falla si hay FR huérfano.
- **FR-P09**: WHEN un PR-gate falla THE pipeline SHALL **bloquear el merge** (branch protection), sin vía
  de excepción automática (coherente con XIII).

### CI de integración/release (M12) — DO-4/DO-5
- **FR-P10**: WHEN se hace push a `develop` THE pipeline SHALL ejecutar el CI completo y, si pasa,
  **construir y publicar** la imagen `ghcr.io/<org>/fieldops-<componente>:x.y.z-snapshot.{sha}` en GHCR, y
  subir la dist como artifact (retención 90 días).
- **FR-P11**: WHEN se hace push/merge a `main` con tag semver THE pipeline SHALL publicar
  `ghcr.io/<org>/fieldops-<componente>:x.y.z` (semver) y crear un **GitHub Release** con la dist.
- **FR-P12**: THE pipeline SHALL **no reconstruir** imágenes en despliegue: la publicada en GHCR desde CI
  es la única desplegable (no-rebuild, XVI §4). *(Aplica a DO-7; se declara ya.)*

### Cadena de suministro (transversal)
- **FR-P13**: THE pipeline SHALL fijar todas las acciones **por SHA de 40 chars** (no por tag móvil).
- **FR-P14**: THE pipeline SHALL declarar `permissions: contents: read` por defecto y elevar
  (`packages: write` / `contents: write`) **solo en el job** que publica imagen/Release.

## NFR
- **NFR-P01 (rendimiento)**: cada workflow de PR (back o front) completa en **< 10 minutos** (P95) — con
  caché de dependencias (`actions/setup-node` cache / `cache: npm`) y Postgres como *service container*.
- **NFR-P02 (paridad)**: la imagen de CI y `docker-compose` usan **la misma base** (Node 18+, Postgres 16)
  que dev/prod (Constitution §Stack).
- **NFR-P03 (API-free / token-free — coste)**: el CI **NUNCA** llama a la API de pago de Claude ni a ningún
  LLM. Todos los gates son **deterministas** (lint/tsc/tests/Spectral/oasdiff/gitleaks/Trivy + scripts de
  guardián/aceptación). Las **evals de promptfoo** (features con IA, p. ej. 007) corren **en local** sobre el
  plan (`claude -p`), **fuera del CI** (como ya documenta el `ci.yml` actual). Los tests **mockean** el
  proveedor de IA. Restricción del proyecto (CLAUDE.md "Sin API de pago") y del reto. **FR-P15**: WHEN corre
  cualquier workflow THE pipeline SHALL NOT requerir claves de API de LLM ni ejecutar evals que llamen a un
  modelo.

## Criterios de aceptación (ACs) — verificables

- **AC-1 (spec-antes-que-YAML)**: `git log --diff-filter=A` muestra `docs/pipeline-spec.md` **antes** que el
  primer `.github/workflows/*-validation-*.yml`. *(Este commit de DO-1 lo garantiza.)*
- **AC-2 (paths)**: un PR que solo toca `frontend/**` **no** dispara el workflow de back (y viceversa),
  comprobable en la pestaña Actions.
- **AC-3 (gate rojo bloquea)**: un PR con un test roto / secreto / OpenAPI inválido **no es mergeable**
  (check requerido en rojo).
- **AC-4 (guardián)**: `scripts/validate-constitution.sh` sale **1** si se añade un workflow sin spec previa
  o una feature sin informes de gate; **0** en el estado actual del repo.
- **AC-5 (imagen)**: tras merge a `develop`, existe en GHCR `fieldops-backend:x.y.z-snapshot.{sha}`; tras
  release en `main`, `fieldops-backend:x.y.z`.
- **AC-6 (SHA-pin/permisos)**: `grep` en `.github/workflows/*.yml` no encuentra `uses: .*@v[0-9]` (todo por
  SHA) y todo workflow declara `permissions:` mínimas.
- **AC-7 (CI<10min)**: la duración media de los workflows de PR en Actions es < 10 min.

## Fuera de alcance (declarado)
- **CD (DO-7)**: despliegue a PaaS + aprobación manual a prod. Diferido (roadmap; muro de repo privado Free).
- **Multi-arch images, SBOM firmado, cosign**: no exigidos por el reto; posibles endurecimientos futuros.
