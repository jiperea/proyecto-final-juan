# Implementation Plan: Reasignación de una orden por el dispatcher (MAGRO)

**Branch**: `004-orden-reasignacion` | **Date**: 2026-07-13 | **Spec**: [spec.md](./spec.md) (G1 PASS, magra)

**Input**: spec magra reformulada (needs-first, XV). Solo el núcleo de reasignación; el cluster de
robustez/deuda queda fuera (stretch). 001/002a/002b inamovibles.

## Summary

Endpoint HTTP `reassignOrder` (`POST /v1/orders/{orderId}/reassignments`) que permite a un **dispatcher**
reasignar una orden reasignable a otro técnico, **conservando el estado**, con `version`+1 y **auditoría
append-only atómica**. RBAC dispatcher-only, no-enumeración (404 genérico) y errores saneados (500). Sin
concurrencia optimista explícita (`If-Match`/409) ni endurecimiento fino — aislados a stretch/deuda (XV).

## Technical Context

**Language/Version**: TypeScript 5 (`^5.5.4`, `strict`) · Node 18+ (Docker).
**Primary Dependencies**: Express 4 (`^4.19.2`), Prisma/`@prisma/client` `^5.18.0` (PostgreSQL 16,
`$transaction` interactiva), Zod `^3.23.8`, `pino ^9.3.2`, `jsonwebtoken ^9.0.2` (auth de 001), `uuid ^10.0.0`.
**Storage**: PostgreSQL 16 vía Docker Compose (BD de test `fieldops_test`, `db-test`, puerto 5433, tmpfs).
Migración Prisma **aditiva** sobre `order_audit` + enum `OrderAuditEventType`; trigger append-only conservado.
**Testing**: Vitest `^2.0.5` (unit dominio sin BD) · Supertest `^7.0.0` (integración + contract). Sin IA →
sin promptfoo.
**Target Platform**: Servicio HTTP Linux (contenedor). **Project Type**: web service hexagonal (solo `backend/`).
**Performance Goals**: p95 < 300 ms (50 peticiones secuenciales, BD caliente, warm-up descartado, nearest-rank).
**Constraints**: `status`/`version`/`assigned_to` **sólo** mutan desde `domain/order/write-side/` (arch test);
`OrderAudit` append-only (trigger); `reason` nunca en logs/errores; atomicidad todo-o-nada; no-enumeración por
cuerpo; actor server-side; errores de BD → 500 genérico. **Sin** 409/If-Match, 503, ni mapeo fino de P2003.
**Scale/Scope**: 1 endpoint, 9 FR, 10 SC, 1 migración aditiva.

## Constitution Check

### Gate · Contract-First (II)
- [x] Se extiende `contracts/orders.openapi.yaml` con `reassignOrder` (200/401/403/404/422/500) **antes** del código.
- [x] Zod derivado manualmente del contrato, `.strict()`; `snake_case` externo / `camelCase` interno.
- [x] Cada `operationId` × código de respuesta con contract test.

### Gate · RBAC y seguridad (IV, IX, XI)
- [x] `requireRole('dispatcher')` + visibilidad por ámbito (estado reasignable) + estado de origen en el UPDATE condicional. Actor sólo del token (FR-008).
- [x] 401/403/404/422/500 distinguidos; no-enumeración 404 genérico por cuerpo (FR-004). `reason` no-fuga (FR-009).
- [x] Auditoría append-only atómica (OrderAudit extendido). `from_status`/`to_status` NULL en reasignación (XI: quién/cuándo/de-quién→a-quién/por qué).
- [~] **Desviación XI (registro de accesos denegados)**: diferida a **BL-002/BL-067** — ver Complexity Tracking.

### Gate · Hexagonal (III)
- [x] `domain/order/write-side/` puro (no importa Express/Prisma); `infra/repositories/` con `$transaction`. Handler delgado sin Prisma directo. Puertos inyectados (`OrderVisibilityPort`, `UserLookupPort`, `OrderReassignmentPort`).
- [x] **Test de arquitectura**: `status`/`version`/`assigned_to` sólo se escriben desde el módulo write-side.

