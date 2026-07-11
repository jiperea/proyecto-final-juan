-- Feature 002b — OrderAudit (append-only). data-model.md / D5.
-- Nota: NO se usa REVOKE UPDATE,DELETE porque el rol de la app (`fieldops`) es PROPIETARIO de la tabla
-- y un REVOKE no afecta al owner en Postgres (G2:S-002). El enforcement es un TRIGGER independiente
-- del propietario. El `down` reversible vive en `down.sql` (T020 lo verifica).

-- CreateTable
CREATE TABLE "order_audit" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "from_status" "OrderStatus" NOT NULL,
    "to_status" "OrderStatus" NOT NULL,
    "reason" TEXT,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_audit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_audit_order_id_idx" ON "order_audit"("order_id");

-- AddForeignKey (Restrict: una orden/usuario con auditoría NO se borra físicamente — trail forense)
ALTER TABLE "order_audit" ADD CONSTRAINT "order_audit_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_audit" ADD CONSTRAINT "order_audit_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Append-only enforcement (SC-003): función + TRIGGER BEFORE UPDATE OR DELETE que lanza excepción.
-- Aplica a TODOS los roles, incluido el propietario `fieldops` (a diferencia de un REVOKE).
CREATE OR REPLACE FUNCTION "order_audit_append_only"() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'order_audit is append-only: % is not permitted', TG_OP
        USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "order_audit_no_mutation"
    BEFORE UPDATE OR DELETE ON "order_audit"
    FOR EACH ROW EXECUTE FUNCTION "order_audit_append_only"();
