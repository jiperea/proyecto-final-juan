# FieldOps — Proyecto Final SDD

Slice de **reasignación, ejecución y revisión de órdenes de trabajo** de FieldOps, construido con
**Spec-Driven Development (Spec Kit)** reforzado con **revisión adversarial independiente**.

> El objetivo del proyecto no es el volumen de código, sino demostrar dominio del flujo SDD de principio
> a fin: la especificación gobierna el código y **cada paso se pone en duda antes de avanzar**.

## Cómo está organizado

- **`.specify/memory/constitution.md`** — la constitution (14 principios verificables, v1.2.1).
- **`docs/`** — documentación y bitácora (empieza por [`docs/README.md`](docs/README.md)):
  brief, reparto, informes adversariales, principios, automatización, niveles, roadmap, glosario, evals.
- **`.claude/agents/`** — panel de verificación independiente (revisor-cinico, auditor-spec-theater,
  revisor-rbac-seguridad, revisor-consistencia, revisor-implementacion, remediador).
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

## Cómo arrancar y verificar

> Stack objetivo: **TypeScript/Node** (Express hexagonal, Prisma + **PostgreSQL (Docker)**, Zod,
> OpenAPI 3.1, Vitest) + **Docker** para paridad de entornos. Auth JWT access+refresh (argon2id).
> La app se implementa feature a feature; cuando exista `package.json`:

```bash
npm install        # instalar dependencias
npm test           # tests (unit + contract + integration) en verde
npm run lint       # calidad de código (Constitution XII)
npx promptfoo eval -c evals/promptfooconfig.yaml   # evals (IA + Success Criteria)
```

Entorno reproducible (cuando exista `docker-compose.yml`):

```bash
docker compose up        # levanta el entorno igual en cualquier máquina
```

Gate adversarial a demanda (headless):

```bash
scripts/gate.sh --phase G1 --feature-dir specs/001-fundacion-auth-rbac
```

## Estado

Fase de **fundación** completada: constitution + agentes + extensiones + plantillas + roadmap + CI.
Siguiente: `/speckit-specify` de la feature `001-fundacion-auth-rbac` (en su rama).

## Entrega

Repositorio: <https://github.com/sdd-talent-devops/proyecto-final-juan>. Tag de entrega: `entrega-final`.
