# Feature Specification: Pipeline CI/CD (reto M12)

**Feature Branch**: `chore/devops-do1-pipeline` (transversal, ADR-0004 — no rama-por-spec)

**Created**: 2026-07-14

**Status**: Draft (reconcilia trabajo ya iniciado: `docs/pipeline-spec.md`, `docs/pipeline-constitution.md`, `.github/workflows/*`)

**Input**: Reto M12 (`RETO-M12.md`) — "convierte el brief de entrega en una spec verificable antes de escribir una línea de YAML".

> **Nota SDD.** Esta spec formaliza en el flujo Spec Kit la fase DevOps que hasta ahora se gobernaba solo
> por el Principio XVI + `docs/pipeline-spec.md`. Aquélla pasa a ser **documento de apoyo**; ésta es la spec
> de la feature. El **detalle FR-P01..P22 y AC-1..AC-11** vive en `docs/pipeline-spec.md` y se referencia aquí.

## Clarifications

### Session 2026-07-14

- Q: ¿Cómo se detecta qué componente cambió para disparar solo su workflow? → A: **`paths:` nativo** en el
  `on:` de cada workflow (`backend/**`+`contracts/**` vs `frontend/**`+`contracts/**`); sin actions extra.
- Q: ¿De dónde sale la versión semver en `main`? → A: **del tag git `vX.Y.Z`**, verificando que **coincide
  con `package.json`** (fail-fast si divergen).
- Q: ¿Qué evento dispara el CI de release en `main`? → A: **push de tag `vX.Y.Z`** (+ verificación de
  procedencia: el commit del tag debe ser ancestro de `main`).
- Q: ¿Cómo se publica el `dist` en cada rama? → A: **develop = `actions/upload-artifact` (90 d)**;
  **main = asset del GitHub Release vía `softprops/action-gh-release`** (permanente).

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

> **EARS.** El detalle completo y numerado (FR-P01..P22, NFR-P01..P03, AC-1..AC-11) está en
> `docs/pipeline-spec.md`. Aquí se enumeran los FR de la feature (agrupados) en EARS; cada uno es testeable.

### Functional Requirements

**Gates de PR (Capa 1):**
- **FR-001**: WHEN se abre/actualiza una PR que toca `backend/**` o `contracts/**` THE pipeline SHALL
  ejecutar el workflow de back; WHEN toca `frontend/**` o `contracts/**` SHALL ejecutar el de front. Un
  cambio SOLO en `backend/**` NO dispara front (y viceversa); un cambio en `contracts/**` dispara **ambos**
  (los dos consumen el contrato). *(Resuelve H-001: `contracts/**` está en los `paths:` de los dos.)*
- **FR-002**: WHEN corre el PR-gate de back THE pipeline SHALL ejecutar `lint`+`typecheck`+`test` (Vitest
  con Postgres de servicio) y fallar el check si alguno no pasa.
- **FR-003**: WHEN la PR toca `contracts/**` THE pipeline SHALL ejecutar Spectral (lint OpenAPI) y oasdiff
  (breaking changes vs base) y fallar ante violaciones.
- **FR-004**: WHEN corre cualquier PR-gate THE pipeline SHALL ejecutar Gitleaks (con `.gitleaks.toml`) y
  fallar si detecta secretos.
- **FR-005**: WHEN corre el PR-gate de back THE pipeline SHALL construir la imagen y ejecutar Trivy con
  **`--severity CRITICAL,HIGH --ignore-unfixed --exit-code 1 --vuln-type os,library`**, fallando ante
  `CRITICAL/HIGH` **con fix disponible**; el PR-gate de front hace lo propio con su imagen nginx. Las
  `CRITICAL/HIGH` **sin fix** (`unfixed`) no bloquean pero **aparecen en el reporte** de Trivy (visibles).
- **FR-006**: WHEN corre el PR-gate de front THE pipeline SHALL ejecutar `lint`(eslint+stylelint),
  `typecheck`(incl. `codegen:check` = aserción tipos↔contrato), `test`(Vitest+axe) y `build`.
