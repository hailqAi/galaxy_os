INSERT INTO "Permission" ("id", "code", "name", "description", "module", "isProtected", "isDelegable", "createdAt")
VALUES (
  gen_random_uuid(),
  'project.stage.bypass',
  'project.stage.bypass',
  'Allows an audited Project stage applicability or bypass decision',
  'project',
  false,
  true,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO NOTHING;
