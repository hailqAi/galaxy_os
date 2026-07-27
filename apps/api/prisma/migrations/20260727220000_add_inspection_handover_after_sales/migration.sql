-- CreateTable
CREATE TABLE "Inspection" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "inspectionNumber" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Inspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionItem" (
    "id" UUID NOT NULL,
    "inspectionId" UUID NOT NULL,
    "installationItemId" UUID,
    "scope" TEXT NOT NULL,
    "result" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "evidenceFileId" UUID,

    CONSTRAINT "InspectionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcceptanceRecord" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "inspectionId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "signedDocumentId" UUID,
    "acceptedAt" TIMESTAMP(3),
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcceptanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcceptanceParticipant" (
    "id" UUID NOT NULL,
    "acceptanceRecordId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "signingStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "signedAt" TIMESTAMP(3),

    CONSTRAINT "AcceptanceParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Handover" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "handoverNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdBy" UUID NOT NULL,
    "completedBy" UUID,
    "overrideReason" TEXT,
    "overrideBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Handover_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HandoverItem" (
    "id" UUID NOT NULL,
    "handoverId" UUID NOT NULL,
    "installationItemId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "variantId" UUID,
    "inventoryLotId" UUID,
    "inventorySerialId" UUID,
    "description" TEXT NOT NULL,

    CONSTRAINT "HandoverItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HandoverChecklist" (
    "id" UUID NOT NULL,
    "handoverId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "completedAt" TIMESTAMP(3),
    "completedBy" UUID,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "HandoverChecklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HandoverDocument" (
    "id" UUID NOT NULL,
    "handoverId" UUID NOT NULL,
    "fileAssetId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HandoverDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HandoverStatusHistory" (
    "id" UUID NOT NULL,
    "handoverId" UUID NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "actorId" UUID NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HandoverStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarrantyPolicy" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "warrantyMonths" INTEGER NOT NULL,
    "startRule" TEXT NOT NULL,
    "terms" TEXT,
    "activeStatus" TEXT NOT NULL DEFAULT 'active',
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WarrantyPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarrantyAsset" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "variantId" UUID,
    "inventorySerialId" UUID,
    "inventoryLotId" UUID,
    "supplierId" UUID,
    "purchaseOrderId" UUID,
    "installationItemId" UUID NOT NULL,
    "handoverItemId" UUID NOT NULL,
    "installationDate" TIMESTAMP(3),
    "handoverDate" TIMESTAMP(3) NOT NULL,
    "warrantyStart" TIMESTAMP(3) NOT NULL,
    "warrantyEnd" TIMESTAMP(3) NOT NULL,
    "warrantyMonths" INTEGER NOT NULL,
    "policySnapshot" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WarrantyAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarrantyRegistration" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "warrantyAssetId" UUID NOT NULL,
    "source" TEXT NOT NULL,
    "registeredBy" UUID NOT NULL,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "WarrantyRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceTicket" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "ticketNumber" TEXT NOT NULL,
    "customerId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "warrantyAssetId" UUID,
    "issueCategory" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT NOT NULL,
    "assignedUserId" UUID,
    "slaDueAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "chargeable" BOOLEAN NOT NULL DEFAULT false,
    "estimatedCost" DECIMAL(20,2),
    "actualCost" DECIMAL(20,2),
    "resolution" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarrantyClaim" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "serviceTicketId" UUID NOT NULL,
    "supplierId" UUID,
    "purchaseOrderId" UUID,
    "decision" TEXT NOT NULL DEFAULT 'PENDING',
    "goodwill" BOOLEAN NOT NULL DEFAULT false,
    "approvedBy" UUID,
    "notes" TEXT,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WarrantyClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceVisit" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "serviceTicketId" UUID NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "technicianId" UUID,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "findings" TEXT,
    "evidenceFileId" UUID,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ServiceVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServicePart" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "serviceTicketId" UUID NOT NULL,
    "inventoryReservationLineId" UUID,
    "stockIssueLineId" UUID,
    "stockReturnLineId" UUID,
    "inventoryItemId" UUID NOT NULL,
    "quantity" DECIMAL(20,3) NOT NULL,
    "purpose" TEXT NOT NULL,

    CONSTRAINT "ServicePart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceResolution" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "serviceTicketId" UUID NOT NULL,
    "summary" TEXT NOT NULL,
    "evidenceFileId" UUID,
    "resolvedBy" UUID NOT NULL,
    "resolvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceResolution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerConfirmation" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "serviceTicketId" UUID NOT NULL,
    "customerName" TEXT NOT NULL,
    "confirmed" BOOLEAN NOT NULL,
    "comments" TEXT,
    "documentId" UUID,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerConfirmation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Inspection_organizationId_projectId_status_idx" ON "Inspection"("organizationId", "projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Inspection_organizationId_inspectionNumber_key" ON "Inspection"("organizationId", "inspectionNumber");

-- CreateIndex
CREATE INDEX "InspectionItem_inspectionId_result_idx" ON "InspectionItem"("inspectionId", "result");

-- CreateIndex
CREATE INDEX "AcceptanceRecord_organizationId_projectId_status_idx" ON "AcceptanceRecord"("organizationId", "projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AcceptanceRecord_inspectionId_key" ON "AcceptanceRecord"("inspectionId");

-- CreateIndex
CREATE UNIQUE INDEX "AcceptanceParticipant_acceptanceRecordId_name_role_key" ON "AcceptanceParticipant"("acceptanceRecordId", "name", "role");

-- CreateIndex
CREATE INDEX "Handover_organizationId_projectId_status_idx" ON "Handover"("organizationId", "projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Handover_organizationId_handoverNumber_key" ON "Handover"("organizationId", "handoverNumber");

-- CreateIndex
CREATE UNIQUE INDEX "HandoverItem_installationItemId_key" ON "HandoverItem"("installationItemId");

-- CreateIndex
CREATE INDEX "HandoverItem_handoverId_idx" ON "HandoverItem"("handoverId");

-- CreateIndex
CREATE INDEX "HandoverChecklist_handoverId_position_idx" ON "HandoverChecklist"("handoverId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "HandoverDocument_handoverId_type_version_key" ON "HandoverDocument"("handoverId", "type", "version");

-- CreateIndex
CREATE INDEX "HandoverStatusHistory_handoverId_createdAt_idx" ON "HandoverStatusHistory"("handoverId", "createdAt");

-- CreateIndex
CREATE INDEX "WarrantyPolicy_organizationId_activeStatus_idx" ON "WarrantyPolicy"("organizationId", "activeStatus");

-- CreateIndex
CREATE UNIQUE INDEX "WarrantyPolicy_organizationId_name_version_key" ON "WarrantyPolicy"("organizationId", "name", "version");

-- CreateIndex
CREATE UNIQUE INDEX "WarrantyAsset_inventorySerialId_key" ON "WarrantyAsset"("inventorySerialId");

-- CreateIndex
CREATE UNIQUE INDEX "WarrantyAsset_installationItemId_key" ON "WarrantyAsset"("installationItemId");

-- CreateIndex
CREATE UNIQUE INDEX "WarrantyAsset_handoverItemId_key" ON "WarrantyAsset"("handoverItemId");

-- CreateIndex
CREATE INDEX "WarrantyAsset_organizationId_projectId_customerId_status_idx" ON "WarrantyAsset"("organizationId", "projectId", "customerId", "status");

-- CreateIndex
CREATE INDEX "WarrantyAsset_organizationId_warrantyEnd_idx" ON "WarrantyAsset"("organizationId", "warrantyEnd");

-- CreateIndex
CREATE UNIQUE INDEX "WarrantyRegistration_warrantyAssetId_source_key" ON "WarrantyRegistration"("warrantyAssetId", "source");

-- CreateIndex
CREATE INDEX "ServiceTicket_organizationId_projectId_customerId_status_pr_idx" ON "ServiceTicket"("organizationId", "projectId", "customerId", "status", "priority");

-- CreateIndex
CREATE INDEX "ServiceTicket_organizationId_slaDueAt_status_idx" ON "ServiceTicket"("organizationId", "slaDueAt", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceTicket_organizationId_ticketNumber_key" ON "ServiceTicket"("organizationId", "ticketNumber");

-- CreateIndex
CREATE INDEX "WarrantyClaim_organizationId_serviceTicketId_decision_idx" ON "WarrantyClaim"("organizationId", "serviceTicketId", "decision");

-- CreateIndex
CREATE INDEX "ServiceVisit_organizationId_scheduledAt_status_idx" ON "ServiceVisit"("organizationId", "scheduledAt", "status");

-- CreateIndex
CREATE INDEX "ServicePart_organizationId_serviceTicketId_idx" ON "ServicePart"("organizationId", "serviceTicketId");

-- CreateIndex
CREATE INDEX "ServiceResolution_organizationId_serviceTicketId_idx" ON "ServiceResolution"("organizationId", "serviceTicketId");

-- CreateIndex
CREATE INDEX "CustomerConfirmation_organizationId_serviceTicketId_confirm_idx" ON "CustomerConfirmation"("organizationId", "serviceTicketId", "confirmed");

-- AddForeignKey
ALTER TABLE "InspectionItem" ADD CONSTRAINT "InspectionItem_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcceptanceRecord" ADD CONSTRAINT "AcceptanceRecord_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcceptanceParticipant" ADD CONSTRAINT "AcceptanceParticipant_acceptanceRecordId_fkey" FOREIGN KEY ("acceptanceRecordId") REFERENCES "AcceptanceRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandoverItem" ADD CONSTRAINT "HandoverItem_handoverId_fkey" FOREIGN KEY ("handoverId") REFERENCES "Handover"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandoverChecklist" ADD CONSTRAINT "HandoverChecklist_handoverId_fkey" FOREIGN KEY ("handoverId") REFERENCES "Handover"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandoverDocument" ADD CONSTRAINT "HandoverDocument_handoverId_fkey" FOREIGN KEY ("handoverId") REFERENCES "Handover"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandoverStatusHistory" ADD CONSTRAINT "HandoverStatusHistory_handoverId_fkey" FOREIGN KEY ("handoverId") REFERENCES "Handover"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyAsset" ADD CONSTRAINT "WarrantyAsset_handoverItemId_fkey" FOREIGN KEY ("handoverItemId") REFERENCES "HandoverItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyRegistration" ADD CONSTRAINT "WarrantyRegistration_warrantyAssetId_fkey" FOREIGN KEY ("warrantyAssetId") REFERENCES "WarrantyAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceTicket" ADD CONSTRAINT "ServiceTicket_warrantyAssetId_fkey" FOREIGN KEY ("warrantyAssetId") REFERENCES "WarrantyAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyClaim" ADD CONSTRAINT "WarrantyClaim_serviceTicketId_fkey" FOREIGN KEY ("serviceTicketId") REFERENCES "ServiceTicket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceVisit" ADD CONSTRAINT "ServiceVisit_serviceTicketId_fkey" FOREIGN KEY ("serviceTicketId") REFERENCES "ServiceTicket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicePart" ADD CONSTRAINT "ServicePart_serviceTicketId_fkey" FOREIGN KEY ("serviceTicketId") REFERENCES "ServiceTicket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceResolution" ADD CONSTRAINT "ServiceResolution_serviceTicketId_fkey" FOREIGN KEY ("serviceTicketId") REFERENCES "ServiceTicket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerConfirmation" ADD CONSTRAINT "CustomerConfirmation_serviceTicketId_fkey" FOREIGN KEY ("serviceTicketId") REFERENCES "ServiceTicket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
