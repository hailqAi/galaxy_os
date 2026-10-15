-- AlterTable
ALTER TABLE "ChatHistoryGrant" ADD COLUMN     "sourceHistoryId" UUID;

-- CreateTable
CREATE TABLE "ChatFile" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "clientKey" UUID NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "fileAssetId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "origin" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessageAttachment" (
    "messageId" UUID NOT NULL,
    "chatFileId" UUID NOT NULL,

    CONSTRAINT "ChatMessageAttachment_pkey" PRIMARY KEY ("messageId","chatFileId")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChatFile_roomId_actorId_clientKey_key" ON "ChatFile"("roomId", "actorId", "clientKey");

-- AddForeignKey
ALTER TABLE "ChatHistoryGrant" ADD CONSTRAINT "ChatHistoryGrant_sourceHistoryId_fkey" FOREIGN KEY ("sourceHistoryId") REFERENCES "ChatHistoryGrant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatFile" ADD CONSTRAINT "ChatFile_roomId_organizationId_projectId_fkey" FOREIGN KEY ("roomId", "organizationId", "projectId") REFERENCES "ChatRoom"("id", "organizationId", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatFile" ADD CONSTRAINT "ChatFile_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "FileAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessageAttachment" ADD CONSTRAINT "ChatMessageAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessageAttachment" ADD CONSTRAINT "ChatMessageAttachment_chatFileId_fkey" FOREIGN KEY ("chatFileId") REFERENCES "ChatFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
