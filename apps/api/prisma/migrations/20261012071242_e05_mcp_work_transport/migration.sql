-- CreateTable
CREATE TABLE "McpClient" (
    "id" TEXT NOT NULL,
    "redirectUris" TEXT[],
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "McpClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "McpGrant" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "organizationId" UUID,
    "ownerId" UUID,
    "membershipId" UUID,
    "authorizationId" UUID,
    "issuer" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "scopes" TEXT[],
    "payload" JSONB NOT NULL DEFAULT '{}',
    "expiresAt" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "McpGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "McpSubscription" (
    "id" TEXT NOT NULL,
    "organizationId" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "authorizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "arguments" JSONB NOT NULL,
    "callbackUrl" TEXT NOT NULL,
    "secretCipher" TEXT NOT NULL,
    "previousSecretCipher" TEXT,
    "rotationUntil" TIMESTAMP(3),
    "refreshBefore" TIMESTAMP(3),
    "verifiedUntil" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "McpSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "McpOutbox" (
    "id" UUID NOT NULL,
    "answerId" UUID NOT NULL,
    "generation" INTEGER NOT NULL DEFAULT 0,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "McpOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "McpDelivery" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseToken" UUID,
    "leaseUntil" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "errorCode" TEXT,

    CONSTRAINT "McpDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "McpResultPart" (
    "answerId" UUID NOT NULL,
    "submissionId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,

    CONSTRAINT "McpResultPart_pkey" PRIMARY KEY ("answerId","submissionId","sequence")
);

-- CreateTable
CREATE TABLE "McpArtifact" (
    "id" UUID NOT NULL,
    "answerId" UUID NOT NULL,
    "submissionId" TEXT NOT NULL,
    "externalFileId" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "downloadCipher" TEXT,
    "filename" TEXT,
    "mimeType" TEXT,
    "sourceId" UUID,
    "fileAssetId" UUID,
    "checksum" TEXT,
    "leaseToken" UUID,
    "leaseUntil" TIMESTAMP(3),
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "McpArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "McpGrant_tokenHash_key" ON "McpGrant"("tokenHash");

-- CreateIndex
CREATE INDEX "McpGrant_authorizationId_kind_revokedAt_idx" ON "McpGrant"("authorizationId", "kind", "revokedAt");

-- CreateIndex
CREATE INDEX "McpSubscription_organizationId_ownerId_revokedAt_idx" ON "McpSubscription"("organizationId", "ownerId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "McpOutbox_answerId_generation_key" ON "McpOutbox"("answerId", "generation");

-- CreateIndex
CREATE INDEX "McpDelivery_state_nextAttemptAt_idx" ON "McpDelivery"("state", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "McpDelivery_eventId_subscriptionId_key" ON "McpDelivery"("eventId", "subscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "McpArtifact_answerId_submissionId_externalFileId_key" ON "McpArtifact"("answerId", "submissionId", "externalFileId");

-- AddForeignKey
ALTER TABLE "McpGrant" ADD CONSTRAINT "McpGrant_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "McpClient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpOutbox" ADD CONSTRAINT "McpOutbox_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "ChatAiAnswer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpDelivery" ADD CONSTRAINT "McpDelivery_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "McpOutbox"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpDelivery" ADD CONSTRAINT "McpDelivery_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "McpSubscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpResultPart" ADD CONSTRAINT "McpResultPart_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "ChatAiAnswer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpArtifact" ADD CONSTRAINT "McpArtifact_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "ChatAiAnswer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
