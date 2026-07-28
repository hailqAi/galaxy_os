-- CreateTable
CREATE TABLE "SupplierRFQ" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "rfqNumber" TEXT NOT NULL,
    "purchaseRequestId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "responseDeadline" TIMESTAMP(3) NOT NULL,
    "requestedCurrency" TEXT NOT NULL,
    "requestedIncoterms" TEXT,
    "deliveryDestination" TEXT NOT NULL,
    "deliveryCountry" TEXT,
    "technicalRequirements" TEXT,
    "commercialRequirements" TEXT,
    "language" TEXT NOT NULL DEFAULT 'EN',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "sentAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "sendMode" TEXT,
    "createdBy" UUID NOT NULL,
    "updatedBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "SupplierRFQ_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierRFQRecipient" (
    "id" UUID NOT NULL,
    "rfqId" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "supplierContactId" UUID,
    "language" TEXT NOT NULL,
    "timezone" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveryStatus" TEXT NOT NULL DEFAULT 'NOT_SENT',
    "responseStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "lastReminderAt" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "SupplierRFQRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierRFQLine" (
    "id" UUID NOT NULL,
    "rfqId" UUID NOT NULL,
    "purchaseRequestLineId" UUID NOT NULL,
    "productId" UUID,
    "variantId" UUID,
    "customDescription" TEXT,
    "quantity" DECIMAL(20,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "targetDeliveryDate" TIMESTAMP(3),
    "technicalRequirements" TEXT,
    "requiredDocuments" JSONB,
    "notes" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SupplierRFQLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierRFQClarification" (
    "id" UUID NOT NULL,
    "rfqId" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "subject" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "askedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "attachments" JSONB,
    "createdBy" UUID NOT NULL,

    CONSTRAINT "SupplierRFQClarification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierRFQDocument" (
    "id" UUID NOT NULL,
    "rfqId" UUID NOT NULL,
    "fileAssetId" UUID NOT NULL,
    "documentType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierRFQDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierRFQStatusHistory" (
    "id" UUID NOT NULL,
    "rfqId" UUID NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "actorId" UUID NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierRFQStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupplierRFQ_organizationId_projectId_status_responseDeadlin_idx" ON "SupplierRFQ"("organizationId", "projectId", "status", "responseDeadline", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierRFQ_organizationId_rfqNumber_key" ON "SupplierRFQ"("organizationId", "rfqNumber");

-- CreateIndex
CREATE INDEX "SupplierRFQRecipient_supplierId_responseStatus_idx" ON "SupplierRFQRecipient"("supplierId", "responseStatus");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierRFQRecipient_rfqId_supplierId_key" ON "SupplierRFQRecipient"("rfqId", "supplierId");

-- CreateIndex
CREATE INDEX "SupplierRFQLine_rfqId_position_idx" ON "SupplierRFQLine"("rfqId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierRFQLine_rfqId_purchaseRequestLineId_key" ON "SupplierRFQLine"("rfqId", "purchaseRequestLineId");

-- CreateIndex
CREATE INDEX "SupplierRFQClarification_rfqId_supplierId_status_idx" ON "SupplierRFQClarification"("rfqId", "supplierId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierRFQDocument_rfqId_fileAssetId_key" ON "SupplierRFQDocument"("rfqId", "fileAssetId");

-- CreateIndex
CREATE INDEX "SupplierRFQStatusHistory_rfqId_createdAt_idx" ON "SupplierRFQStatusHistory"("rfqId", "createdAt");

-- AddForeignKey
ALTER TABLE "SupplierRFQ" ADD CONSTRAINT "SupplierRFQ_purchaseRequestId_fkey" FOREIGN KEY ("purchaseRequestId") REFERENCES "PurchaseRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierRFQRecipient" ADD CONSTRAINT "SupplierRFQRecipient_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "SupplierRFQ"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierRFQLine" ADD CONSTRAINT "SupplierRFQLine_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "SupplierRFQ"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierRFQClarification" ADD CONSTRAINT "SupplierRFQClarification_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "SupplierRFQ"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierRFQDocument" ADD CONSTRAINT "SupplierRFQDocument_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "SupplierRFQ"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierRFQStatusHistory" ADD CONSTRAINT "SupplierRFQStatusHistory_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "SupplierRFQ"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
