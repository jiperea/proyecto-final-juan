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

**Re-revisión de convergencia (`revisor-devops`, 2.ª ronda):** **CONVERGE** — los 8 hallazgos resueltos y
verificados, sin regresiones. Único residual **D-101 (MEDIA)**: el subagente (solo lectura, sin red) no
podía confirmar el formato de los ficheros de checksums; **de-riskeado empíricamente** en esta sesión
(descarga real de `gitleaks_8.21.2_checksums.txt` y `oasdiff .../checksums.txt`: formato goreleaser
`<hash>␣␣<fichero>`, hash en minúsculas, sin asterisco → `sha256sum -c` lo acepta). Diseño **fail-closed**:
si el hash no cuadra, el job falla; nunca hay bypass silencioso.

**Pendiente:** DO-4 (`ci-develop-back.yml`) → DO-5 (`ci-main-back.yml`) → DO-6 (workflows de front).

## DO-4 · CI de integración en `develop` (backend) — 2026-07-14

**Hecho:** `.github/workflows/ci-develop-back.yml` (FR-P10). WHEN push a `develop` que toca
`backend/**`·`contracts/**` → 2 jobs:
- **ci** — `npm ci` + prisma generate/migrate + lint + typecheck + **test (Vitest, Postgres 16 de
  servicio)** + `build`; sube la **dist como artifact** (90 d, auditoría/futuro CD); **construye la imagen
  UNA vez** (`docker build --target runtime`), la **escanea con Trivy** (FR-P05, defensa en profundidad) y la
  **serializa** (`docker save | gzip`) a un artifact efímero.
- **publish-image** (`needs: ci`, `packages: write` SOLO aquí, FR-P14) — **descarga y `docker load`** esa
  misma imagen (no rebuild, FR-P12), la etiqueta `ghcr.io/${owner}/fieldops-backend:${version}-snapshot.
  ${sha7}` y hace push. Login GHCR con `GITHUB_TOKEN`, sin build-push-action (docker CLI, menos actions).

## DO-5 · CI de release en `main` (backend) — 2026-07-14

**Hecho:** `.github/workflows/ci-main-back.yml` (FR-P11). Disparador por **tag semver `vX.Y.Z`** → 3 jobs:
- **ci** — igual que DO-4 (test + build + imagen única + Trivy + serialización) **más dos fail-fast**:
  (1) **procedencia** `git merge-base --is-ancestor <sha> main` — el tag solo libera si su commit está en
  `main` (pasó el PR-gate); (2) el tag semver **debe coincidir** con `backend/package.json`.
- **publish-image** (`needs: ci`, `packages: write`) — `docker load` + push de la imagen semver **sin
  sufijo** `ghcr.io/${owner}/fieldops-backend:${X.Y.Z}` (la misma imagen probada+escaneada, no-rebuild).
- **release** (`needs: [ci, publish-image]`, `contents: write` SOLO aquí) — descarga la dist, la empaqueta y
  crea/actualiza el **GitHub Release** de forma **idempotente** (`gh release view` → `upload --clobber` /
  `create`), con nota que apunta a la imagen publicada (FR-P12).

Cadena de suministro (DO-4/5): 5 actions distintas, **todas por SHA de 40 chars verificado contra su tag**
(checkout, setup-node, upload-artifact, download-artifact, trivy); `permissions` con elevación mínima
**por job** (`packages: write` en imagen, `contents: write` en release, resto `contents: read`).

**Verificado (sin red):** YAML válido; `grep` no halla `uses: …@v[0-9]` (AC-6); los 5 SHA resuelven a su
tag comentado (`gh api`); guardián verde cubriendo también estos 2 workflows. *(La publicación real a
GHCR, el Release y los tiempos se comprueban al empujar a `develop` / taggear en Actions — requiere el
remoto.)*

**Revisión adversarial (`revisor-devops`, por el plan):** 1 BLOQUEANTE · 2 ALTAS · 2 MEDIAS · 2 BAJAS →
`REQUIERE_CAMBIOS`. **Todo resuelto en la misma ronda** (bloqueante y ALTAS son obligatorios):
- **D-001 (BLOQUEANTE, puerta trasera por tag):** un tag `vX.Y.Z` sobre cualquier commit publicaba
  imagen+Release saltándose el PR-gate → **verificación de procedencia** `merge-base --is-ancestor` en el
  job `ci` (aborta si el commit no está en `main`) + **tag ruleset `v*`** documentado en
  `branch-protection.md`.
- **D-002 (ALTA, sin Trivy/gate en integración):** Trivy no volvía a correr al publicar → **Trivy sobre la
  imagen exacta** que se publica, en el job `ci` de DO-4 y DO-5 (defensa en profundidad).
- **D-003 (ALTA, rebuild intra-CI):** la imagen publicada era un 2.º build independiente del `dist`
  probado → **build único**: se construye una vez en `ci`, se pasa por artifact (`save`/`load`) al push;
  la imagen publicada es byte a byte la probada+escaneada (no-rebuild real, FR-P12).
