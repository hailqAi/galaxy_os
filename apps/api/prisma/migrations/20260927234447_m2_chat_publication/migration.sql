-- CreateTable
CREATE TABLE "ChatDocumentRelease" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "sourceId" UUID NOT NULL,
    "sourceVersionId" UUID NOT NULL,
    "fileAssetId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sourceUpdatedAt" TIMESTAMP(3) NOT NULL,
    "preparedBy" UUID NOT NULL,
    "preparedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedBy" UUID,
    "reviewedAt" TIMESTAMP(3),
    "publishedBy" UUID,
    "publishedAt" TIMESTAMP(3),
    "revokedBy" UUID,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ChatDocumentRelease_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatDocumentRelease_roomId_publishedAt_idx" ON "ChatDocumentRelease"("roomId", "publishedAt");

-- AddForeignKey
ALTER TABLE "ChatDocumentRelease" ADD CONSTRAINT "ChatDocumentRelease_roomId_organizationId_projectId_fkey" FOREIGN KEY ("roomId", "organizationId", "projectId") REFERENCES "ChatRoom"("id", "organizationId", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatDocumentRelease" ADD CONSTRAINT "ChatDocumentRelease_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ProjectRequiredDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatDocumentRelease" ADD CONSTRAINT "ChatDocumentRelease_sourceVersionId_fkey" FOREIGN KEY ("sourceVersionId") REFERENCES "ProjectRequiredDocumentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatDocumentRelease" ADD CONSTRAINT "ChatDocumentRelease_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "FileAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
