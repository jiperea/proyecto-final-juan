# Implementation Plan: Detalle de orden (read-side) — #010

**Branch**: `008-order-detalle-read` | **Date**: 2026-07-13 | **Spec**: [spec.md](./spec.md) (G1 PASS ronda 7)

**Input**: spec read-side pura (needs-first, XV). **Un** endpoint de **lectura** del detalle de una orden visible
según el rol, prerequisito de la fase Front. Sin mutaciones, sin migración, sin backfill. 001/002a/004/005/006/007
**inamovibles**.

## Summary

Un endpoint HTTP `getOrderDetail` (`GET /v1/orders/{orderId}`) que devuelve el detalle de una orden **visible
para el rol** (mismo alcance que `listOrders`/`orderScopeFor` de 002a). Para **technician dueño y supervisor**
incluye **notas + metadatos de evidencia** (`{count, content_types}`) del **ciclo vigente** (el `audit_id` del
último `submitOrderExecution`, misma regla que 007 H-001). Para el **technician dueño ACTUAL** con **rechazo SIN
atender** (última transición de rechazo `pending_review→in_progress` **posterior** al último submit) incluye el
**motivo** leído de `OrderAudit.reason` (**excepción de mínimo privilegio de Constitution XI ≥ v1.9.0**),
**saneado al leer** con el `pii-redactor` de 007 (**fail-closed**: si el redactor falla, se omite el campo). El
**dispatcher** solo ve los campos de la orden (sin notas/evidencia). **404 uniforme** (sin 403; la visibilidad
filtra a 404, no-enumeración), con **precedencia 401→404** y `orderId` malformado → **404** (no 400). Todo acceso
denegado (401/404) **emite una entrada de log best-effort** `{actor?, endpoint, recurso opaco saneado, outcome}`
(`FR-009`) por el **logger `pino` compartido** mediante un puerto **propio** `DeniedAccessLoggerPort` (no el
`AccessLogPort` de 007, tipado para ai-summary y sin caso 401; 007 inamovible) — el **registro forense durable**
(append-only, transversal) es la feature **#009** (BL-002/067), fuera del MVP; #010 **no** crea tabla ni migración.
Todas las lecturas (**la fila `order` completa** + guard de propiedad + última reject + último submit + notas/evidencia)
se resuelven en **un snapshot atómico** (una consulta con CTE/subconsultas, o `REPEATABLE READ`/`SERIALIZABLE` si son
varias — **nunca** múltiples SELECT en READ COMMITTED, que no fija snapshot).
**Read-only puro**: no muta estado/version/notas/auditoría de negocio; no sirve el binario de evidencia.

Reutiliza: auth/RBAC de 001; `orderScopeFor`/visibilidad de 002a; `OrderAudit`/`OrderEvidence`/`OrderExecutionNotes`
de 003/005/006; el `pii-redactor` (`domain/ai/pii-redactor`) de 007 y el logger `pino` compartido (puerto propio
para accesos denegados, no el `AccessLogPort` de 007). **0 entidades nuevas, 0
migraciones.**

## Technical Context

**Language/Version**: TypeScript 5 (`^5.5.4`, `strict`) · Node 18+ (Docker).
**Primary Dependencies**: Express 4 (`^4.19.2`), Prisma/`@prisma/client` `^5.18.0` (PostgreSQL 16, `$transaction`
interactiva para el snapshot consistente), Zod `^3.23.8` (derivado del contrato), `pino ^9.3.2` (logger con
`REDACT_PATHS` → `reason`), `jsonwebtoken ^9.0.2` (auth de 001). **Sin SDK-IA** (el `pii-redactor` es dominio puro
de 007, sin proveedor externo).
**Storage**: PostgreSQL 16 vía Docker Compose (BD de test `fieldops_test`, `db-test`, puerto 5433, tmpfs).
**Sin migración Prisma**: no hay tablas ni columnas nuevas. Solo SELECTs sobre `orders`, `order_audit`,
`order_evidence`, `order_execution_notes` (todas ya existen).
**Testing**: Vitest `^2.0.5` (unit dominio sin BD: visibilidad por rol, resolución de ciclo vigente, regla de
"rechazo sin atender", saneo/fail-closed) · Supertest `^7.0.0` (integración con BD real + contract test ×
200/401/404/500/503). **Sin IA → sin promptfoo** (SC verificables por tests deterministas).
**Target Platform**: Servicio HTTP Linux (contenedor). **Project Type**: web service hexagonal (solo `backend/`).
**Performance Goals**: sin SC de latencia propio; objetivo prudente p95 < 300 ms (coherente con el resto de la API).
**Constraints**:
- **Read-only** (arch test): el handler de #010 NO importa write-side; `status`/`version` no se tocan.
- **Snapshot atómico** (FR-003): guard de propiedad + última reject + último submit se leen como **una sola
  consulta atómica** (CTE/subconsultas en un `SELECT`) **o**, si se opta por varias lecturas, dentro de una
  `$transaction` en **`REPEATABLE READ`/`SERIALIZABLE`**. **Prohibido** múltiples SELECT en READ COMMITTED
  (aislamiento por sentencia → una reasignación/submit que comitee entre lecturas produce estado híbrido y podría
  dejar al **ex-dueño** leer el motivo). Verificado con un test de concurrencia **determinista** (advisory locks /
  dos clientes con pausa en tx, no timing real).
