# Implementation Plan: Fundación — Autenticación, sesión y RBAC

**Branch**: `001-fundacion-auth-rbac` | **Date**: 2026-07-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-fundacion-auth-rbac/spec.md` (tras clarify+G1: FR-001..018).

## Summary

Fundación de identidad de FieldOps: autenticación (login/logout/refresh), ciclo de sesión revocable y
**RBAC transversal** con 401/403/404 deterministas. Enfoque (research.md): **access JWT corto
(Bearer/memoria)** + **refresh opaco en cookie HttpOnly/SameSite=Strict**, **rotación single-use atómica**
con **ventana de gracia ≤10 s** (caché efímera) y detección de reuso por familia; **CSRF double-submit** en
endpoints de cookie con **orden sesión(401)→CSRF(403)**; validación por-request **sin round-trip a BD**
(caché de revocación + **fallback a BD** en miss + **fail-closed**) para cumplir **SC-005 (P95<300 ms)**.
Arquitectura **hexagonal**; contrato **OpenAPI 3.1** contract-first en `contracts/auth.openapi.yaml`.

## Technical Context

**Language/Version**: TypeScript 5 (`strict`) · Node.js 18+

**Primary Dependencies**: Express 4, Prisma (PostgreSQL 16), Zod (derivado del contrato), `argon2`
(argon2id), `jsonwebtoken` (HS256), `helmet`, `pino`, `cookie-parser`

**Storage**: PostgreSQL 16 vía Docker Compose. Rate-limit, session-state (revocación) y caché de gracia:
adaptadores **in-memory** tras puertos (slice single-instance).

**Testing**: Vitest (unit dominio sin BD) · Supertest (integración con BD real + contract tests OpenAPI)

**Target Platform**: Servicio HTTP Linux (contenedor). **Project Type**: web service hexagonal (sin UI en 001).

**Performance Goals**: auth P95 **< 300 ms** (SC-005); login P95 **< 1 s** (SC-001); |P95(inexistente) −
P95(inválido)| **< 50 ms** (FR-011). **Método de medición** (D9): N≥200, secuencial + warm-up descartado,
instrumentación **server-side** (excluye red), aplica a SC-001 y SC-005.

**Constraints**: sin round-trip a BD en el hot path (D3, fail-closed, write-through); argon2id calibrado
(D4, `disabled` chequeado tras el hash); refresh solo como hash en BD; **3 secretos distintos**:
`JWT_SECRET`, `CSRF_HMAC_SECRET`, `LOCKOUT_HMAC_SECRET` (D7); unicidad email/username por espacio único a
nivel de esquema (D11).

**Scale/Scope**: organización única y plana (multi-tenant fuera); usuarios semilla (sin auto-registro);
endpoints login/refresh/logout/me/rbacProbe + /health + /ready.

## Constitution Check

*GATE: pasa antes de Phase 0 y se re-comprueba tras Phase 1. Los N/A se justifican por el alcance de
fundación (declarado en la spec), nunca para eludir seguridad.*

### Gate · Contract-First (Principio II)

- [x] `contracts/auth.openapi.yaml` (OpenAPI 3.1) creado **antes** del código.
- [x] Tipos/validación (Zod) **derivados** del contrato; `snake_case` externo / `camelCase` interno.
- [x] Contract test por `operationId`×código: login 200/401/422/429; refresh 200/401/403; logout 204/401/403;
  me 200/401; rbacProbe 200/401/403/404; health 200; ready 200/503.

### Gate · RBAC y seguridad (Principios IV, IX, XI)

- [x] Autorización en **backend** (middleware centralizado), rechaza aunque se fuerce (FR-010).
- [x] **401/403/404** deterministas: orden **auth(401)→autorización(403)** (FR-018) y **rol(403)→pertenencia(404)** (FR-017); test por rol vía `rbacProbe` con fixture de pertenencia (incl. 404-por-alcance, FR-017b).
- [x] **Estado de cuenta**: `disabled` corta **login** (FR-002b, 401 uniforme, cuenta para lockout) **y** validación/refresh por-request (FR-004c, con revocación de familia, write-through); `locked_until` solo login (no DoS-logout).
- [~] **Pertenencia (`assigned_to`) y estado de origen**: **N/A en 001** (no hay dominio; 002+). El `rbacProbe` modela pertenencia solo para testear la regla; la regla queda **base-ready**.
- [~] **PII/cifrado reposo/URLs firmadas/IA**: **N/A en 001** (sin fotos/notas/IA). Sensible: el `identifier` → **redactado en logs** junto con Authorization/Set-Cookie/tokens (FR-014). TLS + cabeceras (FR-012).
- [~] **Auditoría de accesos denegados**: **base-ready** (`DeniedAccessAudit` sin ALTER destructivo); comportamiento = stretch (BL-002).

### Gate · Arquitectura Hexagonal (Principio III)

- [x] `domain/` (política RBAC, rotación, lockout — puro) · `handlers/` (HTTP) · `infra/` (Prisma, cripto, cachés).
- [x] Puertos: `UserRepositoryPort`, `SessionRepositoryPort`, `RefreshTokenRepositoryPort`,
  `PasswordHasherPort`, `TokenIssuerPort`, `SessionStatePort`, `GraceCachePort`, `RateLimitPort`, `ClockPort`. Dominio testeable sin BD.

### Gate · Calidad y verificación (Principios V, VI, VII, XIII, XIV)

- [x] FRs en EARS + trazabilidad RF→endpoint→test (spec) → se extenderá a RF→tarea en `/tasks`.
- [x] TDD con **commit de test en rojo** previo; cobertura dominio ≥80% y servicios ≥80%; 100% de contratos.
- [~] SC medibles con eval (**promptfoo**): **N/A componente IA** en 001. SC-001..006 se validan con tests + aserciones de rendimiento (método D9). Gates G1 (✅) / G2 (tras analyze) / G3 (tras implement).

**Veredicto Constitution Check:** **PASA**. Casillas `~` = N/A justificadas por el alcance de fundación
(no eluden seguridad). Sin violaciones que requieran Complexity Tracking.

## Project Structure

```text
specs/001-fundacion-auth-rbac/
├── plan.md · research.md · data-model.md · quickstart.md · spec.md · threat-model.md
├── checklists/ (requirements.md, security-api.md) · gates/ (G1 PASS, G2)
contracts/
└── auth.openapi.yaml
backend/
├── src/
│   ├── domain/    # auth (credenciales, lockout, rotación), rbac (matriz + regla 403/404), ports/ — sin infra
│   ├── handlers/  # rutas Express, middleware (authenticate, authorize, csrf, correlation, security-headers), error-mapper
│   └── infra/     # Prisma repos, argon2, jwt, session-state/grace/ratelimit in-memory, config Zod fail-fast
└── tests/         # unit (dominio sin BD) · integration (BD real) · contract (OpenAPI)
```

**Structure Decision**: web service hexagonal, solo `backend/` (sin `frontend/` — no hay UI en 001). El
design system y la UI llegan con la primera feature con pantallas.

## Complexity Tracking

Sin violaciones que justificar. Los adaptadores in-memory (revocación, gracia, rate-limit) son **más
simples** que sus equivalentes distribuidos y adecuados al slice single-instance; su sustitución por Redis
(BL-018) es DevOps futuro tras un puerto, sin reescritura de dominio.

## Phase 0 → research.md ✅ · Phase 1 → data-model.md · contracts/auth.openapi.yaml · quickstart.md ✅

Siguiente: `/speckit-tasks` (regenera `tasks.md` con TDD y trazabilidad RF→tarea→test) → `/speckit-analyze` (**G2**).
