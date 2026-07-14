# Plan: Endurecimiento del pipeline de FRONTEND (012)

**Branch**: `012-frontend-pipeline-hardening` | **Date**: 2026-07-14 | **Spec**: [spec.md](./spec.md)

## Summary
Contrapartida de 011 para el front. La 1ª ejecución real del gate `PR · frontend` falla en Trivy: el base
image `nginxinc/nginx-unprivileged:1.27-alpine` arrastra 35 vulns corregibles del SO/librerías Alpine (2
CRITICAL, 33 HIGH). Fix honesto: **parchear el SO** en la etapa runtime del `frontend/Dockerfile`
(`apk --no-cache upgrade`) manejando la elevación/reversión de privilegios (imagen no-root uid 101), +
**smoke-test de arranque** en el job de imagen, + enmienda de `docs/pipeline-spec.md` FR-P05 (política front).
Determinista, API-free (NFR-P03 intacto). Cambios en `frontend/Dockerfile`, workflows de front y el doc maestro.

## Technical Context
- **Superficie**:
  - `frontend/Dockerfile` (etapa runtime): `USER root` → `RUN apk --no-cache upgrade` → `USER 101` antes de
    `EXPOSE`/`CMD` (FR-001/FR-001b).
  - `pr-validation-front.yml` job `image-scan`: paso nuevo de **smoke-test** tras el build y antes/junto a
    Trivy — `docker run --add-host backend:127.0.0.1 -d …` + `curl --retry` a `/` y a un asset `/assets/…` +
    `docker rm -f` (FR-005/SC-006). (Evaluar replicar el smoke-test en `ci-develop-front.yml`/`ci-main-front.yml`
    donde también se construye la imagen desplegable — decisión en tasks.)
  - `docs/pipeline-spec.md` FR-P05: cláusula de front (FR-006).
- **Sin nuevas actions** → SHA-pin (AC-6/FR-P13) intacto; `docker run`/`curl` son shell del runner.
- **Trivy front sin cambios**: `CRITICAL,HIGH` + `ignore-unfixed` (ya así en `pr-validation-front.yml:121-122`);
  el arreglo es en el Dockerfile, no relajando el escáner (FR-002).
- **Fallback FR-004**: si `apk upgrade` no alcanza 0 corregibles → bump del base image en el mismo PR; caso
  terminal = residuo documentado en `docs/pipeline-spec.md` FR-P05 (nunca skip/ignore del SO).
- **Verificación**: ejecución real en Actions (job de Trivy de front verde + smoke-test) + estática
  (Dockerfile válido, orden `USER root→upgrade→USER 101`, sin flags de exclusión del SO, resto de jobs intactos).

## Constitution Check
- **XVI (pipeline gobernado)**: ✅ spec-antes-que-YAML (este spec + G1 preceden al cambio); SHA-pin mantenido
  (no se añaden actions); permisos del job sin elevación nueva.
- **Seguridad de contenedor (no-root)**: ✅ FR-001b restaura `USER 101`; SC-005 lo verifica → no se degrada la
  postura no-root pese a la elevación transitoria para `apk upgrade`.
- **XIII (0 bloqueantes)**: gate adversarial (panel reducido por dominio) ya PASS en G1 (3 rondas); G3 = la
  ejecución real.
- **NFR-P03 (API-free)**: ✅ intacto (ningún LLM nuevo en CI).
- Gates de app (contract-first/RBAC/hexagonal/TDD-coverage): **N/A** (pipeline, igual que 010/011).

## Fases (para tasks)
1. `frontend/Dockerfile`: elevación/reversión de privilegios + `apk --no-cache upgrade` (FR-001/FR-001b).
2. Smoke-test de arranque en el job `image-scan` de `pr-validation-front.yml` (+ valorar ci-develop/main-front)
   (FR-005, SC-005/006).
3. Enmendar `docs/pipeline-spec.md` FR-P05 con la política de front (FR-006) + nota en `docs/15-devops-bitacora.md`.
4. Verificación estática (Dockerfile, USER final no-root, sin skip del SO, SHA-pin intacto).
5. (usuario) push al fork → PR de front → job `Imagen frontend + Trivy` verde + smoke-test (SC-001..006).

## Complexity Tracking
| Desviación | Por qué | Alternativa rechazada |
|---|---|---|
| Parcheo global `apk upgrade` (no dirigido) | coherencia con 011 (`apt-get upgrade`); Trivy gatea cada build | lista dirigida de paquetes (se re-rompe con cada CVE; más mantenimiento) |
| Elevación transitoria a `USER root` | `apk upgrade` requiere root; se restaura `USER 101` (FR-001b) | dejar sin parchear (gate rojo perpetuo) / parchear en build stage (no afecta al runtime desplegable) |
| Smoke-test con `--add-host backend:127.0.0.1` | `nginx.conf` proxya a `backend`, que no resuelve aislado | `docker run` pelado (nginx no arranca: "host not found in upstream") |
| No-reproducibilidad de `apk upgrade` | tag flotante `1.27-alpine`; aceptado (Trivy gatea, no-rebuild) | pin por digest `@sha256` (deuda documentada, ya diferida en 010 D-002) |
| Panel de gate reducido (devops+cínico) | 1 fix acotado; sin superficie a11y/RBAC nueva | panel completo (desproporcionado); rbac-seguridad (privilegio de contenedor = dominio devops) |

## Artefactos de diseño
- **research.md / data-model.md / contracts/**: **N/A** — feature de pipeline (no de app), igual que 010/011.
  No hay entidades de dominio, contrato OpenAPI ni modelo de datos nuevos. El "diseño" es el propio spec + este plan.
- **quickstart.md**: ver abajo (validación runnable local + real).
