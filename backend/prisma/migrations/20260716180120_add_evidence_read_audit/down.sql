-- Reversión de 20260716180120_add_evidence_read_audit (024, T041).
-- Prisma Migrate no ejecuta `down.sql` automáticamente; es el script reversible de referencia.
-- Orden: TRIGGER → FUNCTION → TABLE (sin dejar huérfanos).

DROP TRIGGER IF EXISTS "evidence_read_audit_no_mutation" ON "evidence_read_audit";
DROP FUNCTION IF EXISTS "evidence_read_audit_append_only"();
DROP TABLE IF EXISTS "evidence_read_audit";
