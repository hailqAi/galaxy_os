ALTER TABLE "EstimateLineItem"
  ADD COLUMN "contributesToTotal" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "priceQuotedAt" TIMESTAMP(3),
  ADD COLUMN "priceSourceType" TEXT,
  ADD COLUMN "priceStatus" TEXT NOT NULL DEFAULT 'PROVISIONAL',
  ADD COLUMN "priceValidUntil" TIMESTAMP(3),
  ADD COLUMN "purchaseQuantity" DECIMAL(20,3);

UPDATE "EstimateLineItem"
SET "purchaseQuantity" = "quantity"
WHERE "purchaseQuantity" IS NULL;

ALTER TABLE "EstimateLineItem"
  ALTER COLUMN "purchaseQuantity" SET NOT NULL,
  ALTER COLUMN "netPurchasePrice" DROP NOT NULL,
  ALTER COLUMN "netPurchasePrice" DROP DEFAULT,
  ALTER COLUMN "baseCostVnd" DROP NOT NULL,
  ALTER COLUMN "baseCostVnd" DROP DEFAULT,
  ALTER COLUMN "totalCost" DROP NOT NULL,
  ALTER COLUMN "totalCost" DROP DEFAULT,
  ALTER COLUMN "markup" DROP NOT NULL,
  ALTER COLUMN "markup" DROP DEFAULT,
  ALTER COLUMN "markup" SET DATA TYPE DECIMAL(9,6),
  ALTER COLUMN "margin" DROP NOT NULL,
  ALTER COLUMN "margin" DROP DEFAULT,
  ALTER COLUMN "margin" SET DATA TYPE DECIMAL(9,6),
  ADD CONSTRAINT "EstimateLineItem_priceStatus_check"
    CHECK ("priceStatus" IN ('CONFIRMED', 'PROVISIONAL', 'MISSING')),
  ADD CONSTRAINT "EstimateLineItem_priceState_check"
    CHECK (
      ("priceStatus" = 'MISSING' AND "netPurchasePrice" IS NULL)
      OR ("priceStatus" <> 'MISSING' AND "netPurchasePrice" IS NOT NULL)
    );

ALTER TABLE "EstimateVersion"
  ALTER COLUMN "subtotalCost" DROP NOT NULL,
  ALTER COLUMN "subtotalCost" DROP DEFAULT;

CREATE TABLE "ProjectRisk" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "cause" TEXT NOT NULL,
  "event" TEXT NOT NULL,
  "impact" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "stage" TEXT NOT NULL,
  "ownerId" UUID NOT NULL,
  "likelihood" INTEGER NOT NULL,
  "impactScore" INTEGER NOT NULL,
  "priorityScore" INTEGER NOT NULL,
  "probability" DECIMAL(7,6),
  "financialImpact" DECIMAL(20,2),
  "emv" DECIMAL(20,2),
  "trigger" TEXT,
  "treatment" TEXT,
  "response" TEXT,
  "dueDate" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "occurredAt" TIMESTAMP(3),
  "createdBy" UUID NOT NULL,
  "updatedBy" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectRisk_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProjectRisk_score_check" CHECK (
    "likelihood" BETWEEN 1 AND 5
    AND "impactScore" BETWEEN 1 AND 5
    AND "priorityScore" = "likelihood" * "impactScore"
  ),
  CONSTRAINT "ProjectRisk_probability_check" CHECK (
    "probability" IS NULL OR "probability" BETWEEN 0 AND 1
  ),
  CONSTRAINT "ProjectRisk_financial_check" CHECK (
    ("probability" IS NULL) = ("financialImpact" IS NULL)
    AND ("financialImpact" IS NULL OR "financialImpact" >= 0)
    AND ("emv" IS NULL OR "emv" >= 0)
  )
);

CREATE TABLE "EstimateRiskAllocation" (
  "id" UUID NOT NULL,
  "estimateVersionId" UUID NOT NULL,
  "riskId" UUID NOT NULL,
  "approvedAmount" DECIMAL(20,2) NOT NULL,
  "basis" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ALLOCATED',
  "createdBy" UUID NOT NULL,
  "updatedBy" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EstimateRiskAllocation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EstimateRiskAllocation_amount_check" CHECK ("approvedAmount" >= 0)
);

CREATE UNIQUE INDEX "ProjectRisk_projectId_code_key"
  ON "ProjectRisk"("projectId", "code");
CREATE INDEX "ProjectRisk_organizationId_projectId_status_idx"
  ON "ProjectRisk"("organizationId", "projectId", "status");
CREATE INDEX "ProjectRisk_projectId_stage_priorityScore_idx"
  ON "ProjectRisk"("projectId", "stage", "priorityScore");
CREATE INDEX "ProjectRisk_ownerId_status_idx"
  ON "ProjectRisk"("ownerId", "status");
CREATE UNIQUE INDEX "EstimateRiskAllocation_estimateVersionId_riskId_key"
  ON "EstimateRiskAllocation"("estimateVersionId", "riskId");
CREATE INDEX "EstimateRiskAllocation_riskId_status_idx"
  ON "EstimateRiskAllocation"("riskId", "status");

ALTER TABLE "ProjectRisk"
  ADD CONSTRAINT "ProjectRisk_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectRisk_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EstimateRiskAllocation"
  ADD CONSTRAINT "EstimateRiskAllocation_estimateVersionId_fkey"
  FOREIGN KEY ("estimateVersionId") REFERENCES "EstimateVersion"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "EstimateRiskAllocation_riskId_fkey"
  FOREIGN KEY ("riskId") REFERENCES "ProjectRisk"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
