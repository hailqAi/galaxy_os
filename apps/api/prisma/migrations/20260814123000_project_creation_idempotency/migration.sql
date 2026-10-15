ALTER TABLE "Project"
ADD COLUMN "creationIdempotencyKey" TEXT;

CREATE UNIQUE INDEX "Project_organizationId_creationIdempotencyKey_key"
ON "Project"("organizationId", "creationIdempotencyKey");
