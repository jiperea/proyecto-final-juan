-- Feature 004 — Extensión ADITIVA de order_audit para reasignación. data-model.md.
-- SQL artesanal (no regenerar a ciegas con `migrate dev`). 001/002 inamovibles; el trigger append-only
-- de 002b se CONSERVA (no se recrea). ADD COLUMN con DEFAULT constante = metadata-only en PG11+ (no reescribe
-- filas, no dispara el trigger BEFORE UPDATE/DELETE FOR EACH ROW).

-- CreateEnum
CREATE TYPE "OrderAuditEventType" AS ENUM ('transition', 'reassignment');

-- AlterTable: event_type con DEFAULT 'transition' → backfill implícito de filas legacy (todas transiciones).
ALTER TABLE "order_audit" ADD COLUMN "event_type" "OrderAuditEventType" NOT NULL DEFAULT 'transition';
ALTER TABLE "order_audit" ADD COLUMN "from_assignee" UUID;
ALTER TABLE "order_audit" ADD COLUMN "to_assignee" UUID;

-- Relajar from_status/to_status a NULLABLE (NULL en eventos reassignment; la reasignación no cambia estado).
ALTER TABLE "order_audit" ALTER COLUMN "from_status" DROP NOT NULL;
ALTER TABLE "order_audit" ALTER COLUMN "to_status" DROP NOT NULL;

-- FKs (Restrict, trail forense) con NOT VALID + VALIDATE (evita ACCESS EXCLUSIVE lock prolongado).
ALTER TABLE "order_audit" ADD CONSTRAINT "order_audit_from_assignee_fkey"
    FOREIGN KEY ("from_assignee") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "order_audit" VALIDATE CONSTRAINT "order_audit_from_assignee_fkey";
ALTER TABLE "order_audit" ADD CONSTRAINT "order_audit_to_assignee_fkey"
    FOREIGN KEY ("to_assignee") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "order_audit" VALIDATE CONSTRAINT "order_audit_to_assignee_fkey";

-- CHECK de invariantes por event_type (integridad forense, defensa en profundidad; G2-H-003).
ALTER TABLE "order_audit" ADD CONSTRAINT "order_audit_reassignment_invariant"
    CHECK ("event_type" <> 'reassignment'
        OR ("from_status" IS NULL AND "to_status" IS NULL AND "to_assignee" IS NOT NULL)) NOT VALID;
ALTER TABLE "order_audit" VALIDATE CONSTRAINT "order_audit_reassignment_invariant";
ALTER TABLE "order_audit" ADD CONSTRAINT "order_audit_transition_invariant"
    CHECK ("event_type" <> 'transition'
        OR ("from_status" IS NOT NULL AND "to_status" IS NOT NULL
            AND "from_assignee" IS NULL AND "to_assignee" IS NULL)) NOT VALID;
ALTER TABLE "order_audit" VALIDATE CONSTRAINT "order_audit_transition_invariant";
