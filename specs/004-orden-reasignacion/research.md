# Research — 004-orden-reasignacion (MAGRO)

Decisiones de diseño alineadas a la spec magra (G1 PASS). Sin `NEEDS CLARIFICATION`.

## D-01 · Método/ruta

- **Decisión**: `POST /v1/orders/{orderId}/reassignments`, `operationId reassignOrder`, rol `dispatcher`,
  respuestas 200/401/403/404/422/500. Responde **200 con la orden** (el recurso es la orden; `reassignments`
  es el verbo/evento). **Sin** 409/`If-Match` (stretch, fuera de MVP).
- **Rationale**: sub-recurso de evento coherente con la auditoría append-only; el `operationId` ya se usa en la
  trazabilidad.

## D-02 · Módulo write-side (reconcilia FR-006 de 002b)

- **Decisión**: crear `domain/order/write-side/` y **mover** `apply-transition.ts` (002b) dentro, junto a
  `reassign-order.ts` y `write-side-ports.ts`. `status`/`version`/**`assigned_to`** sólo se mutan desde este
  módulo (+ su repo infra); **test de arquitectura** (dependency-cruiser o grep) lo verifica. `applyTransition`
  **no cambia de comportamiento** (sólo de ruta de import) — XV.
- **Rationale**: materializa el "único punto de escritura" e incluye `assigned_to` (el campo que muta 004).

## D-03 · Primitiva atómica compartida (sólo boilerplate)

- **Decisión**: en infra, `order-transition-repository.ts` → `order-write-side-repository.ts` con un helper
  **privado** `conditionalWriteWithAudit` que comparte **sólo** el boilerplate (SELECT FOR UPDATE + UPDATE
  condicional + insert auditoría en `$transaction`). **La clasificación de 0-filas NO se comparte**:
  `applyTransition` conserva su `classifyZeroRows` de 002b (intacto); `reassignOrder` tiene la suya (D-05). El
  dominio inyecta un puerto de negocio `OrderReassignmentPort.reassign(cmd)` → resultado crudo; **no** conoce
  `conditionalWriteWithAudit`.

## D-04 · Consulta de visibilidad como puerto inyectado

- **Decisión**: `OrderVisibilityPort.findReassignable(orderId)` → `{id, status, assignedTo, version} | null`
  (una consulta `WHERE id AND status IN ('assigned','in_progress')`), implementada en infra; el handler **no**
  usa Prisma directo. Testeable con fakes en unit.

## D-05 · Mutación atómica + auditoría (FR-007) — cómo

- **Decisión**: dentro de `$transaction` en infra: **(1)** `SELECT … FOR UPDATE` de la orden → captura
  `assigned_to` **previo** (= `from_assignee`) y `status`; **(2)** UPDATE condicional `WHERE id ∧ status ∈
  {assigned,in_progress} ∧ assigned_to <> :destino` → `SET assigned_to=:destino, version = version+1`; **(3)**
  si `count=1`, insert de auditoría `reassignment` (`event_type='reassignment'`, `from_status`/`to_status`
  **NULL**, `from_assignee`=previo, `to_assignee`=destino, `actor_id`, `reason`); **(4)** si `count=0`,
  reclasificar sobre el row bloqueado: no existe / status no reasignable → **404**; ya asignado al destino →
  **422** `INVALID_ASSIGNEE`. `from_assignee` sale del **SELECT FOR UPDATE** (valor previo), **no** de
  `RETURNING` (que daría el post-UPDATE). La fila del 200 se relee post-UPDATE.
- **Rationale**: `SELECT FOR UPDATE` bloquea la fila → `from_assignee` veraz y guarda anti-carrera con la FSM
  y contra el no-op de mismo destino, sin necesidad de `version`-guard/409 (last-write-wins entre destinos
  distintos es aceptado en MVP).

## D-06 · Orden de validación en el handler (FR-004)

- **Decisión**: (1) `authenticate` → 401; (2) `requireRole('dispatcher')` → 403; (3) resolución de visibilidad
  → 404: **dentro** de este paso (tras auth) se valida el formato uuid del `orderId` (malformado → mismo 404),
  luego la consulta; (4) sólo con orden visible: forma del body (Zod, `VALIDATION_ERROR`) y luego destino
  (`INVALID_ASSIGNEE`). El body **no** se valida como middleware previo. Así 401 precede a todo y el 422 no es
  alcanzable para orden no visible.

## D-07 · Validez del técnico destino (FR-005)

- **Decisión**: en el DOMINIO (`reassign-order.ts` vía `UserLookupPort.findAssignableTechnician`): existe ∧
  `role='technician'` ∧ `disabledAt IS NULL` ∧ distinto del asignatario actual (del snapshot de visibilidad,
  lectura única pasada por el handler). Fallo → 422 `INVALID_ASSIGNEE`, cuerpo genérico idéntico (4 causas).
  TOCTOU (destino invalidado —deshabilitado o borrado— entre validación y commit): residual **BL-063**; la FK
  de `assigned_to` lo rechaza en el UPDATE.

## D-08 · Contrato de errores con agent_action

- **Decisión**: extender `DomainError` (`domain/result.ts`) con `agentAction?` opcional; `sendError`
  (`error-mapper.ts`) lo emite en respuestas de **negocio** (404/409/422/500 del handler), no en 401/403 del
  middleware reutilizado de 001 (retrocompatible; re-verificar 001/002 verdes). Catálogo: +`INVALID_ASSIGNEE`
  →422, +`FORBIDDEN_ROLE`→403 (reusa `VALIDATION_ERROR`→422, `ORDER_NOT_FOUND`→404). El error-mapper **no**
  inspecciona Prisma (genérico).

## D-09 · No-fuga de `reason` y errores de BD (FR-009)

- **Decisión**: ampliar `REDACT_PATHS` (`infra/logger.ts`) para el `reason` anidado (`req.body.reason`,
  `error.cause`). Catch-all: **todo** error de BD → **500** genérico `{code,message,agent_action}` sin
  SQLSTATE/constraint/columna/query. **Sin 503** ni mapeo fino de `P2003` (fuera de MVP).

## D-10 · Migración de OrderAudit (aditiva)

- **Decisión**: `prisma migrate dev --create-only` + edición manual del SQL: `CREATE TYPE
  OrderAuditEventType` (transition|reassignment); `ADD COLUMN event_type ... NOT NULL DEFAULT 'transition'`
  (backfill implícito de filas legacy); `ADD COLUMN from_assignee/to_assignee UUID` con FK→User
  `NOT VALID` + `VALIDATE CONSTRAINT`; **`ALTER COLUMN from_status/to_status DROP NOT NULL`** (relajar a
  nullable). Conservar el trigger append-only. Sin `@@index(event_type)`.
- **Rationale**: aditiva y compatible con 002b (sus filas y `applyTransition` no cambian; `applyTransition`
  sigue escribiendo `event_type='transition'` por el default).

## D-11 · Concurrencia (MVP: last-write-wins, sin 409)

- **Decisión**: la guarda atómica (status ∧ `assigned_to<>destino`) protege contra transición-cruzada y
  no-op; entre **destinos distintos** concurrentes, **last-write-wins** (ambas legítimas, ambas auditadas con
  `from_assignee` veraz). `If-Match`→409 explícito = **stretch** (BL-001), no MVP.
