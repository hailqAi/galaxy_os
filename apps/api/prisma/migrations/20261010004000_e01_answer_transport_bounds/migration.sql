BEGIN;
-- Preserve canonical completion invariants while allowing transport-bounded original questions
-- and private Workspace answers with a server-pinned exact model binding.
ALTER TABLE "ChatAiAnswer" ADD CONSTRAINT "ChatAiAnswer_state_check_e01"
 CHECK ("status" IN ('QUEUED','INDEXING','RUNNING','COMPLETED','CANCELLED','FAILED','FAILED_UNKNOWN','NOT_CONFIGURED','NO_SOURCES','NEEDS_REPORT','ACCESS_REVOKED')
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
 OR ("status"<>'COMPLETED' AND "answer" IS NULL))) NOT VALID;
ALTER TABLE "ChatAiAnswer" VALIDATE CONSTRAINT "ChatAiAnswer_state_check_e01";
ALTER TABLE "ChatAiAnswer" DROP CONSTRAINT "ChatAiAnswer_state_check";
ALTER TABLE "ChatAiAnswer" RENAME CONSTRAINT "ChatAiAnswer_state_check_e01" TO "ChatAiAnswer_state_check";
COMMIT;
