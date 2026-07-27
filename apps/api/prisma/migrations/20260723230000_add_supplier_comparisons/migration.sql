-- CreateTable
CREATE TABLE "SupplierComparison" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "rfqId" UUID NOT NULL,
    "purchaseRequestId" UUID NOT NULL,
    "baseCurrency" TEXT NOT NULL DEFAULT 'VND',
    "exchangeRateDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdBy" UUID NOT NULL,
    "updatedBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierComparison_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierComparisonLine" (
    "id" UUID NOT NULL,
    "comparisonId" UUID NOT NULL,
    "supplierQuotationId" UUID NOT NULL,
    "supplierQuotationLineId" UUID NOT NULL,
    "rfqLineId" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "originalCurrency" TEXT NOT NULL,
    "exchangeRateSnapshot" DECIMAL(20,6) NOT NULL,
    "netProductValue" DECIMAL(20,2) NOT NULL,
    "landedEstimateBase" DECIMAL(20,2) NOT NULL,
    "productionLeadTimeDays" INTEGER,
    "shippingLeadTimeDays" INTEGER,
    "paymentTerms" TEXT,
    "warrantyTerms" TEXT,
    "technicalCompliance" TEXT NOT NULL,
    "commercialRisk" TEXT,
    "productionRisk" TEXT,
    "logisticsRisk" TEXT,
    "serviceSupport" TEXT,
    "brandAuthorizationConfirmed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SupplierComparisonLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierSelection" (
    "id" UUID NOT NULL,
    "comparisonId" UUID NOT NULL,
    "supplierQuotationId" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "selectedLines" JSONB NOT NULL,
    "selectionReason" TEXT NOT NULL,
    "commercialAssessment" TEXT,
    "technicalAssessment" TEXT,
    "riskAssessment" TEXT,
    "selectedBy" UUID NOT NULL,
    "approvedBy" UUID,
    "approvedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierSelection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierSelectionApproval" (
    "id" UUID NOT NULL,
    "comparisonId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "decision" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierSelectionApproval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupplierComparison_organizationId_projectId_status_idx" ON "SupplierComparison"("organizationId", "projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierComparison_organizationId_rfqId_key" ON "SupplierComparison"("organizationId", "rfqId");

-- CreateIndex
CREATE INDEX "SupplierComparisonLine_comparisonId_rfqLineId_supplierId_idx" ON "SupplierComparisonLine"("comparisonId", "rfqLineId", "supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierComparisonLine_comparisonId_supplierQuotationLineId_key" ON "SupplierComparisonLine"("comparisonId", "supplierQuotationLineId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierSelection_idempotencyKey_key" ON "SupplierSelection"("idempotencyKey");

-- CreateIndex
CREATE INDEX "SupplierSelection_comparisonId_supplierId_status_idx" ON "SupplierSelection"("comparisonId", "supplierId", "status");

-- CreateIndex
CREATE INDEX "SupplierSelectionApproval_comparisonId_createdAt_idx" ON "SupplierSelectionApproval"("comparisonId", "createdAt");

-- AddForeignKey
ALTER TABLE "SupplierComparison" ADD CONSTRAINT "SupplierComparison_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "SupplierRFQ"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierComparisonLine" ADD CONSTRAINT "SupplierComparisonLine_comparisonId_fkey" FOREIGN KEY ("comparisonId") REFERENCES "SupplierComparison"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierSelection" ADD CONSTRAINT "SupplierSelection_comparisonId_fkey" FOREIGN KEY ("comparisonId") REFERENCES "SupplierComparison"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierSelectionApproval" ADD CONSTRAINT "SupplierSelectionApproval_comparisonId_fkey" FOREIGN KEY ("comparisonId") REFERENCES "SupplierComparison"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
