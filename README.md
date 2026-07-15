# FieldOps — Proyecto Final SDD

Gestión de **órdenes de trabajo** de FieldOps (backend API + frontend web), construido con
**Spec-Driven Development (Spec Kit)** reforzado con **revisión adversarial independiente**.

> El objetivo del proyecto no es el volumen de código, sino demostrar dominio del flujo SDD de principio
> a fin: la especificación gobierna el código y **cada paso se pone en duda antes de avanzar**.

## Cómo está organizado

- **`.specify/memory/constitution.md`** — la constitution (14 principios verificables + refuerzos).
- **`docs/`** — documentación y bitácora (empieza por [`docs/README.md`](docs/README.md)):
  brief, reparto, informes adversariales, principios, automatización, niveles, roadmap, glosario, evals.
- **`backend/`** — API (Express hexagonal, Prisma + PostgreSQL, Zod/OpenAPI). Features 001–#010.
- **`frontend/`** — UI (React 18 + Vite, TS strict). Feature **FE-1** (shell + acceso + listado + detalle
  read-only). Design system propio en `frontend/src/ui/` (ver [`docs/design-system.md`](docs/design-system.md)).
- **`.claude/agents/`** — panel de verificación independiente (revisor-cinico, auditor-spec-theater,
  revisor-rbac-seguridad, revisor-consistencia, revisor-implementacion, **revisor-front-a11y-ux**, remediador).
- **`.specify/extensions/`** — extensiones de Spec Kit: `git` (rama por spec) y `speckit-gate` (gates
  adversariales acumulativos tras clarify/analyze/implement).
- **`scripts/gate.sh`** — gate adversarial headless (CI, exit 0/1).
- **`evals/`** — evals con **promptfoo** (componente IA + Success Criteria) *(se crean con cada feature)*.

## Flujo de trabajo (por feature)

```
/speckit-specify (crea rama NNN-feature) → /speckit-clarify → [G1] → /speckit-checklist
  → /speckit-plan → /speckit-tasks → /speckit-analyze → [G2] → /speckit-implement + tests → [G3] → merge
```

Cada gate (G1/G2/G3) ejecuta el panel adversarial de forma **acumulativa** y solo avanza con
**0 bloqueantes** (Constitution, Principio XIII). Roadmap en [`docs/06-roadmap.md`](docs/06-roadmap.md).

## Despliegue local

> Stack: **TypeScript/Node** — backend Express hexagonal (Prisma + **PostgreSQL en Docker**, Zod, OpenAPI
> 3.1) · frontend React 18 + Vite · Vitest + Playwright. Auth JWT access+refresh (argon2id) + CSRF.
> Requisitos: **Node 18+** y **Docker**. Hay dos modos: **A)** todo en Docker (como se despliega en real,
> nginx sirve el front y proxya `/v1` al backend) y **B)** dev con hot-reload (para desarrollar).

### A) Todo en Docker — un solo comando (paridad con producción)

`docker-compose.yml` orquesta **db · backend · frontend** (la fase DevOps **DO-2**, ya operativa).

```bash
docker compose up -d --build            # db(:5432) + backend(:3001→3000) + frontend nginx(:8080)
docker compose ps                       # espera a que db y backend estén (healthy)

# Datos semilla (una vez; el backend aplica migraciones al arrancar, pero NO seedea).
# El seed corre desde el host contra la BD de Docker expuesta en :5432:
cd backend && npm ci && \
  DATABASE_URL=postgresql://fieldops:fieldops@localhost:5432/fieldops npm run seed
```

Abre **http://localhost:8080**. El front (build de producción por nginx, sin secretos en el bundle) proxya
`/v1/*` al backend (:3001). El backend ejecuta `prisma migrate deploy` al arrancar (CMD); el **seed** es el
paso manual de arriba. Para parar: `docker compose down` (añade `-v` para borrar también la BD y volver a sembrar).

### B) Dev con hot-reload (BD en Docker, back y front por npm)

**1) Base de datos (Docker) + migraciones + datos semilla**

```bash
docker compose up -d db                 # Postgres 16 en :5432
cp backend/.env.example backend/.env    # config (secretos de dev; validados al arrancar)
cd backend
npm ci
npm run prisma:generate
npm run prisma:migrate                  # aplica migraciones
npm run seed                            # usuarios + órdenes de prueba
```

**2) Backend** (en `backend/`, deja este proceso corriendo)

```bash
npm run dev                             # API en http://localhost:3000  (rutas bajo /v1)
```

**3) Frontend** (en otra terminal)

```bash
cd frontend
npm ci
npm run codegen                         # genera tipos desde contracts/*.openapi.yaml
npm run dev                             # UI en http://localhost:5173
```