- **FR-007 (verificador de ACs)**: WHEN corre el PR-gate THE pipeline SHALL ejecutar un verificador de
  trazabilidad (`scripts/acceptance-check.sh`) que falla si una fila FR de `docs/traceability.md` carece de
  tarea+test. *(Ámbito: FR de features de app, `FR-###`; los `FR-P###`/FR de esta feature de pipeline se
  verifican por sus ACs y por los gates G1/G2/G3, no por la matriz — ver §Verificación. Resuelve H-014.)*
- **FR-008 (guardián de Constitución — determinista, always-on)**: WHEN corre cualquier PR-gate THE
  pipeline SHALL ejecutar `scripts/validate-constitution.sh` (determinista, 0 coste): orden spec→YAML,
  gates G1/G2/G3 por spec, sin `[NEEDS CLARIFICATION]`, `domain/` sin infra. Exit 1 → falla el merge.
- **FR-009 (guardián de Constitución — agente/API, opt-in y BLOQUEANTE si activo)**: WHILE NO exista el
  secret `ANTHROPIC_API_KEY` THE job SHALL omitirse (skipped, no bloquea, coste 0). WHEN existe el secret
  THE pipeline SHALL ejecutar el guardián-agente (script `scripts/constitution-agent-review.sh`, patrón M9:
  `claude -p … --output-format json`) que devuelve `{aprobado: bool, …}`; si `aprobado=false` **falla el
  check y bloquea el merge** (es un gate, no advisory — coherente con FR-011). Requiere la **excepción
  documentada a NFR-P03** (ver Assumptions/Desvío 1). *(Preparado y desactivado por defecto — decisión del
  usuario; resuelve H-006, D-002 parcial.)*
- **FR-010 (code review registrado)**: WHEN corre cualquier PR-gate THE pipeline SHALL ejecutar un job
  **`code-review-gate`** que **certifica** que el paso de revisión se ejecutó, emitiendo un marcador en el
  *step summary* y **exit 0** (stage nombrado, exigible como check requerido por branch protection). Es un
  **stage de certificación (dummy) por diseño del reto §4** — NO sustituye la revisión humana ni re-implementa
  otro gate; su valor es dejar el paso *nombrado y requerido*. *(Resuelve T-002: condición de fallo = el job
  no llega a completarse; si completa, exit 0.)*
- **FR-011**: WHEN un PR-gate falla (incluido FR-009 si está activo) THE pipeline SHALL bloquear el merge
  (branch protection), sin excepción automática.

**CI de integración/release (Capa 1):**
- **FR-012**: WHEN se integra en `develop` (componente tocado, `paths:`) THE pipeline SHALL ejecutar el
  **CI de integración** — los mismos jobs de calidad del PR-gate del componente (`lint`+`typecheck`+`test`
  [+`build`]) — y, si pasa, **construir la imagen UNA vez**, escanearla con Trivy (FR-005) y publicar en GHCR
  **dos tags de la MISMA imagen**: el inmutable `…:x.y.z-snapshot.{sha}` (auditoría/rollback) y el **móvil
  `:develop`** (que rastrea dev); además subir el `dist` como **workflow artifact** (`actions/upload-artifact`,
  **90 días**). *(Resuelve T-003 [enumera jobs], H-007 [publica :develop].)*
- **FR-013**: WHEN se empuja un **tag semver `vX.Y.Z`** THE pipeline SHALL, por cada componente, usar el tag
  como versión (verificando que **coincide con `package.json`**, FR-015), construir la imagen UNA vez,
  escanearla (Trivy) y publicar en GHCR el inmutable `…:x.y.z` **y** el móvil **`:latest`** (misma imagen), y
  crear/actualizar (idempotente) un **GitHub Release** del tag con el `dist` como asset vía
  **`softprops/action-gh-release`**. Back y front suben **assets con nombres distintos**
  (`fieldops-backend-{tag}.tar.gz` / `fieldops-frontend-{tag}.tar.gz`) al MISMO Release (modo *append*, sin
  pisarse); si ambos workflows concurren, la action hace *upsert* del Release y añade cada asset por su
  nombre. *(Resuelve H-002.)*
