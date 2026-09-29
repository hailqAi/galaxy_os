-- AlterTable
ALTER TABLE "HandoverDocument" ADD COLUMN     "language" TEXT NOT NULL DEFAULT 'VI',
ADD COLUMN     "organizationId" UUID,
ADD COLUMN     "projectId" UUID,
ADD COLUMN     "signedAt" TIMESTAMP(3),
ADD COLUMN     "signedStatus" TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
ADD COLUMN     "supersededBy" UUID,
ADD COLUMN     "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "uploadedBy" UUID;

-- AlterTable
ALTER TABLE "ServiceVisit" ADD COLUMN     "actualEnd" TIMESTAMP(3),
ADD COLUMN     "actualStart" TIMESTAMP(3),
ADD COLUMN     "contactName" TEXT,
ADD COLUMN     "contactPhone" TEXT,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdBy" UUID,
ADD COLUMN     "customerId" UUID,
ADD COLUMN     "customerNotes" TEXT,
ADD COLUMN     "diagnosis" TEXT,
ADD COLUMN     "followUpDate" TIMESTAMP(3),
ADD COLUMN     "followUpRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "projectId" UUID,
ADD COLUMN     "scheduledEnd" TIMESTAMP(3),
ADD COLUMN     "technicianNotes" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "updatedBy" UUID,
ADD COLUMN     "visitType" TEXT NOT NULL DEFAULT 'INSPECTION',
ADD COLUMN     "workPerformed" TEXT;

-- AlterTable
ALTER TABLE "WarrantyClaim" ADD COLUMN     "actualCost" DECIMAL(20,2),
ADD COLUMN     "approvedAmount" DECIMAL(20,2),
ADD COLUMN     "claimNumber" TEXT,
ADD COLUMN     "claimType" TEXT NOT NULL DEFAULT 'CUSTOMER_WARRANTY',
ADD COLUMN     "coverageDecision" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'VND',
ADD COLUMN     "customerId" UUID,
ADD COLUMN     "decisionDate" TIMESTAMP(3),
ADD COLUMN     "diagnosis" TEXT,
ADD COLUMN     "estimatedCost" DECIMAL(20,2),
ADD COLUMN     "inventoryLotId" UUID,
ADD COLUMN     "inventorySerialId" UUID,
ADD COLUMN     "issueDescription" TEXT,
ADD COLUMN     "productId" UUID,
ADD COLUMN     "projectId" UUID,
ADD COLUMN     "resolution" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "submissionMode" TEXT NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "submittedDate" TIMESTAMP(3),
ADD COLUMN     "supplierReference" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "updatedBy" UUID,
ADD COLUMN     "variantId" UUID,
ADD COLUMN     "warrantyAssetId" UUID;

-- CreateTable
CREATE TABLE "WarrantyReplacement" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "serviceTicketId" UUID NOT NULL,
    "warrantyClaimId" UUID NOT NULL,
    "originalWarrantyAssetId" UUID NOT NULL,
    "replacementProductId" UUID NOT NULL,
    "replacementVariantId" UUID,
    "replacementSerialId" UUID,
    "reservationId" UUID,
    "stockIssueId" UUID,
    "defectiveReturnId" UUID,
    "serviceVisitId" UUID,
    "replacementWarrantyAssetId" UUID,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "warrantyDecision" TEXT NOT NULL,
    "approvedBy" UUID,
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WarrantyReplacement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WarrantyReplacement_warrantyClaimId_key" ON "WarrantyReplacement"("warrantyClaimId");

-- CreateIndex
CREATE INDEX "WarrantyReplacement_organizationId_projectId_status_idx" ON "WarrantyReplacement"("organizationId", "projectId", "status");

-- CreateIndex
CREATE INDEX "WarrantyReplacement_serviceTicketId_idx" ON "WarrantyReplacement"("serviceTicketId");

-- CreateIndex
CREATE INDEX "HandoverDocument_organizationId_projectId_type_idx" ON "HandoverDocument"("organizationId", "projectId", "type");

-- CreateIndex
CREATE INDEX "ServiceVisit_organizationId_projectId_technicianId_status_idx" ON "ServiceVisit"("organizationId", "projectId", "technicianId", "status");

-- CreateIndex
CREATE INDEX "WarrantyClaim_organizationId_projectId_status_idx" ON "WarrantyClaim"("organizationId", "projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WarrantyClaim_organizationId_claimNumber_key" ON "WarrantyClaim"("organizationId", "claimNumber");
