# Implementation Plan: Order — entidad y listado por rol (002a)

**Branch**: `002-order-entity-listado` | **Date**: 2026-07-11 | **Spec**: [spec.md](./spec.md)

## Summary

Read-side de la Fundación B: entidad `Order` (base-ready, con `version` para concurrencia optimista) +
`GET /v1/orders` con **filtrado por rol** mediante una **política de dominio única** `orderScopeFor(role,
userId)`, sobre el auth/RBAC de 001. Sin transiciones ni auditoría (002b). Contract-first (OpenAPI 3.1),
hexagonal, TDD Vitest. Reutiliza toda la infraestructura de 001 (authenticate/authorize, error-mapper,
logger con redacción, config, Prisma/Postgres, session-state).

## Technical Context

**Language/Version**: TypeScript 5 (strict) · Node 18+ (ejecutado en Docker) · **Stack**: Express 4, Prisma
(PostgreSQL 16), Zod, Vitest + Supertest. **Reutiliza** los puertos/adaptadores y middlewares de 001.

**Performance**: `GET /v1/orders` P95 < 300 ms (SC-002, método D9: N≥200, warm-up descartado, server-side)
contra dataset semilla ≥30 órdenes.

**Constraints**: filtrado de rol **obligatorio en backend** (no ampliable por input, FR-008/015); `version`
diseñada ahora sin comportamiento (FR-010); `title`/`description` nunca en logs (FR-017); `assigned_to` como
UUID opaco (FR-007); política rol→alcance **centralizada** (FR-016).

## Constitution Check

- **Contract-First (II)**: [x] `contracts/orders.openapi.yaml` antes del código; Zod derivado; contract tests
  por operationId×código (listOrders 200/401/403).
- **RBAC/Seguridad (IV, IX)**: [x] authenticate (Bearer, orden 401→403) + authorize allowlist default-deny
  (403 fail-secure); filtrado por rol en backend, no ampliable; sin fuga de órdenes ajenas (SC-004); PII de
  `title`/`description` fuera de logs; `assigned_to` opaco.
- **Hexagonal (III)**: [x] `domain` (entidad Order, `orderScopeFor`, puerto `OrderRepositoryPort`) sin infra;
  `handlers` (listOrders + reuse middlewares 001); `infra` (Prisma order-repository). Test de arquitectura.
- **Calidad/TDD (VI, VII)**: [x] TDD Red→Green; trazabilidad RF→tarea→test; cobertura por capa; SC medibles.
- **Specs pequeñas (XV)**: [x] slice read-side; FSM/auditoría/reasignación fuera (002b/003+).

**Veredicto**: PASA. Sin violaciones. `version` sin comportamiento y tabla de auditoría son base-ready (002b).

## Project Structure

```text
backend/src/
├── domain/order/         # model (Order), scope-policy (orderScopeFor), ports (OrderRepositoryPort)
├── handlers/orders/      # listOrders handler (+ reuse authenticate/authorize de 001)
└── infra/repositories/   # prisma order-repository
backend/prisma/           # schema (+ modelo Order), seed (órdenes)
contracts/orders.openapi.yaml
```

## Phase 0 → research.md ✅ · Phase 1 → data-model.md · contracts/orders.openapi.yaml · quickstart.md ✅

Siguiente: `/speckit-tasks` → `/speckit-analyze` (**G2**).
