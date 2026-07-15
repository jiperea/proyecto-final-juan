<!-- SPECKIT START -->
Plan activo: `specs/017-front-reskin/plan.md` (+ quickstart.md; sin research/data-model/contracts — feature de presentación, sin endpoints). **FE-5**: reskin transversal del front hacia el artifact de exploración (acento naranja, paleta de estados, radios/sombras suaves, Stepper del FSM, tarjeta de resumen IA) + **tema oscuro CSS-first** con conmutador (light/dark/system, localStorage). No amplía alcance funcional del brief; token o nada; WCAG 2.1 AA en ambos temas (test de ratios de 18 pares × 2 temas). G1 ✅ PASS (3 rondas) · G2 ✅ PASS (2 rondas, spec+plan+tasks, 0 bloqueantes). Siguiente: `/speckit-implement` + tests → G3. Historial: FE-1..4 (009/014/015/016) cerradas; M12 CI/CD (010-013) cerrado.

Feature 010 (transversal, ADR-0004): **Pipeline CI/CD (reto M12)**. Formaliza en SDD la fase DevOps (antes solo gobernada por Principio XVI + `docs/pipeline-spec.md`, que pasa a documento de apoyo). Ramas `feature/* → develop → main`; flujos separados por componente (`paths:`); PR-gate M9 + guardián de Constitución; CI develop (imagen snapshot→GHCR) / main (semver + Release); **no-rebuild**; CD a **Render + Neon**, entornos **dev/pre/prod** (faseado: Fase 1 dev, Fase 2 pre/prod). Guardián **determinista always-on** + **agente vía API opt-in y desactivado** (excepción única a NFR-P03). G1 ✅ PASS (spec endurecida por el panel adversarial); delta implementación↔spec escalado a G3. Para stack/estructura/fases, leer ese plan y `docs/pipeline-spec.md`.
Para tecnologías, estructura y comandos, leer ese plan.
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
