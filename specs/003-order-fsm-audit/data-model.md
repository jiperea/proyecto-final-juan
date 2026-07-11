# Data Model — 002b Order FSM + auditoría append-only

> Entidad `OrderAudit` + FSM + contrato de `applyTransition`. Reutiliza `Order`/`version` de 002a y `User` de
> 001. **Unificado con spec ↔ research** (orden de clasificación, GUARD_UNMET/ACTOR_INVALID, trigger, FR-009).

## FSM — tabla de transiciones legales (dominio)

`domain/order/transition-table.ts` — conjunto de pares legales:

| from | to |
|---|---|
| assigned | in_progress |
| in_progress | pending_review |
| pending_review | closed |
| pending_review | in_progress (rechazo) |

`isLegalTransition(from, to): boolean`. Todo lo demás (mismo estado, desde `closed`, `draft→*`) es ilegal.
`draft` es estado semilla sin transición saliente en el alcance (creación fuera del proyecto — G1:H-001).

## `OrderAudit` (append-only, inmutable)

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | UUID v7 (PK) | |
| `order_id` | UUID (FK→Order) | `onDelete: Restrict` (una orden con auditoría **no** se borra físicamente — decisión permanente, G2:H-008). |
| `actor_id` | UUID (FK→User) | Requerido; = usuario autenticado derivado server-side (contrato duro, G1:S-002). FK inexistente → `ACTOR_INVALID` + rollback de la transición (atomicidad). |
| `from_status`/`to_status` | OrderStatus | Estados de la transición registrada. |
| `reason` | text? | **Pre-saneado por el llamador** (sin PII cruda); nunca en logs/errores (SC-006). Opcional. |
| `at` | timestamptz | `default now()`. |

- **Prisma**: modelo `OrderAudit` (`@@map("order_audit")`, índice `@@index([orderId])`). **Migración**:
  `CREATE TABLE` + **TRIGGER `BEFORE UPDATE OR DELETE ON order_audit` que lanza excepción** (append-only real,
  **independiente del propietario** — un REVOKE no basta con rol único propietario, G2:S-002). La migración
  `down` hace `DROP TRIGGER`/`DROP FUNCTION` antes del `DROP TABLE` (reversible). El test de append-only usa el
  **rol de runtime** de la app (no un superusuario).
- **Order** (002a): sin cambios de esquema; sólo se usa `version` (concurrencia optimista) y `assignedTo`
  (columna `assigned_to`, FK→User nullable de 002a) como campo de guarda de pertenencia (G2:H-007).

## Contrato de dominio — `applyTransition`

Puerto `OrderTransitionPort.applyTransition(input): Promise<Result<OrderRecord>>` con:
`{ orderId, toStatus, actorId, reason?, expectedVersion, guard? }` donde `guard` es un objeto **tipado seguro**
(`{ assignedTo?: string }`) que 002b traduce a un `where` **parametrizado** de Prisma (nunca SQL crudo del
llamador) e inyecta en el WHERE atómico (003/004/005, cierra TOCTOU; G2:H-007).

- Éxito → `Result.ok(order actualizada)` + fila de auditoría (misma `$transaction`; `status`→destino,
  `version`+1, insert OrderAudit).
- 0 filas → `Result.err` clasificado por re-lectura best-effort **en este orden determinista**:
  1. no existe → `ORDER_NOT_FOUND` (404)
  2. `version` ≠ → `VERSION_CONFLICT` (409)
  3. `status` ≠ origen legal → `INVALID_TRANSITION` (422)
  4. existe + version + status OK pero guarda falla → **`GUARD_UNMET`** (sin HTTP fijo; el llamador mapea vía FR-009)
- Fallo de FK `actor_id` → excepción dentro de `$transaction` → rollback → `Result.err(ACTOR_INVALID)` (sin
  efecto; sin filtrar el error crudo de BD).

### Catálogo de errores (extiende el de 001)

| Código | HTTP (referencia) | Notas |
|---|---|---|
| `ORDER_NOT_FOUND` | 404 | Orden inexistente. |
| `VERSION_CONFLICT` | 409 | `expectedVersion` obsoleta (concurrencia optimista). |
| `INVALID_TRANSITION` | 422 | Par origen→destino no legal. |
| `GUARD_UNMET` | *(gobernado por FR-009)* | Guarda de pertenencia no satisfecha; el llamador mapea 404 (no autorizado) o 403 (autorizado). |
| `ACTOR_INVALID` | *(error interno)* | FK de `actor_id` inválida; no filtra BD. |

**FR-009 (contrato para consumidoras, no implementado en 002b)**: los códigos son diagnóstico interno; tras el
401 de auth, actor **no autorizado** sobre la orden → **404 con body uniforme**; actor **autorizado** →
409/422 y `GUARD_UNMET`→**403**.

## Mapa entidad → FR

| Elemento | FRs |
|---|---|
| transition-table (FSM) | FR-001/002 |
| applyTransition (atómico + guarda + clasificación) | FR-003/004/006/007 |
| OrderAudit append-only (trigger) | FR-005 (SC-003) |
| reason saneado / no en logs-errores | FR-008 (SC-006) |
| errores de dominio (incl. GUARD_UNMET/ACTOR_INVALID) | FR-002/003/004 |
| contrato de no-enumeración (consumidoras) | FR-009 |
