# Tasks: Endurecimiento del pipeline de FRONTEND (012)

**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Quickstart**: [quickstart.md](./quickstart.md)

Feature de pipeline (US única, P1). Sin tests unitarios de app (se valida por build+scan+smoke-test).

## Phase 1 · Parcheo del SO del base image (FR-001/FR-001b)
- [ ] T001 [US1] En `frontend/Dockerfile` (etapa runtime `nginx-unprivileged`): añadir, tras el `FROM … AS runtime`, la secuencia `USER root` → `RUN apk --no-cache upgrade` → restaurar `USER 101` **antes** de `EXPOSE 8080`. El `COPY` de estáticos y `nginx.conf` puede quedar antes o después del upgrade, pero el `USER` final debe ser `101` (no-root).

## Phase 2 · Smoke-test de arranque en el gate de front (FR-005, SC-005/006)
- [ ] T002 [US1] En `.github/workflows/pr-validation-front.yml`, job `image-scan`: añadir un paso **Smoke-test** tras `docker build` y antes de/junto a Trivy: `docker run -d --name fe-smoke --add-host backend:127.0.0.1 -p 8080:8080 fieldops-frontend:ci`; `curl --retry 10 --retry-delay 1 --retry-connrefused -fsS http://localhost:8080/`; verificar **un asset** de Vite: usar `docker exec … ls /usr/share/nginx/html/assets` **solo para resolver el nombre hasheado**, y luego `curl -fsS http://localhost:8080/assets/<archivo>` esperando **HTTP 200** (que nginx lo *sirva*, no solo que exista — FR-005/K-004); `docker rm -f fe-smoke` al final (también si falla). No añade actions (shell del runner) → SHA-pin/AC-6 intacto.
- [ ] T003 [US1] Replicar el mismo smoke-test en `ci-develop-front.yml` y `ci-main-front.yml`, **tras el build y antes del push a GHCR** (FR-003/FR-005): la imagen desplegable no llega rota a Render por no-rebuild, y el build de develop/main es distinto del de la PR (no-reproducibilidad de `apk upgrade`).

## Phase 3 · Trazabilidad al documento maestro (FR-006)
- [ ] T004 Enmendar `docs/pipeline-spec.md` **FR-P05** con la cláusula de **front**: parcheo global del SO en runtime (`apk upgrade`), elevación/reversión de privilegios (no-root), Trivy sin `skip-dirs` del SO, fallback = bump del base image en el PR, residuo terminal documentado aquí (no en `gate-exceptions.txt`), revisión al parchear/cambiar el base image.

## Phase 4 · Verificación y cierre
- [ ] T005 Verificación estática/local (quickstart §1-4): build OK; `docker inspect` USER final = `101` (SC-005); `trivy image --severity CRITICAL,HIGH --ignore-unfixed --exit-code 1` → 0 corregibles (SC-001); smoke-test verde (`/` + asset 200, SC-006); **grep explícito de que los 3 workflows de front NO introdujeron `skip-dirs`/`--ignore*` para el SO (SC-002 · K-003)**; `grep` sin `uses: …@v[0-9]` en los workflows tocados (AC-6/SC-003).
- [ ] T005b [US1] (contingencia FR-004 · K-002) IF T005/T008 detecta ≥1 CRITICAL/HIGH corregible residual tras `apk upgrade`: subir el base image en el mismo PR (patch/minor Alpine o digest más nuevo) y **re-ejecutar T005** (reentrada a Phase 1); si ningún base image publicado alcanza 0, registrar la excepción terminal en `docs/pipeline-spec.md` FR-P05 (CVE + motivo + fecha de revisión). PROHIBIDO skip/ignore del SO.
- [ ] T006 Nota en `docs/15-devops-bitacora.md` (4.º hallazgo real de front: Trivy/Alpine; fixes 012; decisión de T003).
- [ ] T007 Gate G3 (panel reducido: revisor-devops/implementacion) + informe en `specs/012-frontend-pipeline-hardening/gates/`.
- [ ] T008 (usuario) push de la rama → PR de front al fork → confirmar `Imagen frontend + Trivy` en **verde** + smoke-test (SC-001..006).

## Dependencias
- T001 (Dockerfile) es prerrequisito de T002/T005 (la imagen parcheada es la que se arranca/escanea).
- T002 y T004 son independientes entre sí (ficheros distintos) → paralelizables tras T001.
- T003 depende de T002 (mismo patrón replicado en los CI de develop/main).
- T005b (contingencia FR-004) solo si T005/T008 detecta corregibles residuales → reentra a Phase 1 (bump) y repite T005.
- Phase 4 tras Phase 1-3.

## MVP
US1 completa = T001 + T002 + T004 + T005 (Dockerfile parcheado + smoke-test + doc + verificación local). T008 (real) es la confirmación en Actions.
