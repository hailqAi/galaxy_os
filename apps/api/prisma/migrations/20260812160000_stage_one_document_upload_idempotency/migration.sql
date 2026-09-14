ALTER TABLE "UploadSession"
  ADD COLUMN "idempotencyKey" TEXT;

UPDATE "UploadSession" AS session
SET "idempotencyKey" = document."idempotencyKey"
FROM "ProjectStageOneDocument" AS document
WHERE session."stageOneDocumentId" = document."id";

CREATE INDEX "UploadSession_projectId_stageOneDocumentId_idempotencyKey_idx"
  ON "UploadSession"("projectId", "stageOneDocumentId", "idempotencyKey");
