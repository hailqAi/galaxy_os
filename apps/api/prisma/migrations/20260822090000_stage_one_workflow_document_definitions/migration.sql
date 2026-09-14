INSERT INTO "ProjectRequiredDocument" (
  "id",
  "organizationId",
  "projectId",
  "stageKey",
  "workstreamKey",
  "documentType",
  "documentName",
  "required",
  "position",
  "initialMatrix",
  "normalizedName",
  "status",
  "ownerRole",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid(),
  project."organizationId",
  project."id",
  'STAGE_1',
  definition.step,
  definition.name,
  definition.name,
  false,
  definition.position,
  false,
  lower(definition.name),
  'MISSING',
  'PROJECT_MANAGER',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Project" AS project
JOIN "ProjectStageState" AS state
  ON state."projectId" = project."id"
 AND state."stage" = 'STAGE_ONE'
CROSS JOIN (VALUES
  ('ASSIGNMENT', 'Văn bản chủ trương đầu tư', 0),
  ('ASSIGNMENT', 'Quyết định giao nhiệm vụ / Phân công Ban QLDA', 1),
  ('ASSIGNMENT', 'Hồ sơ khác', 2),
  ('SURVEY', 'Báo cáo khảo sát hiện trạng mặt bằng', 0),
  ('SURVEY', 'Phương án bố trí nhân sự Ban QLDA', 1),
  ('SURVEY', 'Biên bản khảo sát', 2),
  ('SURVEY', 'Bản vẽ / Bản đo hiện trạng', 3),
  ('SURVEY', 'Ảnh / Video hiện trường', 4),
  ('SURVEY', 'Hồ sơ khác', 5),
  ('PROPOSAL', 'Hồ sơ BCNCTKT / Báo cáo đề xuất chủ trương đầu tư', 0),
  ('PROPOSAL', 'Báo cáo thẩm định nội bộ', 1),
  ('PROPOSAL', 'Báo cáo thẩm định ngành / Bộ', 2),
  ('PROPOSAL', 'Thuyết minh', 3),
  ('PROPOSAL', 'Bản vẽ', 4),
  ('PROPOSAL', 'Dự toán', 5),
  ('PROPOSAL', 'Hồ sơ khác', 6),
  ('FINANCIAL_PLANNING', 'Văn bản cam kết / cân đối nguồn vốn', 0),
  ('FINANCIAL_PLANNING', 'Kế hoạch vốn', 1),
  ('FINANCIAL_PLANNING', 'Văn bản xác nhận nguồn vốn', 2),
  ('FINANCIAL_PLANNING', 'Hồ sơ khác', 3),
  ('KICKOFF_APPROVAL', 'Quyết định phê duyệt chủ trương đầu tư', 0),
  ('KICKOFF_APPROVAL', 'Quyết định phê duyệt dự án đầu tư xây dựng', 1),
  ('KICKOFF_APPROVAL', 'Biên bản / Văn bản phê duyệt', 2),
  ('KICKOFF_APPROVAL', 'Hồ sơ khác', 3)
) AS definition(step, name, position)
WHERE project."deletedAt" IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "ProjectRequiredDocument" AS existing
    WHERE existing."projectId" = project."id"
      AND existing."stageKey" = 'STAGE_1'
      AND existing."initialMatrix" = false
  )
ON CONFLICT ("projectId", "stageKey", "workstreamKey", "documentType")
DO NOTHING;
