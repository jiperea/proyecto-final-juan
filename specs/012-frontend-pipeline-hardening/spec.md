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
3. **Given** una vuln **unfixed** (sin arreglo publicado), **When** corre Trivy con `ignore-unfixed`, **Then**
   **no** bloquea, y queda **listada** en el reporte (residuo documentado).

### Edge Cases
- Si el `apk upgrade` no cubre una vuln concreta porque el fix aún no está en la rama Alpine del base image →
  queda como residuo `unfixed` (no bloquea) o fuerza subir de base image; se documenta.
- Si el parcheo del SO rompiera nginx (versión incompatible) → el build o el arranque del contenedor falla en
  el gate, antes de desplegar (fallo claro, no silencioso).
- El front runtime **no** tiene `node_modules` (es nginx sirviendo estáticos); no aplica el skip de npm de 011.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001 (parcheo honesto del SO del base image de front · conformidad ENMIENDA FR-P05)**: WHEN se
  construye la etapa **runtime** (nginx) de `frontend/Dockerfile` THE pipeline SHALL parchear los paquetes
  del sistema operativo/librerías de Alpine a sus versiones corregidas (`apk --no-cache upgrade`), de modo
  que Trivy no encuentre `CRITICAL/HIGH` **corregibles** en la imagen desplegable. El parcheo **corrige**
  (no esconde): **no** se usan `skip-dirs` ni `--ignore*` para las libs del SO.
- **FR-002 (Trivy de front sin cambios de política · conformidad FR-P05)**: THE gate `Imagen frontend +
  Trivy` SHALL mantener su configuración (`CRITICAL,HIGH`, `ignore-unfixed`, sin `skip-dirs` para el SO); el
  arreglo es en el Dockerfile, **no** relajando el escáner. El residuo (`unfixed`) queda **visible** en el
  reporte y **documentado** con revisión al parchear/cambiar el base image.
- **FR-003 (sin regresión del resto del gate de front)**: THE cambio SHALL limitar su superficie a
  `frontend/Dockerfile` (etapa runtime); no toca los jobs `lint·typecheck·test·build`, guardián de
  Constitución ni code-review, que siguen en verde. La cadena de suministro (SHA-pin de actions, AC-6) queda
  intacta (no se añaden actions nuevas).

### Key Entities
- **Imagen runtime de front**: base `nginxinc/nginx-unprivileged:1.27-alpine` + estáticos de Vite; su
  superficie de vulnerabilidades son los **paquetes de Alpine** (openssl/libcrypto3, libpng, libexpat, c-ares…).
- **Política de Trivy (front)**: `CRITICAL,HIGH` corregibles del SO → bloquean; `unfixed` → no bloquean,
  documentadas.

## Success Criteria *(mandatory)*

- **SC-001**: en una ejecución real de Actions, el job **`Imagen frontend + Trivy`** del gate `PR · frontend`
  pasa de **rojo a verde** (`Total` de CRITICAL/HIGH corregibles = **0**).
- **SC-002**: el reporte de Trivy **sigue mostrando** (sin bloquear) las vulns `unfixed` que existan — no se
  han enmascarado con `--ignore`/`skip-dirs` (verificable en el log: no hay flags de exclusión del SO).
- **SC-003**: el resto de jobs del gate de front (`lint·typecheck·test·build`, guardián, code-review) siguen
  en **verde** (sin regresión), y `grep` sigue sin hallar `uses: …@v[0-9]` (AC-6).
- **SC-004 (API-free intacto)**: ningún cambio introduce llamadas a LLM de pago en CI (NFR-P03 intacto).

## Verificación (determinista, sin IA)
Feature de pipeline, sin componente IA. Se verifica por la **ejecución real en Actions** (el job de Trivy de
front en verde) + validación estática (Dockerfile válido, sin flags de exclusión del SO, resto de jobs sin
tocar). Sin evals promptfoo.

## Assumptions
- La rama Alpine del base image tiene disponibles las versiones de arreglo que Trivy reporta como "fixed"
  (openssl 3.3.7-r0, libpng 1.6.55-r0, libexpat 2.8.2-r0, c-ares 1.34.8-r0…); `apk upgrade` las trae. Si
  alguna no estuviera aún en el índice de la rama pinada, se documenta como residuo o se sube de base image.
- El front runtime es nginx sirviendo estáticos, **sin node_modules** → no aplica el skip de npm de 011
  (FR-003b de 011); aquí se **parchea el SO**, que sí es superficie desplegable.
- Panel de gate **reducido a `revisor-devops`** (dominio), como en 011 — decisión documentada por el tamaño
  acotado del cambio (1 fix). G2/G3 se consolidan; la verificación final es la ejecución real en Actions.
- No se re-corre el ciclo SDD completo de 010; endurecimiento acotado con su propio spec→…→G3.