- **FR-013b (versionado en lockstep, verificación simétrica)**: THE pipeline SHALL tratar un tag semver como
  release **de ambos componentes a la vez** (publica `fieldops-backend:x.y.z` **y** `fieldops-frontend:x.y.z`
  con el mismo `x.y.z`, aunque un componente no haya cambiado). **Guarda de lockstep (simétrica):** el primer
  job de CADA workflow de `main` (back y front) verifica que **`backend/package.json` Y `frontend/package.json`
  coinciden AMBOS** con la versión del tag (tras normalizar el prefijo: `version == ${GITHUB_REF_NAME#v}`); si
  cualquiera de los dos diverge, **AMBOS workflows fallan** (ninguno publica), evitando el release parcial. Si
  aun así un componente falla por un gate de calidad, el tag queda **inválido** y la recuperación es **subir
  una nueva versión de parche** (`vX.Y.Z+1`) — NO reutilizar/sobrescribir el mismo tag (preserva la
  inmutabilidad de `…:x.y.z` para auditoría/rollback, SC-005/006). Si por excepción se re-tagea el mismo
  `x.y.z`, la imagen se reconstruye de forma **determinista** desde el mismo `package-lock.json`. El deploy a
  pre (FR-020) NO procede sin ambas imágenes. *(Resuelve H-001, H-004, H-008.)*
- **FR-014 (no-rebuild)**: THE pipeline SHALL construir la imagen **una sola vez por workflow de CI**
  (develop o main), escanearla con Trivy y **reutilizar esa misma imagen** (vía `docker save/load` entre
  jobs) para publicar y desplegar; **el CD NUNCA reconstruye** — despliega la imagen de GHCR que produjo ese
  CI. *(Aclara H-004/SC-006: "no-rebuild" es dentro-del-workflow y en el deploy; develop y main son builds de
  CI distintos por evento, cada uno determinista desde el mismo `package-lock.json`.)*
- **FR-015 (procedencia)**: WHEN se dispara un release desde un tag semver THE pipeline SHALL verificar que
  el commit del tag es **ancestro de `main`** (`git merge-base --is-ancestor`) y que el tag coincide con
  `package.json`; si no, **aborta** (no publica ni despliega).

**Cadena de suministro (transversal):**
- **FR-016**: THE pipeline SHALL fijar todas las actions externas por **SHA de 40 chars** (ningún `@vN`), en
  `.github/workflows/**` y `.github/actions/**` (composite, si los hubiera). *(Resuelve H-015.)*
- **FR-017**: THE pipeline SHALL declarar `permissions: contents: read` por defecto y elevar SOLO en el job
  que lo necesita: `packages: write` (publica imagen), `contents: write` (Release). Ningún workflow declara
  `write-all`. *(Resuelve T-006: el mínimo se verifica por revisión + ausencia de `write-all`.)*
- **FR-018**: THE pipeline SHALL autenticarse en GHCR con `GITHUB_TOKEN` (sin secretos extra). Los packages
  quedan **privados**; Render hace `pull` con una credencial de registro (PAT read-only) configurada en su
  panel. *(Resuelve S-003.)*
- **FR-018b (higiene de secretos)**: THE pipeline SHALL NO volcar secretos en logs. **Oráculo objetivo:**
  `grep -rniE 'echo[^|]*\$\{\{\s*secrets\.' .github/workflows .github/actions | grep -v 'password-stdin'`
  devuelve **0** (ningún `echo` de un `${{ secrets.* }}` AL LOG; se excluye el idioma seguro
  `echo "$s" | docker login --password-stdin`, que pipea a stdin). Además los PR-gates
  usan el evento **`pull_request`** (verificable: `grep 'pull_request_target' .github/workflows/*.yml` = 0),
  sin exponer secretos a forks. *(Resuelve S-005, S-006, T-001-rerun.)*

