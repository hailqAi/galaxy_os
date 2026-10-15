ALTER TABLE "UploadSession"
  ADD COLUMN "stageOneDocumentId" UUID;

CREATE INDEX "UploadSession_projectId_stageOneDocumentId_idx"
  ON "UploadSession"("projectId", "stageOneDocumentId");

ALTER TABLE "UploadSession"
  ADD CONSTRAINT "UploadSession_stageOneDocumentId_fkey"
    FOREIGN KEY ("stageOneDocumentId") REFERENCES "ProjectStageOneDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;
