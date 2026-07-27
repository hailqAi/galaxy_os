CREATE TABLE "SupplierPaymentSchedule" (
    "id" UUID NOT NULL, "organizationId" UUID NOT NULL, "projectId" UUID NOT NULL,
    "supplierId" UUID NOT NULL, "purchaseOrderId" UUID NOT NULL, "proformaInvoiceId" UUID NOT NULL,
    "supplierPayableId" UUID NOT NULL, "milestone" TEXT NOT NULL, "sequence" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL, "percentage" DECIMAL(9,4), "amount" DECIMAL(20,2) NOT NULL,
    "currency" TEXT NOT NULL, "exchangeRateSnapshot" DECIMAL(20,6) NOT NULL, "condition" TEXT,
    "dependencyType" TEXT, "dependencyId" UUID, "dependencyStatus" TEXT,
    "paidAmount" DECIMAL(20,2) NOT NULL DEFAULT 0, "outstandingAmount" DECIMAL(20,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLANNED', "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SupplierPaymentSchedule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupplierPayment" (
    "id" UUID NOT NULL, "organizationId" UUID NOT NULL, "supplierId" UUID NOT NULL,
    "projectId" UUID NOT NULL, "paymentDate" TIMESTAMP(3) NOT NULL, "amount" DECIMAL(20,2) NOT NULL,
    "currency" TEXT NOT NULL, "exchangeRateSnapshot" DECIMAL(20,6) NOT NULL, "paymentMethod" TEXT NOT NULL,
    "bankReferenceProtected" TEXT, "transactionReference" TEXT, "notes" TEXT,
    "recordedBy" UUID NOT NULL, "approvedBy" UUID, "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "idempotencyKey" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SupplierPayment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupplierPaymentAllocation" (
    "id" UUID NOT NULL, "paymentId" UUID NOT NULL, "scheduleId" UUID NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupplierPaymentAllocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupplierCreditNote" (
    "id" UUID NOT NULL, "organizationId" UUID NOT NULL, "supplierPayableId" UUID NOT NULL,
    "creditNoteNumber" TEXT NOT NULL, "amount" DECIMAL(20,2) NOT NULL, "currency" TEXT NOT NULL,
    "reason" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'DRAFT', "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupplierCreditNote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupplierPaymentApproval" (
    "id" UUID NOT NULL, "supplierPaymentId" UUID NOT NULL, "actorId" UUID NOT NULL,
    "decision" TEXT NOT NULL, "comment" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupplierPaymentApproval_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupplierPaymentStatusHistory" (
    "id" UUID NOT NULL, "supplierPaymentId" UUID NOT NULL, "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL, "actorId" UUID NOT NULL, "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupplierPaymentStatusHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SupplierPaymentSchedule_organizationId_projectId_supplierId_idx" ON "SupplierPaymentSchedule"("organizationId", "projectId", "supplierId", "dueDate", "status");
CREATE UNIQUE INDEX "SupplierPaymentSchedule_supplierPayableId_sequence_key" ON "SupplierPaymentSchedule"("supplierPayableId", "sequence");
CREATE UNIQUE INDEX "SupplierPayment_idempotencyKey_key" ON "SupplierPayment"("idempotencyKey");
CREATE INDEX "SupplierPayment_organizationId_projectId_supplierId_payment_idx" ON "SupplierPayment"("organizationId", "projectId", "supplierId", "paymentDate", "status");
CREATE INDEX "SupplierPaymentAllocation_scheduleId_idx" ON "SupplierPaymentAllocation"("scheduleId");
CREATE UNIQUE INDEX "SupplierPaymentAllocation_paymentId_scheduleId_key" ON "SupplierPaymentAllocation"("paymentId", "scheduleId");
CREATE UNIQUE INDEX "SupplierCreditNote_organizationId_creditNoteNumber_key" ON "SupplierCreditNote"("organizationId", "creditNoteNumber");
CREATE INDEX "SupplierPaymentApproval_supplierPaymentId_createdAt_idx" ON "SupplierPaymentApproval"("supplierPaymentId", "createdAt");
CREATE INDEX "SupplierPaymentStatusHistory_supplierPaymentId_createdAt_idx" ON "SupplierPaymentStatusHistory"("supplierPaymentId", "createdAt");
CREATE INDEX "SupplierPayable_organizationId_projectId_supplierId_status_idx" ON "SupplierPayable"("organizationId", "projectId", "supplierId", "status");

ALTER TABLE "SupplierPaymentSchedule" ADD CONSTRAINT "SupplierPaymentSchedule_supplierPayableId_fkey" FOREIGN KEY ("supplierPayableId") REFERENCES "SupplierPayable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierPaymentAllocation" ADD CONSTRAINT "SupplierPaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "SupplierPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierPaymentAllocation" ADD CONSTRAINT "SupplierPaymentAllocation_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "SupplierPaymentSchedule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierCreditNote" ADD CONSTRAINT "SupplierCreditNote_supplierPayableId_fkey" FOREIGN KEY ("supplierPayableId") REFERENCES "SupplierPayable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierPaymentApproval" ADD CONSTRAINT "SupplierPaymentApproval_supplierPaymentId_fkey" FOREIGN KEY ("supplierPaymentId") REFERENCES "SupplierPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierPaymentStatusHistory" ADD CONSTRAINT "SupplierPaymentStatusHistory_supplierPaymentId_fkey" FOREIGN KEY ("supplierPaymentId") REFERENCES "SupplierPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
