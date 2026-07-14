# Feature Specification: Pipeline CI/CD (reto M12)

**Feature Branch**: `chore/devops-do1-pipeline` (transversal, ADR-0004 — no rama-por-spec)

**Created**: 2026-07-14

**Status**: Draft (reconcilia trabajo ya iniciado: `docs/pipeline-spec.md`, `docs/pipeline-constitution.md`, `.github/workflows/*`)

**Input**: Reto M12 (`RETO-M12.md`) — "convierte el brief de entrega en una spec verificable antes de escribir una línea de YAML".

> **Nota SDD.** Esta spec formaliza en el flujo Spec Kit la fase DevOps que hasta ahora se gobernaba solo
> por el Principio XVI + `docs/pipeline-spec.md`. Aquélla pasa a ser **documento de apoyo**; ésta es la spec
> de la feature. El **detalle FR-P01..P20 y ACs** vive en `docs/pipeline-spec.md` y se referencia aquí.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Nadie mergea a `develop` sin pasar la batería de validación (Priority: P1)

Como equipo, queremos que toda PR de `feature/*` → `develop` pase **automáticamente** todas las gates del
componente tocado (M9), de modo que no entre a la línea de integración código que no cumple.

**Why this priority**: es el corazón del reto (Capa 1) y lo que impide "que cada uno haga lo que quiera".
Sin esto, el resto (imágenes, deploys) propaga defectos.

**Independent Test**: abrir una PR con un test roto / un secreto / un OpenAPI inválido → el check queda en
rojo y el merge se bloquea; una PR limpia → todas las gates verdes.

**Acceptance Scenarios**:

1. **Given** una PR que solo toca `backend/**`, **When** se abre/actualiza, **Then** corre el workflow de
   back (lint·test, Spectral, oasdiff, Gitleaks, verificador de ACs, Trivy, guardián, code-review) y **no**
   el de front.
2. **Given** una PR que solo toca `frontend/**`, **When** se abre, **Then** corre el workflow de front
   (lint+stylelint, typecheck+codegen, test+axe, build, Trivy, guardián, code-review) y **no** el de back.
3. **Given** cualquier gate en rojo, **When** se intenta mergear, **Then** el merge queda bloqueado (branch
   protection), sin vía de excepción automática.

---

### User Story 2 - Cada merge deja una imagen trazable y reproducible (Priority: P1)

Como equipo, queremos que al integrar en `develop`/`main` se construya y publique **una** imagen por
componente en un registro central (GHCR), etiquetada con su versión, y que el `dist` quede archivado; así
siempre sabemos "qué hay" y podemos desplegar exactamente lo que pasó CI.

**Why this priority**: sin artefacto versionado y trazable no hay CD fiable ni rollback.

**Independent Test**: merge a `develop` → existe en GHCR `…:x.y.z-snapshot.{sha}` y el `dist` como artifact
(90 d); release semver en `main` → `…:x.y.z` + GitHub Release con el `dist`.

**Acceptance Scenarios**:

1. **Given** un merge a `develop` que toca back, **When** pasa el CI, **Then** se publica
   `ghcr.io/<owner>/<repo>/fieldops-backend:x.y.z-snapshot.{sha}` y se sube el `dist` (artifact, 90 d).
2. **Given** una release semver en `main`, **When** pasa el CI, **Then** se publica `…:x.y.z` y se crea un
   GitHub Release con el `dist` como asset.
3. **Given** una imagen publicada, **When** se despliega, **Then** el deploy **usa esa imagen** (no la
   reconstruye).

---

### User Story 3 - El código llega a los entornos de forma gobernada (Priority: P2)

Como equipo, queremos despliegue continuo **automático a dev** al integrar en `develop`, **automático a
pre** al llegar a `main`, y **a prod solo con autorización manual**, para no tener sorpresas.

**Why this priority**: Capa 2 (opcional en el reto). Entrega la URL demostrable, pero no bloquea la Capa 1.

**Independent Test**: merge a `develop` → el servicio dev sirve la nueva imagen; llegar a `main` → pre se
actualiza solo; prod solo cambia tras un disparo manual explícito.

**Acceptance Scenarios**:

1. **Given** una imagen snapshot publicada en `develop`, **When** termina el CI, **Then** el entorno **dev**
   se redespliega automáticamente con esa imagen (sin reconstruir).
2. **Given** una release en `main`, **When** termina el CI, **Then** **pre** se redespliega automáticamente.
3. **Given** que pre está desplegado, **When** alguien quiere pasar a **prod**, **Then** se requiere un
   **disparo manual explícito** (no ocurre solo).

---

### Edge Cases

- **PR que toca `contracts/**`**: dispara **ambos** gates (back valida Spectral/oasdiff; front valida que
  el codegen de tipos sigue cuadrando). Es deseado: un cambio de contrato afecta a los dos.
- **Tag semver que no coincide con `package.json`**: el CI de `main` **falla explícitamente** (no publica).
- **Tag creado sobre un commit que no está en `main`**: el release **aborta** (verificación de procedencia).
- **Falta el secret del deploy-hook / de la API del agente**: el job correspondiente **falla con mensaje
  claro** (deploy) o **se omite** (guardián-agente, gated), sin romper el resto.
