BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE "ChatAiSourceIndex" ADD COLUMN "projectFileAssetId" UUID;
CREATE UNIQUE INDEX "ChatAiSourceIndex_project_file_version_key" ON "ChatAiSourceIndex"("projectId", "projectFileAssetId", "version", "extractor");
ALTER TABLE "ChatAiSourceIndex" ADD CONSTRAINT "ChatAiSourceIndex_projectFileAssetId_fkey" FOREIGN KEY ("projectFileAssetId") REFERENCES "FileAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Nguồn hồ sơ dùng chung không mang owner/conversation của nguồn AI riêng.
ALTER TABLE "ChatAiSourceIndex" ADD CONSTRAINT "ChatAiSourceIndex_one_source_v3" CHECK (
  num_nonnulls("messageId","chatFileId","releaseId","fileAssetId","projectFileAssetId")=1
  AND (("projectFileAssetId" IS NOT NULL AND "roomId" IS NULL AND num_nonnulls("ownerId","conversationId","clientKey","payloadHash")=0)
    OR ("projectFileAssetId" IS NULL AND "fileAssetId" IS NULL AND "roomId" IS NOT NULL AND num_nonnulls("ownerId","conversationId","clientKey","payloadHash")=0)
    OR ("fileAssetId" IS NOT NULL AND "roomId" IS NULL AND num_nonnulls("ownerId","conversationId","clientKey","payloadHash")=4))
) NOT VALID;
ALTER TABLE "ChatAiSourceIndex" VALIDATE CONSTRAINT "ChatAiSourceIndex_one_source_v3";
ALTER TABLE "ChatAiSourceIndex" DROP CONSTRAINT "ChatAiSourceIndex_one_source_check";
ALTER TABLE "ChatAiSourceIndex" RENAME CONSTRAINT "ChatAiSourceIndex_one_source_v3" TO "ChatAiSourceIndex_one_source_check";
COMMIT;
