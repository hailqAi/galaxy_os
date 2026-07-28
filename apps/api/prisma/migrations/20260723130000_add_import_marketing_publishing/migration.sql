CREATE TYPE "ImportStatus" AS ENUM ('UPLOADED', 'MAPPED', 'VALIDATED', 'IMPORTING', 'COMPLETED', 'FAILED', 'CANCELLED');
CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'SCHEDULED', 'QUEUED', 'PUBLISHING', 'PUBLISHED', 'REJECTED');
CREATE TYPE "PublishingStatus" AS ENUM ('SCHEDULED', 'QUEUED', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'RETRY_SCHEDULED', 'CANCELLED');

CREATE TABLE "ImportJob" (
  "id" UUID NOT NULL, "organizationId" UUID NOT NULL, "entityType" TEXT NOT NULL,
  "status" "ImportStatus" NOT NULL DEFAULT 'UPLOADED', "filename" TEXT NOT NULL,
  "uploadedById" UUID NOT NULL, "mapping" JSONB, "totalRows" INTEGER NOT NULL DEFAULT 0,
  "validRows" INTEGER NOT NULL DEFAULT 0, "invalidRows" INTEGER NOT NULL DEFAULT 0,
  "importedRows" INTEGER NOT NULL DEFAULT 0, "skippedRows" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "completedAt" TIMESTAMP(3),
  CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ImportRow" (
  "id" UUID NOT NULL, "importJobId" UUID NOT NULL, "rowNumber" INTEGER NOT NULL,
  "rawData" JSONB NOT NULL, "normalizedData" JSONB, "status" TEXT NOT NULL DEFAULT 'PENDING',
  "errors" JSONB, "createdEntityId" UUID, CONSTRAINT "ImportRow_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Campaign" (
  "id" UUID NOT NULL, "organizationId" UUID NOT NULL, "name" TEXT NOT NULL,
  "brandEcosystem" TEXT NOT NULL, "status" "RecordStatus" NOT NULL DEFAULT 'active',
  "startDate" TIMESTAMP(3), "endDate" TIMESTAMP(3), "ownerId" UUID NOT NULL,
  "utmSource" TEXT, "utmMedium" TEXT, "utmCampaign" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ContentItem" (
  "id" UUID NOT NULL, "organizationId" UUID NOT NULL, "title" TEXT NOT NULL,
  "originalContent" TEXT NOT NULL, "campaignId" UUID, "brandEcosystem" TEXT NOT NULL,
  "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT', "authorId" UUID NOT NULL,
  "reviewerId" UUID, "approverId" UUID, "scheduledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContentItem_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ContentVariant" (
  "id" UUID NOT NULL, "contentItemId" UUID NOT NULL, "channel" TEXT NOT NULL,
  "title" TEXT, "body" TEXT NOT NULL, "media" JSONB, "metadata" JSONB,
  "status" TEXT NOT NULL DEFAULT 'DRAFT', CONSTRAINT "ContentVariant_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PublishingJob" (
  "id" UUID NOT NULL, "organizationId" UUID NOT NULL, "contentItemId" UUID NOT NULL,
  "contentVariantId" UUID NOT NULL, "channel" TEXT NOT NULL, "scheduledAt" TIMESTAMP(3) NOT NULL,
  "status" "PublishingStatus" NOT NULL DEFAULT 'SCHEDULED', "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3, "idempotencyKey" TEXT NOT NULL, "publishedUrl" TEXT,
  "lastErrorCode" TEXT, "lastErrorMessage" TEXT, "lockedAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PublishingJob_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PublishingAttempt" (
  "id" UUID NOT NULL, "publishingJobId" UUID NOT NULL, "attemptNumber" INTEGER NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL, "finishedAt" TIMESTAMP(3), "status" TEXT NOT NULL,
  "providerResponseSummary" JSONB, "errorCode" TEXT, "errorMessage" TEXT,
  CONSTRAINT "PublishingAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ImportJob_organizationId_createdAt_idx" ON "ImportJob"("organizationId", "createdAt");
CREATE UNIQUE INDEX "ImportRow_importJobId_rowNumber_key" ON "ImportRow"("importJobId", "rowNumber");
CREATE INDEX "Campaign_organizationId_status_idx" ON "Campaign"("organizationId", "status");
CREATE INDEX "ContentItem_organizationId_status_scheduledAt_idx" ON "ContentItem"("organizationId", "status", "scheduledAt");
CREATE UNIQUE INDEX "ContentVariant_contentItemId_channel_key" ON "ContentVariant"("contentItemId", "channel");
CREATE UNIQUE INDEX "PublishingJob_idempotencyKey_key" ON "PublishingJob"("idempotencyKey");
CREATE INDEX "PublishingJob_organizationId_status_scheduledAt_idx" ON "PublishingJob"("organizationId", "status", "scheduledAt");
CREATE UNIQUE INDEX "PublishingAttempt_publishingJobId_attemptNumber_key" ON "PublishingAttempt"("publishingJobId", "attemptNumber");

ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ImportRow" ADD CONSTRAINT "ImportRow_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "ImportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ContentVariant" ADD CONSTRAINT "ContentVariant_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PublishingJob" ADD CONSTRAINT "PublishingJob_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublishingJob" ADD CONSTRAINT "PublishingJob_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublishingJob" ADD CONSTRAINT "PublishingJob_contentVariantId_fkey" FOREIGN KEY ("contentVariantId") REFERENCES "ContentVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublishingAttempt" ADD CONSTRAINT "PublishingAttempt_publishingJobId_fkey" FOREIGN KEY ("publishingJobId") REFERENCES "PublishingJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
