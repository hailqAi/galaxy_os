-- Chat thông thường không dùng nguồn; giữ yêu cầu citation cho RAG/legacy.
-- Migration mới, không rewrite migration đã áp dụng hoặc thay dữ liệu.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE "ChatAiAnswer" ADD CONSTRAINT "ChatAiAnswer_state_check_v2"
  CHECK (
    "status" IN ('QUEUED','INDEXING','RUNNING','COMPLETED','CANCELLED','FAILED','FAILED_UNKNOWN','NOT_CONFIGURED','NO_SOURCES','NEEDS_REPORT','ACCESS_REVOKED')
    AND length("question") BETWEEN 1 AND 8000
    AND (
      ("status"='COMPLETED' AND "answer" IS NOT NULL AND "providerStartedAt" IS NOT NULL
        AND (cardinality("citations") BETWEEN 1 AND 12
          OR (cardinality("citations")=0 AND COALESCE("usage"->'request'->>'mode', '')='GENERAL')))
      OR ("status"<>'COMPLETED' AND "answer" IS NULL)
    )
  ) NOT VALID;
ALTER TABLE "ChatAiAnswer" VALIDATE CONSTRAINT "ChatAiAnswer_state_check_v2";
ALTER TABLE "ChatAiAnswer" DROP CONSTRAINT "ChatAiAnswer_state_check";
ALTER TABLE "ChatAiAnswer" RENAME CONSTRAINT "ChatAiAnswer_state_check_v2" TO "ChatAiAnswer_state_check";
COMMIT;