**CD por entornos (Capa 2 — faseado dev → pre → prod):**
- **FR-019 (dev, Fase 1)**: WHEN el CI de `develop` publica la imagen THE pipeline SHALL desplegar
  automáticamente **dev** (deploy-hook a Render, `environment: dev`), que consume el tag móvil `:develop` de
  GHCR **sin reconstruir**. El workflow usa `concurrency` para que, ante merges concurrentes, dev acabe
  sirviendo el **último** merge. *(Resuelve H-012.)*
- **FR-020 (pre, Fase 2)**: WHEN el CI de `main` (tag semver) publica la release THE pipeline SHALL, tras
  **verificar que existen en GHCR AMBAS imágenes `…backend:x.y.z` y `…frontend:x.y.z`** (si falta alguna,
  aborta — no despliega parcial), **mover el tag por entorno `:pre`** al **manifest del semver exacto**
  (`docker buildx imagetools create :pre :x.y.z`, sin rebuild), disparar el deploy-hook de **pre**
  (`environment: pre`, Render rastrea `:pre`) y **registrar el semver** en un **GitHub Deployment** de `pre`.
  *(El deploy-hook de Render no acepta parámetro de versión → se usa un tag móvil por entorno apuntado al
  semver; el `:x.y.z` inmutable queda para auditoría. Resuelve H-008, H-001 y el I-001 de G3.)*
- **FR-021 (prod, Fase 2)**: WHEN un operador lo autoriza THE pipeline SHALL desplegar **prod**
  (`environment: prod`) SOLO por disparo **manual** (`workflow_dispatch`) con input de **confirmación**
  (literal `PROD`) y un input `version`; el workflow **valida que ese `version` coincide con el último
  desplegado en `pre`** (leído del GitHub Deployment de `pre`, FR-020) y que su imagen existe en GHCR —
  si no coincide con pre, **aborta** (prod solo recibe lo que pasó por pre). Tras validar, **mueve el tag
  `:prod`** al manifest del semver (como FR-020) y dispara el hook (Render rastrea `:prod`). NO hay
  `on: push` que toque prod. *(Resuelve H-009, H-003, T-007/H-016, I-001 de G3.)*
- **FR-022 (secretos por entorno)**: THE pipeline SHALL tomar credenciales de deploy de **GitHub
  Environment secrets** por entorno (`dev`/`pre`/`prod`): `RENDER_DEPLOY_HOOK_BACKEND/FRONTEND`. La
  `DATABASE_URL` de **Neon (una BD/branch independiente por entorno)** se configura en el panel de Render, no
  en el repo. *(Resuelve H-011, S-004 parcial.)*
- **FR-022b (autorización de prod)**: THE `environment: prod` SHALL configurar `deployment_branch_policy`
  restringido a **solo `main`** (`protected_branches: true` o rama permitida = `main`), verificable con
  `gh api repos/<owner>/<repo>/environments/prod`. La limitación residual (mismo actor con push access, sin
  2ª aprobación independiente por el muro Free) se **asume y documenta** (Desvío 2). *(Resuelve S-002, H-013,
  T-002-rerun.)*

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
- **SC-006**: la imagen que un entorno despliega es **la misma** (mismo digest) que su workflow de CI
  construyó y escaneó con Trivy — el CD **no reconstruye** (verificable: el job de deploy hace `docker load`
  de la imagen serializada por el job de build, o referencia el tag publicado por ese mismo run; no hay
  `docker build` en el CD). *(No afirma que la imagen de develop == la de main: son builds de CI distintos
  por evento, cada uno determinista desde el mismo `package-lock.json`.)*
- **SC-007**: `grep -E 'uses: .*@v[0-9]'` sobre `.github/workflows/*.yml` (y `.github/actions/**` si existen)
  devuelve **0 coincidencias** (todo por SHA de 40 chars); todo workflow tiene un bloque `permissions:` y
  **ninguno** declara `write-all` (`grep 'write-all'` = 0).
