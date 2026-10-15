CREATE TYPE "ProjectLocationType" AS ENUM ('BUILDING', 'FLOOR', 'ZONE', 'ROOM', 'AREA');
CREATE TYPE "ProjectProductApprovalType" AS ENUM ('CUSTOMER', 'TECHNICAL', 'COMMERCIAL');
CREATE TYPE "ProjectProductApprovalStatus" AS ENUM ('NOT_REQUIRED', 'DRAFT', 'PENDING', 'APPROVED', 'APPROVED_WITH_COMMENTS', 'REJECTED', 'SUPERSEDED');
CREATE TYPE "ProjectProductLifecycle" AS ENUM ('REQUIREMENT', 'SHORTLISTING', 'CLIENT_REVIEW', 'CLIENT_APPROVED', 'TECHNICAL_REVIEW', 'COMMERCIAL_REVIEW', 'READY_FOR_ESTIMATE', 'ESTIMATED', 'QUOTED', 'CONTRACTED', 'READY_TO_ORDER', 'ORDERED', 'IN_PRODUCTION', 'READY_TO_SHIP', 'IN_TRANSIT', 'WAREHOUSE_RECEIVED', 'READY_FOR_INSTALLATION', 'INSTALLED', 'ACCEPTED', 'HANDED_OVER', 'UNDER_WARRANTY', 'CLOSED', 'CANCELLED');

CREATE TABLE "ProjectLocation" (
  "id" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "parentId" UUID,
  "type" "ProjectLocationType" NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectLocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectProductLine" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "locationId" UUID,
  "code" TEXT NOT NULL,
  "positionName" TEXT,
  "currentRevision" INTEGER NOT NULL DEFAULT 1,
  "lifecycleStatus" "ProjectProductLifecycle" NOT NULL DEFAULT 'SHORTLISTING',
  "blocker" TEXT,
  "nextAction" TEXT,
  "createdBy" UUID NOT NULL,
  "updatedBy" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "ProjectProductLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectProductRevision" (
  "id" UUID NOT NULL,
  "productLineId" UUID NOT NULL,
  "revision" INTEGER NOT NULL,
  "productId" UUID,
  "variantId" UUID,
  "supplierId" UUID,
  "customProductName" TEXT,
  "customDescription" TEXT,
  "material" TEXT,
  "finish" TEXT,
  "color" TEXT,
  "width" DECIMAL(20,3),
  "depth" DECIMAL(20,3),
  "height" DECIMAL(20,3),
  "length" DECIMAL(20,3),
  "diameter" DECIMAL(20,3),
  "dimensionUnit" TEXT,
  "customDimensionNote" TEXT,
  "quantity" DECIMAL(20,3) NOT NULL,
  "unit" TEXT NOT NULL,
  "countryOfOrigin" TEXT,
  "factoryName" TEXT,
  "customerApprovalStatus" "ProjectProductApprovalStatus" NOT NULL DEFAULT 'DRAFT',
  "technicalApprovalStatus" "ProjectProductApprovalStatus" NOT NULL DEFAULT 'DRAFT',
  "commercialApprovalStatus" "ProjectProductApprovalStatus" NOT NULL DEFAULT 'DRAFT',
  "customerApprovalDueAt" TIMESTAMP(3),
  "technicalApprovalDueAt" TIMESTAMP(3),
  "commercialApprovalDueAt" TIMESTAMP(3),
  "lockedAt" TIMESTAMP(3),
  "createdBy" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectProductRevision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectProductApproval" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "productLineId" UUID NOT NULL,
  "revisionId" UUID NOT NULL,
  "type" "ProjectProductApprovalType" NOT NULL,
  "status" "ProjectProductApprovalStatus" NOT NULL,
  "submittedBy" UUID,
  "submittedAt" TIMESTAMP(3),
  "decidedBy" UUID,
  "decidedAt" TIMESTAMP(3),
  "approvedByExternalName" TEXT,
  "approvalMethod" TEXT,
  "evidenceFileAssetId" UUID,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectProductApproval_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectRequiredDocument" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "stageKey" TEXT NOT NULL,
  "workstreamKey" TEXT NOT NULL,
  "documentType" TEXT NOT NULL,
  "documentName" TEXT NOT NULL,
  "required" BOOLEAN NOT NULL DEFAULT true,
  "status" TEXT NOT NULL DEFAULT 'MISSING',
  "ownerUserId" UUID,
  "ownerRole" TEXT,
  "dueDate" TIMESTAMP(3),
  "currentFileAssetId" UUID,
  "currentVersion" INTEGER NOT NULL DEFAULT 0,
  "approvedAt" TIMESTAMP(3),
  "approvedBy" UUID,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectRequiredDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectLocation_projectId_code_key" ON "ProjectLocation"("projectId", "code");
CREATE INDEX "ProjectLocation_projectId_parentId_active_sortOrder_idx" ON "ProjectLocation"("projectId", "parentId", "active", "sortOrder");
CREATE UNIQUE INDEX "ProjectProductLine_projectId_code_key" ON "ProjectProductLine"("projectId", "code");
CREATE INDEX "ProjectProductLine_organizationId_projectId_lifecycleStatus_deletedAt_idx" ON "ProjectProductLine"("organizationId", "projectId", "lifecycleStatus", "deletedAt");
CREATE INDEX "ProjectProductLine_projectId_locationId_idx" ON "ProjectProductLine"("projectId", "locationId");
CREATE UNIQUE INDEX "ProjectProductRevision_productLineId_revision_key" ON "ProjectProductRevision"("productLineId", "revision");
CREATE INDEX "ProjectProductRevision_productId_variantId_idx" ON "ProjectProductRevision"("productId", "variantId");
CREATE INDEX "ProjectProductRevision_supplierId_idx" ON "ProjectProductRevision"("supplierId");
CREATE INDEX "ProjectProductApproval_organizationId_projectId_type_status_idx" ON "ProjectProductApproval"("organizationId", "projectId", "type", "status");
CREATE INDEX "ProjectProductApproval_productLineId_revisionId_createdAt_idx" ON "ProjectProductApproval"("productLineId", "revisionId", "createdAt");
CREATE UNIQUE INDEX "ProjectRequiredDocument_projectId_stageKey_workstreamKey_documentType_key" ON "ProjectRequiredDocument"("projectId", "stageKey", "workstreamKey", "documentType");
CREATE INDEX "ProjectRequiredDocument_organizationId_projectId_stageKey_status_idx" ON "ProjectRequiredDocument"("organizationId", "projectId", "stageKey", "status");

ALTER TABLE "ProjectLocation" ADD CONSTRAINT "ProjectLocation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectLocation" ADD CONSTRAINT "ProjectLocation_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ProjectLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectProductLine" ADD CONSTRAINT "ProjectProductLine_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectProductLine" ADD CONSTRAINT "ProjectProductLine_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "ProjectLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectProductRevision" ADD CONSTRAINT "ProjectProductRevision_productLineId_fkey" FOREIGN KEY ("productLineId") REFERENCES "ProjectProductLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectProductRevision" ADD CONSTRAINT "ProjectProductRevision_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectProductRevision" ADD CONSTRAINT "ProjectProductRevision_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectProductRevision" ADD CONSTRAINT "ProjectProductRevision_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectProductApproval" ADD CONSTRAINT "ProjectProductApproval_productLineId_fkey" FOREIGN KEY ("productLineId") REFERENCES "ProjectProductLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectProductApproval" ADD CONSTRAINT "ProjectProductApproval_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "ProjectProductRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectRequiredDocument" ADD CONSTRAINT "ProjectRequiredDocument_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
