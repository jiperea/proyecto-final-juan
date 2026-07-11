-- Reversión de 20260711120000_add_order_audit (T001/T020, cínico-G2:H-006).
-- Prisma Migrate no ejecuta `down.sql` automáticamente; es el script reversible verificado en quickstart.
-- Orden: TRIGGER → FUNCTION → TABLE (sin dejar huérfanos).

DROP TRIGGER IF EXISTS "order_audit_no_mutation" ON "order_audit";
DROP FUNCTION IF EXISTS "order_audit_append_only"();
DROP TABLE IF EXISTS "order_audit";
