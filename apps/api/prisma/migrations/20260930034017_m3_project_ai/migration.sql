/*
  Warnings:

  - A unique constraint covering the columns `[id,organizationId,projectId,roomId]` on the table `ChatDocumentRelease` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[id,organizationId,projectId,roomId]` on the table `ChatFile` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[id,organizationId,projectId,roomId]` on the table `ChatMessage` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateTable
CREATE TABLE "ChatAiConversation" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "clientKey" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatAiConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatAiAnswer" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "invokeGrantId" UUID NOT NULL,
    "clientKey" UUID NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "answer" TEXT,
    "uncertainty" TEXT,
    "citations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "model" TEXT,
    "usage" JSONB,
    "providerStartedAt" TIMESTAMP(3),
    "leaseUntil" TIMESTAMP(3),
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ChatAiAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatAiSourceIndex" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "messageId" UUID,
    "chatFileId" UUID,
    "releaseId" UUID,
    "version" TEXT NOT NULL,
    "extractor" TEXT NOT NULL DEFAULT 'utf8-v1',
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "text" TEXT NOT NULL DEFAULT '',
    "chunks" JSONB NOT NULL DEFAULT '[]',
    "checksum" TEXT,
    "label" TEXT NOT NULL,
    "provenance" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseToken" UUID,
    "leaseUntil" TIMESTAMP(3),
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatAiSourceIndex_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatAiAnswerDependency" (
    "organizationId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "answerId" UUID NOT NULL,
    "sourceIndexId" UUID NOT NULL,
    "handles" TEXT[],

    CONSTRAINT "ChatAiAnswerDependency_pkey" PRIMARY KEY ("answerId","sourceIndexId")
);

-- CreateIndex
CREATE INDEX "ChatAiConversation_organizationId_projectId_ownerId_created_idx" ON "ChatAiConversation"("organizationId", "projectId", "ownerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChatAiConversation_id_organizationId_projectId_ownerId_key" ON "ChatAiConversation"("id", "organizationId", "projectId", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatAiConversation_organizationId_projectId_ownerId_clientK_key" ON "ChatAiConversation"("organizationId", "projectId", "ownerId", "clientKey");

-- CreateIndex
CREATE INDEX "ChatAiAnswer_organizationId_ownerId_providerStartedAt_idx" ON "ChatAiAnswer"("organizationId", "ownerId", "providerStartedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChatAiAnswer_id_organizationId_projectId_key" ON "ChatAiAnswer"("id", "organizationId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatAiAnswer_conversationId_clientKey_key" ON "ChatAiAnswer"("conversationId", "clientKey");

-- CreateIndex
CREATE INDEX "ChatAiSourceIndex_organizationId_projectId_roomId_status_idx" ON "ChatAiSourceIndex"("organizationId", "projectId", "roomId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ChatAiSourceIndex_id_organizationId_projectId_key" ON "ChatAiSourceIndex"("id", "organizationId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatAiSourceIndex_messageId_extractor_key" ON "ChatAiSourceIndex"("messageId", "extractor");

-- CreateIndex
CREATE UNIQUE INDEX "ChatAiSourceIndex_chatFileId_extractor_key" ON "ChatAiSourceIndex"("chatFileId", "extractor");

-- CreateIndex
CREATE UNIQUE INDEX "ChatAiSourceIndex_releaseId_extractor_key" ON "ChatAiSourceIndex"("releaseId", "extractor");

-- CreateIndex
CREATE UNIQUE INDEX "ChatDocumentRelease_id_organizationId_projectId_roomId_key" ON "ChatDocumentRelease"("id", "organizationId", "projectId", "roomId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatFile_id_organizationId_projectId_roomId_key" ON "ChatFile"("id", "organizationId", "projectId", "roomId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMessage_id_organizationId_projectId_roomId_key" ON "ChatMessage"("id", "organizationId", "projectId", "roomId");

CREATE UNIQUE INDEX "ChatProjectGrant_id_organizationId_projectId_userId_key" ON "ChatProjectGrant"("id", "organizationId", "projectId", "userId");

-- AddForeignKey
ALTER TABLE "ChatAiConversation" ADD CONSTRAINT "ChatAiConversation_organizationId_projectId_fkey" FOREIGN KEY ("organizationId", "projectId") REFERENCES "Project"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatAiConversation" ADD CONSTRAINT "ChatAiConversation_organizationId_ownerId_fkey" FOREIGN KEY ("organizationId", "ownerId") REFERENCES "OrganizationMembership"("organizationId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatAiAnswer" ADD CONSTRAINT "ChatAiAnswer_conversationId_organizationId_projectId_owner_fkey" FOREIGN KEY ("conversationId", "organizationId", "projectId", "ownerId") REFERENCES "ChatAiConversation"("id", "organizationId", "projectId", "ownerId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatAiAnswer" ADD CONSTRAINT "ChatAiAnswer_invokeGrantId_organizationId_projectId_ownerI_fkey" FOREIGN KEY ("invokeGrantId", "organizationId", "projectId", "ownerId") REFERENCES "ChatProjectGrant"("id", "organizationId", "projectId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatAiSourceIndex" ADD CONSTRAINT "ChatAiSourceIndex_roomId_organizationId_projectId_fkey" FOREIGN KEY ("roomId", "organizationId", "projectId") REFERENCES "ChatRoom"("id", "organizationId", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatAiSourceIndex" ADD CONSTRAINT "ChatAiSourceIndex_messageId_organizationId_projectId_roomI_fkey" FOREIGN KEY ("messageId", "organizationId", "projectId", "roomId") REFERENCES "ChatMessage"("id", "organizationId", "projectId", "roomId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatAiSourceIndex" ADD CONSTRAINT "ChatAiSourceIndex_chatFileId_organizationId_projectId_room_fkey" FOREIGN KEY ("chatFileId", "organizationId", "projectId", "roomId") REFERENCES "ChatFile"("id", "organizationId", "projectId", "roomId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatAiSourceIndex" ADD CONSTRAINT "ChatAiSourceIndex_releaseId_organizationId_projectId_roomI_fkey" FOREIGN KEY ("releaseId", "organizationId", "projectId", "roomId") REFERENCES "ChatDocumentRelease"("id", "organizationId", "projectId", "roomId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatAiAnswerDependency" ADD CONSTRAINT "ChatAiAnswerDependency_answerId_organizationId_projectId_fkey" FOREIGN KEY ("answerId", "organizationId", "projectId") REFERENCES "ChatAiAnswer"("id", "organizationId", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatAiAnswerDependency" ADD CONSTRAINT "ChatAiAnswerDependency_sourceIndexId_organizationId_projec_fkey" FOREIGN KEY ("sourceIndexId", "organizationId", "projectId") REFERENCES "ChatAiSourceIndex"("id", "organizationId", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Source and owner scopes are enforced by composite FKs; derived rows never
-- cascade away when canonical sources or authority are removed.
ALTER TABLE "ChatAiConversation" ADD CONSTRAINT "ChatAiConversation_scope_check"
  CHECK ("scope" IN ('ALL','CONSULTING','COMMERCIAL','SUPPLY','AFTER_SALES'));
ALTER TABLE "ChatAiSourceIndex" ADD CONSTRAINT "ChatAiSourceIndex_one_source_check"
  CHECK (num_nonnulls("messageId","chatFileId","releaseId")=1);
ALTER TABLE "ChatAiSourceIndex" ADD CONSTRAINT "ChatAiSourceIndex_state_check"
  CHECK ("status" IN ('QUEUED','PROCESSING','READY','UNSUPPORTED','FORBIDDEN','INVALID','TOO_LARGE','ERROR') AND "attempts" BETWEEN 0 AND 3 AND octet_length("text")<=262144);
ALTER TABLE "ChatAiAnswer" ALTER COLUMN "citations" SET NOT NULL;
ALTER TABLE "ChatAiAnswer" ADD CONSTRAINT "ChatAiAnswer_state_check"
  CHECK ("status" IN ('QUEUED','INDEXING','RUNNING','COMPLETED','CANCELLED','FAILED','FAILED_UNKNOWN','NOT_CONFIGURED','NO_SOURCES','NEEDS_REPORT','ACCESS_REVOKED') AND length("question") BETWEEN 1 AND 8000
    AND (("status"='COMPLETED' AND "answer" IS NOT NULL AND "providerStartedAt" IS NOT NULL AND cardinality("citations") BETWEEN 1 AND 12) OR ("status"<>'COMPLETED' AND "answer" IS NULL)));
ALTER TABLE "ChatAiAnswerDependency" ALTER COLUMN "handles" SET NOT NULL;
ALTER TABLE "ChatAiAnswerDependency" ADD CONSTRAINT "ChatAiAnswerDependency_handles_check" CHECK (cardinality("handles") BETWEEN 1 AND 12);

-- Catalog only. No user/role receives invocation or source rights implicitly.
INSERT INTO "Permission" ("id","code","name","description","module")
VALUES (gen_random_uuid(),'ai.invoke','Hỏi AI theo Project','Quyền gọi AI riêng; không tự cấp quyền đọc nguồn hoặc phát hành','project-chat')
ON CONFLICT ("code") DO NOTHING;