Abre **http://localhost:5173**. El front llama a rutas relativas `/v1/*` y Vite las proxya al backend
(configurable con `VITE_BACKEND_ORIGIN`, ver `frontend/.env.example`). No hay secretos en el front: el
access token vive en memoria; refresh y CSRF van en cookies.

### Usuarios de prueba (semilla)

Contraseña común: **`SuperSecret123!`**. Identifier = username **o** email (`@fieldops.test`).
Referencia también en `frontend/.env.example`.

| Usuario | Rol | Qué ve en la UI |
|---|---|---|
| `technician1` | technician | sus órdenes activas (una columna) |
| `dispatcher1` | dispatcher | assigned/in_progress (master-detail en escritorio) |
| `supervisor1` | supervisor | pending_review (master-detail en escritorio) |
| `disabled1` / `locked1` | — | probar cuenta deshabilitada / bloqueada |

### Verificación (tests y calidad)

```bash
# backend/                          # frontend/
npm test                            npm test        # Vitest + RTL + axe + MSW
npm run lint                        npm run lint     # eslint + stylelint (sin estilos sueltos)
npm run typecheck                   npm run typecheck
                                    npm run test:e2e # Playwright (teclado, reflow, bfcache)
```

Gate adversarial a demanda (headless): `scripts/gate.sh --phase G1 --feature-dir specs/<feature>`.

## Pipeline CI/CD (reto M12)

Pipeline **gobernado por SDD** (Principio XVI): la spec precede al YAML. Detalle en
[`docs/pipeline-spec.md`](docs/pipeline-spec.md), config de ramas en
[`.github/branch-protection.md`](.github/branch-protection.md), bitácora del proceso en
[`docs/15-devops-bitacora.md`](docs/15-devops-bitacora.md). CI **API-free** (las evals de IA corren en local,
nunca en CI). Todas las *actions* van **fijadas por SHA** (cadena de suministro) y con **permisos mínimos**.

### Estrategia de ramas (GitFlow)

```
feature/NNN-*  ──PR──▶  develop  ──PR──▶  main
                          │                 │
                    CI develop         CI main (release)
                 imagen :snapshot     imagen semver + GitHub Release
                    → GHCR                → GHCR  (tag v* protegido)
```

- **`feature/*` → `develop`**: cada feature en su rama; PR contra `develop` con el **PR Gate** (abajo).
- **`develop` → `main`**: integración → release. Al mergear a `develop` se construye y publica la imagen
  **snapshot** a GHCR; en `main`, la imagen **semver** + GitHub Release. **No-rebuild**: la imagen que se
  escanea es byte a byte la que se publica y despliega.
- **Ramas protegidas** (`develop`, `main`): requieren PR (sin push directo) y que pasen los **required checks**.

### El PR Gate (un único check agregador)

Todo PR dispara [`.github/workflows/pr-gate.yml`](.github/workflows/pr-gate.yml) (sin filtro `paths:`, corre
**siempre**). Detecta qué componente cambió y ejecuta:

- **Gobernanza (siempre):** guardián de Constitución + trazabilidad, guardián-agente (opt-in, desactivado sin
  `ANTHROPIC_API_KEY`), code-review registrado.
- **Backend** (si toca `backend/**`/`contracts/**`): lint · typecheck · test (Postgres real), Contratos
  (Spectral + oasdiff), Imagen backend + Trivy.
- **Frontend** (si toca `frontend/**`/`contracts/**`): lint · typecheck · test · build, Imagen frontend +
  Trivy (con smoke-test de arranque).
- **`PR Gate`** (job final): agrega el resultado de todos (`skip` = OK, `failure` = bloquea). Es el **único
  required** junto con `gitleaks`. Así ningún PR queda bloqueado en "Expected" y a la vez no se puede mergear
  con un check de calidad/seguridad en rojo. (Los jobs del componente que no se toca aparecen **`skipped`**.)

### Cómo abrir un PR de prueba

```bash
git switch develop && git pull
git switch -c feature/prueba-pipeline
# …haz un cambio (p. ej. en backend/** o frontend/**)…
git add -A && git commit -m "test: pipeline"
git push -u origin feature/prueba-pipeline
gh pr create --base develop --fill        # abre el PR → dispara el PR Gate
gh pr checks --watch                       # sigue los checks en vivo
```

- Un PR que toca solo `docs/**` → los jobs de componente salen **`skipped`** y `PR Gate` verde (mergeable).
- Un PR de `backend/**` con un test roto o una vuln CRITICAL/HIGH → el job falla → `PR Gate` **bloquea** el merge.

### Cómo verificar la imagen publicada en el registro (GHCR)

Al mergear a `develop`/`main`, la imagen se publica en **GitHub Container Registry**:

