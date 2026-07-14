# Feature Specification: Endurecimiento del pipeline de FRONTEND tras 1ª ejecución real (M12)

**Feature Branch**: `012-frontend-pipeline-hardening`

**Created**: 2026-07-14

**Status**: Draft

**Input**: 1 fallo REAL descubierto al ejecutar el gate `PR · frontend` en Actions (fork público
`jiperea/proyecto-final-juan`). No era detectable sin ejecución remota. Es la **contrapartida de 011**
(que endureció el back) para el componente **front**.

> **Relación con 010/011:** endurecimiento de la feature `010-devops-pipeline`, línea front. Reutiliza sus
> FR-P y ACs y **aplica la ENMIENDA FR-P05** (política de Trivy: bloquear CRITICAL/HIGH corregibles del SO)
> ya introducida en 011, ahora al base image de front. Detalle en `docs/pipeline-spec.md`.

## Clarifications

### Session 2026-07-14
- Q: ¿Qué destapó Trivy en la imagen de front? → A: **35 vulns corregibles** (2 CRITICAL, 33 HIGH) en
  paquetes de sistema de Alpine del base image `nginxinc/nginx-unprivileged:1.27-alpine` — `libcrypto3`/
  openssl (CVE-2026-31789 CRITICAL), `libpng`, `libexpat`, `c-ares`… **todas con "fixed version"**. No son
  de npm (el front runtime es nginx puro, sin node_modules) ni del código de la app: es el SO del base image.
- Q: ¿Cómo se corrige sin esconder? → A: **parchear** los paquetes del SO en la etapa runtime del
  `frontend/Dockerfile` (`apk --no-cache upgrade`), que los sube a las versiones corregidas de la rama
  Alpine. **No** se usa `skip-dirs` ni `--ignore` (sería esconder, no corregir); coherente con FR-003b de
  011 (allí el skip era legítimo solo para el npm del base image que **no** era superficie de runtime; aquí
  las libs de Alpine **sí** están en la imagen desplegable → se parchean, no se excluyen).
- Q: ¿Y las vulns "unfixed" (sin arreglo aún)? → A: Trivy corre con `ignore-unfixed` (FR-P05), así que no
  bloquean; el residuo se documenta con revisión al parchear/cambiar el base image.
- Q: ¿Parcheo global o dirigido de los paquetes del SO? → A: **Global** (`apk --no-cache upgrade`), por
  coherencia con 011 (el back usó `apt-get upgrade -y`). El determinismo queda acotado porque el **tag del
  base image sigue pinado** y **Trivy re-corre en cada build** cazando cualquier regresión introducida por la
  subida. No se mantiene lista de paquetes (que se re-rompería con cada CVE nuevo).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - El PR-gate de FRONT pasa en verde en una ejecución real, sin esconder vulnerabilidades (Priority: P1)

Como equipo, queremos que el gate `PR · frontend` pase en Actions **de verdad**, y que Trivy solo bloquee
por vulnerabilidades **reales y corregibles** del artefacto desplegable — corrigiéndolas, no silenciándolas.

**Why this priority**: hoy `PR · frontend` está **rojo** por Trivy (2 CRITICAL, 33 HIGH corregibles del SO
del base image), mientras el resto del gate (lint·typecheck·test·build, guardián, code-review) está verde.
Sin esto, el pipeline de front "existe" pero no demuestra nada verde; simétrico al problema que 011 resolvió
en back.

**Independent Test**: abrir una PR / push que toque `frontend/**` en el repo con Actions activo → el job
`Imagen frontend + Trivy` pasa de **rojo a verde** (0 CRITICAL/HIGH corregibles), y el resto de jobs del
gate de front siguen en verde (sin regresión).

**Acceptance Scenarios**:
1. **Given** la imagen runtime de front (nginx), **When** corre Trivy en el gate, **Then** **no** hay
   `CRITICAL/HIGH` **corregibles** (los paquetes del SO están parcheados a la versión de arreglo).
2. **Given** que aparezca una vuln `CRITICAL/HIGH` corregible **nueva** en el base image, **When** corre
   Trivy, **Then** el gate **vuelve a fallar** (no se ha escondido nada con `--ignore`/`skip-dirs`).
