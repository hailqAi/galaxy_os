-- CreateTable
CREATE TABLE "Contract" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "quotationId" UUID,
    "contractNumber" TEXT NOT NULL,
    "sellerLegalEntity" TEXT NOT NULL,
    "buyerLegalEntity" TEXT NOT NULL,
    "sellerRepresentative" TEXT,
    "buyerRepresentative" TEXT,
    "signedDate" TIMESTAMP(3),
    "effectiveDate" TIMESTAMP(3),
    "expectedCompletionDate" TIMESTAMP(3),
    "originalValue" DECIMAL(20,2) NOT NULL,
    "currentValue" DECIMAL(20,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "taxAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "retentionPercent" DECIMAL(9,4) NOT NULL DEFAULT 0,
    "retentionAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "warrantyRetentionPercent" DECIMAL(9,4) NOT NULL DEFAULT 0,
    "warrantyRetentionAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "paymentTerms" TEXT,
    "deliveryTerms" TEXT,
    "installationTerms" TEXT,
    "warrantyTerms" TEXT,
    "terminationTerms" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdBy" UUID NOT NULL,
    "updatedBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractVersion" (
    "id" UUID NOT NULL,
    "contractId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractAppendix" (
    "id" UUID NOT NULL,
    "contractId" UUID NOT NULL,
    "appendixNumber" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "valueChange" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3),
    "signedDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "idempotencyKey" TEXT NOT NULL,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractAppendix_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractAppendixLine" (
    "id" UUID NOT NULL,
    "appendixId" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "valueChange" DECIMAL(20,2) NOT NULL DEFAULT 0,

    CONSTRAINT "ContractAppendixLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractValueHistory" (
    "id" UUID NOT NULL,
    "contractId" UUID NOT NULL,
    "appendixId" UUID,
    "previousValue" DECIMAL(20,2) NOT NULL,
    "changeValue" DECIMAL(20,2) NOT NULL,
    "currentValue" DECIMAL(20,2) NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractValueHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractMilestone" (
    "id" UUID NOT NULL,
    "contractId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "percentage" DECIMAL(9,4),
    "amount" DECIMAL(20,2),
    "status" TEXT NOT NULL DEFAULT 'PLANNED',

    CONSTRAINT "ContractMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractGuarantee" (
    "id" UUID NOT NULL,
    "contractId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "guaranteeNumber" TEXT NOT NULL,
    "bank" TEXT NOT NULL,
    "beneficiary" TEXT NOT NULL,
    "value" DECIMAL(20,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "documentId" UUID,

    CONSTRAINT "ContractGuarantee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractApproval" (
    "id" UUID NOT NULL,
    "contractId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "decision" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractDocument" (
    "id" UUID NOT NULL,
    "contractId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "language" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "generatedBy" UUID NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractStatusHistory" (
    "id" UUID NOT NULL,
    "contractId" UUID NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "actorId" UUID NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerPaymentSchedule" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "contractId" UUID NOT NULL,
    "appendixId" UUID,
    "milestoneName" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "percentage" DECIMAL(9,4),
    "amount" DECIMAL(20,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "exchangeRateSnapshot" DECIMAL(20,6) NOT NULL DEFAULT 1,
    "condition" TEXT,
    "requiredDocuments" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "paidAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "outstandingAmount" DECIMAL(20,2) NOT NULL,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerPaymentSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerPayment" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "exchangeRate" DECIMAL(20,6) NOT NULL DEFAULT 1,
    "paymentMethod" TEXT NOT NULL,
    "bankReference" TEXT,
    "receiptNumber" TEXT,
    "notes" TEXT,
    "recordedBy" UUID NOT NULL,
    "approvedBy" UUID,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAllocation" (
    "id" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "scheduleId" UUID NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Contract_quotationId_key" ON "Contract"("quotationId");

-- CreateIndex
CREATE INDEX "Contract_organizationId_projectId_status_idx" ON "Contract"("organizationId", "projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_organizationId_contractNumber_key" ON "Contract"("organizationId", "contractNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ContractVersion_contractId_version_key" ON "ContractVersion"("contractId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ContractAppendix_idempotencyKey_key" ON "ContractAppendix"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ContractAppendix_contractId_status_idx" ON "ContractAppendix"("contractId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ContractAppendix_contractId_appendixNumber_key" ON "ContractAppendix"("contractId", "appendixNumber");

-- CreateIndex
CREATE INDEX "ContractAppendixLine_appendixId_idx" ON "ContractAppendixLine"("appendixId");

-- CreateIndex
CREATE INDEX "ContractValueHistory_contractId_effectiveDate_idx" ON "ContractValueHistory"("contractId", "effectiveDate");

-- CreateIndex
CREATE INDEX "ContractMilestone_contractId_idx" ON "ContractMilestone"("contractId");

-- CreateIndex
CREATE INDEX "ContractGuarantee_contractId_expiryDate_status_idx" ON "ContractGuarantee"("contractId", "expiryDate", "status");

-- CreateIndex
CREATE INDEX "ContractApproval_contractId_createdAt_idx" ON "ContractApproval"("contractId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContractDocument_contractId_version_language_format_key" ON "ContractDocument"("contractId", "version", "language", "format");

-- CreateIndex
CREATE INDEX "ContractStatusHistory_contractId_createdAt_idx" ON "ContractStatusHistory"("contractId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerPaymentSchedule_organizationId_projectId_dueDate_st_idx" ON "CustomerPaymentSchedule"("organizationId", "projectId", "dueDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerPaymentSchedule_contractId_sequence_key" ON "CustomerPaymentSchedule"("contractId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerPayment_idempotencyKey_key" ON "CustomerPayment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "CustomerPayment_organizationId_projectId_paymentDate_idx" ON "CustomerPayment"("organizationId", "projectId", "paymentDate");

-- CreateIndex
CREATE INDEX "PaymentAllocation_scheduleId_idx" ON "PaymentAllocation"("scheduleId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAllocation_paymentId_scheduleId_key" ON "PaymentAllocation"("paymentId", "scheduleId");

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractVersion" ADD CONSTRAINT "ContractVersion_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractAppendix" ADD CONSTRAINT "ContractAppendix_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractAppendixLine" ADD CONSTRAINT "ContractAppendixLine_appendixId_fkey" FOREIGN KEY ("appendixId") REFERENCES "ContractAppendix"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractValueHistory" ADD CONSTRAINT "ContractValueHistory_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractMilestone" ADD CONSTRAINT "ContractMilestone_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractGuarantee" ADD CONSTRAINT "ContractGuarantee_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractApproval" ADD CONSTRAINT "ContractApproval_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractDocument" ADD CONSTRAINT "ContractDocument_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractStatusHistory" ADD CONSTRAINT "ContractStatusHistory_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPaymentSchedule" ADD CONSTRAINT "CustomerPaymentSchedule_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "CustomerPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "CustomerPaymentSchedule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
