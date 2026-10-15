ALTER TABLE "ProjectStageState"
  ADD COLUMN "documentDefinitionsInitializedAt" TIMESTAMP(3);

ALTER TABLE "ProjectRequiredDocument"
  ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "initialMatrix" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "normalizedName" TEXT;

CREATE UNIQUE INDEX "ProjectRequiredDocument_active_normalizedName_key"
  ON "ProjectRequiredDocument"("projectId", "stageKey", "workstreamKey", "normalizedName")
  WHERE "supersededAt" IS NULL AND "normalizedName" IS NOT NULL;

ALTER TABLE "ProjectStageOneDocument"
  ADD COLUMN "stageKey" TEXT,
  ADD COLUMN "workstreamKey" TEXT;

UPDATE "ProjectStageOneDocument"
SET
  "stageKey" = 'STAGE_1',
  "workstreamKey" = "step"::TEXT;

ALTER TABLE "ProjectStageOneDocument"
  ALTER COLUMN "stageKey" SET NOT NULL,
  ALTER COLUMN "workstreamKey" SET NOT NULL,
  ALTER COLUMN "step" DROP NOT NULL;

ALTER TABLE "Task"
  ADD COLUMN "code" TEXT,
  ADD COLUMN "baselineVersion" INTEGER,
  ADD COLUMN "allocatedBudget" DECIMAL(20,2);

CREATE UNIQUE INDEX "Task_active_stageTwoBaseline_code_key"
  ON "Task"("projectId", "baselineVersion", "code")
  WHERE "relatedEntityType" = 'PROJECT_STAGE_TWO_BASELINE'
    AND "deletedAt" IS NULL;

ALTER TABLE "ImportJob"
  ADD COLUMN "projectId" UUID,
  ADD COLUMN "fileAssetId" UUID;

CREATE INDEX "ImportJob_projectId_fileAssetId_idx"
  ON "ImportJob"("projectId", "fileAssetId");

ALTER TABLE "ImportJob"
  ADD CONSTRAINT "ImportJob_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ImportJob_fileAssetId_fkey"
    FOREIGN KEY ("fileAssetId") REFERENCES "FileAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
