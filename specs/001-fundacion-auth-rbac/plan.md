# Implementation Plan: Fundación — Autenticación, sesión y RBAC

**Branch**: `001-fundacion-auth-rbac` | **Date**: 2026-07-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-fundacion-auth-rbac/spec.md`

## Summary

Fundación de identidad de FieldOps: autenticación (login/logout/refresh), ciclo de sesión revocable y
**RBAC transversal** en backend con distinción 401/403/404. Enfoque técnico (research.md): **access token
JWT corto (Bearer, en memoria)** + **refresh opaco en cookie HttpOnly/SameSite=Strict** con **rotación
single-use** y detección de reuso por familia; **CSRF double-submit** en los endpoints de cookie;
**validación de estado por-request sin round-trip a BD** (JWT local + caché de revocación en memoria,
autoritativo en refresh) para cumplir SC-005 (P95<300 ms). Arquitectura **hexagonal**; contrato
**OpenAPI 3.1** contract-first en `contracts/auth.openapi.yaml`.

## Technical Context

**Language/Version**: TypeScript 5 (`strict`) · Node.js 18+

**Primary Dependencies**: Express 4, Prisma (PostgreSQL 16), Zod (derivado del contrato), `argon2`
(argon2id), `jsonwebtoken` (HS256), `helmet`, `pino`, `cookie-parser`

**Storage**: PostgreSQL 16 vía Docker Compose (paridad dev=test=prod). Rate-limit/revocación: adaptadores
in-memory tras puertos (slice single-instance).

**Testing**: Vitest (unit dominio sin BD) · Supertest (integración con BD real + contract tests OpenAPI)

**Target Platform**: Servicio HTTP Linux (contenedor)

**Project Type**: Web service (backend hexagonal). Frontend fuera de esta feature (no hay UI en 001).

**Performance Goals**: Auth (login/refresh/me/logout) **P95 < 300 ms** (SC-005, excluida red); login < 1 s
P95 (SC-001); diferencia de timing inexistente-vs-inválido **< 50 ms P95** (FR-011).

**Constraints**: sin round-trip a BD en el hot path de validación de access (D3); argon2id calibrado para
no dominar SC-005 (D4); refresh nunca en claro en BD (solo hash).

**Scale/Scope**: organización única y plana (multi-tenant fuera, YAGNI); usuarios semilla (sin
auto-registro); 6 endpoints (+1 probe RBAC) + /health + /ready.

## Constitution Check

*GATE: pasa antes de Phase 0 y se re-comprueba tras Phase 1. Principios no aplicables a esta feature se
marcan N/A **con justificación** (alcance declarado en la spec), nunca para eludir seguridad.*

### Gate · Contract-First (Principio II)

- [x] Contrato `contracts/auth.openapi.yaml` (OpenAPI 3.1) creado en Phase 1 **antes** del código.
- [x] Tipos/validación (Zod) se **derivarán** del contrato; `snake_case` externo / `camelCase` interno (transform en boundary).
- [x] Cada `operationId` × código documentado tendrá contract test (login 200/401/422/429; refresh 200/401/403; logout 204/401; me 200/401; rbacProbe 200/401/403/404; health 200; ready 200/503).

### Gate · RBAC y seguridad (Principios IV, IX, XI)

- [x] Autorización en **backend** (middleware centralizado), rechaza aunque se fuerce (FR-010).
- [x] **401/403/404** distinguidos con regla fundacional (FR-017); test negativo por endpoint y rol vía `rbacProbe`. *(422: validación de body; 409 llega con transiciones de dominio en 002 — N/A funcional aquí.)*
- [~] **Pertenencia (`assigned_to == usuario`) y estado de origen**: **N/A en 001** — no hay recursos de dominio; se aplican en 002+ (declarado en spec). La regla 403/404 se deja **base-ready** en el middleware.
- [~] **PII / cifrado en reposo / URLs firmadas / minimización IA**: **N/A en 001** — no hay fotos/notas ni IA. Único dato sensible: el `identifier` (email) → **redactado en logs** (FR-014). TLS y cabeceras aplican (FR-012).
- [~] **Auditoría append-only de accesos denegados**: **base-ready** (data-model `DeniedAccessAudit` sin ALTER destructivo); comportamiento = stretch (BL-002). El esquema no lo impide.

### Gate · Arquitectura Hexagonal (Principio III)

- [x] Capas `domain/` (pura: política RBAC, rotación, lockout) · `handlers/` (HTTP) · `infra/` (Prisma, cripto, caché).
- [x] Dependencias por **puertos**: `UserRepositoryPort`, `SessionRepositoryPort`, `PasswordHasherPort`, `TokenIssuerPort`, `SessionStatePort` (revocación/estado), `RateLimitPort`, `ClockPort`. Dominio testeable sin BD.

### Gate · Calidad y verificación (Principios V, VI, VII, XIII, XIV)

- [x] FRs en EARS (spec) + trazabilidad RF→endpoint→test (spec) → se extenderá a RF→tarea en `/tasks`.
- [x] TDD con **commit de test en rojo** previo; cobertura dominio ≥80% y servicios ≥80%; 100% de contratos.
- [~] SC medibles con eval (**promptfoo**): **N/A componente IA** en 001. Los SC-001..006 se validan con tests unit/integración/contract y aserciones de rendimiento (spec §Eval de objetivos). Gates adversariales G1 (✅ PASS) / G2 (tras analyze) / G3 (tras implement) previstos.

**Veredicto Constitution Check:** **PASA**. Las casillas `~` son **N/A justificadas por el alcance
declarado** de la fundación (no eluden seguridad; lo sensible —RBAC 401/403/404, cabeceras, redacción de
logs, fail-fast— sí se cumple). Sin violaciones que requieran Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/001-fundacion-auth-rbac/
├── plan.md              # Este archivo
├── research.md          # Phase 0 (decisiones D1–D8, resuelve diferidos)
├── data-model.md        # Phase 1 (User, Session, RefreshToken, LoginAttempt, base-ready audit)
├── quickstart.md        # Phase 1 (levantar y probar el slice)
├── spec.md · threat-model.md
├── checklists/ (requirements.md, security-api.md)
└── gates/ (G1 PASS)
contracts/
└── auth.openapi.yaml    # Contrato (repo-root, fuente de verdad — Constitution II)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── domain/            # NO importa Express/Prisma/JWT
│   │   ├── auth/          # política de credenciales, lockout, rotación de refresh (Result/Either)
│   │   ├── rbac/          # matriz rol×alcance + regla 403/404 (FR-017)
│   │   └── ports/         # interfaces de los puertos
│   ├── handlers/          # rutas Express, middleware auth+rbac, mapeo Result→contrato error
│   └── infra/             # Prisma repos, argon2, jwt, caché de revocación, rate-limit in-memory, config Zod
└── tests/
    ├── unit/              # dominio puro (sin BD)
    ├── integration/       # BD real (docker), flujos login/refresh/logout/me
    └── contract/          # OpenAPI: operationId × código
```

**Structure Decision**: web service hexagonal, solo `backend/` en esta feature (sin `frontend/` — no hay
UI en 001). El design system y la UI llegan con la primera feature con pantallas (Constitution §Design System).

## Complexity Tracking

Sin violaciones de la constitution que justificar. (La caché de revocación en memoria y los adaptadores
in-memory de rate-limit son **más simples** que sus equivalentes distribuidos, adecuados al slice
single-instance; su sustitución por Redis es DevOps futuro tras un puerto, sin reescritura de dominio.)

## Phase 0 → research.md ✅ · Phase 1 → data-model.md · contracts/auth.openapi.yaml · quickstart.md ✅

Siguiente comando: `/speckit-tasks` (genera `tasks.md` con TDD y trazabilidad RF→tarea→test) → luego
`/speckit-analyze` (**G2**).
