# Data Model — 004-orden-reasignacion

Sólo cambios respecto a 002a/002b. La feature **no crea entidades nuevas**: muta `Order.assigned_to`/`version`
y **extiende** `OrderAudit`. Fuente: `backend/prisma/schema.prisma`.

## Order (existente — sin cambios de esquema)

Se **muta** en la reasignación (no se altera el modelo):

| Campo | Tipo | Cambio en reasignación |
|-------|------|------------------------|
| `assignedTo` (`assigned_to`, `@db.Uuid`, **nullable**, FK→User `onDelete:SetNull`) | UUID? | ← técnico destino T2 |
| `version` (`Int @default(0)`) | Int | +1 (concurrencia optimista) |
| `status` (`OrderStatus`) | enum | **se conserva** (no es transición FSM) |

- Estados reasignables (visibilidad del dispatcher): `assigned`, `in_progress`.
- `assigned_to` **nullable** es un caso real (orden huérfana por `onDelete:SetNull` al borrar el técnico): el
  `from_assignee` de la auditoría sería NULL y la reasignación a T2 es válida (Edge Case de la spec).
- Guarda de escritura: UPDATE condicional `WHERE id=:id AND version=:expectedVersion AND status IN
  ('assigned','in_progress')` → `SET assigned_to=:t2, version=version+1`.

## OrderAudit (extendida)

Esquema actual (002b): `{ id, order_id, actor_id, from_status, to_status, reason?, at }`, FKs
`onDelete:Restrict`, **trigger append-only** `BEFORE UPDATE OR DELETE` (se conserva).

**Columnas añadidas** (migración aditiva):

| Campo | Tipo | Reglas |
|-------|------|--------|
| `from_assignee` | `@db.Uuid` **nullable**, FK→User `onDelete:Restrict` | asignatario origen (NULL si orden huérfana o evento `transition`) |
| `to_assignee` | `@db.Uuid` **nullable**, FK→User `onDelete:Restrict` | asignatario destino (NULL en eventos `transition`) |
| `event_type` | enum `OrderAuditEventType` (`transition`\|`reassignment`), **`@default(transition)`** | discrimina el tipo de evento |

**Invariantes por `event_type`**:

- `transition` (escrito por `applyTransition`): `from_status ≠ to_status` (cambio de estado);
  `from_assignee`/`to_assignee` **NULL**. Es el valor por defecto → filas legacy de 002b quedan aquí por
  backfill.
- `reassignment` (escrito por `reassignOrder`): `from_status == to_status` (estado conservado);
  `to_assignee` **NOT NULL** (destino válido T2); `from_assignee` nullable (NULL si orden huérfana); `reason`
  **NOT NULL** (1..500 code points, ≥1 carácter imprimible — obligatorio en reasignación, FR-006).

**Regla de escritura**: exactamente **1** fila de auditoría por reasignación exitosa, en la **misma
transacción** que el UPDATE de `Order` (atomicidad todo-o-nada, FR-007). Ningún rechazo (401/403/404/409/422/
500) crea auditoría.

## Enum nuevo

```prisma
enum OrderAuditEventType {
  transition
  reassignment
}
```

## Migración

Directorio: `backend/prisma/migrations/<timestamp>_extend_order_audit_reassignment/migration.sql`

Operaciones (aditivas, seguras con el trigger existente — `ALTER`/`CREATE TYPE` no son UPDATE/DELETE de fila):

1. `CREATE TYPE "OrderAuditEventType" AS ENUM ('transition','reassignment');`
2. `ALTER TABLE "order_audit" ADD COLUMN "event_type" "OrderAuditEventType" NOT NULL DEFAULT 'transition';`
   → **backfill** implícito: todas las filas de 002b existentes quedan `'transition'`.
3. `ALTER TABLE "order_audit" ADD COLUMN "from_assignee" UUID;` (+ FK a `user(id)` `ON DELETE RESTRICT`).
4. `ALTER TABLE "order_audit" ADD COLUMN "to_assignee" UUID;` (+ FK a `user(id)` `ON DELETE RESTRICT`).
5. Índice opcional `@@index([event_type])` si las consultas de auditoría filtran por tipo (evaluar en tasks).

`down.sql`: `DROP COLUMN` × 3 + `DROP TYPE` (Prisma no lo ejecuta solo; documentado en quickstart como en 002b).

**Verificación de migración** (trazabilidad "Migración (OrderAudit)"): tras aplicar, un test asserta que las
filas de auditoría preexistentes (transiciones de 002b) tienen `event_type='transition'`,
`from_assignee IS NULL`, `to_assignee IS NULL`; y que el trigger append-only sigue rechazando UPDATE/DELETE.

## Relaciones

```text
User 1───* OrderAudit.actor      (actor_id,       onDelete:Restrict)   [002b]
User 1───* OrderAudit.from_user  (from_assignee,  onDelete:Restrict)   [nuevo]
User 1───* OrderAudit.to_user    (to_assignee,    onDelete:Restrict)   [nuevo]
Order 1──* OrderAudit.order      (order_id,       onDelete:Restrict)   [002b]
User 0/1─* Order.assignee        (assigned_to,    onDelete:SetNull)    [002a]
```

> `onDelete:Restrict` en `from_assignee`/`to_assignee` preserva el trail forense (no se puede borrar un usuario
> referenciado por una auditoría), coherente con `actor_id`. Contrasta con `Order.assigned_to`
> (`SetNull`, que sí permite huérfanas vivas).