3. **Given** una vuln realmente **unfixed** (Trivy NO reporta `Fixed Version`), **When** corre Trivy con
   `ignore-unfixed`, **Then** **no** bloquea, y queda **listada** en el reporte (residuo documentado).
4. **Given** la imagen ya parcheada, **When** se inspecciona el `USER` final del runtime, **Then** **no** es
   root (sigue siendo el uid 101 no-root del base image `nginx-unprivileged`) — el parcheo no degrada la
   postura de seguridad del contenedor.

### Edge Cases
- **`apk upgrade` requiere root, pero el base image corre como uid 101 no-root** → si se ejecuta sin elevar,
  el build **falla por `Permission denied`** en el paso de parcheo (antes de Trivy). Manejo obligatorio en
  FR-001b (`USER root` → upgrade → restaurar no-root).
- **Aclaración `ignore-unfixed` (corrige supuesto erróneo):** `ignore-unfixed` solo suprime CVEs para las que
  Trivy **no** publica `Fixed Version`. Una CVE con `Fixed Version` que `apk upgrade` **no** pudo instalar
  (aún no en el índice de la rama Alpine pinada) **NO** es "unfixed" → Trivy **la sigue marcando y el gate
  bloquea**. No hay vía de escape silenciosa: se actúa según FR-004 (bump del base image en el mismo PR).
- Si el parcheo del SO rompiera nginx (incompatibilidad binaria) → hoy el gate **solo hace `docker build`+
  Trivy** (sin arrancar el contenedor), así que **no** lo detectaría hasta Render. FR-005 añade un smoke-test
  (`docker run` + `curl`) para que el fallo de arranque salga en el gate, no en producción.
- El front runtime **no** tiene `node_modules` (es nginx sirviendo estáticos); no aplica el skip de npm de 011.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001 (parcheo honesto del SO del base image de front · conformidad ENMIENDA FR-P05)**: WHEN se
  construye la etapa **runtime** (nginx) de `frontend/Dockerfile` THE pipeline SHALL parchear los paquetes
  del sistema operativo/librerías de Alpine a sus versiones corregidas (`apk --no-cache upgrade`), de modo
  que Trivy no encuentre `CRITICAL/HIGH` **corregibles** en la imagen desplegable. El parcheo es **global**
  (`apk --no-cache upgrade`, simétrico al `apt-get upgrade` del back en 011), no una lista dirigida. El parcheo
  **corrige** (no esconde): **no** se usan `skip-dirs` ni `--ignore*` para las libs del SO.
- **FR-001b (elevación/reversión de privilegios · resuelve BLOQUEANTE D-001)**: el base image
  `nginx-unprivileged` corre como **uid 101 no-root**, y `apk upgrade` requiere root. THE etapa runtime del
  `frontend/Dockerfile` SHALL, en este orden: (1) `USER root`; (2) `RUN apk --no-cache upgrade`; (3)
  **restaurar el usuario no-root** (`USER 101`, el del base image) **antes** de `EXPOSE`/`CMD`. La imagen
  final SHALL seguir arrancando como no-root (no se degrada la postura de seguridad del contenedor).
- **FR-002 (Trivy de front sin cambios de política · conformidad FR-P05)**: THE gate `Imagen frontend +
  Trivy` SHALL mantener su configuración (`CRITICAL,HIGH`, `ignore-unfixed`, sin `skip-dirs` para el SO —
  verificado hoy en `pr-validation-front.yml:121-122`); el arreglo es en el Dockerfile, **no** relajando el
  escáner. El residuo realmente `unfixed` queda **visible** en el reporte y **documentado**.
- **FR-003 (sin regresión del resto del gate de front)**: THE cambio SHALL limitar su superficie a
  `frontend/Dockerfile` (etapa runtime) + el smoke-test de FR-005; no toca los jobs `lint·typecheck·test·
  build`, guardián de Constitución ni code-review, que siguen en verde. La cadena de suministro (SHA-pin de
  actions, AC-6) queda intacta (no se añaden actions nuevas).
