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

## DO-3 · PR-gate del backend — 2026-07-14

**Hecho:** `.github/workflows/pr-validation-back.yml` — batería de gates M9 sobre PRs que tocan
`backend/**` o `contracts/**` (filtros `paths:`, FR-P01), en 5 jobs deterministas:
- **guardian** → `scripts/validate-constitution.sh` (FR-P07: a spec-antes-que-YAML · b informes de gate
  G1/G2/G3 por spec, con excepciones documentadas · c sin `[NEEDS CLARIFICATION]` en `spec.md` · d
  `domain/` sin imports de infra) + `scripts/acceptance-check.sh` (FR-P08: integridad de la matriz
  `docs/traceability.md`, ninguna fila FR sin tarea+test).
- **secrets** → gitleaks CLI OSS con versión fijada + `.gitleaks.toml` (FR-P04).
- **lint-typecheck-test** → `eslint` + `tsc --noEmit` + `vitest run` con **Postgres 16 de servicio** y
  `prisma migrate deploy` (FR-P02; NFR-P02 paridad; NFR-P01 caché npm + `timeout-minutes: 10`).
- **contracts** → Spectral (`.spectral.yaml` extiende `spectral:oas`, `--fail-severity error`) + oasdiff
  `breaking` vs la base del PR (FR-P03).
- **image-scan** → `docker build` del backend + **Trivy** (`CRITICAL,HIGH`, `ignore-unfixed`, FR-P05).

Cadena de suministro: **todas las actions por SHA de 40 chars** (checkout, setup-node, trivy-action; el
tag va solo en comentario, FR-P13/AC-6); `permissions: contents: read` a nivel de workflow y **ningún job
eleva permisos** (este gate no publica nada — eso es DO-4/DO-5, FR-P14). Cero API de LLM: las evals de
promptfoo siguen **en local** sobre el plan (NFR-P03/FR-P15).

**Nuevos artefactos de soporte:** `scripts/{validate-constitution,acceptance-check}.sh` (deterministas,
`set -euo pipefail`, exit 0/1), `.spectral.yaml`, `.specify/gate-exceptions.txt` (excepciones al guardián
**documentadas y trazables**, no silenciosas — memoria «no diferir ALTAs en silencio»).

**Retirada del placeholder:** se elimina `.github/workflows/ci.yml` (era placeholder de fundación con
`build-test` sobre un `package.json` de raíz inexistente; DO-1 ya lo marcó «se reemplaza por los workflows
spec-derivados en DO-3+»). Para **no** dejar hueco de cobertura de secretos, el escaneo NO se acota al
PR-gate de back: vive en un workflow **universal** `secrets-scan.yml` (todo PR + push a `develop`/`main`,
sin filtro `paths:`), que también protege PRs de front y pushes directos a ramas protegidas.

**Verificado (determinista, sin API):** ambos scripts salen **0** en el estado actual del repo (AC-4);
`validate-constitution.sh` reporta la excepción **005-G3** (informe G3 no materializado como
`gates/gate-G3-*`; deuda documental conocida, gate ejecutado) sin fallar. YAML válido; `grep` **no**
encuentra `uses: …@v[0-9]` (AC-6); las 3 actions con SHA de 40 chars. `git log --diff-filter=A` mantiene
`docs/pipeline-spec.md` **anterior** a `pr-validation-back.yml` (AC-1). *(La ejecución real en Actions —
tiempos, imagen, Trivy — se comprobará al abrir el primer PR contra `develop`.)*

**Decisiones/hallazgos de DO-3:**
- **acceptance-check** verifica la **integridad de la matriz** (toda fila FR con tarea+test) en vez del
  cruce libre `spec.md`↔matriz: los FR se renumeran por spec y hay filas de ID combinado
  (`FR-007/008/009`), así que un matcher por token daba falsos positivos. La cobertura por-spec se emite
  como **aviso no-bloqueante** (visibilidad sin falso rojo).
- **gitleaks por CLI OSS** (no la action) para evitar el requisito de licencia en repos de organización;
  versión fijada. Coherente con el `ci.yml` original.
- **Trivy `ignore-unfixed`**: FR-P05 exige fallar ante `CRITICAL/HIGH` **corregibles**; las sin fix no
  bloquean (no hay acción posible), se ven en el reporte.

**Revisión adversarial (`revisor-devops`, por el plan):** 0 BLOQUEANTES · 4 ALTAS · 4 MEDIAS →
`REQUIERE_CAMBIOS`. Todas las ALTAS y las MEDIAS de bajo riesgo resueltas en la misma ronda (memoria «no
diferir ALTAs en silencio»):
- **D-004 (ALTA, cobertura secretos):** la retirada de `ci.yml` dejaría PRs de front y push a `main` sin
  gitleaks hasta DO-4/5/6 → **`secrets-scan.yml` universal** (cierra el hueco, no depende de disciplina).
- **D-002 (ALTA, timeout):** `timeout-minutes: 10` añadido también a `guardian`, `contracts` y al job de
  secretos (antes solo el job pesado); evita jobs colgados (NFR-P01, cuota de Actions Free).
- **D-003 (ALTA, cobertura del guardián):** el check (a) del guardián pasa de `*-validation-*.yml` a
  **todos** los `.github/workflows/*.{yml,yaml}` → DO-4/5/6 y cualquier workflow futuro caen bajo
  spec-antes-que-YAML.
- **D-001 (ALTA, branch protection):** no es código en repo privado Free → se **versiona** la config
  esperada en `.github/branch-protection.md` (checks requeridos por nombre de job, sin bypass, FR-P09/AC-3).
- **D-005 (MEDIA, cadena de suministro):** verificación de **checksum SHA256** de los binarios descargados
  (gitleaks y oasdiff) contra el fichero de checksums del release.
- **D-006 (MEDIA, Trivy):** `docker build --target runtime` explícito → Trivy escanea siempre la imagen
  desplegable, no una etapa de build.
- **D-007 (MEDIA, parser):** `acceptance-check.sh` era **falso-verde** en las 30 filas de 5 columnas de la
  matriz (leía `$4/$5` fijos; en esas filas la tarea/test están corridas por una columna «método»). Ahora
  lee las **dos últimas** celdas (`$(NF-2)/$(NF-1)`), tolera ambas disposiciones y marca MALFORMADA (falla)
  toda fila con < 6 campos. *(Hallazgo real: esas 30 filas nunca se habían verificado de verdad.)*
- **D-008 (MEDIA, caducidad de excepciones):** `.specify/gate-exceptions.txt` gana campos `fecha` y
  `owner`; el guardián emite **AVISO visible** si una excepción supera 30 días (deuda que envejece).

Pospuesto (documentado, no bloqueante): un **fixture** que ejercite `acceptance-check.sh` contra filas
incompletas/combinadas (D-007) — la corrección ya está verificada a mano contra la matriz real; el fixture
se valora cuando exista arnés de test de scripts.

**Pendiente:** DO-4 (`ci-develop-back.yml`: imagen `x.y.z-snapshot.{sha}` → GHCR + dist artifact) → DO-5
(`ci-main-back.yml`: imagen semver + Release) → DO-6 (workflows de front).

<!-- Próximas entradas: DO-4/5, DO-6 se añaden aquí conforme se completan. -->