- **SC-008 (Fase 1)**: tras merge a `develop`, el job `deploy-dev` **dispara el deploy-hook** (verificable
  en Actions: paso en verde). **Oráculo objetivo del "sirviendo":** `curl -s -o /dev/null -w '%{http_code}'
  <URL_dev>` devuelve **`200`** en ≤ 5 min (30 reintentos × 10 s). Si el secret `RENDER_DEV_HEALTHCHECK_URL`
  está configurado, el propio workflow ejecuta ese smoke-test y **falla** si no llega a 200; si NO está
  configurado, el smoke-test se **omite** y el 200 queda como **verificación manual pendiente** (no cuenta
  como PASS automático). *(Resuelve T-001.)*
- **SC-009 (Fase 2)**: **prod** nunca cambia sin disparo manual explícito — `grep 'on:' cd-prod.yml` muestra
  **solo `workflow_dispatch`** (0 `push`/`pull_request`), y el deploy exige el input de confirmación `PROD`.

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

- **Desvío 1 (guardián — excepción explícita a NFR-P03):** el reto pide el guardián como Claude Code Action
  (API del agente). Se implementa en **dos modos**: (a) determinista *always-on* (`validate-constitution.sh`,
  0 coste, cumple "sin API de pago"); (b) agente vía API **opt-in, desactivado por defecto** (FR-009), según
  el ejemplo de M9. Esto exige **enmendar `NFR-P03`** de "el CI NUNCA llama a un LLM" a "**NUNCA por defecto;
  excepción única**: el job `guardian-agent`, *skipped* salvo que exista `secrets.ANTHROPIC_API_KEY`, que el
  operador añade a conciencia asumiendo el coste". Enmienda registrada en `docs/pipeline-spec.md` (NFR-P03) y
  `docs/pipeline-constitution.md`. Minimización: el guardián-agente envía **solo** los artefactos SDD
  (spec/constitution), sin `.env`, logs ni secretos. *(Resuelve D-002, S-004, T-005 [el script define el
  checklist de PASS/FAIL].)*
- **Desvío 2 (aprobación prod):** el gate de GitHub Environments (required reviewers) no está en repo
  privado del plan Free → se sustituye por `workflow_dispatch` manual + confirmación `PROD` (FR-021).
  **Limitación residual asumida:** lo lanza el mismo actor con push access (no es 2ª aprobación
  independiente); mitigable con repo público o plan de pago (fuera de alcance).
- **Desvío 3 (cloud):** el cloud de CD es libre (reto §8) → **Render** (consume imagen de GHCR, no-rebuild) +
  **Neon** (Postgres), gratis y con URL pública.
- **Formalización SDD retroactiva (reconciliación):** los 6 workflows (DO-1..DO-6) y `docs/pipeline-spec.md`
  ya existían antes de este `spec.md` de Spec Kit. La regla **"spec-antes-que-YAML" del reto se ancla a
  `docs/pipeline-spec.md`** (commit `0a68292`, anterior a todo `.yml` — SC-004/AC-1), NO a este artefacto,
  que es una **formalización posterior** de la fase transversal (ADR-0004). Se documenta como excepción
  consciente en `pipeline-constitution.md`/ADR-0004, no como violación del Principio XVI. *(Resuelve D-004,
  D-005, H-005.)*
- La configuración en GitHub/Render/Neon (secrets por Environment, servicios, DB Neon **independiente por
  entorno**, credencial de pull de GHCR, rulesets, protección de `environment: prod`) la realiza el
  **usuario a mano**, documentada en el manual de setup **`docs/16-devops-setup-manual.md`** — entregable
  que se crea al cerrar la implementación (aún **no existe**; referencia prospectiva). *(D-103.)*
- **Lockstep de versión** (backend/frontend mismo `x.y.z` por tag) es ahora un requisito verificable
  (**FR-013b**), no una asunción.
