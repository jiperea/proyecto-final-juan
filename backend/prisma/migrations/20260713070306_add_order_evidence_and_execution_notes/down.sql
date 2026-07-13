-- Reversión de 20260713070306_add_order_evidence_and_execution_notes (005, T004).
-- Prisma Migrate no ejecuta `down.sql` automáticamente; es el script reversible verificado en quickstart.
-- Orden: TRIGGER → FUNCTION → TABLEs (sin dejar huérfanos). order_execution_notes no tiene trigger.

DROP TRIGGER IF EXISTS "order_evidence_no_mutation" ON "order_evidence";
DROP FUNCTION IF EXISTS "order_evidence_append_only"();
DROP TABLE IF EXISTS "order_execution_notes";
DROP TABLE IF EXISTS "order_evidence";