### Gate · Calidad y verificación (V, VI, VII, XIII, XIV)
- [x] FRs en EARS; trazabilidad RF→endpoint→tarea→test (docs/traceability.md, Polish).
- [x] TDD fase Red (commit de test en rojo); cobertura dominio ≥80%, handlers/servicios ≥80%.
- [x] SC medibles (Vitest+Supertest, Postgres real; sin IA → sin promptfoo, N/A). Gates G1 (PASS)/G2/G3, 0 bloqueantes.

**Resultado**: PASS.

## Project Structure

### Source Code (repository root)

```text
backend/
├── src/
│   ├── domain/order/
│   │   ├── write-side/                 # NUEVO módulo (único punto de escritura status/version/assigned_to)
│   │   │   ├── apply-transition.ts     # REUBICADO desde domain/order/ (002b) — clasificador 002b intacto
│   │   │   ├── reassign-order.ts       # NUEVO caso de uso reassignOrder
│   │   │   └── write-side-ports.ts     # OrderReassignmentPort + OrderVisibilityPort + UserLookupPort + errores
│   │   ├── scope-policy.ts             # orderScopeFor(dispatcher) reutilizado
│   │   └── model.ts
│   ├── handlers/
│   │   ├── orders/reassign.ts          # handler DELGADO (auth→visibilidad(404)→body(422)→destino(422)→dominio)
│   │   ├── contract/{schemas,order-types}.ts   # Zod reassignRequestSchema + DTOs snake_case
│   │   ├── error-mapper.ts             # +INVALID_ASSIGNEE→422, +FORBIDDEN_ROLE→403; agent_action; catch-all 500
│   │   └── app.ts                      # monta POST .../reassignments con authenticate+requireRole('dispatcher')
│   └── infra/repositories/
│       └── order-write-side-repository.ts  # generaliza order-transition-repository: primitiva atómica compartida
├── prisma/
│   ├── schema.prisma                   # +from/to_assignee, +event_type; from_status/to_status → nullable
│   └── migrations/<ts>_extend_order_audit_reassignment/
└── tests/{contract,integration,unit}/
contracts/orders.openapi.yaml           # +POST .../reassignments (200/401/403/404/422/500)
```

**Structure Decision**: web service hexagonal, solo `backend/`. Se crea `domain/order/write-side/` (reubica
`apply-transition.ts`, añade `reassign-order.ts`) como **único punto de escritura** de `status`/`version`/
`assigned_to` (arch test, reconcilia FR-006 de 002b). En infra, `order-transition-repository.ts` →
`order-write-side-repository.ts` con una **primitiva atómica privada** (SELECT FOR UPDATE + UPDATE condicional
+ insert auditoría en `$transaction`) que comparte **sólo el boilerplate**; `applyTransition` conserva su
clasificador de 002b **intacto** (sin cambio de comportamiento, XV). Contrato en `contracts/orders.openapi.yaml`.

## Complexity Tracking

| Violación | Por qué se acepta | Alternativa rechazada porque |
|-----------|-------------------|------------------------------|
| **Constitution XI — no se registran accesos denegados** (401/403/404) en auditoría | Desviación **heredada** de 001/002b; es un slice transversal (BL-002) que afecta a todos los endpoints, no propio de reasignación. Además existe una **tensión interna de la constitution** (Governance no-excepcionable vs bloque MVP/Stretch que lo clasifica stretch) que debe reconciliarse **a nivel de fundación** (BL-067), no aquí. | Implementarlo sólo en 004 → inconsistencia entre endpoints y scope-creep en una feature de negocio. |

> La auditoría de **acciones exitosas** de reasignación sí es append-only y atómica (FR-007); lo diferido es
> sólo el registro de **accesos denegados**. No se toca la constitution (verificada fidelidad al brief).
