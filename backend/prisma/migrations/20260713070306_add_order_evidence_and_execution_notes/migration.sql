-- Feature 005 — Registro de ejecución. Migración ADITIVA (data-model.md): dos tablas nuevas, sin ALTER
-- sobre orders/order_audit. `order_evidence` es APPEND-ONLY (mismo patrón de trigger que `order_audit` de
-- 002b: función + TRIGGER BEFORE UPDATE OR DELETE que aplica también al propietario `fieldops`, no un REVOKE).
-- `order_execution_notes` es MUTABLE/purgable (Constitution IX): SIN trigger append-only (debe admitir
-- purga/anonimización de PII). FKs onDelete RESTRICT (trail forense). El `down` vive en `down.sql`.

-- CreateTable
CREATE TABLE "order_evidence" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "audit_id" UUID NOT NULL,
    "object_ref" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "uploaded_by" UUID NOT NULL,
    "attempt" INTEGER,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_execution_notes" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "audit_id" UUID NOT NULL,
    "notes" TEXT NOT NULL,
    "attempt" INTEGER,
    "created_by" UUID NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_execution_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_evidence_order_id_idx" ON "order_evidence"("order_id");

-- CreateIndex
CREATE INDEX "order_evidence_audit_id_idx" ON "order_evidence"("audit_id");

-- CreateIndex
CREATE INDEX "order_execution_notes_order_id_idx" ON "order_execution_notes"("order_id");

-- CreateIndex
CREATE INDEX "order_execution_notes_audit_id_idx" ON "order_execution_notes"("audit_id");

-- AddForeignKey
ALTER TABLE "order_evidence" ADD CONSTRAINT "order_evidence_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_evidence" ADD CONSTRAINT "order_evidence_audit_id_fkey" FOREIGN KEY ("audit_id") REFERENCES "order_audit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_evidence" ADD CONSTRAINT "order_evidence_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_execution_notes" ADD CONSTRAINT "order_execution_notes_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_execution_notes" ADD CONSTRAINT "order_execution_notes_audit_id_fkey" FOREIGN KEY ("audit_id") REFERENCES "order_audit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_execution_notes" ADD CONSTRAINT "order_execution_notes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Append-only enforcement de `order_evidence` (misma técnica que `order_audit` de 002b): función + TRIGGER
-- BEFORE UPDATE OR DELETE que lanza excepción. Aplica a TODOS los roles, incluido el propietario `fieldops`
-- (a diferencia de un REVOKE). `order_execution_notes` NO recibe este trigger (mutable/purgable, IX).
CREATE OR REPLACE FUNCTION "order_evidence_append_only"() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'order_evidence is append-only: % is not permitted', TG_OP
        USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "order_evidence_no_mutation"
    BEFORE UPDATE OR DELETE ON "order_evidence"
    FOR EACH ROW EXECUTE FUNCTION "order_evidence_append_only"();
