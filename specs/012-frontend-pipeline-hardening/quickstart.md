# Quickstart — validación de 012 (endurecimiento del pipeline de front)

Feature de pipeline: se valida por **build + scan + smoke-test** de la imagen de front, en local (determinista)
y luego en la ejecución real en Actions. Sin componente IA (sin promptfoo).

## Prerrequisitos
- Docker con Trivy disponible (`trivy` CLI o `aquasecurity/trivy` en imagen).
- Estar en la raíz del repo, rama `012-frontend-pipeline-hardening`.

## 1. Build de la imagen runtime parcheada (FR-001/FR-001b)
```bash
docker build --target runtime -t fieldops-frontend:ci ./frontend
```
Esperado: build OK, incluido el `RUN apk --no-cache upgrade` (tras `USER root`).

## 2. USER final no-root (SC-005)
```bash
docker inspect --format '{{.Config.User}}' fieldops-frontend:ci   # esperado: 101 (no vacío/root)
```
Estático: el último `USER` del Dockerfile antes de `EXPOSE`/`CMD` es `101`.

## 3. Trivy en verde (SC-001/SC-002)
```bash
trivy image --severity CRITICAL,HIGH --ignore-unfixed --exit-code 1 fieldops-frontend:ci
```
Esperado: `Total: 0` de CRITICAL/HIGH corregibles → exit 0. Sin `--skip-dirs`/`--ignore*` del SO (no se esconde).
Las `unfixed` que queden aparecen listadas (no bloquean).

## 4. Smoke-test de arranque (FR-005 / SC-006)
```bash
docker run -d --name fe-smoke --add-host backend:127.0.0.1 -p 8080:8080 fieldops-frontend:ci
curl --retry 10 --retry-delay 1 --retry-connrefused -fsS http://localhost:8080/ > /dev/null   # index SPA 200
asset=$(docker exec fe-smoke sh -c 'ls /usr/share/nginx/html/assets/*.js | head -1 | sed s#/usr/share/nginx/html##')
curl -fsS "http://localhost:8080${asset}" > /dev/null                                          # un asset 200
docker rm -f fe-smoke
```
Esperado: nginx arranca (el `--add-host` evita "host not found in upstream `backend`"), `/` y un asset de Vite
responden 200. Un parcheo que rompa nginx o el serving falla aquí, no en Render.

## 5. Verificación real (SC-001..006) — la razón de ser de 012
Push de la rama → PR de front al fork → job **`Imagen frontend + Trivy`** de `PR · frontend` en **verde**
(build + smoke-test + Trivy 0 CRITICAL/HIGH corregibles), resto de jobs de front sin regresión.

> Fallback (FR-004): si Trivy sigue rojo con corregibles, **bump del base image** en el mismo PR (nunca skip).
