# Data Model — 002b Order FSM + auditoría append-only

> Entidad `OrderAudit` + FSM + contrato de `applyTransition`. Reutiliza `Order`/`version` de 002a y `User` de 001.

## FSM — tabla de transiciones legales (dominio)

`domain/order/transition-table.ts` — conjunto de pares legales:

| from | to |
|---|---|
| assigned | in_progress |
| in_progress | pending_review |
| pending_review | closed |
| pending_review | in_progress (rechazo) |

`isLegalTransition(from, to): boolean`. Todo lo demás (mismo estado, desde `closed`, `draft→*`) es ilegal.

## `OrderAudit` (append-only, inmutable)

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | UUID v7 (PK) | |
| `order_id` | UUID (FK→Order) | onDelete: Restrict (no borrar órdenes con auditoría). |
| `actor_id` | UUID (FK→User) | Requerido; FK inexistente → rollback de la transición (atomicidad). |
| `from_status`/`to_status` | OrderStatus | Estados de la transición registrada. |
| `reason` | text? | **Pre-saneado por el llamador** (sin PII cruda); nunca en logs/errores. Opcional. |
| `at` | timestamptz | `default now()`. |

- **Prisma**: modelo `OrderAudit` (`@@map("order_audit")`, índice `@@index([orderId])`). **Migración**:
  `CREATE TABLE` + `REVOKE UPDATE, DELETE ON order_audit FROM <rol_app>` (append-only real a nivel de BD).
- **Order** (002a): sin cambios de esquema; sólo se usa `version` para la concurrencia optimista.

## Contrato de dominio — `applyTransition`

Puerto `OrderTransitionPort.applyTransition(input): Promise<Result<OrderRecord>>` con:
`{ orderId, toStatus, actorId, reason?, expectedVersion, guard? }` donde `guard` = predicados de pertenencia
opcionales (p. ej. `{ assignedTo }`) que el llamador inyecta al WHERE atómico (003/004/005, cierra TOCTOU).

- Éxito → `Result.ok(order actualizada)` + fila de auditoría (misma transacción).
- 0 filas → `Result.err`: `ORDER_NOT_FOUND`(404) / `VERSION_CONFLICT`(409) / `INVALID_TRANSITION`(422),
  clasificado por re-lectura best-effort; guarda no satisfecha → el llamador la mapea (403/404).
- Fallo de FK `actor_id` → excepción → rollback → `Result.err` (sin efecto).

## Mapa entidad → FR

| Elemento | FRs |
|---|---|
| transition-table (FSM) | FR-001/002 |
| applyTransition (atómico + guardas) | FR-003/004/006/007 |
| OrderAudit append-only | FR-005 (SC-003) |
| reason saneado / no en logs-errores | FR-008 |
| errores dominio | FR-002/003 (422/409/404) |
