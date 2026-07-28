-- CreateTable
CREATE TABLE "PurchaseRequest" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "requestNumber" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" UUID,
    "requestedById" UUID NOT NULL,
    "departmentId" UUID,
    "requiredDate" TIMESTAMP(3),
    "priority" "WorkPriority" NOT NULL DEFAULT 'NORMAL',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdBy" UUID NOT NULL,
    "updatedBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "PurchaseRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseRequestLine" (
    "id" UUID NOT NULL,
    "purchaseRequestId" UUID NOT NULL,
    "productId" UUID,
    "variantId" UUID,
    "customDescription" TEXT,
    "quantity" DECIMAL(20,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "preferredSupplierId" UUID,
    "targetPrice" DECIMAL(20,2),
    "currency" TEXT NOT NULL,
    "requiredDate" TIMESTAMP(3),
    "projectArea" TEXT,
    "technicalRequirements" TEXT,
    "notes" TEXT,
    "orderedQuantity" DECIMAL(20,3) NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PurchaseRequestLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseRequestApproval" (
    "id" UUID NOT NULL,
    "purchaseRequestId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "decision" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseRequestApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseRequestStatusHistory" (
    "id" UUID NOT NULL,
    "purchaseRequestId" UUID NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "actorId" UUID NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseRequestStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PurchaseRequest_organizationId_projectId_status_deletedAt_idx" ON "PurchaseRequest"("organizationId", "projectId", "status", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseRequest_organizationId_requestNumber_key" ON "PurchaseRequest"("organizationId", "requestNumber");

-- CreateIndex
CREATE INDEX "PurchaseRequestLine_purchaseRequestId_position_idx" ON "PurchaseRequestLine"("purchaseRequestId", "position");

-- CreateIndex
CREATE INDEX "PurchaseRequestApproval_purchaseRequestId_createdAt_idx" ON "PurchaseRequestApproval"("purchaseRequestId", "createdAt");

-- CreateIndex
CREATE INDEX "PurchaseRequestStatusHistory_purchaseRequestId_createdAt_idx" ON "PurchaseRequestStatusHistory"("purchaseRequestId", "createdAt");

-- AddForeignKey
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequestLine" ADD CONSTRAINT "PurchaseRequestLine_purchaseRequestId_fkey" FOREIGN KEY ("purchaseRequestId") REFERENCES "PurchaseRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequestApproval" ADD CONSTRAINT "PurchaseRequestApproval_purchaseRequestId_fkey" FOREIGN KEY ("purchaseRequestId") REFERENCES "PurchaseRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequestStatusHistory" ADD CONSTRAINT "PurchaseRequestStatusHistory_purchaseRequestId_fkey" FOREIGN KEY ("purchaseRequestId") REFERENCES "PurchaseRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
