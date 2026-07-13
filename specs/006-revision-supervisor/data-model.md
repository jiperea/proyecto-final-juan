# Data Model — 006 Revisión por el supervisor

**Sin cambios de esquema**: 0 tablas nuevas, 0 columnas nuevas, **0 migraciones**. 006 reutiliza tal cual las
entidades de 002b/005 y sólo **muta** `orders` e **inserta** en `order_audit` (append-only). Lee `order_evidence`
(COUNT) para el guard defensivo. No toca `order_execution_notes` ni `order_evidence` (conservación, FR-005).

## Entidades implicadas (existentes)

### Order (`orders`) — se muta
- Campos relevantes: `id (uuid)`, `status (OrderStatus)`, `version (int)`, `updatedAt`.
- **Mutación 006**: `status` `pending_review → closed` (approve) | `pending_review → in_progress` (reject);
  `version = version + 1`. No se tocan otros campos (`assignedTo` se conserva).
- **Invariante de escritura**: sólo desde `domain/order/write-side/` + `order-write-side-repository.ts` (arch test).

### OrderAudit (`order_audit`, append-only) — se inserta 1 fila por decisión
- Campos usados: `id (uuid v7)`, `orderId`, `actorId` (= supervisor, **del token**, FR-012),
  `eventType = transition`, `fromStatus = pending_review`, `toStatus = closed|in_progress`,
  `reason` (motivo pre-saneado o `NULL`), `at`.
- `reason`: pre-saneado por `sanitizeReason` (FR-008); `NULL` en approve sin motivo; texto en reject (obligatorio)
  y en approve con motivo. **Nunca** en logs ni cuerpos de error. Cifrado at-rest = BL-051 (diferido).
- Append-only garantizado por el trigger existente (002b). Enlaces `fromAssignee/toAssignee` = `NULL` (transición).

### OrderEvidence (`order_evidence`) — sólo lectura (COUNT)
- **Guard FR-013 (approve)**: `SELECT COUNT(*) FROM order_evidence WHERE order_id = :id` dentro de la
  transacción; `< 1` → `409 EVIDENCE_MISSING`. No se lee `object_ref` (PII) — sólo el conteo.
- `attempt` (nullable): **no** lo usa 006 (versionado por intento = 005/#008).

### OrderExecutionNotes (`order_execution_notes`) — intacta
- No se lee ni se escribe en 006 (la lectura de notas es read-side #010). Conservación FR-005.

## Transacción atómica (una `$transaction` interactiva)

**approve** (`decision=approve`):
1. Guard: `COUNT(order_evidence WHERE order_id) ≥ 1` → si 0, abortar → `409 EVIDENCE_MISSING`.
2. `UPDATE orders SET status='closed', version=version+1, updated_at=now() WHERE id=:id AND status='pending_review'`
   → 0 filas ⇒ clasificar (re-lectura): no visible → `404`.
3. `INSERT order_audit {transition, from=pending_review, to=closed, actor=<token>, reason=sanitize(reason)|NULL}`.

**reject** (`decision=reject`, `reason` obligatorio y válido):
1. `UPDATE orders SET status='in_progress', version=version+1, updated_at=now() WHERE id=:id AND status='pending_review'`
   → 0 filas ⇒ `404`.
2. `INSERT order_audit {transition, from=pending_review, to=in_progress, actor=<token>, reason=sanitize(reason)}`.

Todo o nada. Fallo de BD no disponible → `503`; error no transitorio (constraint/FK actor) → `500` (FR-010).

## Validación (dominio puro, `review-order.ts` + `sanitize-reason.ts`)

| Campo | Regla | Fallo |
|---|---|---|
| `decision` | presente ∧ ∈ `{approve, reject}` | ausente/otro/body no-JSON → `422 VALIDATION_ERROR` |
| `reason` (reject) | obligatorio; `1..1000` code points **tras saneo**; ≥1 imprimible | ausente/vacío-tras-saneo/rango → `422 INVALID_REASON` |
| `reason` (approve) | opcional; si presente, mismas reglas que reject | idem → `422 INVALID_REASON` |
| `sanitizeReason(s)` | trim → colapso whitespace interno → strip Cc (`U+0000`–`U+001F`,`U+007F` salvo `\n`) → NFC | — |

**Precedencia**: `401 → 403 → 422 VALIDATION_ERROR → 422 INVALID_REASON → 404 (no visible) → 409 (evidencia)`.

## Máquina de estados (FSM 002b/003, reutilizada)

- `pending_review → closed` (approve; transición introducida en el alcance de 006, ya declarada legal en la tabla).
- `pending_review → in_progress` (reject; ya legal en 002b).
- Cualquier origen ≠ `pending_review` → no visible para el supervisor → `404` (no `INVALID_TRANSITION`).
