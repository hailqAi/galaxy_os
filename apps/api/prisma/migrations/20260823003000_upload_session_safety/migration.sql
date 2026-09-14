ALTER TABLE "UploadSession"
  ADD COLUMN "verificationClaimId" TEXT,
  ADD COLUMN "verificationStartedAt" TIMESTAMP(3),
  ADD COLUMN "stagingReleasedAt" TIMESTAMP(3),
  ADD COLUMN "stagingCleanupAttemptedAt" TIMESTAMP(3);

ALTER TABLE "QuotationDocument"
  ADD COLUMN "sizeBytes" BIGINT;

CREATE UNIQUE INDEX "QuotationDocument_storageKey_key"
  ON "QuotationDocument"("storageKey");

UPDATE "UploadSession" AS upload
SET "submittingOfficerId" = version."submittedOfficerId"
FROM "ProjectStageOneDocumentVersion" AS version
WHERE upload."stageOneDocumentId" = version."documentId"
  AND upload."fileAssetId" = version."fileAssetId"
  AND upload."submittingOfficerId" IS NULL;

UPDATE "UploadSession"
SET
  "status" = 'EXPIRED',
  "expiresAt" = LEAST("expiresAt", CURRENT_TIMESTAMP)
WHERE "stageOneDocumentId" IS NOT NULL
  AND "submittingOfficerId" IS NULL
  AND "status" IN ('INITIATED', 'UPLOADING', 'VERIFYING', 'AVAILABLE', 'FAILED');

UPDATE "UploadSession" AS upload
SET "storageKey" = asset."storageKey"
FROM "FileAsset" AS asset
WHERE upload."fileAssetId" = asset."id";

CREATE INDEX "UploadSession_organizationId_stagingReleasedAt_idx"
  ON "UploadSession"("organizationId", "stagingReleasedAt");

CREATE INDEX "UploadSession_stagingReleasedAt_stagingCleanupAttemptedAt_idx"
  ON "UploadSession"("stagingReleasedAt", "stagingCleanupAttemptedAt");

CREATE INDEX "UploadSession_status_verificationStartedAt_idx"
  ON "UploadSession"("status", "verificationStartedAt");

CREATE INDEX "UploadSession_projectId_requiredDocumentId_idempotencyKey_idx"
  ON "UploadSession"("projectId", "requiredDocumentId", "idempotencyKey");
