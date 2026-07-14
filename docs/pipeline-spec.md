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

### CD — despliegue continuo (M12 · DO-7) — Render + Neon
> Target elegido: **Render** (cómputo, URL pública, free) + **Neon** (Postgres, free). Se despliega la
> **imagen ya publicada en GHCR** (no-rebuild). GitHub Actions orquesta (requisito duro). Entornos **dev
> (`develop`)** y **prod (`main`)**; se valida **dev primero**.
- **FR-P16 (deploy dev automático)**: WHEN el CI de `develop` publica las imágenes a GHCR THE pipeline
  SHALL desplegar automáticamente el entorno **dev** en Render (deploy-hook), que **consume la imagen**
  publicada (tag móvil `:develop`) sin reconstruir (coherente con FR-P12).
- **FR-P16b (deploy pre automático)**: WHEN el CI de `main` publica la release semver a GHCR THE pipeline
  SHALL desplegar automáticamente el entorno **pre** en Render, consumiendo la imagen **`:x.y.z` de ese
  release** (no un `:latest` desincronizable), sin reconstruir. *(Tercer entorno del reto: dev/pre/prod.)*
- **FR-P17 (deploy prod con aprobación manual)**: WHEN hay una release semver en `main` THE pipeline SHALL
  desplegar **prod** SOLO mediante disparo **manual** (`workflow_dispatch`) — sustituto del gate de
  aprobación de *GitHub Environments* (required reviewers), no disponible en repo privado Free.
  *(Limitación residual asumida: el disparo manual lo hace el mismo actor con push access; es un freno
  anti-fat-finger + confirmación explícita, NO una segunda aprobación independiente de dos personas. Se
  acepta por el límite del plan Free; el endurecimiento sería repo público o plan con Environments.)*
- **FR-P18 (secretos por entorno)**: THE pipeline SHALL tomar las credenciales de despliegue de cada
  entorno de **GitHub Environment secrets** — un environment por entorno **`dev` / `pre` / `prod`**, cada
  uno con SUS `RENDER_DEPLOY_HOOK_BACKEND` / `RENDER_DEPLOY_HOOK_FRONTEND` propios (aislamiento por entorno,
  NFR-P02). NUNCA en el repo. La `DATABASE_URL` de Neon (una BD/branch **independiente por entorno**) se
  configura en el **panel de Render** del servicio, no en el workflow.
- **FR-P19 (tag móvil por entorno)**: además del tag inmutable (`x.y.z-snapshot.{sha}` en dev, semver en
  prod), THE pipeline SHALL publicar un tag **móvil** que el servicio de Render rastrea (`:develop` para
  dev, `:latest` para prod); el deploy-hook redeploya ese tag. El tag inmutable queda para auditoría/rollback.
- **FR-P20 (migraciones al arrancar)**: THE backend SHALL aplicar `prisma migrate deploy` contra la Neon
  del entorno **al arrancar el contenedor** (ya en el CMD de la imagen, DO-2), sin paso de build en el deploy.
- **FR-P21 (guardián-agente, opt-in)**: WHEN existe `secrets.ANTHROPIC_API_KEY` THE PR-gate SHALL ejecutar
  el job `guardian-agent` (`scripts/constitution-agent-review.sh`, patrón M9: `claude -p … --output-format
  json`) que revisa la coherencia de los artefactos SDD contra la constitución y **bloquea el merge** si
  `aprobado=false`; WHILE no exista el secret THE job SHALL omitirse (skipped, coste 0). Es el "Claude Code
  Action" del reto; complementa (no sustituye) al guardián determinista FR-P07. Única excepción a NFR-P03.
- **FR-P22 (code-review registrado)**: WHEN corre cualquier PR-gate THE pipeline SHALL ejecutar el job
  `code-review-gate` que **certifica** el paso de revisión (marcador en el summary, exit 0) y es un **check
  requerido** por branch protection. Stage de certificación (dummy) por diseño del reto §4; no re-implementa
  otro gate ni sustituye la revisión humana.

## NFR
- **NFR-P01 (rendimiento)**: cada workflow de PR (back o front) completa en **< 10 minutos** (P95) — con
  caché de dependencias (`actions/setup-node` cache / `cache: npm`) y Postgres como *service container*.
- **NFR-P02 (paridad)**: la imagen de CI y `docker-compose` usan **la misma base** (Node 18+, Postgres 16)
  que dev/prod (Constitution §Stack).
