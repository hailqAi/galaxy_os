ALTER TABLE "Project"
  ADD COLUMN "deletedBy" UUID,
  ADD COLUMN "deleteReason" TEXT;

ALTER TABLE "ProjectStageOneDocument"
  ADD COLUMN "contextType" TEXT;

UPDATE "ProjectStageOneDocument" attachment
SET "contextType" = CASE
  WHEN item."initialMatrix" = true THEN 'STAGE_MATRIX_DOCUMENT'
  ELSE 'STAGE_WORKFLOW_STEP_DOCUMENT'
END
FROM "ProjectRequiredDocument" item
WHERE attachment."requiredDocumentId" = item."id";

UPDATE "ProjectStageOneDocument"
SET "contextType" = 'STAGE_WORKFLOW_STEP_DOCUMENT'
WHERE "contextType" IS NULL;

ALTER TABLE "ProjectStageOneDocument"
  ALTER COLUMN "contextType" SET NOT NULL,
  DROP CONSTRAINT "ProjectStageOneDocument_stageKey_step_check";

CREATE TABLE "KeyDossierReferenceMilestone" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdBy" UUID NOT NULL,
  "updatedBy" UUID NOT NULL,
  "deletedAt" TIMESTAMP(3),
  "deletedBy" UUID,
  "deleteReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "KeyDossierReferenceMilestone_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ProjectRequiredDocument"
  ADD COLUMN "referenceMilestoneId" UUID,
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletedBy" UUID,
  ADD COLUMN "deleteReason" TEXT;

CREATE UNIQUE INDEX "KeyDossierReferenceMilestone_projectId_code_key"
  ON "KeyDossierReferenceMilestone"("projectId", "code");
CREATE INDEX "KeyDossierReferenceMilestone_organizationId_projectId_deletedAt_position_idx"
  ON "KeyDossierReferenceMilestone"("organizationId", "projectId", "deletedAt", "position");
CREATE INDEX "ProjectRequiredDocument_projectId_initialMatrix_deletedAt_position_idx"
  ON "ProjectRequiredDocument"("projectId", "initialMatrix", "deletedAt", "position");
CREATE INDEX "ProjectRequiredDocument_referenceMilestoneId_idx"
  ON "ProjectRequiredDocument"("referenceMilestoneId");

ALTER TABLE "KeyDossierReferenceMilestone"
  ADD CONSTRAINT "KeyDossierReferenceMilestone_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectRequiredDocument"
  ADD CONSTRAINT "ProjectRequiredDocument_referenceMilestoneId_fkey"
  FOREIGN KEY ("referenceMilestoneId") REFERENCES "KeyDossierReferenceMilestone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "KeyDossierReferenceMilestone" (
  "id", "organizationId", "projectId", "code", "name", "position",
  "active", "createdBy", "updatedBy", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(),
  project."organizationId",
  project."id",
  'LEGACY-' || matrix."workstreamKey",
  CASE matrix."workstreamKey"
    WHEN 'ASSIGNMENT' THEN 'Tiếp nhận & Phân công'
    WHEN 'SURVEY' THEN 'Khảo sát & Thiết lập bộ máy'
    WHEN 'PROPOSAL' THEN 'Lập & Thẩm định hồ sơ đề xuất'
    WHEN 'FINANCIAL_PLANNING' THEN 'Xác định nguồn vốn & Kế hoạch'
    WHEN 'KICKOFF_APPROVAL' THEN 'Phê duyệt dự án'
    ELSE 'Cần rà soát — ' || matrix."workstreamKey"
  END,
  matrix."position",
  true,
  project."createdBy",
  project."updatedBy",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Project" project
JOIN (
  SELECT "projectId", "workstreamKey", MIN("position") AS "position"
  FROM "ProjectRequiredDocument"
  WHERE "stageKey" = 'STAGE_1' AND "initialMatrix" = true
  GROUP BY "projectId", "workstreamKey"
) matrix ON matrix."projectId" = project."id"
ON CONFLICT ("projectId", "code") DO NOTHING;

