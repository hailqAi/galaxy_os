-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID,
    "itemCode" TEXT NOT NULL,
    "brandId" UUID,
    "productId" UUID NOT NULL,
    "variantId" UUID,
    "supplierId" UUID,
    "purchaseOrderId" UUID,
    "purchaseOrderLineId" UUID,
    "proformaInvoiceId" UUID,
    "productionOrderId" UUID,
    "shipmentId" UUID,
    "shipmentItemId" UUID,
    "goodsReceiptId" UUID,
    "unit" TEXT NOT NULL,
    "unitCost" DECIMAL(20,2),
    "currency" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryLot" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "inventoryItemId" UUID NOT NULL,
    "lotNumber" TEXT NOT NULL,
    "manufacturedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventorySerial" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "inventoryItemId" UUID NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECEIVING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventorySerial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryBalance" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "balanceKey" TEXT NOT NULL,
    "inventoryItemId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "storageLocationId" UUID,
    "lotId" UUID,
    "serialId" UUID,
    "onHand" DECIMAL(20,3) NOT NULL DEFAULT 0,
    "available" DECIMAL(20,3) NOT NULL DEFAULT 0,
    "reserved" DECIMAL(20,3) NOT NULL DEFAULT 0,
    "inTransit" DECIMAL(20,3) NOT NULL DEFAULT 0,
    "qualityHold" DECIMAL(20,3) NOT NULL DEFAULT 0,
    "damaged" DECIMAL(20,3) NOT NULL DEFAULT 0,
    "issued" DECIMAL(20,3) NOT NULL DEFAULT 0,
    "installed" DECIMAL(20,3) NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryTransaction" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID,
    "transactionNumber" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" UUID NOT NULL,
    "reason" TEXT,
    "postedBy" UUID NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryTransactionLine" (
    "id" UUID NOT NULL,
    "inventoryTransactionId" UUID NOT NULL,
    "inventoryItemId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "storageLocationId" UUID,
    "lotId" UUID,
    "serialId" UUID,
    "quantity" DECIMAL(20,3) NOT NULL,
    "onHandDelta" DECIMAL(20,3) NOT NULL DEFAULT 0,
    "availableDelta" DECIMAL(20,3) NOT NULL DEFAULT 0,
    "reservedDelta" DECIMAL(20,3) NOT NULL DEFAULT 0,
    "inTransitDelta" DECIMAL(20,3) NOT NULL DEFAULT 0,
    "qualityHoldDelta" DECIMAL(20,3) NOT NULL DEFAULT 0,
    "damagedDelta" DECIMAL(20,3) NOT NULL DEFAULT 0,
    "issuedDelta" DECIMAL(20,3) NOT NULL DEFAULT 0,
    "installedDelta" DECIMAL(20,3) NOT NULL DEFAULT 0,
    "unitCostSnapshot" DECIMAL(20,2),
    "currency" TEXT,

    CONSTRAINT "InventoryTransactionLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoodsReceipt" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "warehouseId" UUID NOT NULL,
    "shipmentId" UUID,
    "purchaseOrderId" UUID,
    "supplierId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "receivedAt" TIMESTAMP(3),
    "createdBy" UUID NOT NULL,
    "receivedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoodsReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoodsReceiptLine" (
    "id" UUID NOT NULL,
    "goodsReceiptId" UUID NOT NULL,
    "purchaseOrderLineId" UUID NOT NULL,
    "shipmentItemId" UUID,
    "inventoryItemId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "variantId" UUID,
    "storageLocationId" UUID NOT NULL,
    "lotId" UUID,
    "expectedQuantity" DECIMAL(20,3) NOT NULL,
    "receivedQuantity" DECIMAL(20,3) NOT NULL,
    "shortageQuantity" DECIMAL(20,3) NOT NULL DEFAULT 0,
    "excessQuantity" DECIMAL(20,3) NOT NULL DEFAULT 0,
    "damagedQuantity" DECIMAL(20,3) NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL,
    "notes" TEXT,

    CONSTRAINT "GoodsReceiptLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoodsReceiptStatusHistory" (
    "id" UUID NOT NULL,
    "goodsReceiptId" UUID NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "actorId" UUID NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoodsReceiptStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QualityInspection" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "goodsReceiptId" UUID NOT NULL,
    "inspectionNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "inspectorId" UUID NOT NULL,
    "approverId" UUID,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QualityInspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QualityInspectionLine" (
    "id" UUID NOT NULL,
    "qualityInspectionId" UUID NOT NULL,
    "goodsReceiptLineId" UUID NOT NULL,
    "inspectedQuantity" DECIMAL(20,3) NOT NULL,
    "passedQuantity" DECIMAL(20,3) NOT NULL DEFAULT 0,
    "failedQuantity" DECIMAL(20,3) NOT NULL DEFAULT 0,
    "quarantinedQuantity" DECIMAL(20,3) NOT NULL DEFAULT 0,
    "result" TEXT NOT NULL,
    "reason" TEXT,
    "evidenceFileId" UUID,

    CONSTRAINT "QualityInspectionLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DamageRecord" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID,
    "goodsReceiptId" UUID,
    "goodsReceiptLineId" UUID,
    "qualityInspectionId" UUID,
    "inventoryItemId" UUID NOT NULL,
    "lotId" UUID,
    "serialId" UUID,
    "quantity" DECIMAL(20,3) NOT NULL,
    "reason" TEXT NOT NULL,
    "evidenceFileId" UUID,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DamageRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InventoryItem_organizationId_projectId_productId_variantId__idx" ON "InventoryItem"("organizationId", "projectId", "productId", "variantId", "supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_organizationId_itemCode_key" ON "InventoryItem"("organizationId", "itemCode");

-- CreateIndex
CREATE INDEX "InventoryLot_organizationId_lotNumber_idx" ON "InventoryLot"("organizationId", "lotNumber");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryLot_organizationId_inventoryItemId_lotNumber_key" ON "InventoryLot"("organizationId", "inventoryItemId", "lotNumber");

-- CreateIndex
CREATE INDEX "InventorySerial_organizationId_inventoryItemId_status_idx" ON "InventorySerial"("organizationId", "inventoryItemId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "InventorySerial_organizationId_serialNumber_key" ON "InventorySerial"("organizationId", "serialNumber");

-- CreateIndex
CREATE INDEX "InventoryBalance_organizationId_warehouseId_inventoryItemId_idx" ON "InventoryBalance"("organizationId", "warehouseId", "inventoryItemId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryBalance_organizationId_balanceKey_key" ON "InventoryBalance"("organizationId", "balanceKey");

-- CreateIndex
CREATE INDEX "InventoryTransaction_organizationId_projectId_type_postedAt_idx" ON "InventoryTransaction"("organizationId", "projectId", "type", "postedAt");

-- CreateIndex
CREATE INDEX "InventoryTransaction_sourceType_sourceId_idx" ON "InventoryTransaction"("sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryTransaction_organizationId_transactionNumber_key" ON "InventoryTransaction"("organizationId", "transactionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryTransaction_organizationId_idempotencyKey_key" ON "InventoryTransaction"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "InventoryTransactionLine_inventoryTransactionId_inventoryIt_idx" ON "InventoryTransactionLine"("inventoryTransactionId", "inventoryItemId");

-- CreateIndex
CREATE INDEX "GoodsReceipt_organizationId_projectId_warehouseId_status_idx" ON "GoodsReceipt"("organizationId", "projectId", "warehouseId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "GoodsReceipt_organizationId_receiptNumber_key" ON "GoodsReceipt"("organizationId", "receiptNumber");

-- CreateIndex
CREATE INDEX "GoodsReceiptLine_goodsReceiptId_purchaseOrderLineId_idx" ON "GoodsReceiptLine"("goodsReceiptId", "purchaseOrderLineId");

-- CreateIndex
CREATE INDEX "GoodsReceiptStatusHistory_goodsReceiptId_createdAt_idx" ON "GoodsReceiptStatusHistory"("goodsReceiptId", "createdAt");

-- CreateIndex
CREATE INDEX "QualityInspection_organizationId_projectId_goodsReceiptId_s_idx" ON "QualityInspection"("organizationId", "projectId", "goodsReceiptId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "QualityInspection_organizationId_inspectionNumber_key" ON "QualityInspection"("organizationId", "inspectionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "QualityInspectionLine_qualityInspectionId_goodsReceiptLineI_key" ON "QualityInspectionLine"("qualityInspectionId", "goodsReceiptLineId");

-- CreateIndex
CREATE INDEX "DamageRecord_organizationId_projectId_inventoryItemId_creat_idx" ON "DamageRecord"("organizationId", "projectId", "inventoryItemId", "createdAt");

-- AddForeignKey
ALTER TABLE "InventoryLot" ADD CONSTRAINT "InventoryLot_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventorySerial" ADD CONSTRAINT "InventorySerial_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_storageLocationId_fkey" FOREIGN KEY ("storageLocationId") REFERENCES "StorageLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "InventoryLot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_serialId_fkey" FOREIGN KEY ("serialId") REFERENCES "InventorySerial"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransactionLine" ADD CONSTRAINT "InventoryTransactionLine_inventoryTransactionId_fkey" FOREIGN KEY ("inventoryTransactionId") REFERENCES "InventoryTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransactionLine" ADD CONSTRAINT "InventoryTransactionLine_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransactionLine" ADD CONSTRAINT "InventoryTransactionLine_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransactionLine" ADD CONSTRAINT "InventoryTransactionLine_storageLocationId_fkey" FOREIGN KEY ("storageLocationId") REFERENCES "StorageLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransactionLine" ADD CONSTRAINT "InventoryTransactionLine_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "InventoryLot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransactionLine" ADD CONSTRAINT "InventoryTransactionLine_serialId_fkey" FOREIGN KEY ("serialId") REFERENCES "InventorySerial"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceiptLine" ADD CONSTRAINT "GoodsReceiptLine_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "GoodsReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceiptStatusHistory" ADD CONSTRAINT "GoodsReceiptStatusHistory_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "GoodsReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityInspection" ADD CONSTRAINT "QualityInspection_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "GoodsReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityInspectionLine" ADD CONSTRAINT "QualityInspectionLine_qualityInspectionId_fkey" FOREIGN KEY ("qualityInspectionId") REFERENCES "QualityInspection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityInspectionLine" ADD CONSTRAINT "QualityInspectionLine_goodsReceiptLineId_fkey" FOREIGN KEY ("goodsReceiptLineId") REFERENCES "GoodsReceiptLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DamageRecord" ADD CONSTRAINT "DamageRecord_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "GoodsReceipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DamageRecord" ADD CONSTRAINT "DamageRecord_goodsReceiptLineId_fkey" FOREIGN KEY ("goodsReceiptLineId") REFERENCES "GoodsReceiptLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DamageRecord" ADD CONSTRAINT "DamageRecord_qualityInspectionId_fkey" FOREIGN KEY ("qualityInspectionId") REFERENCES "QualityInspection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
