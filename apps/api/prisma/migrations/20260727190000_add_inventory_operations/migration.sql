-- CreateTable
CREATE TABLE "InventoryReservation" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "reservationNumber" TEXT NOT NULL,
    "requiredDate" TIMESTAMP(3) NOT NULL,
    "purpose" TEXT NOT NULL,
    "requestedBy" UUID NOT NULL,
    "approvedBy" UUID,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryReservationLine" (
    "id" UUID NOT NULL,
    "inventoryReservationId" UUID NOT NULL,
    "inventoryItemId" UUID NOT NULL,
    "storageLocationId" UUID,
    "lotId" UUID,
    "serialId" UUID,
    "quantity" DECIMAL(20,3) NOT NULL,
    "issuedQuantity" DECIMAL(20,3) NOT NULL DEFAULT 0,

    CONSTRAINT "InventoryReservationLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryReservationStatusHistory" (
    "id" UUID NOT NULL,
    "inventoryReservationId" UUID NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "actorId" UUID NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryReservationStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockTransfer" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID,
    "transferNumber" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "sourceWarehouseId" UUID NOT NULL,
    "destinationWarehouseId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdBy" UUID NOT NULL,
    "approvedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockTransferLine" (
    "id" UUID NOT NULL,
    "stockTransferId" UUID NOT NULL,
    "inventoryItemId" UUID NOT NULL,
    "sourceLocationId" UUID,
    "destinationLocationId" UUID,
    "lotId" UUID,
    "serialId" UUID,
    "quantity" DECIMAL(20,3) NOT NULL,
    "receivedQuantity" DECIMAL(20,3) NOT NULL DEFAULT 0,

    CONSTRAINT "StockTransferLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockTransferStatusHistory" (
    "id" UUID NOT NULL,
    "stockTransferId" UUID NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "actorId" UUID NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockTransferStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockIssue" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID,
    "warehouseId" UUID NOT NULL,
    "issueNumber" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "evidenceFileId" UUID,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdBy" UUID NOT NULL,
    "approvedBy" UUID,
    "issuedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockIssueLine" (
    "id" UUID NOT NULL,
    "stockIssueId" UUID NOT NULL,
    "reservationLineId" UUID,
    "inventoryItemId" UUID NOT NULL,
    "storageLocationId" UUID,
    "lotId" UUID,
    "serialId" UUID,
    "quantity" DECIMAL(20,3) NOT NULL,

    CONSTRAINT "StockIssueLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockIssueStatusHistory" (
    "id" UUID NOT NULL,
    "stockIssueId" UUID NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "actorId" UUID NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockIssueStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockReturn" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID,
    "warehouseId" UUID NOT NULL,
    "returnNumber" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdBy" UUID NOT NULL,
    "receivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockReturnLine" (
    "id" UUID NOT NULL,
    "stockReturnId" UUID NOT NULL,
    "stockIssueLineId" UUID,
    "inventoryItemId" UUID NOT NULL,
    "storageLocationId" UUID,
    "lotId" UUID,
    "serialId" UUID,
    "quantity" DECIMAL(20,3) NOT NULL,

    CONSTRAINT "StockReturnLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockAdjustment" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID,
    "warehouseId" UUID NOT NULL,
    "adjustmentNumber" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdBy" UUID NOT NULL,
    "approvedBy" UUID,
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockAdjustmentLine" (
    "id" UUID NOT NULL,
    "stockAdjustmentId" UUID NOT NULL,
    "inventoryItemId" UUID NOT NULL,
    "storageLocationId" UUID,
    "lotId" UUID,
    "serialId" UUID,
    "expectedQuantity" DECIMAL(20,3) NOT NULL,
    "actualQuantity" DECIMAL(20,3) NOT NULL,
    "variance" DECIMAL(20,3) NOT NULL,

    CONSTRAINT "StockAdjustmentLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockAdjustmentStatusHistory" (
    "id" UUID NOT NULL,
    "stockAdjustmentId" UUID NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "actorId" UUID NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockAdjustmentStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CycleCount" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID,
    "warehouseId" UUID NOT NULL,
    "countNumber" TEXT NOT NULL,
    "scope" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "snapshotAt" TIMESTAMP(3),
    "counterId" UUID,
    "approvedBy" UUID,
    "adjustmentId" UUID,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CycleCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CycleCountLine" (
    "id" UUID NOT NULL,
    "cycleCountId" UUID NOT NULL,
    "inventoryItemId" UUID NOT NULL,
    "storageLocationId" UUID,
    "lotId" UUID,
    "serialId" UUID,
    "expectedQuantity" DECIMAL(20,3) NOT NULL,
    "countedQuantity" DECIMAL(20,3),
    "variance" DECIMAL(20,3),
    "countedBy" UUID,
    "countedAt" TIMESTAMP(3),

    CONSTRAINT "CycleCountLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CycleCountStatusHistory" (
    "id" UUID NOT NULL,
    "cycleCountId" UUID NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "actorId" UUID NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CycleCountStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InventoryReservation_organizationId_projectId_warehouseId_s_idx" ON "InventoryReservation"("organizationId", "projectId", "warehouseId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryReservation_organizationId_reservationNumber_key" ON "InventoryReservation"("organizationId", "reservationNumber");

-- CreateIndex
CREATE INDEX "InventoryReservationLine_inventoryReservationId_inventoryIt_idx" ON "InventoryReservationLine"("inventoryReservationId", "inventoryItemId");

-- CreateIndex
CREATE INDEX "InventoryReservationStatusHistory_inventoryReservationId_cr_idx" ON "InventoryReservationStatusHistory"("inventoryReservationId", "createdAt");

-- CreateIndex
CREATE INDEX "StockTransfer_organizationId_projectId_sourceWarehouseId_de_idx" ON "StockTransfer"("organizationId", "projectId", "sourceWarehouseId", "destinationWarehouseId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "StockTransfer_organizationId_transferNumber_key" ON "StockTransfer"("organizationId", "transferNumber");

-- CreateIndex
CREATE INDEX "StockTransferLine_stockTransferId_inventoryItemId_idx" ON "StockTransferLine"("stockTransferId", "inventoryItemId");

-- CreateIndex
CREATE INDEX "StockTransferStatusHistory_stockTransferId_createdAt_idx" ON "StockTransferStatusHistory"("stockTransferId", "createdAt");

-- CreateIndex
CREATE INDEX "StockIssue_organizationId_projectId_warehouseId_status_idx" ON "StockIssue"("organizationId", "projectId", "warehouseId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "StockIssue_organizationId_issueNumber_key" ON "StockIssue"("organizationId", "issueNumber");

-- CreateIndex
CREATE INDEX "StockIssueLine_stockIssueId_inventoryItemId_idx" ON "StockIssueLine"("stockIssueId", "inventoryItemId");

-- CreateIndex
CREATE INDEX "StockIssueStatusHistory_stockIssueId_createdAt_idx" ON "StockIssueStatusHistory"("stockIssueId", "createdAt");

-- CreateIndex
CREATE INDEX "StockReturn_organizationId_projectId_warehouseId_status_idx" ON "StockReturn"("organizationId", "projectId", "warehouseId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "StockReturn_organizationId_returnNumber_key" ON "StockReturn"("organizationId", "returnNumber");

-- CreateIndex
CREATE INDEX "StockReturnLine_stockReturnId_inventoryItemId_idx" ON "StockReturnLine"("stockReturnId", "inventoryItemId");

-- CreateIndex
CREATE INDEX "StockAdjustment_organizationId_projectId_warehouseId_status_idx" ON "StockAdjustment"("organizationId", "projectId", "warehouseId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "StockAdjustment_organizationId_adjustmentNumber_key" ON "StockAdjustment"("organizationId", "adjustmentNumber");

-- CreateIndex
CREATE INDEX "StockAdjustmentLine_stockAdjustmentId_inventoryItemId_idx" ON "StockAdjustmentLine"("stockAdjustmentId", "inventoryItemId");

-- CreateIndex
CREATE INDEX "StockAdjustmentStatusHistory_stockAdjustmentId_createdAt_idx" ON "StockAdjustmentStatusHistory"("stockAdjustmentId", "createdAt");

-- CreateIndex
CREATE INDEX "CycleCount_organizationId_projectId_warehouseId_status_idx" ON "CycleCount"("organizationId", "projectId", "warehouseId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CycleCount_organizationId_countNumber_key" ON "CycleCount"("organizationId", "countNumber");

-- CreateIndex
CREATE INDEX "CycleCountLine_cycleCountId_inventoryItemId_idx" ON "CycleCountLine"("cycleCountId", "inventoryItemId");

-- CreateIndex
CREATE INDEX "CycleCountStatusHistory_cycleCountId_createdAt_idx" ON "CycleCountStatusHistory"("cycleCountId", "createdAt");

-- AddForeignKey
ALTER TABLE "InventoryReservationLine" ADD CONSTRAINT "InventoryReservationLine_inventoryReservationId_fkey" FOREIGN KEY ("inventoryReservationId") REFERENCES "InventoryReservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReservationStatusHistory" ADD CONSTRAINT "InventoryReservationStatusHistory_inventoryReservationId_fkey" FOREIGN KEY ("inventoryReservationId") REFERENCES "InventoryReservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransferLine" ADD CONSTRAINT "StockTransferLine_stockTransferId_fkey" FOREIGN KEY ("stockTransferId") REFERENCES "StockTransfer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransferStatusHistory" ADD CONSTRAINT "StockTransferStatusHistory_stockTransferId_fkey" FOREIGN KEY ("stockTransferId") REFERENCES "StockTransfer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockIssueLine" ADD CONSTRAINT "StockIssueLine_stockIssueId_fkey" FOREIGN KEY ("stockIssueId") REFERENCES "StockIssue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockIssueStatusHistory" ADD CONSTRAINT "StockIssueStatusHistory_stockIssueId_fkey" FOREIGN KEY ("stockIssueId") REFERENCES "StockIssue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReturnLine" ADD CONSTRAINT "StockReturnLine_stockReturnId_fkey" FOREIGN KEY ("stockReturnId") REFERENCES "StockReturn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReturnLine" ADD CONSTRAINT "StockReturnLine_stockIssueLineId_fkey" FOREIGN KEY ("stockIssueLineId") REFERENCES "StockIssueLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustmentLine" ADD CONSTRAINT "StockAdjustmentLine_stockAdjustmentId_fkey" FOREIGN KEY ("stockAdjustmentId") REFERENCES "StockAdjustment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustmentStatusHistory" ADD CONSTRAINT "StockAdjustmentStatusHistory_stockAdjustmentId_fkey" FOREIGN KEY ("stockAdjustmentId") REFERENCES "StockAdjustment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CycleCountLine" ADD CONSTRAINT "CycleCountLine_cycleCountId_fkey" FOREIGN KEY ("cycleCountId") REFERENCES "CycleCount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CycleCountStatusHistory" ADD CONSTRAINT "CycleCountStatusHistory_cycleCountId_fkey" FOREIGN KEY ("cycleCountId") REFERENCES "CycleCount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
