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

## Cómo arrancar el stack completo (dev)

> Stack: **TypeScript/Node** — backend Express hexagonal (Prisma + **PostgreSQL en Docker**, Zod, OpenAPI
> 3.1) · frontend React 18 + Vite · Vitest + Playwright. Auth JWT access+refresh (argon2id) + CSRF.
> Requisitos: Node 18+ y Docker. Hoy se arranca por la **vía dev** (BD en Docker, back y front por npm);
> el `docker-compose` que orquesta **db · back · front** en un solo comando es la fase **DevOps (DO-2)**.

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
npm test                            npm test        # Vitest + RTL + axe + MSW (56 tests)
npm run lint                        npm run lint     # eslint + stylelint (sin estilos sueltos)
npm run typecheck                   npm run typecheck
                                    npm run test:e2e # Playwright (teclado, reflow, bfcache)
```

Gate adversarial a demanda (headless): `scripts/gate.sh --phase G1 --feature-dir specs/<feature>`.

## Estado

- **Backend** (features **001–#010**): auth+RBAC, órdenes (entidad/listado/FSM/auditoría), reasignación,
  ejecución, revisión, resumen IA y **detalle read-side** — todas con G1/G2/G3 verdes, en `develop`.
- **Frontend FE-1** (`009-front-shell-listado`): shell + acceso/sesión + listado por rol + detalle
  read-only. **G1/G2/G3 verdes**, mergeada a `develop`. Verificado end-to-end contra el stack real.
- **Siguiente**: FE-2 (técnico) · FE-3 (dispatcher) · FE-4 (supervisor+IA) sobre FE-1; y la fase
  **DevOps** (spec del pipeline → contenerización `docker-compose` de las 3 capas → CI/CD). Roadmap en
  [`docs/06-roadmap.md`](docs/06-roadmap.md).

## Entrega

Repositorio: <https://github.com/sdd-talent-devops/proyecto-final-juan>. Tag de entrega: `entrega-final`.