- **Descarga de binario (gitleaks/oasdiff) manipulada**: verificación de **checksum SHA256** → falla cerrado.

## Requirements *(mandatory)*

> **EARS.** El detalle completo y numerado (FR-P01..P20, NFR-P01..P03, AC-1..AC-10) está en
> `docs/pipeline-spec.md`. Aquí se enumeran los FR de la feature (agrupados) en EARS; cada uno es testeable.

### Functional Requirements

**Gates de PR (Capa 1):**
- **FR-001**: WHEN se abre/actualiza una PR que toca `backend/**` o `contracts/**` THE pipeline SHALL
  ejecutar el workflow de back y NO el de front; y simétrico para `frontend/**` (filtros `paths:`).
- **FR-002**: WHEN corre el PR-gate de back THE pipeline SHALL ejecutar `lint`+`typecheck`+`test` (Vitest
  con Postgres de servicio) y fallar el check si alguno no pasa.
- **FR-003**: WHEN la PR toca `contracts/**` THE pipeline SHALL ejecutar Spectral (lint OpenAPI) y oasdiff
  (breaking changes vs base) y fallar ante violaciones.
- **FR-004**: WHEN corre cualquier PR-gate THE pipeline SHALL ejecutar Gitleaks (con `.gitleaks.toml`) y
  fallar si detecta secretos.
- **FR-005**: WHEN corre el PR-gate de back THE pipeline SHALL construir la imagen y ejecutar Trivy,
  fallando ante `CRITICAL/HIGH` corregibles; el PR-gate de front hace lo propio con su imagen nginx.
- **FR-006**: WHEN corre el PR-gate de front THE pipeline SHALL ejecutar `lint`(eslint+stylelint),
  `typecheck`(incl. `codegen:check` = aserción tipos↔contrato), `test`(Vitest+axe) y `build`.
- **FR-007 (verificador de ACs)**: WHEN corre el PR-gate THE pipeline SHALL ejecutar un verificador de
  trazabilidad (`scripts/acceptance-check.sh`) que falla si un FR de la matriz carece de tarea+test.
- **FR-008 (guardián de Constitución — determinista, always-on)**: WHEN corre cualquier PR-gate THE
  pipeline SHALL ejecutar `scripts/validate-constitution.sh` (determinista, 0 coste): orden spec→YAML,
  gates G1/G2/G3 por spec, sin `[NEEDS CLARIFICATION]`, `domain/` sin infra. Falla el merge si viola algo.
- **FR-009 (guardián de Constitución — agente/API, opt-in)**: WHEN existe el secret `ANTHROPIC_API_KEY`
  THE pipeline SHALL ejecutar además un guardián basado en el **agente** (`claude -p`/Claude Code Action,
  patrón M9) que revisa la coherencia de los artefactos SDD contra la constitución; WHILE el secret no esté
  configurado THE job SHALL omitirse (no bloquea). *(Preparado y desactivado por defecto — decisión del
  usuario; ver Assumptions/Desvíos.)*
- **FR-010 (code review registrado)**: WHEN corre cualquier PR-gate THE pipeline SHALL ejecutar un job que
  **certifica** el paso de code-review (stage nombrado, exigible como check).
- **FR-011**: WHEN un PR-gate falla THE pipeline SHALL bloquear el merge (branch protection), sin excepción
  automática.

**CI de integración/release (Capa 1):**
- **FR-012**: WHEN se integra en `develop` (componente tocado) THE pipeline SHALL ejecutar CI completo y, si
  pasa, construir la imagen `…:x.y.z-snapshot.{sha}`, publicarla en GHCR y subir el `dist` como artifact (90 d).
- **FR-013**: WHEN llega a `main` una versión semver (tag creado antes del merge) THE pipeline SHALL publicar
  `…:x.y.z` y crear un GitHub Release con el `dist` como asset.
- **FR-014 (no-rebuild)**: THE pipeline SHALL construir la imagen UNA vez (en el job de CI, escaneada por
  Trivy) y **reutilizarla** (no reconstruir) en publicación y despliegue.
- **FR-015 (procedencia)**: WHEN se dispara un release desde un tag semver THE pipeline SHALL verificar que
  el commit es ancestro de `main` y que el tag coincide con `package.json`; si no, aborta.

**Cadena de suministro (transversal):**
- **FR-016**: THE pipeline SHALL fijar todas las actions externas por **SHA de 40 chars** (ningún `@vN`).
- **FR-017**: THE pipeline SHALL declarar `permissions: contents: read` por defecto y elevar
  (`packages: write` / `contents: write`) solo en el job que publica imagen / Release.
- **FR-018**: THE pipeline SHALL autenticarse en GHCR con `GITHUB_TOKEN` (sin secretos extra).

**CD por entornos (Capa 2 — faseado):**
- **FR-019 (dev, Fase 1)**: WHEN el CI de `develop` publica la imagen THE pipeline SHALL desplegar
  automáticamente el entorno **dev** (deploy-hook a Render), consumiendo la imagen (`:develop`), sin rebuild.
