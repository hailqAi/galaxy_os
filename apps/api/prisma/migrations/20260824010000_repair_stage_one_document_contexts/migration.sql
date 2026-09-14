WITH matrix_defaults("workstreamKey", "name") AS (
  VALUES
    ('ASSIGNMENT', 'Văn bản chủ trương / Quyết định giao nhiệm vụ'),
    ('SURVEY', 'Báo cáo khảo sát & Phương án nhân sự'),
    ('PROPOSAL', 'Hồ sơ Báo cáo Kinh tế - Kỹ thuật'),
    ('FINANCIAL_PLANNING', 'Văn bản xác nhận / Cân đối nguồn vốn'),
    ('KICKOFF_APPROVAL', 'Quyết định phê duyệt Báo cáo Kinh tế - Kỹ thuật')
)
UPDATE "ProjectRequiredDocument" AS document
SET
  "initialMatrix" = true,
  "normalizedName" = CASE
    WHEN document."normalizedName" IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM "ProjectRequiredDocument" AS conflict
        WHERE conflict."projectId" = document."projectId"
          AND conflict."stageKey" = document."stageKey"
          AND conflict."workstreamKey" = document."workstreamKey"
          AND conflict."normalizedName" = lower(defaults."name")
          AND conflict."supersededAt" IS NULL
          AND conflict."id" <> document."id"
      )
    THEN lower(defaults."name")
    ELSE document."normalizedName"
  END
FROM matrix_defaults AS defaults
WHERE document."stageKey" = 'STAGE_1'
  AND document."workstreamKey" = defaults."workstreamKey"
  AND document."documentType" = defaults."name"
  AND document."initialMatrix" = false;

WITH document_defaults(
  "workstreamKey",
  "name",
  "legacyName",
  "position",
  "initialMatrix"
) AS (
  VALUES
    ('ASSIGNMENT', 'Văn bản chủ trương / Quyết định giao nhiệm vụ', NULL, 0, true),
    ('SURVEY', 'Báo cáo khảo sát & Phương án nhân sự', NULL, 1, true),
    ('PROPOSAL', 'Hồ sơ Báo cáo Kinh tế - Kỹ thuật', NULL, 2, true),
    ('FINANCIAL_PLANNING', 'Văn bản xác nhận / Cân đối nguồn vốn', NULL, 3, true),
    ('KICKOFF_APPROVAL', 'Quyết định phê duyệt Báo cáo Kinh tế - Kỹ thuật', NULL, 4, true),
    ('ASSIGNMENT', 'Phiếu tiếp nhận / Yêu cầu khởi tạo dự án', 'Văn bản chủ trương đầu tư', 0, false),
    ('ASSIGNMENT', 'Quyết định giao nhiệm vụ / Phân công đội dự án', 'Quyết định giao nhiệm vụ / Phân công Ban QLDA', 1, false),
    ('ASSIGNMENT', 'Hồ sơ khác', NULL, 2, false),
    ('SURVEY', 'Báo cáo khảo sát hiện trạng', 'Báo cáo khảo sát hiện trạng mặt bằng', 0, false),
    ('SURVEY', 'Phương án bố trí nhân sự dự án', 'Phương án bố trí nhân sự Ban QLDA', 1, false),
    ('SURVEY', 'Biên bản khảo sát', NULL, 2, false),
    ('SURVEY', 'Bản vẽ / Bản đo hiện trạng', NULL, 3, false),
    ('SURVEY', 'Ảnh / Video hiện trường', NULL, 4, false),
    ('SURVEY', 'Hồ sơ khác', NULL, 5, false),
    ('PROPOSAL', 'Hồ sơ đề xuất dự án', 'Hồ sơ BCNCTKT / Báo cáo đề xuất chủ trương đầu tư', 0, false),
    ('PROPOSAL', 'Báo cáo thẩm định nội bộ', NULL, 1, false),
    ('PROPOSAL', 'Báo cáo thẩm định chuyên môn', 'Báo cáo thẩm định ngành / Bộ', 2, false),
    ('PROPOSAL', 'Thuyết minh phương án', 'Thuyết minh', 3, false),
    ('PROPOSAL', 'Bản vẽ / Tài liệu kỹ thuật', 'Bản vẽ', 4, false),
    ('PROPOSAL', 'Dự toán / BOQ sơ bộ', 'Dự toán', 5, false),
    ('PROPOSAL', 'Hồ sơ khác', NULL, 6, false),
    ('FINANCIAL_PLANNING', 'Xác nhận ngân sách / Kế hoạch tài chính', 'Văn bản cam kết / cân đối nguồn vốn', 0, false),
    ('FINANCIAL_PLANNING', 'Kế hoạch ngân sách', 'Kế hoạch vốn', 1, false),
    ('FINANCIAL_PLANNING', 'Xác nhận nguồn tài chính', 'Văn bản xác nhận nguồn vốn', 2, false),
    ('FINANCIAL_PLANNING', 'Hồ sơ khác', NULL, 3, false),
    ('KICKOFF_APPROVAL', 'Phiếu phê duyệt khởi tạo dự án', 'Quyết định phê duyệt chủ trương đầu tư', 0, false),
    ('KICKOFF_APPROVAL', 'Quyết định phê duyệt dự án', 'Quyết định phê duyệt dự án đầu tư xây dựng', 1, false),
    ('KICKOFF_APPROVAL', 'Biên bản / Tài liệu phê duyệt', 'Biên bản / Văn bản phê duyệt', 2, false),
    ('KICKOFF_APPROVAL', 'Hồ sơ khác', NULL, 3, false)
)
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
  defaults."workstreamKey",
  defaults."name",
  defaults."name",
  false,
  defaults."position",
  defaults."initialMatrix",
  lower(defaults."name"),
  'MISSING',
  'PROJECT_MANAGER',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Project" AS project
JOIN "ProjectStageState" AS state
  ON state."projectId" = project."id"
 AND state."stage" = 'STAGE_ONE'
CROSS JOIN document_defaults AS defaults
WHERE project."deletedAt" IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "ProjectRequiredDocument" AS existing
    WHERE existing."projectId" = project."id"
      AND existing."stageKey" = 'STAGE_1'
      AND existing."workstreamKey" = defaults."workstreamKey"
      AND (
        existing."documentType" = defaults."name"
        OR existing."documentName" = defaults."name"
        OR existing."normalizedName" = lower(defaults."name")
        OR (
          defaults."legacyName" IS NOT NULL
          AND (
            existing."documentType" = defaults."legacyName"
            OR existing."documentName" = defaults."legacyName"
            OR existing."normalizedName" = lower(defaults."legacyName")
          )
        )
      )
  )
ON CONFLICT DO NOTHING;
