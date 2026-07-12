-- Reverso PARCIAL (M10 / G2-H-002). Prisma no lo ejecuta solo; documentado.
-- Elimina lo aditivo (columnas/CHECK/FK/enum). NO re-impone NOT NULL en from_status/to_status:
-- las filas reassignment las tienen NULL por diseño y order_audit es append-only (re-endurecer violaría
-- la inmutabilidad). Limitación documentada en data-model.md.
ALTER TABLE "order_audit" DROP CONSTRAINT IF EXISTS "order_audit_transition_invariant";
ALTER TABLE "order_audit" DROP CONSTRAINT IF EXISTS "order_audit_reassignment_invariant";
ALTER TABLE "order_audit" DROP CONSTRAINT IF EXISTS "order_audit_to_assignee_fkey";
ALTER TABLE "order_audit" DROP CONSTRAINT IF EXISTS "order_audit_from_assignee_fkey";
ALTER TABLE "order_audit" DROP COLUMN IF EXISTS "to_assignee";
ALTER TABLE "order_audit" DROP COLUMN IF EXISTS "from_assignee";
ALTER TABLE "order_audit" DROP COLUMN IF EXISTS "event_type";
DROP TYPE IF EXISTS "OrderAuditEventType";
