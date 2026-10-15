BEGIN;
SET LOCAL lock_timeout = '5s';
-- AlterTable
ALTER TABLE "ChatAiSourceIndex" ADD COLUMN     "clientKey" UUID,
ADD COLUMN     "conversationId" UUID,
ADD COLUMN     "fileAssetId" UUID,
ADD COLUMN     "ownerId" UUID,
ADD COLUMN     "payloadHash" TEXT,
ALTER COLUMN "roomId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "FileAsset_id_organizationId_uploadedById_key" ON "FileAsset"("id", "organizationId", "uploadedById");

-- CreateIndex
CREATE INDEX "ChatAiSourceIndex_organizationId_projectId_ownerId_status_idx" ON "ChatAiSourceIndex"("organizationId", "projectId", "ownerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ChatAiSourceIndex_conversationId_clientKey_key" ON "ChatAiSourceIndex"("conversationId", "clientKey");

-- CreateIndex
CREATE UNIQUE INDEX "ChatAiSourceIndex_fileAssetId_extractor_key" ON "ChatAiSourceIndex"("fileAssetId", "extractor");

-- AddForeignKey
ALTER TABLE "ChatAiSourceIndex" ADD CONSTRAINT "ChatAiSourceIndex_fileAssetId_organizationId_ownerId_fkey" FOREIGN KEY ("fileAssetId", "organizationId", "ownerId") REFERENCES "FileAsset"("id", "organizationId", "uploadedById") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatAiSourceIndex" ADD CONSTRAINT "ChatAiSourceIndex_conversationId_organizationId_projectId__fkey" FOREIGN KEY ("conversationId", "organizationId", "projectId", "ownerId") REFERENCES "ChatAiConversation"("id", "organizationId", "projectId", "ownerId") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Mở rộng nguồn hiện hữu; không sửa/xóa bản ghi hay migration đã áp dụng.
ALTER TABLE "ChatAiSourceIndex" ADD CONSTRAINT "ChatAiSourceIndex_one_source_v2" CHECK (
  num_nonnulls("messageId","chatFileId","releaseId","fileAssetId")=1
  AND (("fileAssetId" IS NULL AND "roomId" IS NOT NULL AND num_nonnulls("ownerId","conversationId","clientKey","payloadHash")=0)
    OR ("fileAssetId" IS NOT NULL AND "roomId" IS NULL AND num_nonnulls("ownerId","conversationId","clientKey","payloadHash")=4))
) NOT VALID;
ALTER TABLE "ChatAiSourceIndex" VALIDATE CONSTRAINT "ChatAiSourceIndex_one_source_v2";
ALTER TABLE "ChatAiSourceIndex" DROP CONSTRAINT "ChatAiSourceIndex_one_source_check";
ALTER TABLE "ChatAiSourceIndex" RENAME CONSTRAINT "ChatAiSourceIndex_one_source_v2" TO "ChatAiSourceIndex_one_source_check";
ALTER TABLE "ChatAiAnswer" ADD CONSTRAINT "ChatAiAnswer_state_check_v3"
 CHECK ("status" IN ('QUEUED','INDEXING','RUNNING','COMPLETED','CANCELLED','FAILED','FAILED_UNKNOWN','NOT_CONFIGURED','NO_SOURCES','NEEDS_REPORT','ACCESS_REVOKED')
 AND length("question") BETWEEN 1 AND 8000
 AND (("status"='COMPLETED' AND "answer" IS NOT NULL AND "providerStartedAt" IS NOT NULL
 AND (cardinality("citations") BETWEEN 1 AND 12 OR (cardinality("citations")=0 AND COALESCE("usage"->'request'->>'mode','') IN ('GENERAL','UNIFIED'))))
 OR ("status"<>'COMPLETED' AND "answer" IS NULL))) NOT VALID;
ALTER TABLE "ChatAiAnswer" VALIDATE CONSTRAINT "ChatAiAnswer_state_check_v3";
ALTER TABLE "ChatAiAnswer" DROP CONSTRAINT "ChatAiAnswer_state_check";
ALTER TABLE "ChatAiAnswer" RENAME CONSTRAINT "ChatAiAnswer_state_check_v3" TO "ChatAiAnswer_state_check";
COMMIT;