- **FR-004 (fallback obligatorio si el parcheo no basta · resuelve H-001/H-002)**: IF tras `apk upgrade`
  Trivy sigue reportando ≥1 `CRITICAL/HIGH` **corregible** (con `Fixed Version` no instalable desde la rama
  pinada) THE equipo SHALL, **en el mismo PR**, subir el base image (patch/minor de la rama Alpine, o un
  digest más nuevo) hasta alcanzar 0 corregibles. **PROHIBIDO** desbloquear con `skip-dirs`/`--ignore*` del
  SO. La decisión se toma en el PR (no se difiere). **Techo/escalado (resuelve H-101/H-105):** si un bump
  introduce una CVE corregible nueva, es una nueva iteración de FR-004; si **ninguna** versión/digest
  publicada del base image alcanza 0 corregibles (el fix aún no está empaquetado en ninguna imagen
  disponible), la única salida es registrar el residuo como **excepción documentada** en la sección FR-P05
  de `docs/pipeline-spec.md` (documento versionado; **no** en `.specify/gate-exceptions.txt`, cuyo esquema
  `<spec> <G1|G2|G3> <fecha> <owner>` es solo para excepciones del guardián de Constitución y no encaja para
  un CVE — D-005) con CVE + motivo + fecha de revisión — **auditable, nunca un skip silencioso**.
- **FR-005 (smoke-test de arranque · resuelve H-005/D-003/D-004/H-103)**: WHEN el job `Imagen frontend +
  Trivy` construye la imagen parcheada THE pipeline SHALL, tras el build y antes de dar verde, **arrancar el
  contenedor** de la imagen runtime y verificar que **nginx arranca y sirve estáticos**. Dado que
  `nginx.conf` proxya `/v1/ → http://backend:3000` (hostname que solo resuelve en la red de compose), el
  arranque aislado SHALL hacer resoluble ese upstream (`docker run --add-host backend:127.0.0.1 …`) para que
  nginx no falle por "host not found in upstream" (causa ajena al parcheo). El check SHALL: (a) esperar con
  reintentos (`curl --retry`) a que nginx escuche; (b) verificar **HTTP 200 en `/`** (index de la SPA) **y**
  en **al menos un asset de Vite** (`/assets/…`) — no solo el index, para no dar falso-verde si el parcheo
  rompe el serving de estáticos; (c) limpiar el contenedor al final (`docker rm -f`). El smoke-test valida
  **arranque + serving de estáticos**, NO el proxy `/v1` (eso lo cubre el e2e de compose de DO-2).
- **FR-006 (trazabilidad al documento maestro · resuelve H-004/D-004)**: THE `docs/pipeline-spec.md` FR-P05
  SHALL enmendarse con la política de **front** (parcheo global del SO en runtime, sin `skip-dirs`; elevación/
  reversión de privilegios; fallback = bump del base image; residuo `unfixed` documentado), para que el
  documento maestro del pipeline refleje la regla real de front (hoy solo describe el npm del back).

### Key Entities
- **Imagen runtime de front**: base `nginxinc/nginx-unprivileged:1.27-alpine` + estáticos de Vite; su
  superficie de vulnerabilidades son los **paquetes de Alpine** (openssl/libcrypto3, libpng, libexpat, c-ares…).
- **Política de Trivy (front)**: `CRITICAL,HIGH` corregibles del SO → bloquean; `unfixed` → no bloquean,
  documentadas.

## Success Criteria *(mandatory)*

- **SC-001**: en una ejecución real de Actions, el job **`Imagen frontend + Trivy`** del gate `PR · frontend`
  pasa de **rojo a verde** (`Total` de CRITICAL/HIGH corregibles = **0**).
- **SC-002**: el reporte de Trivy **sigue mostrando** (sin bloquear) las vulns realmente `unfixed` que
  existan — no se han enmascarado con `--ignore`/`skip-dirs` (verificable en el log: no hay flags de
  exclusión del SO). Cualquier residuo **aceptado** (caso terminal de FR-004) queda registrado en
  `docs/pipeline-spec.md` FR-P05 (artefacto versionado, no en `.specify/gate-exceptions.txt` ni solo en el
  log efímero de una ejecución — resuelve H-102/D-005).
