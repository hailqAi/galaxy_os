-- CreateTable
CREATE TABLE "InstallationPlan" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "planNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plannedStartDate" TIMESTAMP(3),
    "plannedCompletionDate" TIMESTAMP(3),
    "siteReady" BOOLEAN NOT NULL DEFAULT false,
    "customerCoordination" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstallationPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstallationTeam" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "leadUserId" UUID,
    "activeStatus" TEXT NOT NULL DEFAULT 'active',

    CONSTRAINT "InstallationTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Installer" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "installationTeamId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" TEXT,
    "activeStatus" TEXT NOT NULL DEFAULT 'active',

    CONSTRAINT "Installer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subcontractor" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "phone" TEXT,
    "activeStatus" TEXT NOT NULL DEFAULT 'active',

    CONSTRAINT "Subcontractor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstallationWorkOrder" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "teamId" UUID,
    "workOrderNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "area" TEXT,
    "plannedDate" TIMESTAMP(3),
    "requiredInventory" BOOLEAN NOT NULL DEFAULT true,
    "approvedDrawing" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "overrideReason" TEXT,
    "overrideBy" UUID,
    "releasedBy" UUID,
    "releasedAt" TIMESTAMP(3),
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstallationWorkOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstallationChecklist" (
    "id" UUID NOT NULL,
    "installationWorkOrderId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "completedAt" TIMESTAMP(3),
    "completedBy" UUID,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InstallationChecklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstallationItem" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "installationWorkOrderId" UUID NOT NULL,
    "inventoryItemId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "variantId" UUID,
    "lotId" UUID,
    "serialId" UUID,
    "stockIssueLineId" UUID,
    "area" TEXT,
    "room" TEXT,
    "position" TEXT,
    "installedBy" UUID,
    "installedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PLANNED',

    CONSTRAINT "InstallationItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteDelivery" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "installationWorkOrderId" UUID NOT NULL,
    "deliveryDate" TIMESTAMP(3) NOT NULL,
    "vehicle" TEXT,
    "driverReference" TEXT,
    "recipient" TEXT NOT NULL,
    "evidenceFileId" UUID,
    "siteCondition" TEXT,
    "shortageNotes" TEXT,
    "damageNotes" TEXT,
    "items" JSONB NOT NULL,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteDailyLog" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "installationWorkOrderId" UUID NOT NULL,
    "logDate" TIMESTAMP(3) NOT NULL,
    "siteCondition" TEXT NOT NULL,
    "peopleOnsite" INTEGER NOT NULL,
    "workCompleted" TEXT NOT NULL,
    "materialUsed" TEXT,
    "issues" TEXT,
    "customerComments" TEXT,
    "nextPlan" TEXT,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteDailyLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteIssue" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "installationWorkOrderId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "ownerId" UUID,
    "dueDate" TIMESTAMP(3),
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PunchItem" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "installationWorkOrderId" UUID NOT NULL,
    "issue" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "ownerId" UUID,
    "dueDate" TIMESTAMP(3),
    "evidenceFileId" UUID,
    "resolution" TEXT,
    "resolvedBy" UUID,
    "verifiedBy" UUID,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PunchItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InstallationPlan_organizationId_projectId_status_idx" ON "InstallationPlan"("organizationId", "projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "InstallationPlan_organizationId_planNumber_key" ON "InstallationPlan"("organizationId", "planNumber");

-- CreateIndex
CREATE INDEX "InstallationTeam_organizationId_projectId_activeStatus_idx" ON "InstallationTeam"("organizationId", "projectId", "activeStatus");

-- CreateIndex
CREATE UNIQUE INDEX "InstallationTeam_planId_name_key" ON "InstallationTeam"("planId", "name");

-- CreateIndex
CREATE INDEX "Installer_organizationId_userId_activeStatus_idx" ON "Installer"("organizationId", "userId", "activeStatus");

-- CreateIndex
CREATE UNIQUE INDEX "Installer_installationTeamId_userId_key" ON "Installer"("installationTeamId", "userId");

