BEGIN;
-- Preserve completion invariants; PARTIAL retains deadline work without claiming completion.
ALTER TABLE "ChatAiAnswer" ADD CONSTRAINT "ChatAiAnswer_state_check_e03"
 CHECK ("status" IN ('QUEUED','INDEXING','RUNNING','COMPLETED','CANCELLED','FAILED','FAILED_UNKNOWN','NOT_CONFIGURED','NO_SOURCES','NEEDS_REPORT','ACCESS_REVOKED','PARTIAL')
 AND length("question") BETWEEN 1 AND 256000
 AND (("status"='COMPLETED' AND "answer" IS NOT NULL AND "providerStartedAt" IS NOT NULL
 AND (cardinality("citations") BETWEEN 1 AND 64 OR (cardinality("citations")=0 AND
 (COALESCE("usage"->'request'->>'mode','') IN ('GENERAL','UNIFIED') OR
 (COALESCE("usage"->'workspace'->>'visibility','')='PRIVATE'
 AND "usage"->'workspace'->>'requestedModel'="model"
 AND "usage"->'workspace'->>'configuredModel'="model"
 AND "usage"->'workspace'->>'actorId'="ownerId"::text
 AND "usage"->'workspace'->>'organizationId'="organizationId"::text
 AND "usage"->'workspace'->>'projectId'="projectId"::text)))))
 OR ("status"='PARTIAL' AND "answer" IS NOT NULL AND length("answer") BETWEEN 1 AND 512000
 AND COALESCE("errorCode",'')='RUN_DEADLINE' AND COALESCE("usage"->'workflow'->>'version','')='1'
 AND cardinality("citations") BETWEEN 0 AND 64)
 OR ("status" NOT IN ('COMPLETED','PARTIAL') AND "answer" IS NULL))) NOT VALID;
ALTER TABLE "ChatAiAnswer" VALIDATE CONSTRAINT "ChatAiAnswer_state_check_e03";
ALTER TABLE "ChatAiAnswer" DROP CONSTRAINT "ChatAiAnswer_state_check";
ALTER TABLE "ChatAiAnswer" RENAME CONSTRAINT "ChatAiAnswer_state_check_e03" TO "ChatAiAnswer_state_check";
-- CreateIndex
CREATE INDEX "ChatAiAnswer_status_createdAt_idx" ON "ChatAiAnswer"("status", "createdAt");
COMMIT;