- **PII**: motivo saneado al leer con `pii-redactor` (**fail-closed** → omitir campo si falla, nunca crudo);
  `object_ref` nunca en respuesta; `notes` es payload IX (servido a technician dueño/supervisor, no redactado —
  residual documentado); `reason` crudo nunca en logs (`REDACT_PATHS`).
- **No-enumeración**: 404 genérico e indistinguible (mismo código y cuerpo) para inexistente/ajena/fuera-de-estado/
  malformado/rol-no-reconocido; `orderId` malformado NO produce 400; **sin 403**. Precedencia **401→404**.
- **Observabilidad de accesos denegados (FR-009)**: 401/404 → **entrada de log best-effort** `{actor?, endpoint,
  recurso, outcome∈{401_unauth,404_not_visible}}` por el logger `pino` compartido vía puerto **propio**
  `DeniedAccessLoggerPort` (NO el `AccessLogPort` de 007, sin caso 401; 007 inamovible; #010 **sí** emite en 401);
  `recurso` saneado (UUID o `<malformed>`, nunca crudo); no bloqueante (un fallo no degrada la respuesta).
  **NO** se crea el registro **durable append-only** en #010 (`order_audit.order_id` es FK NOT NULL → no puede
  sostener un 401/orden inexistente): eso es la feature **#009** (BL-002/067), fuera del MVP. Sin tabla ni migración.
- **Excepción XI v1.9.0**: la lectura de `OrderAudit.reason` está acotada a la última reject de la propia orden del
  técnico; NO abre el resto del registro (puerto de lectura dedicado, mínimo privilegio). El desempate submit-vs-reject
  usa el `id`/uuid v7 generado **server-side** (monótono con el commit).
- BD no disponible → 503; error no transitorio → 500.
**Scale/Scope**: 1 endpoint (GET), 9 FR, 5 SC, 0 entidades nuevas, 0 migraciones.

## Constitution Check

*GATE: pasa antes de Phase 0 y se re-comprueba tras Phase 1.*

### Gate · Contract-First (II)
- [x] Se **extiende** `contracts/orders.openapi.yaml` (**v1.5.0**) con `getOrderDetail` (200/401/404/500/503,
  **sin 403**) + esquemas `OrderDetailResponse` y `EvidenceMeta`, **antes** del código (Phase 1; YAML válido).
- [x] Zod derivado del contrato, `.strict()`; `snake_case` externo / `camelCase` interno; `orderId` como string
  (no `format: uuid`) para que un id malformado caiga en 404, no en 400 (no-enumeración).
- [x] Cada `operationId` × código de respuesta con contract test (200/401/404/500/503).

### Gate · RBAC y seguridad (IV, IX, XI)
- [x] Visibilidad valida **rol + pertenencia** (`assigned_to == actor` para technician) **+ estado de origen**
  (alcance por rol) en backend; rol no reconocido → alcance vacío → **404** (fail-secure). Motivo solo al dueño
  actual (`assigned_to == actor`).
- [x] **401/404** distinguidos; **sin 403** en este endpoint (deliberado, no-enumeración; difiere de `listOrders`
  que sí usa 403 porque un listado no revela existencia de un recurso concreto). Test negativo por rol y por rama
  de 404. Precedencia **401→404**.
- [x] PII: motivo **saneado al leer** (pii-redactor, **fail-closed**); `object_ref` nunca en la respuesta;
  `reason` crudo nunca en logs (`REDACT_PATHS`); minimización N/A (sin proveedor IA). `notes` = payload IX
  (residual documentado, servido solo a technician dueño/supervisor). **Sin** URLs firmadas (no se sirve binario).