- **FR-020 (pre, Fase 2)**: WHEN el CI de `main` publica la release THE pipeline SHALL desplegar
  automáticamente **pre** (Render), consumiendo la imagen semver/`:latest`.
- **FR-021 (prod, Fase 2)**: WHEN alguien lo autoriza THE pipeline SHALL desplegar **prod** SOLO por disparo
  **manual** (`workflow_dispatch` + confirmación) — sustituto del gate de GitHub Environments (no en Free).
- **FR-022 (secretos por entorno)**: THE pipeline SHALL tomar credenciales de deploy de **GitHub
  Environment secrets** (`dev`/`pre`/`prod`); `DATABASE_URL` (Neon) se configura en el panel de Render.

### Key Entities

- **Componente**: `backend` | `frontend` — unidad con su propio flujo CI/CD y filtro `paths:`.
- **Imagen**: artefacto desplegable en GHCR; tag inmutable (`x.y.z-snapshot.{sha}` / `x.y.z`) + tag móvil
  por entorno (`:develop` / `:latest`).
- **Entorno**: `dev` (develop, auto) | `pre` (main, auto) | `prod` (manual). Cada uno con sus secretos.
- **Gate**: comprobación determinista (o agente opt-in) que bloquea el merge.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: el 100% de las PRs con un fallo inyectado (test roto / secreto / OpenAPI inválido) quedan
  **no-mergeables** (check requerido en rojo).
- **SC-002**: una PR que solo toca `frontend/**` **no** ejecuta ningún job del workflow de back (y viceversa).
- **SC-003**: cada workflow de PR (back o front) completa en **< 10 minutos** (P95).
- **SC-004**: `git log --diff-filter=A` muestra `docs/pipeline-spec.md` **anterior** al primer workflow de
  validación (spec-antes-que-YAML, verificable por el instructor).
- **SC-005**: tras merge a `develop`, la imagen `…:x.y.z-snapshot.{sha}` existe en GHCR y el `dist` está
  archivado (90 d); tras release en `main`, existe `…:x.y.z` y un GitHub Release con el `dist`.
- **SC-006**: la imagen desplegada en un entorno es **bit a bit** la que pasó CI (no hay segundo build).
- **SC-007**: `grep` en `.github/workflows/*.yml` no encuentra `uses: …@v[0-9]` (todo por SHA) y todo
  workflow declara `permissions:` mínimas.
- **SC-008 (Fase 1)**: tras merge a `develop`, el entorno **dev** sirve la nueva versión en una **URL
  pública** (verificable manualmente o con smoke-test si hay healthcheck configurado).
- **SC-009 (Fase 2)**: **prod** nunca cambia sin un disparo manual explícito (no hay `on: push` que lo toque).

## Verificación (determinista, sin IA) *(sustituye a la sección de evals promptfoo)*

Esta feature **no tiene componente IA** y su CI es **API-free** (NFR-P03): los SC se verifican con
herramientas deterministas (validación YAML, `grep` de SHAs/permisos, `git log`, guardián y acceptance-check
como scripts exit 0/1, y la ejecución real en Actions). No hay evals promptfoo. El **único** uso opcional de
un modelo es el **guardián-agente (FR-009), desactivado por defecto**.

## Fases de implementación

- **Fase 1 (ahora):** Capa 1 completa (6 workflows de gate/CI + no-rebuild + historial) + **CD solo a `dev`**
  + guardián determinista + guardián-agente **preparado y desactivado**.
- **Fase 2 (siguiente):** CD a **pre** (auto) y **prod** (manual) + activación opt-in del guardián-agente
  cuando el usuario configure `ANTHROPIC_API_KEY`.

## Assumptions

- **Desvío 1 (guardián):** el reto pide el guardián como Claude Code Action (API del agente). Se implementa
  en **dos modos**: determinista *always-on* (cumple "sin API de pago" del proyecto, 0 coste) **+** agente
  vía API **opt-in y desactivado por defecto** (job gated a `secrets.ANTHROPIC_API_KEY`), preparado según el
  ejemplo de M9. El usuario añade la key y lo activa cuando quiera. Se documenta en `pipeline-constitution.md`.
- **Desvío 2 (aprobación prod):** el gate de GitHub Environments (required reviewers) no está en repo
  privado del plan Free → se sustituye por `workflow_dispatch` manual + confirmación. Limitación residual:
  lo lanza el mismo actor con push access (no es 2ª aprobación independiente).
- **Desvío 3 (cloud):** el cloud de CD es libre (reto §8) → **Render** (consume imagen de GHCR, no-rebuild) +
  **Neon** (Postgres), gratis y con URL pública.
- La configuración en GitHub/Render/Neon (secrets por Environment, servicios, DB, rulesets) la realiza el
  **usuario a mano** (documentada en el manual de setup).
- `backend/package.json` y `frontend/package.json` avanzan en **lockstep** (mismo `x.y.z` por tag).
