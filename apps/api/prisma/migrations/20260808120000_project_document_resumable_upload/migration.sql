ALTER TABLE "UploadSession"
  ADD COLUMN "projectId" UUID,
  ADD COLUMN "requiredDocumentId" UUID,
  ADD COLUMN "fileAssetId" UUID;

CREATE UNIQUE INDEX "UploadSession_fileAssetId_key"
  ON "UploadSession"("fileAssetId");
CREATE INDEX "UploadSession_projectId_requiredDocumentId_idx"
  ON "UploadSession"("projectId", "requiredDocumentId");

ALTER TABLE "UploadSession"
  ADD CONSTRAINT "UploadSession_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "UploadSession_requiredDocumentId_fkey"
    FOREIGN KEY ("requiredDocumentId") REFERENCES "ProjectRequiredDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "UploadSession_fileAssetId_fkey"
    FOREIGN KEY ("fileAssetId") REFERENCES "FileAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
