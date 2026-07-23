CREATE TABLE "FileAsset"(
 "id" UUID NOT NULL,"organizationId" UUID NOT NULL,"originalFilename" TEXT NOT NULL,"storedFilename" TEXT NOT NULL,"mimeType" TEXT NOT NULL,"sizeBytes" INTEGER NOT NULL,"storageProvider" TEXT NOT NULL DEFAULT 'LOCAL',"storageKey" TEXT NOT NULL,"checksum" TEXT NOT NULL,"category" TEXT NOT NULL,"confidentiality" "Confidentiality" NOT NULL DEFAULT 'INTERNAL',"uploadedById" UUID NOT NULL,"version" INTEGER NOT NULL DEFAULT 1,"thumbnailKey" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,"deletedAt" TIMESTAMP(3),CONSTRAINT "FileAsset_pkey" PRIMARY KEY("id")
);
CREATE TABLE "EntityAttachment"(
 "id" UUID NOT NULL,"fileAssetId" UUID NOT NULL,"entityType" TEXT NOT NULL,"entityId" UUID NOT NULL,"projectId" UUID,"customerId" UUID,"createdBy" UUID NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "EntityAttachment_pkey" PRIMARY KEY("id")
);
CREATE UNIQUE INDEX "FileAsset_storageKey_key" ON "FileAsset"("storageKey");
CREATE INDEX "FileAsset_organizationId_category_deletedAt_idx" ON "FileAsset"("organizationId","category","deletedAt");
CREATE INDEX "FileAsset_organizationId_uploadedById_createdAt_idx" ON "FileAsset"("organizationId","uploadedById","createdAt");
CREATE INDEX "FileAsset_organizationId_mimeType_idx" ON "FileAsset"("organizationId","mimeType");
CREATE INDEX "EntityAttachment_entityType_entityId_idx" ON "EntityAttachment"("entityType","entityId");
CREATE INDEX "EntityAttachment_projectId_idx" ON "EntityAttachment"("projectId");
CREATE INDEX "EntityAttachment_customerId_idx" ON "EntityAttachment"("customerId");
CREATE UNIQUE INDEX "EntityAttachment_fileAssetId_entityType_entityId_key" ON "EntityAttachment"("fileAssetId","entityType","entityId");
ALTER TABLE "FileAsset" ADD CONSTRAINT "FileAsset_organizationId_fkey" FOREIGN KEY("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FileAsset" ADD CONSTRAINT "FileAsset_uploadedById_fkey" FOREIGN KEY("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EntityAttachment" ADD CONSTRAINT "EntityAttachment_fileAssetId_fkey" FOREIGN KEY("fileAssetId") REFERENCES "FileAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EntityAttachment" ADD CONSTRAINT "EntityAttachment_projectId_fkey" FOREIGN KEY("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EntityAttachment" ADD CONSTRAINT "EntityAttachment_customerId_fkey" FOREIGN KEY("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
