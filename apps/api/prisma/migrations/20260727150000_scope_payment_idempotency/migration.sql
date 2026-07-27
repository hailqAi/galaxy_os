DROP INDEX "SupplierPayment_idempotencyKey_key";
CREATE UNIQUE INDEX "SupplierPayment_organizationId_idempotencyKey_key"
ON "SupplierPayment"("organizationId", "idempotencyKey");
