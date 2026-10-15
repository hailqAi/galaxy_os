BEGIN;
SET LOCAL lock_timeout = '5s';
/*
  Warnings:

  - A unique constraint covering the columns `[aiConversationId,idempotencyKey]` on the table `UploadSession` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "ChatAiSourceIndex" ADD COLUMN     "processingMetadata" JSONB;

-- AlterTable
ALTER TABLE "UploadSession" ADD COLUMN     "aiConversationId" UUID;

-- CreateTable
CREATE TABLE "ChatAiSourceChunk" (
    "id" UUID NOT NULL,
    "sourceIndexId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "sourceVersion" TEXT NOT NULL,
    "parserVersion" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "locator" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatAiSourceChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChatAiSourceChunk_sourceIndexId_parserVersion_ordinal_key" ON "ChatAiSourceChunk"("sourceIndexId", "parserVersion", "ordinal");

-- CreateIndex
CREATE UNIQUE INDEX "UploadSession_aiConversationId_idempotencyKey_key" ON "UploadSession"("aiConversationId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "UploadSession" ADD CONSTRAINT "UploadSession_aiConversationId_organizationId_projectId_ac_fkey" FOREIGN KEY ("aiConversationId", "organizationId", "projectId", "actorId") REFERENCES "ChatAiConversation"("id", "organizationId", "projectId", "ownerId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatAiSourceChunk" ADD CONSTRAINT "ChatAiSourceChunk_sourceIndexId_organizationId_projectId_fkey" FOREIGN KEY ("sourceIndexId", "organizationId", "projectId") REFERENCES "ChatAiSourceIndex"("id", "organizationId", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Historical targetless business uploads remain representable; new API admission requires one target.
ALTER TABLE "UploadSession" ADD CONSTRAINT "UploadSession_chat_target_check" CHECK (
  num_nonnulls("requiredDocumentId", "stageOneDocumentId", "aiConversationId") <= 1
  AND ("aiConversationId" IS NULL OR (
    "projectId" IS NOT NULL AND "idempotencyKey" IS NOT NULL
    AND "idempotencyKey" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND "declaredSize" BETWEEN 1 AND 10000000000
  ))
) NOT VALID;
ALTER TABLE "UploadSession" VALIDATE CONSTRAINT "UploadSession_chat_target_check";

ALTER TABLE "ChatAiSourceChunk" ADD CONSTRAINT "ChatAiSourceChunk_bounds_check" CHECK (
  "ordinal" BETWEEN 0 AND 1023
  AND octet_length("text") BETWEEN 1 AND 32768
  AND length("sourceVersion") BETWEEN 1 AND 256
  AND length("parserVersion") BETWEEN 1 AND 64
  AND "checksum" ~ '^[0-9a-f]{64}$'
  AND jsonb_typeof("locator") = 'object'
  AND octet_length("locator"::text) <= 4096
);
COMMIT;
