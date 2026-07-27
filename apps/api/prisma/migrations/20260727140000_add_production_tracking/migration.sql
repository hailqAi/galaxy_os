-- CreateTable
CREATE TABLE "ProductionOrder" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "purchaseOrderId" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "plannedStartDate" TIMESTAMP(3),
    "actualStartDate" TIMESTAMP(3),
    "plannedReadyDate" TIMESTAMP(3),
    "actualReadyDate" TIMESTAMP(3),
    "progressPercentage" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ORDER_CONFIRMED',
    "delayReason" TEXT,
    "ownerId" UUID NOT NULL,
    "supplierContactId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionMilestone" (
    "id" UUID NOT NULL,
    "productionOrderId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "plannedDate" TIMESTAMP(3),
    "actualDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "required" BOOLEAN NOT NULL DEFAULT true,
    "evidenceFileId" UUID,
    "factoryReport" TEXT,
    "delayReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionUpdate" (
    "id" UUID NOT NULL,
    "productionOrderId" UUID NOT NULL,
    "progressPercentage" DECIMAL(5,2) NOT NULL,
    "summary" TEXT NOT NULL,
    "reportedAt" TIMESTAMP(3) NOT NULL,
    "reportedBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TechnicalApproval" (
    "id" UUID NOT NULL,
    "productionOrderId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "currentRevision" INTEGER NOT NULL DEFAULT 1,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TechnicalApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TechnicalApprovalRevision" (
    "id" UUID NOT NULL,
    "technicalApprovalId" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "fileId" UUID,
    "decision" TEXT,
    "comment" TEXT,
    "submittedBy" UUID NOT NULL,
    "decidedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "TechnicalApprovalRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SampleApproval" (
    "id" UUID NOT NULL,
    "productionOrderId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "fileId" UUID,
    "submittedBy" UUID NOT NULL,
    "decidedBy" UUID,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "SampleApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QualityReport" (
    "id" UUID NOT NULL,
    "productionOrderId" UUID NOT NULL,
    "reportNumber" TEXT NOT NULL,
    "inspectionDate" TIMESTAMP(3) NOT NULL,
    "result" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "fileId" UUID,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QualityReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackingRecord" (
    "id" UUID NOT NULL,
    "productionOrderId" UUID NOT NULL,
    "packingNumber" TEXT NOT NULL,
    "packageCount" INTEGER NOT NULL,
    "grossWeight" DECIMAL(20,3),
    "volume" DECIMAL(20,3),
    "packedAt" TIMESTAMP(3) NOT NULL,
    "fileId" UUID,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PackingRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionStatusHistory" (
    "id" UUID NOT NULL,
    "productionOrderId" UUID NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "actorId" UUID NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductionOrder_purchaseOrderId_key" ON "ProductionOrder"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "ProductionOrder_organizationId_projectId_supplierId_status_idx" ON "ProductionOrder"("organizationId", "projectId", "supplierId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionMilestone_productionOrderId_sequence_key" ON "ProductionMilestone"("productionOrderId", "sequence");

-- CreateIndex
CREATE INDEX "ProductionUpdate_productionOrderId_reportedAt_idx" ON "ProductionUpdate"("productionOrderId", "reportedAt");

-- CreateIndex
CREATE INDEX "TechnicalApproval_productionOrderId_status_idx" ON "TechnicalApproval"("productionOrderId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TechnicalApprovalRevision_technicalApprovalId_revision_key" ON "TechnicalApprovalRevision"("technicalApprovalId", "revision");

-- CreateIndex
CREATE INDEX "SampleApproval_productionOrderId_status_idx" ON "SampleApproval"("productionOrderId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "QualityReport_productionOrderId_reportNumber_key" ON "QualityReport"("productionOrderId", "reportNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PackingRecord_productionOrderId_packingNumber_key" ON "PackingRecord"("productionOrderId", "packingNumber");

-- CreateIndex
CREATE INDEX "ProductionStatusHistory_productionOrderId_createdAt_idx" ON "ProductionStatusHistory"("productionOrderId", "createdAt");

-- AddForeignKey
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionMilestone" ADD CONSTRAINT "ProductionMilestone_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionUpdate" ADD CONSTRAINT "ProductionUpdate_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnicalApproval" ADD CONSTRAINT "TechnicalApproval_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnicalApprovalRevision" ADD CONSTRAINT "TechnicalApprovalRevision_technicalApprovalId_fkey" FOREIGN KEY ("technicalApprovalId") REFERENCES "TechnicalApproval"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SampleApproval" ADD CONSTRAINT "SampleApproval_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityReport" ADD CONSTRAINT "QualityReport_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackingRecord" ADD CONSTRAINT "PackingRecord_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionStatusHistory" ADD CONSTRAINT "ProductionStatusHistory_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
