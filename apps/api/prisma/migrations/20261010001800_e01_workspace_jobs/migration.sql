-- CreateTable
CREATE TABLE "ChatAiWorkspaceJob" (
    "id" UUID NOT NULL,
    "answerId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "principalId" UUID NOT NULL,
    "bindingRevision" UUID NOT NULL,
    "actorSnapshot" JSONB NOT NULL,
    "bindingSnapshot" JSONB NOT NULL,
    "contextSnapshot" JSONB NOT NULL,
    "conversationKey" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'QUEUED',
    "providerRunId" TEXT,
    "providerStatus" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseToken" UUID,
    "leaseUntil" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "resultChecksum" TEXT,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatAiWorkspaceJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatAiWorkspaceResultChunk" (
    "jobId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "content" TEXT NOT NULL,

    CONSTRAINT "ChatAiWorkspaceResultChunk_pkey" PRIMARY KEY ("jobId","sequence")
);

-- CreateTable
CREATE TABLE "WorkspaceConnectorGrant" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "principalId" UUID NOT NULL,
    "bindingRevision" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "sessionId" UUID,
    "membershipId" UUID,
    "clientId" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "challenge" TEXT NOT NULL,
    "clientState" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceConnectorGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChatAiWorkspaceJob_answerId_key" ON "ChatAiWorkspaceJob"("answerId");

-- CreateIndex
CREATE INDEX "ChatAiWorkspaceJob_state_nextAttemptAt_idx" ON "ChatAiWorkspaceJob"("state", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "ChatAiWorkspaceJob_principalId_bindingRevision_createdAt_idx" ON "ChatAiWorkspaceJob"("principalId", "bindingRevision", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChatAiWorkspaceJob_id_organizationId_projectId_ownerId_key" ON "ChatAiWorkspaceJob"("id", "organizationId", "projectId", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatAiWorkspaceJob_answerId_organizationId_projectId_ownerI_key" ON "ChatAiWorkspaceJob"("answerId", "organizationId", "projectId", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceConnectorGrant_tokenHash_key" ON "WorkspaceConnectorGrant"("tokenHash");

-- CreateIndex
CREATE INDEX "WorkspaceConnectorGrant_principalId_bindingRevision_kind_idx" ON "WorkspaceConnectorGrant"("principalId", "bindingRevision", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "ChatAiAnswer_id_organizationId_projectId_ownerId_key" ON "ChatAiAnswer"("id", "organizationId", "projectId", "ownerId");

-- AddForeignKey
ALTER TABLE "ChatAiWorkspaceJob" ADD CONSTRAINT "ChatAiWorkspaceJob_answerId_organizationId_projectId_owner_fkey" FOREIGN KEY ("answerId", "organizationId", "projectId", "ownerId") REFERENCES "ChatAiAnswer"("id", "organizationId", "projectId", "ownerId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatAiWorkspaceResultChunk" ADD CONSTRAINT "ChatAiWorkspaceResultChunk_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ChatAiWorkspaceJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Pilot connector is serialized across credential epochs as well as conversations.
CREATE UNIQUE INDEX "ChatAiWorkspaceJob_one_active_principal" ON "ChatAiWorkspaceJob"("principalId") WHERE "state" IN ('QUEUED','DISPATCHING','DELIVERY_UNCERTAIN','WAITING_RESULT');
ALTER TABLE "ChatAiWorkspaceJob" ADD CONSTRAINT "ChatAiWorkspaceJob_state_check" CHECK ("state" IN ('QUEUED','DISPATCHING','DELIVERY_UNCERTAIN','WAITING_RESULT','COMPLETED','CANCELLED','FAILED','ACCESS_REVOKED','TIMED_OUT'));
ALTER TABLE "ChatAiWorkspaceResultChunk" ADD CONSTRAINT "ChatAiWorkspaceResultChunk_budget_check" CHECK ("sequence" BETWEEN 0 AND 1399 AND octet_length("content") BETWEEN 1 AND 48000);
ALTER TABLE "WorkspaceConnectorGrant" ADD CONSTRAINT "WorkspaceConnectorGrant_kind_check" CHECK ("kind" IN ('REQUEST','CODE','ACCESS'));
