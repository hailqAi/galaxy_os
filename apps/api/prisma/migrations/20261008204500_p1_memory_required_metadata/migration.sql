-- Preserve the applied schema migration; PostgreSQL CHECK accepts NULL unless explicit.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE "ChatAiMemoryRevision" ADD CONSTRAINT "ChatAiMemoryRevision_required_metadata_check" CHECK (
  "coveredAnswerIds" IS NOT NULL
  AND ("version"=1 OR "previousVersion" IS NOT NULL)
  AND ("category"<>'SUMMARY' OR "policyVersion" IS NOT NULL)
);
ALTER TABLE "ChatAiMemoryDependency" ADD CONSTRAINT "ChatAiMemoryDependency_permissions_check"
  CHECK ("permissions" IS NOT NULL);
COMMIT;