```bash
# nombres: ghcr.io/<owner>/<repo>/fieldops-backend  y  …/fieldops-frontend
#   develop → tag :develop  (+ :<version>-snapshot.<sha7> inmutable)
#   main    → tag :<version> (semver) + GitHub Release

# 1) verlas en el registro (necesita PAT con read:packages)
echo "$GHCR_PAT" | docker login ghcr.io -u <tu-usuario> --password-stdin
docker pull ghcr.io/<owner>/<repo>/fieldops-backend:develop
docker image inspect ghcr.io/<owner>/<repo>/fieldops-backend:develop --format '{{.Id}} {{.Config.User}}'

# 2) o en la web: pestaña "Packages" del repo/organización en GitHub.
```

La imagen desplegada (Render, CD) es exactamente esa (no se reconstruye).

## Despliegue en otros entornos (dev / pre / prod)

El despliegue a los entornos usa la **misma imagen** publicada en GHCR (no-rebuild): **cómputo en
[Render](https://render.com)** (gratis, URL pública) + **Postgres gestionada en [Neon](https://neon.tech)**
(una BD por entorno). Faseado: **Fase 1 = `dev`** primero; **Fase 2 = `pre`/`prod`** después.

| Entorno | Rama que lo alimenta | Imagen (tag móvil) | CD |
|---|---|---|---|
| **dev** | `develop` | `…/fieldops-{backend,frontend}:develop` | job *Deploy dev (Render)* dentro de [`ci-develop-back.yml`](.github/workflows/ci-develop-back.yml) / [`ci-develop-front.yml`](.github/workflows/ci-develop-front.yml) (auto tras CI) |
| **pre** | `main` (tras release) | `…:pre` (movido al semver validado) | [`cd-pre.yml`](.github/workflows/cd-pre.yml) (auto) |
| **prod** | `main` | `…:prod` (movido al semver validado) | [`cd-prod.yml`](.github/workflows/cd-prod.yml) (**manual**, con confirmación) |

Cada entorno = **2 servicios web** en Render (backend + frontend) *from an existing image*, más su **BD Neon**.
El deploy no reconstruye: la CD **mueve el tag** del entorno (`:pre`/`:prod`) al semver ya validado y **dispara
el deploy-hook** de Render; Render tira la imagen de GHCR y arranca. Config sensible (connection string de Neon,
`JWT_SECRET`/`CSRF_HMAC_SECRET`/`LOCKOUT_HMAC_SECRET`, TTLs) va en **variables de entorno de Render** (validadas
al arrancar, fail-fast), **nunca** en el repo ni en GitHub Secrets del código.

> **Pasos manuales (una vez por entorno)** — GitHub → Neon → Render, con las variables y los deploy-hooks:
> **[`docs/16-devops-setup-manual.md`](docs/16-devops-setup-manual.md)** (orden A→E, dev primero). Detalle de
> gobernanza del pipeline en [`docs/pipeline-spec.md`](docs/pipeline-spec.md). Si falta el secret
> `RENDER_DEPLOY_HOOK_*` de un entorno, su job de deploy **se omite en verde** (no rompe el pipeline).

## Estado

- **Backend** (features **001–#010**): auth+RBAC, órdenes (entidad/listado/FSM/auditoría), reasignación,
  ejecución, revisión, resumen IA y **detalle read-side** — todas con G1/G2/G3 verdes, en `develop`.
- **Frontend**: **FE-1** (`009`, shell + acceso + listado + detalle read-only) y **FE-2** (`014`, write-side
  del técnico: iniciar/ejecutar/evidencia) **G1/G2/G3 verdes, en `develop`**; **FE-3** (`015`, write-side del
  dispatcher: reasignación master-detail) **G1/G2/G3 verdes, en PR** — verificado end-to-end contra el stack real.
- **DevOps / pipeline CI/CD** (features **010–013**): contenerización de las 3 capas, PR-gate M9,
  CI develop/main con imagen a GHCR, y el **PR Gate agregador** (013) — G1/G2/G3 verdes, **probado en
  Actions**. **CD a Render + Neon** cableada (jobs de deploy por entorno; se activan al configurar los
  deploy-hooks/secrets — ver *Despliegue en otros entornos* arriba y [`docs/16-devops-setup-manual.md`](docs/16-devops-setup-manual.md)).
  Faseado: dev primero, pre/prod después.
- **Siguiente**: FE-4 (supervisor + panel de resumen IA) sobre FE-1. Roadmap en
  [`docs/06-roadmap.md`](docs/06-roadmap.md).

## Entrega

Repositorio: <https://github.com/sdd-talent-devops/proyecto-final-juan>. Tag de entrega: `entrega-final`.
