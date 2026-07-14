# 15 · Bitácora del proceso CI/CD (fase DevOps · reto M12)

> Registro cronológico de **decisiones, avances y lecciones** de la fase DevOps. La gobernanza está en
> [`pipeline-constitution.md`](pipeline-constitution.md); la spec ejecutable en
> [`pipeline-spec.md`](pipeline-spec.md); el plan por pasos en [`06-roadmap.md`](06-roadmap.md) §DevOps.
> Alcance acordado: **Mínima DO-1→DO-6** (sin CD). Regla rectora: **spec antes que YAML**.

## Decisiones de fase (acordadas al entrar)

| # | Decisión | Elegido | Motivo |
|---|----------|---------|--------|
| D1 | Ubicación de la gobernanza | **Principio XVI en constitución + `docs/pipeline-constitution.md`** | separa lo normativo (constitución) del detalle operativo |
| D2 | Alcance ahora | **Mínima DO-1→DO-6** (sin CD/DO-7) | es lo exigido por el reto; CD topa con el muro de repo privado Free |
| D3 | Estrategia de ramas | **`feature/* → develop → main`** | GitFlow del reto; ya en uso en el repo |
| D4 | Qué se implementa | **el reto (roadmap DO-1..6)**; M9 = referencia/ejemplo | M9/M10 es teoría; el entregable es el reto M12 |
| D5 | Coste | **CI API-free / token-free** | regla del proyecto (CLAUDE.md); evals de IA en local, no en CI |
| D6 | Estructura de ficheros | Dockerfiles por componente · compose en raíz · workflows en `.github/workflows/` · sin carpeta `infra/` | convención de monorepo; `infra/` solo si hubiera CD/IaC |

## DO-1 · Gobernanza + spec del pipeline — 2026-07-14

**Hecho:**
- Enmienda de constitución **v1.9.1 → v1.10.0** (MINOR): principio nuevo **XVI. Pipeline como gate
  gobernado** (spec-antes-que-YAML, spec-as-gate, SHA-pin, permisos mínimos, no-rebuild, flujos por
  componente, ramas develop/main, CI<10min). Detalle delegado a los docs de pipeline.
- `docs/pipeline-constitution.md` (gobernanza) + `docs/pipeline-spec.md` (FRs EARS, NFR CI<10min, ACs).
- Esta bitácora.
- **Rama dedicada** `chore/devops-do1-pipeline` (ADR-0004: fundación transversal, no rama de feature).

**Clave (regla de oro):** este commit de DO-1 **precede en git a cualquier `.yml`** de workflow real →
satisface AC-1 (`git log --diff-filter=A`). El `.github/workflows/ci.yml` actual es un **placeholder de
fundación** (gitleaks + build-test sobre un `package.json` de raíz inexistente); se reemplaza por los
workflows spec-derivados en DO-3+.

**Herencia registrada:** el *verificador determinista de constitución* de M9/M10 (`validate-constitution.sh`)
que quedó en backlog (docs/13) se materializa como el **guardián de Constitución** del PR-gate (FR-P07).

**Pendiente:** DO-2 (contenerización) → DO-3 (PR-gate back) → DO-4/5 (CI develop/main + GHCR) → DO-6
(workflows front).

## DO-2 · Contenerización (db · backend · frontend) — 2026-07-14

**Hecho:** `backend/Dockerfile` (multi-stage Node 20-slim, runtime lean no-root), `frontend/Dockerfile`
(build Vite → **nginx unprivileged** no-root) + `nginx.conf` (SPA + proxy `/v1`→backend), `.dockerignore`
de cada uno, y `docker-compose.yml` ampliado a **db · db-test · backend · frontend** (un `docker compose up`).
Nuevo agente de comprobación `.claude/agents/revisor-devops.md`.

**Verificado (determinista, sin API):** `docker compose up` → 4 contenedores; backend *healthy*; **login
end-to-end por `:8080`** (nginx→backend→BD) HTTP 200; imágenes backend 370MB / frontend ~50MB; nginx corre
como uid 101 (no-root).

**Problemas que destapó la contenerización (lecciones):**
1. **`npm ci` roto**: `package-lock.json` del backend desincronizado (promptfoo añadido en 007 sin
   actualizar el lock) → fallaría también en CI. **Fix:** re-sincronizar el lock.
2. **promptfoo inflaba la imagen**: era devDep del backend y arrastra aws-sdk/azure/gcp. **Fix:** sacarlo de
   `package.json`; el script `eval` lo invoca con `npx` bajo demanda (evals en local, nunca en CI/runtime).
3. **`prisma` a dependencies**: se necesita en runtime para `migrate deploy` al arrancar.
4. **ESM vs Node**: el proyecto es ESM+moduleResolution Bundler (para tsx/dev); `node dist/…` no resuelve
   imports sin extensión. **Fix:** `tsconfig.build.json` que emite **CommonJS** + `dist/package.json`
   `{"type":"commonjs"}`. (Latente: el `start` de prod nunca se había ejercitado.)
5. **Ruta de salida**: `rootDir:"."`+include tests → `dist/src/main.js`; el build de prod usa `rootDir:src`
   → `dist/main.js`; `start`/CMD corregidos.
6. **Prisma en debian-slim**: faltaba **openssl** (detección de libssl) y permisos de escritura de engines
   como no-root. **Fix:** `apt-get install openssl` + `chown -R node:node /app`.

**Revisión adversarial (`revisor-devops`, por el plan):** 0 bloqueantes. D-001 (nginx front root, ALTA) →
resuelto con imagen **unprivileged**. D-003 (front sin esperar backend *healthy* ni healthcheck, MEDIA) →
resuelto (`depends_on: condition: service_healthy` + healthcheck). **D-002 (MEDIA, dispuesto):** las imágenes
base van por tag (`node:20-slim`, `nginx…-alpine`, `postgres:16-alpine`), no por digest `@sha256`. El SHA-pin
**obligatorio** del reto (FR-P13) es sobre las *actions* de los workflows (DO-3); el pin por digest de imágenes
base es endurecimiento opcional → se valora al añadir Trivy en DO-3. Tags minor+alpine razonablemente estables.

**Pendiente:** DO-3 (pr-validation-back.yml + `validate-constitution.sh` + `acceptance-check.sh`) → DO-4/5
(CI develop/main + GHCR) → DO-6 (workflows front).

<!-- Próximas entradas: DO-3, DO-4/5, DO-6 se añaden aquí conforme se completan. -->

