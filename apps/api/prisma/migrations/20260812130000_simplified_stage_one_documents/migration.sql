CREATE TYPE "StageOneFundingSource" AS ENUM (
  'PUBLIC_INVESTMENT_2026',
  'ODA_CONCESSIONAL_LOAN',
  'PPP',
  'MIXED_OTHER'
);

ALTER TABLE "ProjectStageOnePlan"
  ADD COLUMN "fundingSource" "StageOneFundingSource";

CREATE TABLE "ProjectStageOneDocument" (
  "id" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "step" "ProjectStageOneStep" NOT NULL,
  "documentType" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "requiredDocumentId" UUID,
  "currentFileAssetId" UUID,
  "currentVersion" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'PENDING_UPLOAD',
  "submittedOfficerId" UUID NOT NULL,
  "actualActorId" UUID NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProjectStageOneDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectStageOneDocumentVersion" (
  "id" UUID NOT NULL,
  "documentId" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "fileAssetId" UUID NOT NULL,
  "status" TEXT NOT NULL,
  "submittedOfficerId" UUID NOT NULL,
  "actualActorId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ProjectStageOneDocumentVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectStageOneDocument_currentFileAssetId_key"
  ON "ProjectStageOneDocument"("currentFileAssetId");
CREATE UNIQUE INDEX "ProjectStageOneDocument_projectId_idempotencyKey_key"
  ON "ProjectStageOneDocument"("projectId", "idempotencyKey");
CREATE INDEX "ProjectStageOneDocument_projectId_step_status_createdAt_idx"
  ON "ProjectStageOneDocument"("projectId", "step", "status", "createdAt");
CREATE INDEX "ProjectStageOneDocument_requiredDocumentId_idx"
  ON "ProjectStageOneDocument"("requiredDocumentId");
CREATE UNIQUE INDEX "ProjectStageOneDocumentVersion_fileAssetId_key"
  ON "ProjectStageOneDocumentVersion"("fileAssetId");
CREATE UNIQUE INDEX "ProjectStageOneDocumentVersion_documentId_version_key"
  ON "ProjectStageOneDocumentVersion"("documentId", "version");
CREATE INDEX "ProjectStageOneDocumentVersion_documentId_createdAt_idx"
  ON "ProjectStageOneDocumentVersion"("documentId", "createdAt");

ALTER TABLE "ProjectStageOneDocument"
  ADD CONSTRAINT "ProjectStageOneDocument_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectStageOneDocument_requiredDocumentId_fkey"
    FOREIGN KEY ("requiredDocumentId") REFERENCES "ProjectRequiredDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectStageOneDocument_currentFileAssetId_fkey"
    FOREIGN KEY ("currentFileAssetId") REFERENCES "FileAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectStageOneDocument_submittedOfficerId_fkey"
    FOREIGN KEY ("submittedOfficerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectStageOneDocument_actualActorId_fkey"
    FOREIGN KEY ("actualActorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProjectStageOneDocumentVersion"
  ADD CONSTRAINT "ProjectStageOneDocumentVersion_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "ProjectStageOneDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectStageOneDocumentVersion_fileAssetId_fkey"
    FOREIGN KEY ("fileAssetId") REFERENCES "FileAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectStageOneDocumentVersion_submittedOfficerId_fkey"
    FOREIGN KEY ("submittedOfficerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectStageOneDocumentVersion_actualActorId_fkey"
    FOREIGN KEY ("actualActorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