-- CreateIndex
CREATE INDEX "Subcontractor_organizationId_projectId_activeStatus_idx" ON "Subcontractor"("organizationId", "projectId", "activeStatus");

-- CreateIndex
CREATE INDEX "InstallationWorkOrder_organizationId_projectId_status_idx" ON "InstallationWorkOrder"("organizationId", "projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "InstallationWorkOrder_organizationId_workOrderNumber_key" ON "InstallationWorkOrder"("organizationId", "workOrderNumber");

-- CreateIndex
CREATE INDEX "InstallationChecklist_installationWorkOrderId_position_idx" ON "InstallationChecklist"("installationWorkOrderId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "InstallationItem_stockIssueLineId_key" ON "InstallationItem"("stockIssueLineId");

-- CreateIndex
CREATE INDEX "InstallationItem_organizationId_projectId_status_idx" ON "InstallationItem"("organizationId", "projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "InstallationItem_installationWorkOrderId_inventoryItemId_se_key" ON "InstallationItem"("installationWorkOrderId", "inventoryItemId", "serialId");

-- CreateIndex
CREATE INDEX "SiteDelivery_organizationId_projectId_deliveryDate_idx" ON "SiteDelivery"("organizationId", "projectId", "deliveryDate");

-- CreateIndex
CREATE INDEX "SiteDailyLog_organizationId_projectId_logDate_idx" ON "SiteDailyLog"("organizationId", "projectId", "logDate");

-- CreateIndex
CREATE UNIQUE INDEX "SiteDailyLog_installationWorkOrderId_logDate_key" ON "SiteDailyLog"("installationWorkOrderId", "logDate");

-- CreateIndex
CREATE INDEX "SiteIssue_organizationId_projectId_status_severity_idx" ON "SiteIssue"("organizationId", "projectId", "status", "severity");

-- CreateIndex
CREATE INDEX "PunchItem_organizationId_projectId_status_severity_idx" ON "PunchItem"("organizationId", "projectId", "status", "severity");

-- AddForeignKey
ALTER TABLE "InstallationTeam" ADD CONSTRAINT "InstallationTeam_planId_fkey" FOREIGN KEY ("planId") REFERENCES "InstallationPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Installer" ADD CONSTRAINT "Installer_installationTeamId_fkey" FOREIGN KEY ("installationTeamId") REFERENCES "InstallationTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subcontractor" ADD CONSTRAINT "Subcontractor_planId_fkey" FOREIGN KEY ("planId") REFERENCES "InstallationPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallationWorkOrder" ADD CONSTRAINT "InstallationWorkOrder_planId_fkey" FOREIGN KEY ("planId") REFERENCES "InstallationPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallationWorkOrder" ADD CONSTRAINT "InstallationWorkOrder_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "InstallationTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallationChecklist" ADD CONSTRAINT "InstallationChecklist_installationWorkOrderId_fkey" FOREIGN KEY ("installationWorkOrderId") REFERENCES "InstallationWorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallationItem" ADD CONSTRAINT "InstallationItem_installationWorkOrderId_fkey" FOREIGN KEY ("installationWorkOrderId") REFERENCES "InstallationWorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteDelivery" ADD CONSTRAINT "SiteDelivery_installationWorkOrderId_fkey" FOREIGN KEY ("installationWorkOrderId") REFERENCES "InstallationWorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteDailyLog" ADD CONSTRAINT "SiteDailyLog_installationWorkOrderId_fkey" FOREIGN KEY ("installationWorkOrderId") REFERENCES "InstallationWorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteIssue" ADD CONSTRAINT "SiteIssue_installationWorkOrderId_fkey" FOREIGN KEY ("installationWorkOrderId") REFERENCES "InstallationWorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PunchItem" ADD CONSTRAINT "PunchItem_installationWorkOrderId_fkey" FOREIGN KEY ("installationWorkOrderId") REFERENCES "InstallationWorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
