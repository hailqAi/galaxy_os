BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
-- Preserve provider completion rules; direct domain receipts prove no AI ran.
ALTER TABLE "ChatAiAnswer" ADD CONSTRAINT "ChatAiAnswer_state_check_data"
 CHECK (
"status" IN ('QUEUED','INDEXING','RUNNING','COMPLETED','CANCELLED','FAILED','FAILED_UNKNOWN','NOT_CONFIGURED','NO_SOURCES','NEEDS_REPORT','ACCESS_REVOKED','PARTIAL')
 AND length("question") BETWEEN 1 AND 256000
 AND (("status"='COMPLETED' AND "answer" IS NOT NULL AND "providerStartedAt" IS NOT NULL
 AND (cardinality("citations") BETWEEN 1 AND 64 OR (cardinality("citations")=0 AND
 (COALESCE("usage"->'request'->>'mode','') IN ('GENERAL','UNIFIED') OR
 COALESCE(("usage"->'mcp'->>'version'='1' AND "usage"->'mcp'->>'state'='COMPLETED'
 AND "usage"->'mcp'->>'originalMessageId'="id"::text
 AND "usage"->'mcp'->'actor'->>'userId'="ownerId"::text
 AND "usage"->'mcp'->'actor'->>'organizationId'="organizationId"::text
 AND length("usage"->'mcp'->>'resultChecksum')=64), FALSE) OR
 (COALESCE("usage"->'workspace'->>'visibility','')='PRIVATE'
 AND "usage"->'workspace'->>'requestedModel'="model"
 AND "usage"->'workspace'->>'configuredModel'="model"
 AND "usage"->'workspace'->>'actorId'="ownerId"::text
 AND "usage"->'workspace'->>'organizationId'="organizationId"::text
 AND "usage"->'workspace'->>'projectId'="projectId"::text)))))
 OR ("status"='PARTIAL' AND "answer" IS NOT NULL AND length("answer") BETWEEN 1 AND 512000
 AND ((COALESCE("errorCode",'')='RUN_DEADLINE' AND COALESCE("usage"->'workflow'->>'version','')='1')
 OR (COALESCE("errorCode",'')='DOCUMENT_COVERAGE_INCOMPLETE'
 AND COALESCE("usage"->'request'->>'version','')='4'
 AND COALESCE("usage"->'request'->>'documentReadScope','')='ALL'
 AND COALESCE(length("uncertainty"),0) BETWEEN 1 AND 32000))
 AND cardinality("citations") BETWEEN 0 AND 64)
 OR ("status" NOT IN ('COMPLETED','PARTIAL') AND "answer" IS NULL))
 OR COALESCE(("status"='COMPLETED' AND "answer" IS NOT NULL
 AND length("question") BETWEEN 1 AND 256000 AND length("answer") BETWEEN 1 AND 512000
 AND "providerStartedAt" IS NULL AND "model" IS NULL AND "completedAt" IS NOT NULL
 AND cardinality("citations")=0
 AND "usage"->'routeSelection'->>'effective_executor'='GALAXY_DATA'
 AND "usage"->'routeSelection'->>'requested_executor'='AUTO'
 AND "usage"->'dataReceipt'->>'version'='1'
 AND "usage"->'dataReceipt'->>'operation'='COUNT_PROJECTS'
 AND "usage"->'dataReceipt'->>'source_message_id'="id"::text
 AND "usage"->'dataReceipt'->>'requested_by'="ownerId"::text
 AND "usage"->'dataReceipt'->>'project_id'="projectId"::text
 AND "usage"->'dataReceipt'->>'thread_id'="conversationId"::text
 AND "usage"->'dataReceipt'->'scope'->>'organization_id'="organizationId"::text
 AND "usage"->'dataReceipt'->>'entity_type'='Project'
 AND "usage"->'dataReceipt'->>'queried_at' IS NOT NULL
 AND jsonb_typeof("usage"->'dataReceipt'->'count')='number'
 AND "usage"->'dataReceipt'->>'count' ~ '^[0-9]+$'
 AND length("usage"->>'executionCommandHash')=64), FALSE)
 ) NOT VALID;
ALTER TABLE "ChatAiAnswer" VALIDATE CONSTRAINT "ChatAiAnswer_state_check_data";
ALTER TABLE "ChatAiAnswer" DROP CONSTRAINT "ChatAiAnswer_state_check";
ALTER TABLE "ChatAiAnswer" RENAME CONSTRAINT "ChatAiAnswer_state_check_data" TO "ChatAiAnswer_state_check";
COMMIT;
