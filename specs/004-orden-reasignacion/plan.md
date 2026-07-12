# Implementation Plan: Reasignación de una orden por el dispatcher

**Branch**: `004-orden-reasignacion` | **Date**: 2026-07-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/004-orden-reasignacion/spec.md` (G1 PASS, 0 BLOQUEANTES).

## Summary

Primer **endpoint HTTP** que muta una orden: un **dispatcher** reasigna una orden reasignable
(`assigned`/`in_progress`) a otro técnico válido, **conservando el `status`**, con `version`+1 y **auditoría
append-only atómica** en la misma transacción. Reutiliza el RBAC de 001, el patrón atómico y `OrderAudit` de
002b, y salda la deuda de contrato que 002b dejó "verificable sólo con endpoint" (BL-056/059/060/061/062).

**Enfoque técnico**: caso de uso de dominio `reassignOrder` que comparte una **primitiva atómica de bajo nivel**
(UPDATE condicional por `id ∧ version ∧ status reasignable` + insert de auditoría, en una `$transaction`) con
`applyTransition`; ambos residen en el nuevo módulo `domain/order/write-side/` (reconciliación del "único punto
de escritura" de FR-006 de 002b, verificada por test de arquitectura). `OrderAudit` se extiende
(`from_assignee`/`to_assignee`/`event_type`) vía migración con `DEFAULT 'transition'` + backfill, conservando el
trigger append-only. No-enumeración **por construcción**: una única consulta de visibilidad decide 404; la
guarda atómica clasifica 0-filas con **precedencia status > version**.

## Technical Context

**Language/Version**: TypeScript 5 (`^5.5.4`, `strict`) · Node.js 18+ (Docker).

**Primary Dependencies**: Express 4 (`^4.19.2`), Prisma/`@prisma/client` `^5.18.0` (PostgreSQL 16,
`$transaction` interactiva para atomicidad), Zod `^3.23.8` (derivado del contrato), `pino ^9.3.2`,
`jsonwebtoken ^9.0.2` (auth de 001), `uuid ^10.0.0` (uuidv7 en fixtures). Reutiliza
error-mapper/logger/config/middlewares de 001 y `Order`/`version`/`OrderAudit`/patrón atómico de 002a/002b.

**Storage**: PostgreSQL 16 vía Docker Compose (paridad dev/test). BD de test `fieldops_test` (`db-test`,
puerto host 5433, `tmpfs` efímera). Migración Prisma que **añade** columnas a `order_audit` + enum
`OrderAuditEventType`; el trigger append-only de 002b se conserva.

**Testing**: Vitest `^2.0.5` (unit de dominio sin BD) · Supertest `^7.0.0` (integración con BD real + contract
tests OpenAPI). Sin componente IA → sin eval promptfoo (verificación 100% determinista; convención BL-058).

**Target Platform**: Servicio HTTP Linux (contenedor). **Project Type**: web service hexagonal (solo
`backend/`; sin `frontend/` — esta feature no tiene UI).

**Performance Goals**: p95 de reasignación (happy path) **< 300 ms** sobre 50 peticiones secuenciales, BD de
test caliente (SC-010).

**Constraints**: `status`/`version` **sólo** mutan desde `domain/order/write-side/` (arch test, FR-007);
`OrderAudit` append-only a nivel de BD (trigger); `reason` pre-saneado y **nunca** en logs/errores (FR-009);
atomicidad todo-o-nada (FR-007); no-enumeración por construcción en cuerpo+cabeceras (FR-004); actor
infalsificable server-side (FR-011); catch-all de errores de BD → 500 genérico (FR-010).

**Scale/Scope**: 1 endpoint (`reassignOrder`), 12 FR, 10 SC, 1 migración aditiva. Slice single-instance
(sin cambios de despliegue).

## Constitution Check

*GATE: debe pasar antes de Phase 0 y re-comprobarse tras Phase 1.*

### Gate · Contract-First (Principio II)

- [x] Se extiende `contracts/orders.openapi.yaml` (OpenAPI 3.1) con `reassignOrder` **antes** del código (Phase 1).
- [x] Zod derivado **manualmente** del contrato (convención del repo), `.strict()` → `additionalProperties:false`; `snake_case` externo / `camelCase` interno.
- [x] Cada `operationId` × código de respuesta (200/401/403/404/409/422/500) tendrá contract test (100%).

### Gate · RBAC y seguridad (Principios IV, IX, XI)

- [x] `reassignOrder` valida **rol dispatcher** (`requireRole('dispatcher')`) + **visibilidad por ámbito** (estado reasignable) + **estado de origen** en el UPDATE condicional. La pertenencia `assigned_to==actor` **no aplica** (el dispatcher no es el asignatario); guarda declarada = (status reasignable ∧ version), FR-008.
- [x] 401/403/404/409/422/500 distinguidos; test negativo por rol no autorizado y por cada causa. No-enumeración: 404 genérico indistinguible por construcción (FR-004).
- [x] PII: `reason` redactado en logs (ruta HTTP real, FR-009) + longitud 1..500 code points. Cifrado en reposo de `reason` = residual heredado **BL-051**; purga/anonimización **BL-055** (fuera de alcance). `assigned_to`/`from_assignee`/`to_assignee` son UUIDs opacos (no PII).
- [x] Auditoría append-only en la misma transacción; `event_type='reassignment'` con par de asignatarios. Registro de accesos denegados = **BL-002** (diferido, heredado de 001/002b).

### Gate · Arquitectura Hexagonal (Principio III)

- [x] `domain/order/write-side/` (puro: `apply-transition` reubicado + `reassign-order` nuevo + puertos) no importa Express/Prisma; `infra/repositories/` implementa la primitiva atómica con `$transaction`.
- [x] Dependencias por inyección (puertos en `AppDeps`/container). Dominio testeable sin BD (fakes). **Test de arquitectura**: ningún fichero fuera de `domain/order/write-side/*` (dominio) ni del repo write-side (infra) emite escrituras de `status`/`version` (FR-007, cierra BL-065).

### Gate · Calidad y verificación (Principios V, VI, VII, XIII, XIV)

- [x] FRs en EARS; trazabilidad RF→endpoint→tarea→test (spec §Trazabilidad, se completa en `/speckit-tasks`).
- [x] TDD con **commit de test en rojo** previo; cobertura dominio ≥80% y servicios/handlers ≥80% (gate duro en `vitest.config.ts`). 100% contract tests y clasificación de 0-filas.
- [x] SC medibles por Vitest+Supertest (sin IA → sin promptfoo, N/A justificado). Gates adversariales G1 (PASS) / G2 / G3 previstos, 0 bloqueantes.

**Resultado**: PASS. Sin violaciones que requieran Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/004-orden-reasignacion/
├── plan.md              # Este fichero
├── research.md          # Phase 0 — decisiones de diseño resueltas
├── data-model.md        # Phase 1 — OrderAudit extendido + migración
├── quickstart.md        # Phase 1 — guía de validación end-to-end
├── contracts/           # Phase 1 — fragmento del contrato reassignOrder (referencia)
├── checklists/requirements.md   # (G1)
├── gates/               # G1 (PASS), G2/G3 (pendientes)
└── tasks.md             # Phase 2 — /speckit-tasks (NO lo crea /speckit-plan)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── domain/
│   │   └── order/
│   │       ├── write-side/                 # NUEVO módulo (único punto de escritura status/version)
│   │       │   ├── apply-transition.ts     # REUBICADO desde domain/order/ (002b)
│   │       │   ├── reassign-order.ts       # NUEVO caso de uso reassignOrder
│   │       │   └── write-side-ports.ts     # puerto compartido (primitiva atómica) + errores
│   │       ├── transition-table.ts         # FSM (sin cambios; reasignación NO añade pares)
│   │       ├── scope-policy.ts             # orderScopeFor(dispatcher) reutilizado para visibilidad
│   │       └── model.ts
│   ├── handlers/
│   │   ├── orders/reassign.ts              # NUEVO handler HTTP (POST .../reassignments)
│   │   ├── contract/order-types.ts         # DTOs snake_case (req/resp de reasignación)
│   │   ├── contract/schemas.ts             # Zod reassignRequestSchema (.strict())
│   │   ├── error-mapper.ts                 # + INVALID_ASSIGNEE→422; agent_action en ErrorBody
│   │   └── app.ts                          # monta la ruta reassignOrder
│   └── infra/
│       └── repositories/
│           └── order-write-side-repository.ts   # generaliza order-transition-repository:
│                                                 # primitiva conditionalWriteWithAudit compartida
├── prisma/
│   ├── schema.prisma                       # + from_assignee/to_assignee/event_type en OrderAudit
│   └── migrations/<ts>_extend_order_audit_reassignment/   # ADD columns + enum + DEFAULT + backfill
└── tests/
    ├── contract/reassign.contract.spec.ts  # forma de request/response por código
    ├── integration/reassign-order*.spec.ts # BD real: RBAC, 404 no-enum, 422, 409, atomicidad, latencia
    └── unit/reassign-order.spec.ts         # dominio con fakes
contracts/orders.openapi.yaml               # + path POST /orders/{orderId}/reassignments (contract-first)
```

**Structure Decision**: web service hexagonal, sólo `backend/`. Se introduce `domain/order/write-side/`
reubicando `apply-transition.ts` (002b) y añadiendo `reassign-order.ts`, para materializar el "único punto de
escritura de status/version" que reconcilia FR-006 de 002b (BL-065). En infra, se **generaliza**
`order-transition-repository.ts` a `order-write-side-repository.ts` con una primitiva privada
`conditionalWriteWithAudit` compartida por transición y reasignación (evita divergencia, H-008), preservando el
comportamiento de 002b (no viola XV). El contrato vive en el `contracts/orders.openapi.yaml` de raíz (fuente de
verdad única).

## Complexity Tracking

> Sin violaciones de Constitution Check. No aplica.
