CREATE UNIQUE INDEX "ProjectRequiredDocument_active_context_name_key"
ON "ProjectRequiredDocument"(
  "projectId",
  "stageKey",
  "workstreamKey",
  "normalizedName",
  "initialMatrix"
)
WHERE "supersededAt" IS NULL AND "normalizedName" IS NOT NULL;

DROP INDEX "ProjectRequiredDocument_active_normalizedName_key";
