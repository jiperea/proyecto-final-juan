# Data Model — 004-orden-reasignacion (MAGRO)

Sólo cambios respecto a 002a/002b (inamovibles). No hay entidades nuevas: se muta `Order.assigned_to`/`version`
y se **extiende** `OrderAudit` de forma **aditiva**. Fuente: `backend/prisma/schema.prisma`.

## Order (existente — sin cambio de esquema)

| Campo | Cambio en reasignación |
|-------|------------------------|
| `assignedTo` (`assigned_to`, `@db.Uuid`, nullable, FK→User `onDelete:SetNull`) | ← técnico destino |
| `version` (`Int @default(0)`) | +1 |
| `status` (`OrderStatus`) | **se conserva** |

Guarda de escritura: `SELECT … FOR UPDATE` (captura previo) → UPDATE condicional `WHERE id ∧ version… no,
sólo id ∧ status IN ('assigned','in_progress') ∧ assigned_to <> :destino` → `SET assigned_to=:destino,
version=version+1`. (Sin guarda de `version`/409 en el MVP; ver research D-11.)

## OrderAudit (extendida — aditiva)

Esquema actual (002b): `{id, order_id, actor_id, from_status, to_status, reason?, at}`, FKs `onDelete:Restrict`,
**trigger append-only** `BEFORE UPDATE OR DELETE` (se conserva).

**Cambios (migración aditiva)**:

| Campo | Tipo | Regla |
|-------|------|-------|
| `from_assignee` | `@db.Uuid` **nullable**, FK→User `onDelete:Restrict` | asignatario origen (NULL si orden huérfana o evento `transition`) |
| `to_assignee` | `@db.Uuid` **nullable**, FK→User `onDelete:Restrict` | asignatario destino (NULL en `transition`) |
| `event_type` | enum `OrderAuditEventType` (`transition`\|`reassignment`), **`@default(transition)`** | discrimina el evento |
| `from_status` / `to_status` | (existentes) → **relajados a NULLABLE** | **NULL** en eventos `reassignment` (no cambia estado) |

**Invariantes por `event_type`**:
- `transition` (escrito por `applyTransition`, 002b, sin cambios): `from_status`/`to_status` NOT NULL (cambio de
  estado); `from_assignee`/`to_assignee` NULL. Valor por defecto → filas legacy quedan aquí por backfill.
- `reassignment` (escrito por `reassignOrder`): `from_status`/`to_status` **NULL**; `to_assignee` NOT NULL;
  `from_assignee` nullable (NULL si orden huérfana); `reason` NOT NULL (1..500 code points, ≥1 imprimible,
  sin control chars). **Exactamente 1** fila por reasignación exitosa, en la misma transacción (FR-007).

## Enum nuevo

```prisma
enum OrderAuditEventType { transition  reassignment }
```

## Migración

`backend/prisma/migrations/<ts>_extend_order_audit_reassignment/migration.sql` — flujo
`prisma migrate dev --create-only` + edición manual (SQL artesanal, no regenerar a ciegas):

1. `CREATE TYPE "OrderAuditEventType" AS ENUM ('transition','reassignment');`
2. `ALTER TABLE "order_audit" ADD COLUMN "event_type" "OrderAuditEventType" NOT NULL DEFAULT 'transition';`
   → **backfill** implícito de filas legacy de 002b a `'transition'`.
3. `ALTER TABLE "order_audit" ADD COLUMN "from_assignee" UUID;` + FK→`user(id)` con `ADD CONSTRAINT … NOT VALID`
   luego `VALIDATE CONSTRAINT` (evita lock largo).
4. `ALTER TABLE "order_audit" ADD COLUMN "to_assignee" UUID;` + FK igual.
5. `ALTER TABLE "order_audit" ALTER COLUMN "from_status" DROP NOT NULL; ALTER COLUMN "to_status" DROP NOT NULL;`
6. **Conservar** el trigger append-only (no recrear). Sin `@@index(event_type)`.

`down.sql`: revertir (Prisma no lo ejecuta solo; documentado en quickstart).

**Verificación** (test): tras migrar, las filas legacy tienen `event_type='transition'`, `from_assignee`/
`to_assignee` NULL; el trigger sigue rechazando UPDATE/DELETE.

## Relaciones

```text
User 1───* OrderAudit.actor      (actor_id,      onDelete:Restrict)  [002b]
User 1───* OrderAudit.from_user  (from_assignee, onDelete:Restrict)  [nuevo]
User 1───* OrderAudit.to_user    (to_assignee,   onDelete:Restrict)  [nuevo]
Order 1──* OrderAudit.order      (order_id,      onDelete:Restrict)  [002b]
User 0/1─* Order.assignee        (assigned_to,   onDelete:SetNull)   [002a]
```
