ALTER TABLE "ProjectRequiredDocument"
ADD COLUMN "notApplicableReason" TEXT,
ADD COLUMN "markedBy" UUID,
ADD COLUMN "markedAt" TIMESTAMP(3),
ADD COLUMN "supersededAt" TIMESTAMP(3),
ADD COLUMN "supersededBy" UUID;

CREATE TABLE "ProjectRequiredDocumentVersion" (
  "id" UUID NOT NULL,
  "requirementId" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "fileAssetId" UUID,
  "status" TEXT NOT NULL,
  "notes" TEXT,
  "createdBy" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectRequiredDocumentVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProjectRequiredDocumentVersion_requirementId_fkey"
    FOREIGN KEY ("requirementId") REFERENCES "ProjectRequiredDocument"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ProjectRequiredDocumentVersion_requirementId_version_key"
ON "ProjectRequiredDocumentVersion"("requirementId", "version");
CREATE INDEX "ProjectRequiredDocumentVersion_requirementId_createdAt_idx"
ON "ProjectRequiredDocumentVersion"("requirementId", "createdAt");

INSERT INTO "Permission" ("id", "code", "name", "description", "module", "isProtected", "isDelegable", "createdAt")
VALUES (gen_random_uuid(), 'project.document.review', 'project.document.review', 'Review required project documents', 'project', false, true, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId", "createdAt")
SELECT role."id", permission."id", CURRENT_TIMESTAMP
FROM "Role" role
CROSS JOIN "Permission" permission
WHERE role."category" = 'SYSTEM'
  AND permission."code" = 'project.document.review'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