- [x] **Observabilidad** de accesos denegados (401/404, FR-009) con `recurso` saneado vía **puerto propio**
  `DeniedAccessLoggerPort` sobre el logger `pino` compartido (best-effort; **sí** cubre 401, a diferencia del
  `AccessLogPort` de 007, que queda inamovible); el **registro forense durable** (XI, transversal) es la feature
  **#009** (BL-002/067), fuera del MVP — #010 no crea tabla/migración. Lectura de
  `OrderAudit.reason` acotada por la excepción XI v1.9.0 (mínimo privilegio, puerto dedicado).

### Gate · Arquitectura Hexagonal (III)
- [x] Capas `domain/` (visibilidad por rol, resolución de ciclo vigente, regla de "rechazo sin atender", decisión
  de campos por rol — puras) · `handlers/` (ruta GET, orquestación, mapeo de errores) · `infra/` (Prisma:
  snapshot consistente; adaptador del pii-redactor; escritor de auditoría). El dominio **no** importa Express/Prisma.
- [x] Dependencias por inyección (puertos): `OrderDetailReaderPort` (snapshot), `PiiRedactorPort` (007),
  `DeniedAccessAuditPort` (XI). Dominio testeable sin BD.

### Gate · Calidad y verificación (V, VI, VII, XIII, XIV)
- [x] FRs en EARS (FR-001..FR-009); trazabilidad RF→endpoint→tarea→test en spec + `docs/traceability.md`.
- [x] TDD con **commit de test en rojo** previo; cobertura dominio ≥80% y servicios ≥80%; 100% contrato y ramas
  de visibilidad/404.
- [x] SC medibles por tests deterministas (sin promptfoo: no hay IA); gates G1 (PASS) / G2 / G3 previstos.

## Project Structure

### Documentation (this feature)

```text
specs/008-order-detalle-read/
├── plan.md              # Este fichero
├── research.md          # Phase 0 (decisiones de diseño)
├── data-model.md        # Phase 1 (entidades leídas, sin cambios de esquema)
├── quickstart.md        # Phase 1 (validación end-to-end)
├── spec.md              # G1 PASS
└── tasks.md             # /speckit-tasks (no lo crea /plan)
```

Contrato (fuente de verdad, extendido): `contracts/orders.openapi.yaml` (v1.5.0, operación `getOrderDetail`).

### Source Code (repository root)

```text
backend/
├── src/
│   ├── domain/order/read-side/
│   │   ├── order-detail-visibility.ts     # NUEVO: visibilidad por rol (rol+assigned_to+status) → visible|404
│   │   ├── current-cycle.ts               # NUEVO: resuelve ciclo vigente (audit_id del último submit)
│   │   ├── rejection-reason.ts            # NUEVO: regla "rechazo sin atender" (última reject vs último submit)
│   │   └── order-detail-assembler.ts      # NUEVO: decide campos por rol (dispatcher sin notes/evidence; motivo)
│   │   └── ports.ts                        # NUEVO: OrderDetailReaderPort, PiiRedactorPort, DeniedAccessLoggerPort
│   ├── domain/ai/pii-redactor.ts           # REUSA (007): saneo estructural, invocado fail-closed
│   ├── handlers/orders/get-order-detail.ts # NUEVO: ruta GET /orders/{orderId}, precedencia 401→404, mapeo error
│   └── infra/
│       ├── prisma/order-detail-reader.ts   # NUEVO: snapshot consistente (guard+reject+submit+notes+evidence)
│       └── audit/denied-access-logger.ts    # NUEVO (fino): DeniedAccessLoggerPort sobre pino compartido (no AccessLogPort de 007); emite 401/404 best-effort (recurso saneado, outcome). Durable = #009
└── tests/
    ├── unit/                               # dominio sin BD (visibilidad, ciclo, rechazo-sin-atender, fail-closed)
    ├── integration/                        # BD real: por rol, 404 ramas, snapshot concurrente, auditoría
    └── contract/                           # getOrderDetail × 200/401/404/500/503; evidence/notes opcionales
```

**Structure Decision**: web service hexagonal (solo `backend/`), reutilizando el layout de 004/005/006/007. Todo
lo nuevo de #010 vive bajo `domain/order/read-side/`, un `handler` y dos adaptadores `infra/`. El `pii-redactor` de
007 se reutiliza sin cambios. La Front (FE-1/FE-2/FE-4) consume el contrato congelado, fuera de esta rama.

## Complexity Tracking

> Sin violaciones de la Constitution que justificar. #010 es read-side puro, reutiliza puertos/entidades
> existentes, no añade proyectos, tablas ni migraciones. La única decisión no trivial (leer `OrderAudit.reason`)
> está cubierta por la excepción acotada de Constitution XI v1.9.0 (ya mergeada a `develop`).
