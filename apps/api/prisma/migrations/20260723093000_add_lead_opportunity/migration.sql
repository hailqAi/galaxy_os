CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'ASSIGNED', 'CONTACTED', 'QUALIFIED', 'UNQUALIFIED', 'CONVERTED', 'ARCHIVED');
CREATE TYPE "WorkPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
CREATE TYPE "OpportunityStage" AS ENUM ('DISCOVERY', 'QUALIFICATION', 'SURVEY', 'REQUIREMENT', 'DESIGN_PREPARATION', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST');

CREATE TABLE "LeadSource" (
  "id" UUID NOT NULL, "organizationId" UUID NOT NULL, "code" TEXT NOT NULL, "name" TEXT NOT NULL,
  "status" "RecordStatus" NOT NULL DEFAULT 'active', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "LeadSource_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Lead" (
  "id" UUID NOT NULL, "organizationId" UUID NOT NULL, "name" TEXT NOT NULL, "companyName" TEXT, "contactName" TEXT,
  "phone" TEXT, "email" TEXT, "sourceId" UUID, "campaignId" UUID, "ownerId" UUID, "departmentId" UUID,
  "status" "LeadStatus" NOT NULL DEFAULT 'NEW', "priority" "WorkPriority" NOT NULL DEFAULT 'NORMAL',
  "estimatedValue" DECIMAL(20,2), "currency" TEXT NOT NULL DEFAULT 'VND', "expectedCloseDate" TIMESTAMP(3), "notes" TEXT,
  "convertedAt" TIMESTAMP(3), "convertedBy" UUID, "createdBy" UUID NOT NULL, "updatedBy" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3), "version" INTEGER NOT NULL DEFAULT 1, CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Opportunity" (
  "id" UUID NOT NULL, "organizationId" UUID NOT NULL, "leadId" UUID, "customerId" UUID, "primaryContactId" UUID,
  "name" TEXT NOT NULL, "ownerId" UUID, "departmentId" UUID, "stage" "OpportunityStage" NOT NULL DEFAULT 'DISCOVERY',
  "probability" INTEGER NOT NULL DEFAULT 10, "estimatedValue" DECIMAL(20,2), "currency" TEXT NOT NULL DEFAULT 'VND',
  "expectedCloseDate" TIMESTAMP(3), "lostReason" TEXT, "wonAt" TIMESTAMP(3), "lostAt" TIMESTAMP(3),
  "createdBy" UUID NOT NULL, "updatedBy" UUID NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, "deletedAt" TIMESTAMP(3), "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LeadSource_organizationId_status_idx" ON "LeadSource"("organizationId", "status");
CREATE UNIQUE INDEX "LeadSource_organizationId_code_key" ON "LeadSource"("organizationId", "code");
CREATE INDEX "Lead_organizationId_status_deletedAt_idx" ON "Lead"("organizationId", "status", "deletedAt");
CREATE INDEX "Lead_organizationId_ownerId_idx" ON "Lead"("organizationId", "ownerId");
CREATE INDEX "Lead_organizationId_departmentId_idx" ON "Lead"("organizationId", "departmentId");
CREATE INDEX "Lead_organizationId_sourceId_idx" ON "Lead"("organizationId", "sourceId");
CREATE UNIQUE INDEX "Opportunity_leadId_key" ON "Opportunity"("leadId");
CREATE INDEX "Opportunity_organizationId_stage_deletedAt_idx" ON "Opportunity"("organizationId", "stage", "deletedAt");
CREATE INDEX "Opportunity_organizationId_ownerId_idx" ON "Opportunity"("organizationId", "ownerId");
CREATE INDEX "Opportunity_organizationId_customerId_idx" ON "Opportunity"("organizationId", "customerId");

ALTER TABLE "LeadSource" ADD CONSTRAINT "LeadSource_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "LeadSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_convertedBy_fkey" FOREIGN KEY ("convertedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_primaryContactId_fkey" FOREIGN KEY ("primaryContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
