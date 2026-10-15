BEGIN;
SET LOCAL lock_timeout = '5s';
/*
  Warnings:

  - A unique constraint covering the columns `[id,organizationId,projectId]` on the table `ChatMessage` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateTable
CREATE TABLE "ChatAiMemory" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "visibility" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'NOTE',
    "conversationId" UUID,
    "clientKey" UUID NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "inactiveAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatAiMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatAiMemoryRevision" (
    "id" UUID NOT NULL,
    "memoryId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "previousVersion" INTEGER,
    "content" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "verification" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "editorId" UUID NOT NULL,
    "clientKey" UUID NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "coveredAnswerIds" UUID[] DEFAULT ARRAY[]::UUID[],
    "inputDigest" TEXT,
    "model" TEXT,
    "policyVersion" TEXT,
    "tokenizerVersion" TEXT,
    "budget" JSONB,
    "summaryStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatAiMemoryRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatAiMemoryDependency" (
    "revisionId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "sourceKind" TEXT NOT NULL,
    "sourceId" UUID NOT NULL,
    "sourceVersion" TEXT NOT NULL,
    "locator" JSONB NOT NULL,
    "locatorHash" TEXT NOT NULL,
    "sourceOwnerId" UUID,
    "sourceConversationId" UUID,
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "answerSourceId" UUID,
    "messageSourceId" UUID,
    "indexSourceId" UUID,
    "memorySourceRevisionId" UUID,

    CONSTRAINT "ChatAiMemoryDependency_pkey" PRIMARY KEY ("revisionId","sourceKind","sourceId","sourceVersion","locatorHash")
);

-- CreateTable
CREATE TABLE "ChatAiAnswerMemoryDependency" (
    "answerId" UUID NOT NULL,
    "memoryRevisionId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID NOT NULL,

    CONSTRAINT "ChatAiAnswerMemoryDependency_pkey" PRIMARY KEY ("answerId","memoryRevisionId")
);

-- CreateIndex
CREATE INDEX "ChatAiMemory_organizationId_projectId_visibility_ownerId_in_idx" ON "ChatAiMemory"("organizationId", "projectId", "visibility", "ownerId", "inactiveAt", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChatAiMemory_id_organizationId_projectId_key" ON "ChatAiMemory"("id", "organizationId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatAiMemory_organizationId_projectId_ownerId_clientKey_key" ON "ChatAiMemory"("organizationId", "projectId", "ownerId", "clientKey");

-- CreateIndex
CREATE UNIQUE INDEX "ChatAiMemoryRevision_id_organizationId_projectId_key" ON "ChatAiMemoryRevision"("id", "organizationId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatAiMemoryRevision_memoryId_version_key" ON "ChatAiMemoryRevision"("memoryId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ChatAiMemoryRevision_memoryId_clientKey_key" ON "ChatAiMemoryRevision"("memoryId", "clientKey");

-- CreateIndex
CREATE UNIQUE INDEX "ChatAiMemoryRevision_organizationId_projectId_inputDigest_key" ON "ChatAiMemoryRevision"("organizationId", "projectId", "inputDigest");

-- CreateIndex
CREATE INDEX "ChatAiMemoryDependency_organizationId_projectId_sourceKind__idx" ON "ChatAiMemoryDependency"("organizationId", "projectId", "sourceKind", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMessage_id_organizationId_projectId_key" ON "ChatMessage"("id", "organizationId", "projectId");

-- AddForeignKey
ALTER TABLE "ChatAiMemory" ADD CONSTRAINT "ChatAiMemory_organizationId_projectId_fkey" FOREIGN KEY ("organizationId", "projectId") REFERENCES "Project"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatAiMemory" ADD CONSTRAINT "ChatAiMemory_organizationId_ownerId_fkey" FOREIGN KEY ("organizationId", "ownerId") REFERENCES "OrganizationMembership"("organizationId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatAiMemory" ADD CONSTRAINT "ChatAiMemory_conversationId_organizationId_projectId_owner_fkey" FOREIGN KEY ("conversationId", "organizationId", "projectId", "ownerId") REFERENCES "ChatAiConversation"("id", "organizationId", "projectId", "ownerId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatAiMemoryRevision" ADD CONSTRAINT "ChatAiMemoryRevision_memoryId_organizationId_projectId_fkey" FOREIGN KEY ("memoryId", "organizationId", "projectId") REFERENCES "ChatAiMemory"("id", "organizationId", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatAiMemoryRevision" ADD CONSTRAINT "ChatAiMemoryRevision_organizationId_editorId_fkey" FOREIGN KEY ("organizationId", "editorId") REFERENCES "OrganizationMembership"("organizationId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatAiMemoryRevision" ADD CONSTRAINT "ChatAiMemoryRevision_memoryId_previousVersion_fkey" FOREIGN KEY ("memoryId", "previousVersion") REFERENCES "ChatAiMemoryRevision"("memoryId", "version") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatAiMemoryDependency" ADD CONSTRAINT "ChatAiMemoryDependency_revisionId_organizationId_projectId_fkey" FOREIGN KEY ("revisionId", "organizationId", "projectId") REFERENCES "ChatAiMemoryRevision"("id", "organizationId", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatAiMemoryDependency" ADD CONSTRAINT "ChatAiMemoryDependency_organizationId_sourceOwnerId_fkey" FOREIGN KEY ("organizationId", "sourceOwnerId") REFERENCES "OrganizationMembership"("organizationId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatAiMemoryDependency" ADD CONSTRAINT "ChatAiMemoryDependency_sourceConversationId_organizationId_fkey" FOREIGN KEY ("sourceConversationId", "organizationId", "projectId", "sourceOwnerId") REFERENCES "ChatAiConversation"("id", "organizationId", "projectId", "ownerId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatAiMemoryDependency" ADD CONSTRAINT "ChatAiMemoryDependency_answerSourceId_organizationId_proje_fkey" FOREIGN KEY ("answerSourceId", "organizationId", "projectId") REFERENCES "ChatAiAnswer"("id", "organizationId", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatAiMemoryDependency" ADD CONSTRAINT "ChatAiMemoryDependency_messageSourceId_organizationId_proj_fkey" FOREIGN KEY ("messageSourceId", "organizationId", "projectId") REFERENCES "ChatMessage"("id", "organizationId", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatAiMemoryDependency" ADD CONSTRAINT "ChatAiMemoryDependency_indexSourceId_organizationId_projec_fkey" FOREIGN KEY ("indexSourceId", "organizationId", "projectId") REFERENCES "ChatAiSourceIndex"("id", "organizationId", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatAiMemoryDependency" ADD CONSTRAINT "ChatAiMemoryDependency_memorySourceRevisionId_organization_fkey" FOREIGN KEY ("memorySourceRevisionId", "organizationId", "projectId") REFERENCES "ChatAiMemoryRevision"("id", "organizationId", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatAiAnswerMemoryDependency" ADD CONSTRAINT "ChatAiAnswerMemoryDependency_answerId_organizationId_proje_fkey" FOREIGN KEY ("answerId", "organizationId", "projectId") REFERENCES "ChatAiAnswer"("id", "organizationId", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatAiAnswerMemoryDependency" ADD CONSTRAINT "ChatAiAnswerMemoryDependency_memoryRevisionId_organization_fkey" FOREIGN KEY ("memoryRevisionId", "organizationId", "projectId") REFERENCES "ChatAiMemoryRevision"("id", "organizationId", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "CustomFieldDefinition_scope_organizationId_entityType_status_so" RENAME TO "CustomFieldDefinition_scope_organizationId_entityType_statu_idx";

-- RenameIndex
ALTER INDEX "KeyDossierReferenceMilestone_organizationId_projectId_deletedAt" RENAME TO "KeyDossierReferenceMilestone_organizationId_projectId_delet_idx";

-- RenameIndex
ALTER INDEX "ProjectProductLine_organizationId_projectId_lifecycleStatus_del" RENAME TO "ProjectProductLine_organizationId_projectId_lifecycleStatus_idx";

-- RenameIndex
ALTER INDEX "ProjectRequiredDocument_organizationId_projectId_stageKey_statu" RENAME TO "ProjectRequiredDocument_organizationId_projectId_stageKey_s_idx";

-- RenameIndex
ALTER INDEX "ProjectRequiredDocument_projectId_initialMatrix_deletedAt_posit" RENAME TO "ProjectRequiredDocument_projectId_initialMatrix_deletedAt_p_idx";

-- RenameIndex
ALTER INDEX "UserRole_organizationId_userId_roleId_scopeType_departmentId_ke" RENAME TO "UserRole_organizationId_userId_roleId_scopeType_departmentI_key";

-- The database enforces scope even if a future worker bypasses the HTTP layer.
ALTER TABLE "ChatAiMemory" ADD CONSTRAINT "ChatAiMemory_state_check" CHECK (
  "visibility" IN ('PRIVATE','SHARED') AND "kind" IN ('NOTE','CONVERSATION_SUMMARY')
  AND "currentVersion">0 AND "payloadHash" ~ '^[a-f0-9]{64}$'
  AND (("kind"='NOTE' AND "conversationId" IS NULL)
    OR ("kind"='CONVERSATION_SUMMARY' AND "visibility"='PRIVATE' AND "conversationId" IS NOT NULL))
);
ALTER TABLE "ChatAiMemoryRevision" ADD CONSTRAINT "ChatAiMemoryRevision_state_check" CHECK (
  "version">0 AND (("version"=1 AND "previousVersion" IS NULL)
    OR ("version">1 AND "previousVersion"="version"-1))
  AND char_length("content") BETWEEN 1 AND 8000
  AND "category" IN ('NOTE','REQUIREMENT','TECHNICAL','DECISION','ISSUE','SUMMARY')
  AND "verification" IN ('UNVERIFIED','USER_CONFIRMED','SOURCE_CONFIRMED')
  AND "payloadHash" ~ '^[a-f0-9]{64}$'
  AND (("category"<>'SUMMARY' AND cardinality("coveredAnswerIds")=0
    AND num_nonnulls("inputDigest","model","policyVersion","tokenizerVersion","budget","summaryStatus")=0)
    OR ("category"='SUMMARY' AND "verification"='UNVERIFIED'
      AND cardinality("coveredAnswerIds")>0
      AND "inputDigest" IS NOT NULL AND "inputDigest" ~ '^[a-f0-9]{64}$'
      AND "model" IS NOT NULL AND char_length("model") BETWEEN 1 AND 200
      AND "policyVersion"='project-ai-p1-v1'
      AND "tokenizerVersion" IS NOT NULL AND char_length("tokenizerVersion") BETWEEN 1 AND 200
      AND "budget" IS NOT NULL AND jsonb_typeof("budget")='object'
      AND "summaryStatus" IS NOT NULL AND "summaryStatus" IN ('READY','STALE')))
);
ALTER TABLE "ChatAiMemoryDependency" ADD CONSTRAINT "ChatAiMemoryDependency_source_check" CHECK (
  char_length("sourceVersion") BETWEEN 1 AND 200 AND jsonb_typeof("locator")='object'
  AND "locatorHash" ~ '^[a-f0-9]{64}$'
  AND ("sourceConversationId" IS NULL OR "sourceOwnerId" IS NOT NULL)
  AND (
    ("sourceKind"='AI_ANSWER' AND "answerSourceId" IS NOT NULL AND "answerSourceId"="sourceId"
      AND num_nonnulls("messageSourceId","indexSourceId","memorySourceRevisionId")=0)
    OR ("sourceKind"='CHAT_MESSAGE' AND "messageSourceId" IS NOT NULL AND "messageSourceId"="sourceId"
      AND num_nonnulls("answerSourceId","indexSourceId","memorySourceRevisionId")=0)
    OR ("sourceKind"='FILE_INDEX' AND "indexSourceId" IS NOT NULL AND "indexSourceId"="sourceId"
      AND num_nonnulls("answerSourceId","messageSourceId","memorySourceRevisionId")=0)
    OR ("sourceKind"='MEMORY_REVISION' AND "memorySourceRevisionId" IS NOT NULL
      AND "memorySourceRevisionId"="sourceId" AND "memorySourceRevisionId"<>"revisionId"
      AND num_nonnulls("answerSourceId","messageSourceId","indexSourceId")=0)
    OR ("sourceKind" IN ('TASK','PROJECT_RECORD')
      AND num_nonnulls("answerSourceId","messageSourceId","indexSourceId","memorySourceRevisionId")=0)
  )
);
CREATE FUNCTION "ChatAiMemory_guard_scope"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW."id",NEW."organizationId",NEW."projectId",NEW."ownerId",NEW."visibility",NEW."kind",NEW."conversationId",NEW."clientKey",NEW."payloadHash",NEW."createdAt")
    IS DISTINCT FROM (OLD."id",OLD."organizationId",OLD."projectId",OLD."ownerId",OLD."visibility",OLD."kind",OLD."conversationId",OLD."clientKey",OLD."payloadHash",OLD."createdAt")
    OR NEW."currentVersion"<OLD."currentVersion"
    OR (OLD."inactiveAt" IS NOT NULL AND NEW."inactiveAt" IS DISTINCT FROM OLD."inactiveAt") THEN
    RAISE EXCEPTION 'Memory scope is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "ChatAiMemory_guard_scope" BEFORE UPDATE ON "ChatAiMemory"
  FOR EACH ROW EXECUTE FUNCTION "ChatAiMemory_guard_scope"();
CREATE FUNCTION "ChatAiMemoryRevision_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE head_kind text;
BEGIN
  IF TG_OP='UPDATE' AND (to_jsonb(NEW)-'summaryStatus') IS DISTINCT FROM (to_jsonb(OLD)-'summaryStatus') THEN
    RAISE EXCEPTION 'Memory revision is immutable' USING ERRCODE='23514';
  END IF;
  SELECT "kind" INTO head_kind FROM "ChatAiMemory" WHERE "id"=NEW."memoryId"
    AND "organizationId"=NEW."organizationId" AND "projectId"=NEW."projectId";
  IF (head_kind='CONVERSATION_SUMMARY' AND NEW."category"<>'SUMMARY')
    OR (head_kind='NOTE' AND NEW."category"='SUMMARY') THEN
    RAISE EXCEPTION 'Summary metadata does not match memory kind' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "ChatAiMemoryRevision_guard" BEFORE INSERT OR UPDATE ON "ChatAiMemoryRevision"
  FOR EACH ROW EXECUTE FUNCTION "ChatAiMemoryRevision_guard"();
COMMIT;
