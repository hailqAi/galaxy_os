-- CreateTable
CREATE TABLE "SupplierQuotation" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "rfqId" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "supplierContactId" UUID,
    "quotationNumber" TEXT NOT NULL,
    "quotationDate" TIMESTAMP(3) NOT NULL,
    "receivedDate" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "currency" TEXT NOT NULL,
    "exchangeRateSnapshot" DECIMAL(20,6) NOT NULL DEFAULT 1,
    "incoterms" TEXT,
    "paymentTerms" TEXT,
    "productionLeadTimeDays" INTEGER,
    "shippingLeadTimeDays" INTEGER,
    "warrantyTerms" TEXT,
    "shippingCost" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "insuranceCost" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "supersedesId" UUID,
    "createdBy" UUID NOT NULL,
    "updatedBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SupplierQuotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierQuotationLine" (
    "id" UUID NOT NULL,
    "supplierQuotationId" UUID NOT NULL,
    "rfqLineId" UUID NOT NULL,
    "productId" UUID,
    "variantId" UUID,
    "supplierProductCode" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(20,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "listPrice" DECIMAL(20,2) NOT NULL,
    "discountPercent" DECIMAL(9,4) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "netUnitPrice" DECIMAL(20,2) NOT NULL,
    "netTotal" DECIMAL(20,2) NOT NULL,
    "leadTimeDays" INTEGER,
    "technicalCompliance" TEXT NOT NULL DEFAULT 'PENDING',
    "alternativeOffered" BOOLEAN NOT NULL DEFAULT false,
    "warrantyMonths" INTEGER,
    "notes" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SupplierQuotationLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierQuotationDocument" (
    "id" UUID NOT NULL,
    "supplierQuotationId" UUID NOT NULL,
    "fileAssetId" UUID NOT NULL,
    "documentType" TEXT NOT NULL,
    "checksum" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierQuotationDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierQuotationStatusHistory" (
    "id" UUID NOT NULL,
    "supplierQuotationId" UUID NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "actorId" UUID NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierQuotationStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupplierQuotation_organizationId_rfqId_supplierId_status_de_idx" ON "SupplierQuotation"("organizationId", "rfqId", "supplierId", "status", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierQuotation_organizationId_supplierId_quotationNumber_key" ON "SupplierQuotation"("organizationId", "supplierId", "quotationNumber", "revision");

-- CreateIndex
CREATE INDEX "SupplierQuotationLine_supplierQuotationId_position_idx" ON "SupplierQuotationLine"("supplierQuotationId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierQuotationLine_supplierQuotationId_rfqLineId_key" ON "SupplierQuotationLine"("supplierQuotationId", "rfqLineId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierQuotationDocument_supplierQuotationId_fileAssetId_key" ON "SupplierQuotationDocument"("supplierQuotationId", "fileAssetId");

-- CreateIndex
CREATE INDEX "SupplierQuotationStatusHistory_supplierQuotationId_createdA_idx" ON "SupplierQuotationStatusHistory"("supplierQuotationId", "createdAt");

-- AddForeignKey
ALTER TABLE "SupplierQuotation" ADD CONSTRAINT "SupplierQuotation_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "SupplierRFQ"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierQuotationLine" ADD CONSTRAINT "SupplierQuotationLine_supplierQuotationId_fkey" FOREIGN KEY ("supplierQuotationId") REFERENCES "SupplierQuotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierQuotationDocument" ADD CONSTRAINT "SupplierQuotationDocument_supplierQuotationId_fkey" FOREIGN KEY ("supplierQuotationId") REFERENCES "SupplierQuotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierQuotationStatusHistory" ADD CONSTRAINT "SupplierQuotationStatusHistory_supplierQuotationId_fkey" FOREIGN KEY ("supplierQuotationId") REFERENCES "SupplierQuotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