- **D-004 (MEDIA, paridad Node):** la verificación del tag usaba el Node preinstalado del runner →
  `setup-node` **antes** de esa verificación.
- **D-005 (MEDIA, idempotencia):** `gh release create` fallaba en reintentos → flujo **idempotente**
  (`view` → `upload --clobber` / `create`).
- **D-006 (BAJA):** documentado que el artifact `…-dist-*` es auditoría/futuro-CD, **no** lo desplegado
  (canónico = imagen GHCR) — en `branch-protection.md`.
- **D-007 (BAJA):** verificado con `gh api` que **cada SHA resuelve a su tag** comentado.

**Pendiente:** DO-6 (workflows de front): `pr-validation-front.yml`, `ci-develop-front.yml`,
`ci-main-front.yml`.

## DO-6 · Workflows de front — 2026-07-14

**Hecho:** los 3 workflows de front, espejo del patrón ya convergido del back (sin Postgres; imagen
`fieldops-frontend`, nginx unprivileged):
- **`pr-validation-front.yml`** (FR-P06/P07/P08): PRs a `frontend/**`·`contracts/**` (paths, FR-P01; el
  contrato entra porque el front deriva tipos de él) → job **guardian** (validate-constitution +
  acceptance-check) + job **lint·typecheck(+`codegen:check` = aserción Zod↔contrato)·test(+axe)·build**.
  Los **E2E (Playwright) quedan fuera** del gate (pesados, riesgo NFR-P01) → local/manual con justificación.
- **`ci-develop-front.yml`** (FR-P10): push a `develop` → CI de front + imagen construida **una vez** +
  Trivy + `save`/`load` → push `…/fieldops-frontend:x.y.z-snapshot.{sha7}` (no-rebuild, FR-P12).
- **`ci-main-front.yml`** (FR-P11): tag semver `vX.Y.Z` → procedencia (`merge-base` a main) +
  tag==`frontend/package.json` + imagen semver. **No crea Release** (lo hace back bajo el mismo tag) para
  evitar carrera entre workflows; el front solo publica su imagen + dist artifact.

Cadena de suministro: mismas 5 actions por SHA de 40 chars ya verificadas; `permissions` mínimas por job
(`packages: write` solo en publish). Escaneo de secretos: cubierto por `secrets-scan.yml` universal.

**Verificado (sin red):** los 3 YAML válidos; `grep` no halla `uses: …@v[0-9]` (AC-6); guardián verde
cubriendo los **7 workflows**; nombres de imagen (`:ci`/`:rel`) y de artifact sin colisión con los del back
(prefijos `-backend`/`-frontend`). *(La ejecución real —lint/test/build de front, imagen, Trivy, push a
GHCR— se comprueba al abrir PR / empujar a `develop` / taggear en Actions.)*

**Revisión adversarial (`revisor-devops`, por el plan):** 0 BLOQUEANTES · 1 ALTA · 3 MEDIAS · 1 BAJA →
`REQUIERE_CAMBIOS`. Resuelto:
- **D-001 (ALTA, asimetría de seguridad):** el PR-gate de front no construía ni escaneaba la imagen (el de
  back sí) → la imagen de front llegaba a `develop` sin gate de cadena de suministro. **Añadido job
  `image-scan`** (build `--target runtime` + Trivy) al PR-gate de front, en paridad con back.
- **D-003 (MEDIA, paths):** un cambio a los scripts del guardián no re-disparaba el gate de front →
  añadidos `scripts/validate-constitution.sh` y `acceptance-check.sh` a sus `paths:` (paridad con back).
- **D-004 (MEDIA, versionado):** un tag `vX.Y.Z` dispara back y front a la vez → **política de lockstep**
  documentada en `pipeline-spec.md` (mismo `X.Y.Z` ambos componentes; package.json sincronizados).
- **D-002 (MEDIA, trazabilidad de FR-P):** documentado en `pipeline-spec.md` que los `FR-P###` del pipeline
  se verifican por los **ACs (AC-1..7)** + workflows/guardián, no por la matriz RF (deliberado: meterlos en
  la matriz haría fallar `acceptance-check`).
- **D-005 (BAJA, doble `tsc -b`):** aceptado — `typecheck` (`tsc --noEmit` + `codegen:check`) y `build`
  (`tsc -b && vite build`) cumplen fines distintos; el margen de NFR-P01 lo permite hoy.

**Pendiente:** DO-7 (CD) — enmendar la spec para traer el CD a alcance (spec-antes-que-YAML) y desplegar a
**Render + Neon** (decisión del usuario), entornos **dev (`develop`) primero, luego prod (`main`)**, con
secretos por **GitHub Environment**. La configuración en GitHub (secrets, servicios Render, Neon, rulesets)
es **manual** (la hace el usuario), como el resto de ajustes del repo.

<!-- Próximas entradas: DO-4/5, DO-6 se añaden aquí conforme se completan. -->

