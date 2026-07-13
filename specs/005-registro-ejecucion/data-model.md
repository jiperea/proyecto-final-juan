# Data Model: Registro de ejecución por el técnico (005)

**Fase 1.** Cambios **aditivos** sobre el esquema de 002/004 (inamovibles). Dos tablas nuevas; `orders` y
`order_audit` **no se tocan**. Una migración Prisma aditiva.

## Entidades existentes (reutilizadas, sin cambio de esquema)

- **Order** (002a): se muta `status` (`assigned→in_progress`, `in_progress→pending_review`) y `version` (+1),
  **sólo** desde `domain/order/write-side/` (arch test). Sin columnas nuevas.
- **OrderAudit** (002b/004): 1 fila `event_type=transition` por transición. En la ejecución, `reason` = marcador
  opaco constante `"execution_registered"` (**nunca** el texto de las notas — Constitution XI). `reason` ya es
  `text?` nullable → sin migración. En `startOrderWork`, `reason` = NULL.
- **User** (001): el actor debe ser **technician** y **dueño** (`assigned_to == actor`).

## Entidad nueva · `OrderEvidence` (append-only inmutable)

Referencia/metadato de evidencia; el binario NO se almacena aquí (feature #007).

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid (PK) | uuidv7. |
| `order_id` | uuid (FK→orders, RESTRICT) | Orden a la que pertenece. |
| `object_ref` | text | String opaco, **1..512** code points, sin control ni whitespace de borde. Validado por formato, **sin** chequeo de existencia. Único (exacto) dentro de una request. |
| `content_type` | text | Allowlist `image/jpeg\|png\|webp\|heic`. |
| `size_bytes` | int | `> 0` y `≤ 26214400` (25 MiB). Metadato declarado. |
| `uploaded_by` | uuid (FK→users, RESTRICT) | Derivado del token server-side (FR-007), nunca del cuerpo. |
| `attempt` | int **NULL** | Base-ready (#005); siempre NULL en el MVP (D6). |
| `at` | timestamptz(3) | `default now()`. |

- **Trigger append-only** a nivel de BD (como `order_audit`): sin UPDATE/DELETE.
- **Índice**: `(order_id)`.

## Entidad nueva · `OrderExecutionNotes` (payload PII, mutable/purgable)

Notas de ejecución del técnico, **separadas** de la auditoría (Constitution IX/XI).

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid (PK) | uuidv7. |
| `order_id` | uuid (FK→orders, RESTRICT) | Orden. |
| `audit_id` | uuid (FK→order_audit, RESTRICT) | **Enlace unidireccional** a la auditoría de la transición (insertada **antes**). Rompe el ciclo de FKs (G1). |
| `notes` | text | **Payload PII** (IX). 1..2000 code points, no vacío/whitespace/control. Cifrado en reposo/purga = ítem de backlog propio (D4), fuera del MVP. |
| `attempt` | int **NULL** | Base-ready (#005), paralelo a `OrderEvidence.attempt` (mismo valor por registro). |
| `created_by` | uuid (FK→users, RESTRICT) | Actor server-side (FR-007). |
| `at` | timestamptz(3) | `default now()`. |

- **NO** append-only (a diferencia de `order_audit`/`order_evidence`): debe admitir purga/anonimización (IX).
- **Lectura**: restringida por RBAC (supervisor en función de auditoría; nunca technician de otra orden). No hay
  endpoint de lectura en este MVP (constancia para #005/#007).
- **Índices**: `(order_id)`, `(audit_id)`.

## Reglas de validación (dominio puro, antes de tocar BD)

1. **Evidencia**: `1 ≤ len(evidence) ≤ 10`; cada ítem con `content_type ∈ allowlist`, `0 < size_bytes ≤ 25 MiB`,
   `object_ref` en formato; **sin `object_ref` duplicados** (igualdad exacta). Fallo → `EVIDENCE_REQUIRED`
   (0 ítems) o `INVALID_EVIDENCE` (resto). Se valida **antes** que las notas.
2. **Notas**: presentes, no vacías/whitespace/control, `≤ 2000` code points. Fallo → `VALIDATION_ERROR`.
3. **RBAC/estado** (guard compartido, precedencia única): `401 → 403 → 404 (pertenencia) → 422 (estado
   `INVALID_TRANSITION`) → 422 (payload)`. Pertenencia **antes** que estado.

## Transacción atómica (FR-006) — `submitOrderExecution`

`UPDATE` condicional (`in_progress→pending_review`, `version`+guard) → `OrderAudit` (reason opaco) →
`OrderEvidence` (≥1) → `OrderExecutionNotes` (audit_id). Todo o nada. `startOrderWork` = `applyTransition`
(`assigned→in_progress`) reutilizado.

## Migración Prisma (aditiva)

`<ts>_add_order_evidence_and_execution_notes`: crea `order_evidence` (+trigger append-only + índice) y
`order_execution_notes` (+índices). Sin ALTER sobre `orders`/`order_audit`. FKs con `onDelete: Restrict`.