- **SC-003**: el resto de jobs del gate de front (`lint·typecheck·test·build`, guardián, code-review) siguen
  en **verde** (sin regresión), y `grep` sigue sin hallar `uses: …@v[0-9]` (AC-6).
- **SC-004 (API-free intacto)**: ningún cambio introduce llamadas a LLM de pago en CI (NFR-P03 intacto).
- **SC-005 (no-root tras el parcheo · resuelve D-002)**: la imagen runtime final **no** corre como root —
  verificable por validación estática del Dockerfile (el último `USER` antes de `CMD`/fin de etapa es `101`,
  no `root`/`0`) y por `docker inspect --format '{{.Config.User}}'` en el smoke-test de FR-005.
- **SC-006 (smoke-test verde · resuelve H-005)**: en la ejecución real, el contenedor de front parcheado
  **arranca y responde** (nginx sirve la SPA con HTTP 200) dentro del job de imagen.

## Verificación (determinista, sin IA)
Feature de pipeline, sin componente IA. Se verifica por la **ejecución real en Actions** (job de Trivy de
front en verde + smoke-test de arranque) + validación estática (Dockerfile válido, orden `USER root →
apk upgrade → USER 101`, sin flags de exclusión del SO, resto de jobs sin tocar). Sin evals promptfoo.

## Assumptions
- La rama Alpine del base image tiene disponibles las versiones de arreglo que Trivy reporta como "fixed"
  (openssl 3.3.7-r0, libpng 1.6.55-r0, libexpat 2.8.2-r0, c-ares 1.34.8-r0…); `apk upgrade` las trae. Si
  alguna **no** estuviera aún en el índice de la rama pinada, **no** cuenta como `unfixed` (Trivy la seguiría
  bloqueando) → se aplica **FR-004** (bump del base image en el mismo PR). No hay vía de escape con skip.
- El front runtime es nginx sirviendo estáticos, **sin node_modules** → no aplica el skip de npm de 011
  (FR-003b de 011); aquí se **parchea el SO**, que sí es superficie desplegable.
- **No-reproducibilidad aceptada (H-003):** `apk upgrade` sobre un tag de rama flotante (`1.27-alpine`) no es
  bit-reproducible en el tiempo (un re-run del mismo commit puede instalar otra revisión de paquetes). Se
  acepta porque el tag sigue pinado y **Trivy gatea cada build**; el endurecimiento pleno (pin del base image
  por digest `@sha256`) queda como **deuda documentada** (ya era "endurecimiento opcional" diferido en 010,
  D-002). Ante required-checks, el merge usa el último estado verde.
- **Sin capa Docker rancia (H-007):** el build de front no usa `cache-from`/layer cache persistente (runner
  efímero) y `apk` va con `--no-cache` → cada build re-ejecuta el parcheo; Trivy escanea la imagen real.
- **No-rebuild verificado para front (H-106):** la imagen que llega a producción es la **misma** que pasa el
  gate — `ci-develop-front.yml` escanea `fieldops-frontend:ci` con Trivy **antes** de push a GHCR (línea 69),
  y Render **tira** esa imagen de GHCR sin reconstruir (no-rebuild, DO-7/010). El drift de `apk upgrade` no
  se reintroduce en despliegue.
- **Panel reducido re-justificado para front (H-006/H-104):** panel = `revisor-devops` (dominio CI/CD y
  **privilegios de contenedor** — validó FR-001b en 2 rondas) + `revisor-cinico` (ataque genérico). El cambio
  toca **solo paquetes del SO** del base image — **no** `nginx.conf`, cabeceras de seguridad, UI ni contrato.
  La elevación de privilegios de FR-001b es seguridad **de contenedor** (dominio de `revisor-devops`), no
  control de acceso **de aplicación** (roles/401/403, dominio de `revisor-rbac-seguridad`, sin superficie
  nueva aquí); SC-005 da el chequeo determinista. G2/G3 se consolidan; verificación final = ejecución real.
- No se re-corre el ciclo SDD completo de 010; endurecimiento acotado con su propio spec→…→G3.
