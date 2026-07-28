-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "poNumber" TEXT NOT NULL,
    "supplierId" UUID NOT NULL,
    "supplierSelectionId" UUID NOT NULL,
    "supplierQuotationId" UUID NOT NULL,
    "purchaseRequestId" UUID NOT NULL,
    "currency" TEXT NOT NULL,
    "exchangeRateSnapshot" DECIMAL(20,6) NOT NULL DEFAULT 1,
    "incoterms" TEXT,
    "paymentTerms" TEXT,
    "billingAddress" TEXT,
    "deliveryAddress" TEXT NOT NULL,
    "expectedProductionStart" TIMESTAMP(3),
    "expectedReadyDate" TIMESTAMP(3),
    "subtotal" DECIMAL(20,2) NOT NULL,
    "discountAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "shippingAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "insuranceAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(20,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "createdBy" UUID NOT NULL,
    "updatedBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderLine" (
    "id" UUID NOT NULL,
    "purchaseOrderId" UUID NOT NULL,
    "purchaseRequestLineId" UUID NOT NULL,
    "productId" UUID,
    "variantId" UUID,
    "customDescription" TEXT,
    "quantity" DECIMAL(20,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "unitPrice" DECIMAL(20,2) NOT NULL,
    "discount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "netUnitPrice" DECIMAL(20,2) NOT NULL,
    "lineTotal" DECIMAL(20,2) NOT NULL,
    "expectedReadyDate" TIMESTAMP(3),
    "projectArea" TEXT,
    "technicalRequirements" TEXT,
    "shippedQuantity" DECIMAL(20,3) NOT NULL DEFAULT 0,
    "receivedQuantity" DECIMAL(20,3) NOT NULL DEFAULT 0,
    "cancelledQuantity" DECIMAL(20,3) NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PurchaseOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderApproval" (
    "id" UUID NOT NULL,
    "purchaseOrderId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "decision" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseOrderApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderDocument" (
    "id" UUID NOT NULL,
    "purchaseOrderId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "language" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "generatedBy" UUID NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseOrderDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderStatusHistory" (
    "id" UUID NOT NULL,
    "purchaseOrderId" UUID NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "actorId" UUID NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseOrderStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_supplierSelectionId_key" ON "PurchaseOrder"("supplierSelectionId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_organizationId_projectId_supplierId_status_idx" ON "PurchaseOrder"("organizationId", "projectId", "supplierId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_organizationId_poNumber_revision_key" ON "PurchaseOrder"("organizationId", "poNumber", "revision");

-- CreateIndex
CREATE INDEX "PurchaseOrderLine_purchaseOrderId_position_idx" ON "PurchaseOrderLine"("purchaseOrderId", "position");

-- CreateIndex
CREATE INDEX "PurchaseOrderApproval_purchaseOrderId_createdAt_idx" ON "PurchaseOrderApproval"("purchaseOrderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrderDocument_purchaseOrderId_version_language_form_key" ON "PurchaseOrderDocument"("purchaseOrderId", "version", "language", "format");

-- CreateIndex
CREATE INDEX "PurchaseOrderStatusHistory_purchaseOrderId_createdAt_idx" ON "PurchaseOrderStatusHistory"("purchaseOrderId", "createdAt");

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_purchaseRequestId_fkey" FOREIGN KEY ("purchaseRequestId") REFERENCES "PurchaseRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplierQuotationId_fkey" FOREIGN KEY ("supplierQuotationId") REFERENCES "SupplierQuotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplierSelectionId_fkey" FOREIGN KEY ("supplierSelectionId") REFERENCES "SupplierSelection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderApproval" ADD CONSTRAINT "PurchaseOrderApproval_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderDocument" ADD CONSTRAINT "PurchaseOrderDocument_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderStatusHistory" ADD CONSTRAINT "PurchaseOrderStatusHistory_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
