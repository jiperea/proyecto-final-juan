<!-- SPECKIT START -->
Plan activo: `specs/004-orden-reasignacion/plan.md` (+ research.md, data-model.md, quickstart.md).
Contrato: `contracts/orders.openapi.yaml` (OpenAPI 3.1, operación `reassignOrder`). Para tecnologías,
estructura y comandos, leer ese plan.
<!-- SPECKIT END -->

# FieldOps — Guía operativa para Claude

> **La fuente de verdad es la constitution** (`.specify/memory/constitution.md`). Ante conflicto,
> manda la constitution. Esto es un resumen operativo para trabajar rápido y bien en este repo.

## Reglas de oro

1. **SDD real, no a mano.** Usa las skills de Spec Kit (`/speckit-specify`, `/speckit-clarify`,
   `/speckit-plan`, `/speckit-tasks`, `/speckit-analyze`, `/speckit-implement`). No redactes artefactos
   Spec Kit a mano.
2. **Una rama por spec** (la crea la extensión git en `before_specify`). Commits separados
   `spec → plan → tasks → código` (**Conventional Commits**: `feat/fix/docs/chore/test/refactor`).
3. **Gates adversariales** (extensión `speckit-gate`) tras `clarify` (G1), `analyze` (G2) e
   `implement` (G3), **acumulativos**; se avanza solo con **0 BLOQUEANTES**. No commitear con bloqueantes.
4. **Sin API de pago.** Todo por el plan (CLI `claude -p`): gate.sh, evals de promptfoo (provider
   `claude -p`), feature IA en dev (`AI_PROVIDER=claude-cli`). Tests mockean el proveedor.
5. **Deterministic-first.** Verifican las herramientas (`tsc`, `eslint`, `vitest`, `promptfoo`); Claude
   lee resultados y corrige. No hagas de linter a mano. Model tiering: Haiku mecánico / Sonnet revisión /
   Opus lo difícil (ver `docs/11`).

## Stack (Constitution §Stack)

- **TypeScript 5 strict** · Node 18+ · **Express 4** con **arquitectura hexagonal** (`domain/` puro,
  `handlers/`, `infra/`; el dominio NO importa Express/Prisma/SDK-IA).
- **PostgreSQL 16 (Prisma) en todos los entornos vía Docker** (paridad; migraciones Prisma Migrate).
- **Zod** derivado del contrato · **OpenAPI 3.1** en `contracts/` (contract-first, rutas bajo **`/v1`**).
- **Vitest** + Supertest · **pino** · **Docker + Docker Compose**.
- **Seguridad/robustez:** helmet (HSTS/CSP) + CSRF + rate-limit (login e IA); config validada al
  arrancar (Zod, fail-fast); FSM explícito; auditoría atómica (misma transacción); correlation-ID.
- **Auth:** JWT access (memoria) + refresh opaco (cookie HttpOnly, revocable), **argon2id** (ADR-0002).

## Cómo trabajar una feature

`/speckit-specify` (crea rama) → `/speckit-clarify` → **G1** → `/speckit-checklist` → `/speckit-plan`
→ `/speckit-tasks` → `/speckit-analyze` → **G2** → `/speckit-implement` + tests → **G3** → merge.

- **FRs en EARS**; NFRs cuantificados; **Success Criteria medibles** (eval promptfoo).
- **Trazabilidad** RF→endpoint→tarea→test en `docs/traceability.md`.
- **TDD fase Red** (commit de test en rojo antes de implementar). Cobertura dominio ≥80% y servicios ≥80%,
  100% contratos y transiciones. BD real (Postgres docker-compose, BD de test independiente). E2E solo
  con justificación. Detalle en `docs/12`.
- **Errores de dominio con `Result/Either`** (no throw); contrato de errores `{code,message,details,agent_action}`.
- **Seguridad:** RBAC en backend (rol + `assigned_to` + estado de origen), 401/403/404/409; PII cifrada,
  URLs firmadas ≤300 s, no en logs, minimizada antes de la IA; auditoría append-only.

## Documentación y analítica

- Mapa de `docs/` y bitácora: `docs/README.md`. Roadmap de features: `docs/06-roadmap.md`.
- Panel de agentes de verificación en `.claude/agents/` (independientes de Spec Kit).
- Analítica de tokens (RTK/ccusage, sin API): `informes/` + skill `/informe-tokens` + hook SessionEnd.

## No hacer

- No usar la API de pago. No redactar artefactos Spec Kit a mano. No saltarse gates ni exceptuar
  bloqueantes/seguridad. No `any` sin `// JUSTIFICACIÓN:`. No importar infra desde `domain/`.
  No default exports. No commitear secretos (usa `.env`, ver `.env.example`).