UPDATE "ProjectRequiredDocument" item
SET "referenceMilestoneId" = milestone."id"
FROM "KeyDossierReferenceMilestone" milestone
WHERE item."projectId" = milestone."projectId"
  AND item."stageKey" = 'STAGE_1'
  AND item."initialMatrix" = true
  AND milestone."code" = 'LEGACY-' || item."workstreamKey"
  AND item."referenceMilestoneId" IS NULL;

UPDATE "ProjectRequiredDocument"
SET "workstreamKey" = 'KEY_DOSSIER_LEGACY_' || "workstreamKey"
WHERE "stageKey" = 'STAGE_1'
  AND "initialMatrix" = true
  AND "workstreamKey" NOT LIKE 'KEY_DOSSIER%';

UPDATE "ProjectStageOneDocument" attachment
SET "workstreamKey" = item."workstreamKey", "step" = NULL
FROM "ProjectRequiredDocument" item
WHERE attachment."requiredDocumentId" = item."id"
  AND item."stageKey" = 'STAGE_1'
  AND item."initialMatrix" = true
  AND (
    attachment."workstreamKey" <> item."workstreamKey"
    OR attachment."step" IS NOT NULL
  );

ALTER TABLE "ProjectStageOneDocument"
  ADD CONSTRAINT "ProjectStageOneDocument_stageKey_step_check"
  CHECK (
    (
      "stageKey" = 'STAGE_1'
      AND "contextType" = 'STAGE_WORKFLOW_STEP_DOCUMENT'
      AND "step" IS NOT NULL
    )
    OR (
      "stageKey" = 'STAGE_1'
      AND "contextType" = 'STAGE_MATRIX_DOCUMENT'
      AND "step" IS NULL
    )
    OR (
      "stageKey" <> 'STAGE_1'
      AND "contextType" IN (
        'STAGE_MATRIX_DOCUMENT',
        'STAGE_WORKFLOW_STEP_DOCUMENT'
      )
      AND "step" IS NULL
    )
  ) NOT VALID;

ALTER TABLE "ProjectStageOneDocument"
  VALIDATE CONSTRAINT "ProjectStageOneDocument_stageKey_step_check";

INSERT INTO "Permission" (
  "id", "code", "name", "description", "module", "isProtected", "isDelegable", "createdAt"
)
SELECT gen_random_uuid(), code, name, description, 'project', false, true, CURRENT_TIMESTAMP
FROM (VALUES
  ('project.key_dossier.manage', 'Quản lý Hồ sơ chủ chốt', 'Thêm, sửa và sắp xếp mốc hoặc mục Hồ sơ chủ chốt trong phạm vi được cấp'),
  ('project.key_dossier.item.delete', 'Xóa mục Hồ sơ chủ chốt', 'Xóa mềm một mục Hồ sơ chủ chốt trong phạm vi được cấp')
) AS permission(code, name, description)
ON CONFLICT ("code") DO UPDATE
SET "name" = EXCLUDED."name", "description" = EXCLUDED."description";

UPDATE "Permission" SET
  "name" = 'Xóa dự án',
  "description" = 'Xóa mềm toàn bộ dự án trong phạm vi được cấp'
WHERE "code" = 'project.delete';

UPDATE "Permission" SET
  "name" = 'Xóa tệp đính kèm',
  "description" = 'Gỡ liên kết tệp đính kèm trong phạm vi được cấp'
WHERE "code" = 'file.delete';

INSERT INTO "RolePermission" ("roleId", "permissionId", "createdAt")
SELECT role."id", permission."id", CURRENT_TIMESTAMP
FROM "Role" role
CROSS JOIN "Permission" permission
WHERE role."category" IN ('SYSTEM', 'ORGANIZATION')
  AND permission."code" IN (
    'project.key_dossier.manage',
    'project.key_dossier.item.delete'
  )
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

DELETE FROM "RolePermission" assignment
USING "Role" role, "Permission" permission
WHERE assignment."roleId" = role."id"
  AND assignment."permissionId" = permission."id"
  AND role."code" IN ('project_manager', 'employee')
  AND permission."code" IN (
    'project.delete',
    'project.key_dossier.manage',
    'project.key_dossier.item.delete'
  );
