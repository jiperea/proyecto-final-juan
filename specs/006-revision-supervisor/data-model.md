# Data Model — 006 Revisión por el supervisor

**Sin cambios de esquema**: 0 tablas nuevas, 0 columnas nuevas, **0 migraciones**. 006 reutiliza tal cual las
entidades de 002b/005 y sólo **muta** `orders` e **inserta** en `order_audit` (append-only). Comprueba la existencia de evidencia
en `order_evidence` (filtro de relación dentro del UPDATE condicional, no un `COUNT` previo) para el guard
defensivo de aprobación. No toca `order_execution_notes` ni `order_evidence` (conservación, FR-005).

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

### OrderEvidence (`order_evidence`) — sólo lectura (existencia)
- **Guard FR-013 (approve)**: la existencia de ≥1 evidencia se comprueba como **filtro de relación dentro del
  UPDATE condicional** (`evidence:{ some:{} }`), no como `SELECT COUNT` previo; el `409 EVIDENCE_MISSING` lo
  emite el clasificador **sólo** cuando el snapshot re-leído confirma `status=pending_review` con 0 evidencias
  (así el 404 de no-visible precede al 409). No se lee `object_ref` (PII) — sólo existencia/conteo.
- `attempt` (nullable): **no** lo usa 006 (versionado por intento = 005/#008).

### OrderExecutionNotes (`order_execution_notes`) — intacta
- No se lee ni se escribe en 006 (la lectura de notas es read-side #010). Conservación FR-005.

## Transacción atómica (una `$transaction` interactiva)

**approve** (`decision=approve`) — la condición de evidencia va **dentro** del UPDATE condicional (no como paso
previo), para que la **visibilidad (404) preceda al guard (409)** vía re-lectura única (FR-009):
1. `updateMany({ where:{ id, status:'pending_review', evidence:{ some:{} } }, data:{ status:'closed',
   version:{increment:1} } })` — el filtro de relación `evidence:{some:{}}` exige ≥1 evidencia en el mismo UPDATE.
2. **0 filas** ⇒ re-lectura del snapshot `{status, evidenceCount}` (dentro de la misma tx) y `classifyReviewGuard`:
   - `status ≠ pending_review` o inexistente → **`404` GUARD_UNMET** (no visible).
   - `status = pending_review` **y** `evidenceCount = 0` → **`409` EVIDENCE_MISSING**.
   - **por-defecto** (cualquier otro snapshot, p. ej. `{pending_review, evidenceCount≥1}` por carrera) → **`404`
     GUARD_UNMET fail-safe** (nunca 500, nunca filtra estado).
   - (404 **antes** que 409: la clasificación mira el estado antes que la evidencia.)
3. **1 fila** ⇒ `INSERT order_audit {transition, from=pending_review, to=closed, actor=<token>,
   reason=sanitize(reason)|NULL}`.

**reject** (`decision=reject`, `reason` obligatorio y válido) — sin guard de evidencia:
1. `updateMany({ where:{ id, status:'pending_review' }, data:{ status:'in_progress', version:{increment:1} } })`
   → 0 filas ⇒ `classifyReviewGuard` (sólo visibilidad) → `404`.
2. `INSERT order_audit {transition, from=pending_review, to=in_progress, actor=<token>, reason=sanitize(reason)}`.

Todo o nada (una `$transaction`, aislamiento por defecto **READ COMMITTED**). Fallo de BD no disponible → `503`;
error no transitorio (constraint/FK actor) → `500` (FR-010). Nunca una orden **no visible** devuelve 409 antes
que 404 (el `evidence:{some:{}}` no distingue por sí solo visibilidad de evidencia; la distinción la hace el
clasificador sobre el estado).

> **(G2/H-002) Atomicidad del guard**: el `updateMany` con `evidence:{some:{}}` **debe** compilar a **una** sola
> sentencia `UPDATE … WHERE … AND EXISTS(SELECT 1 FROM order_evidence …)` (sin `SELECT`/`COUNT` previo → sin
> TOCTOU). Verificar el SQL generado en el test (query log de Prisma); **fallback** `$executeRaw` si no compilara
> atómico. Ver research.md D8.

## Validación (dominio puro, `review-order.ts` + `sanitize-reason.ts`)

| Campo | Regla | Fallo |
|---|---|---|
| `decision` | presente ∧ ∈ `{approve, reject}` | ausente/otro/body no-JSON → `422 VALIDATION_ERROR` |
| `reason` (schema/Zod) | string; **cota cruda ≤ 4000** code points (red de seguridad de payload) | > 4000 crudo → `422 VALIDATION_ERROR` |
| `reason` (reject, dominio) | obligatorio; `1..1000` code points **tras `sanitizeReason`**; ≥1 imprimible | ausente/vacío-tras-saneo/>1000-tras-saneo → `422 INVALID_REASON` |
| `reason` (approve, dominio) | opcional; si presente, mismas reglas de dominio que reject | idem → `422 INVALID_REASON` |
| `sanitizeReason(s)` | trim → colapso whitespace interno → strip Cc (`U+0000`–`U+001F`,`U+007F` salvo `\n`) → NFC | — |

> **G2/K2**: el límite 1..1000 se mide **tras saneo** en el dominio (`INVALID_REASON`), **no** en el schema Zod
> (que sólo pone la cota cruda 4000 → `VALIDATION_ERROR`). Un motivo con mucho whitespace puede exceder 1000 en
> crudo y ser válido tras saneo.

**Precedencia**: `401 → 403 → 422 VALIDATION_ERROR → 422 INVALID_REASON → 404 (no visible) → 409 (evidencia)`.

## Máquina de estados (FSM 002b/003, reutilizada)

- `pending_review → closed` (approve; transición introducida en el alcance de 006, ya declarada legal en la tabla).
- `pending_review → in_progress` (reject; ya legal en 002b).
- Cualquier origen ≠ `pending_review` → no visible para el supervisor → `404` (no `INVALID_TRANSITION`).
