-- Feature 024 (US3, FR-021) — EvidenceReadAudit: registro append-only de LECTURAS autorizadas de
-- evidencia. Tabla NUEVA (separada de `order_audit`) para no contaminar la semántica FSM que
-- `order-detail-reader.ts` deriva de `order_audit` (transición más reciente → `last_rejection_reason`);
-- una fila de "lectura" (sin transición) en `order_audit` rompería esas consultas. Mismo patrón de
-- enforcement que `order_audit`/`order_evidence` (002b/005): función + TRIGGER BEFORE UPDATE OR DELETE,
-- aplica también al propietario `fieldops` (no un REVOKE).

-- CreateTable
CREATE TABLE "evidence_read_audit" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "evidence_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_read_audit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "evidence_read_audit_order_id_idx" ON "evidence_read_audit"("order_id");

-- CreateIndex
CREATE INDEX "evidence_read_audit_evidence_id_idx" ON "evidence_read_audit"("evidence_id");

-- AddForeignKey
ALTER TABLE "evidence_read_audit" ADD CONSTRAINT "evidence_read_audit_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_read_audit" ADD CONSTRAINT "evidence_read_audit_evidence_id_fkey" FOREIGN KEY ("evidence_id") REFERENCES "order_evidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_read_audit" ADD CONSTRAINT "evidence_read_audit_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Append-only enforcement (XI): función + TRIGGER BEFORE UPDATE OR DELETE que lanza excepción. Aplica a
-- TODOS los roles, incluido el propietario `fieldops` (a diferencia de un REVOKE).
CREATE OR REPLACE FUNCTION "evidence_read_audit_append_only"() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'evidence_read_audit is append-only: % is not permitted', TG_OP
        USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "evidence_read_audit_no_mutation"
    BEFORE UPDATE OR DELETE ON "evidence_read_audit"
    FOR EACH ROW EXECUTE FUNCTION "evidence_read_audit_append_only"();
