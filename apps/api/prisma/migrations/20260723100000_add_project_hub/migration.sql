CREATE TYPE "ProjectStatus" AS ENUM ('PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED');
CREATE TYPE "ProjectPhase" AS ENUM ('SURVEY', 'REQUIREMENT', 'DESIGN', 'PRODUCT_SELECTION', 'QUOTATION', 'CONTRACT', 'PROCUREMENT', 'PRODUCTION', 'SHIPPING', 'INSTALLATION', 'INSPECTION', 'HANDOVER', 'WARRANTY', 'AFTER_SALES');
CREATE TYPE "ProjectHealth" AS ENUM ('ON_TRACK', 'AT_RISK', 'OFF_TRACK');
CREATE TYPE "Confidentiality" AS ENUM ('INTERNAL', 'RESTRICTED', 'CONFIDENTIAL');

CREATE TABLE "Project" (
  "id" UUID NOT NULL, "organizationId" UUID NOT NULL, "opportunityId" UUID, "code" TEXT NOT NULL, "name" TEXT NOT NULL,
  "customerId" UUID NOT NULL, "primaryContactId" UUID, "projectType" TEXT, "propertyType" TEXT, "location" TEXT, "address" TEXT,
  "projectOwnerId" UUID, "salesOwnerId" UUID, "designOwnerId" UUID, "projectManagerId" UUID, "startDate" TIMESTAMP(3),
  "expectedCompletionDate" TIMESTAMP(3), "actualCompletionDate" TIMESTAMP(3), "status" "ProjectStatus" NOT NULL DEFAULT 'PLANNING',
  "phase" "ProjectPhase" NOT NULL DEFAULT 'SURVEY', "priority" "WorkPriority" NOT NULL DEFAULT 'NORMAL',
  "estimatedValue" DECIMAL(20,2), "contractedValue" DECIMAL(20,2), "currency" TEXT NOT NULL DEFAULT 'VND', "description" TEXT,
  "confidentiality" "Confidentiality" NOT NULL DEFAULT 'INTERNAL', "healthStatus" "ProjectHealth" NOT NULL DEFAULT 'ON_TRACK',
  "progressPercentage" INTEGER NOT NULL DEFAULT 0, "createdBy" UUID NOT NULL, "updatedBy" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, "deletedAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1, CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ProjectMember" (
  "id" UUID NOT NULL, "organizationId" UUID NOT NULL, "projectId" UUID NOT NULL, "userId" UUID NOT NULL,
  "role" TEXT, "createdBy" UUID NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ProjectDepartment" (
  "id" UUID NOT NULL, "organizationId" UUID NOT NULL, "projectId" UUID NOT NULL, "departmentId" UUID NOT NULL,
  "createdBy" UUID NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectDepartment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Project_opportunityId_key" ON "Project"("opportunityId");
CREATE INDEX "Project_organizationId_status_phase_deletedAt_idx" ON "Project"("organizationId", "status", "phase", "deletedAt");
CREATE INDEX "Project_organizationId_customerId_idx" ON "Project"("organizationId", "customerId");
CREATE INDEX "Project_organizationId_projectManagerId_idx" ON "Project"("organizationId", "projectManagerId");
CREATE UNIQUE INDEX "Project_organizationId_code_key" ON "Project"("organizationId", "code");
CREATE INDEX "ProjectMember_organizationId_userId_idx" ON "ProjectMember"("organizationId", "userId");
CREATE UNIQUE INDEX "ProjectMember_projectId_userId_key" ON "ProjectMember"("projectId", "userId");
CREATE INDEX "ProjectDepartment_organizationId_departmentId_idx" ON "ProjectDepartment"("organizationId", "departmentId");
CREATE UNIQUE INDEX "ProjectDepartment_projectId_departmentId_key" ON "ProjectDepartment"("projectId", "departmentId");
ALTER TABLE "Project" ADD CONSTRAINT "Project_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_primaryContactId_fkey" FOREIGN KEY ("primaryContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_projectOwnerId_fkey" FOREIGN KEY ("projectOwnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_salesOwnerId_fkey" FOREIGN KEY ("salesOwnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_designOwnerId_fkey" FOREIGN KEY ("designOwnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_projectManagerId_fkey" FOREIGN KEY ("projectManagerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectDepartment" ADD CONSTRAINT "ProjectDepartment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectDepartment" ADD CONSTRAINT "ProjectDepartment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectDepartment" ADD CONSTRAINT "ProjectDepartment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