- **NFR-P03 (API-free / token-free — coste)**: el CI **NUNCA por defecto** llama a la API de pago de Claude
  ni a ningún LLM. Todos los gates son **deterministas** (lint/tsc/tests/Spectral/oasdiff/gitleaks/Trivy +
  scripts de guardián/aceptación). Las **evals de promptfoo** corren **en local** sobre el plan (`claude -p`),
  **fuera del CI**. Los tests **mockean** el proveedor de IA. **FR-P15**: WHEN corre cualquier workflow THE
  pipeline SHALL NOT requerir claves de API de LLM ni ejecutar evals que llamen a un modelo — **con una única
  excepción explícita y opt-in**: el job **`guardian-agent` (FR-P21)**, que **solo** se ejecuta si el
  operador ha añadido `secrets.ANTHROPIC_API_KEY` a conciencia (asumiendo su coste); WHILE ese secret no
  exista, el job se **omite** (skipped) y el CI sigue siendo API-free/token-free. Es el guardián de
  Constitución que el reto pide como "Claude Code Action"; el modo por defecto del proyecto es el
  **determinista** (FR-P07). Restricción base: CLAUDE.md "Sin API de pago".

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
- **AC-8 (deploy dev automático)**: tras push a `develop`, el job `deploy-dev` **dispara el deploy-hook**
  de Render (verificable en Actions) y Render redeploya `:develop` de GHCR **sin reconstruir**. Si se
  configura el secret `RENDER_DEV_HEALTHCHECK_URL`, un **smoke-test** opcional espera el `200` del servicio;
  si no, el `200` se verifica manualmente (el redeploy de Render es asíncrono y el free tier puede tardar).
- **AC-9 (prod solo manual)**: `main` NO despliega prod de forma automática; prod solo se despliega vía
  `workflow_dispatch` de `cd-prod.yml` (comprobable: no hay `on: push` a prod en ese workflow).
- **AC-10 (secretos fuera del repo)**: `grep` no encuentra deploy-hooks ni `DATABASE_URL` reales en el
  repo; viven en GitHub Environment secrets (`dev`/`pre`/`prod`) y en el panel de Render.
- **AC-11 (deploy pre automático)**: tras publicar la release semver en `main`, el job `deploy-pre`
  dispara el deploy-hook del entorno **pre** (verificable en Actions) consumiendo `…:x.y.z`; con
  `RENDER_PRE_HEALTHCHECK_URL` configurado, el smoke-test espera `200` (mismo oráculo que AC-8). Simétrico
  a AC-8 (dev). *(Resuelve D-102.)*

## Política de versionado y releases (M12)

- **Versionado en lockstep (monorepo):** un tag semver `vX.Y.Z` libera **ambos componentes a la vez** con
  el **mismo `X.Y.Z`**. `backend/package.json` y `frontend/package.json` se mantienen **sincronizados**;
  cada workflow de `main` verifica `tag == su package.json` (fail-fast) — si divergen, el release de ese
  componente falla a propósito. *(No hay versionado independiente por componente; si algún día se quisiera,
  se usarían patrones de tag separados `backend-v*`/`frontend-v*`.)*
- **Trazabilidad de los FR del pipeline (FR-P01..P15):** NO viven en `docs/traceability.md` (esa es la
  matriz **RF→tarea→test de las features**, y `acceptance-check.sh` solo valida `FR-###`, no `FR-P###`).
  Los FR del pipeline se verifican por los **ACs de esta spec (AC-1..AC-7)** y por los propios workflows +
  guardián. Es deliberado: mezclar `FR-P###` en la matriz de features haría fallar `acceptance-check` (no
  tienen tarea/test de feature). El guardián se autoverifica vía AC-4.

## Fuera de alcance (declarado)
- **CD (DO-7)**: ~~diferido~~ → **en alcance** (Render + Neon, ver §CD arriba). El gate de aprobación
  automática de *GitHub Environments* sigue fuera (muro de repo privado Free) → sustituido por
  `workflow_dispatch` manual para prod (FR-P17).
- **IaC (Terraform) / cloud (AWS/GCP)**: posible endurecimiento futuro; v1 es PaaS (Render/Neon) sin IaC.
- **Multi-arch images, SBOM firmado, cosign**: no exigidos por el reto; posibles endurecimientos futuros.
