INSERT INTO "Permission" ("id", "code", "name", "description", "module", "isProtected", "isDelegable", "createdAt")
SELECT gen_random_uuid(), code, code, 'Project Product Register capability', 'project', false, true, CURRENT_TIMESTAMP
FROM unnest(ARRAY[
  'project.product.view',
  'project.product.create',
  'project.product.update',
  'project.product.revise',
  'project.product.submit_customer',
  'project.product.approve_customer',
  'project.product.submit_technical',
  'project.product.approve_technical',
  'project.product.submit_commercial',
  'project.product.approve_commercial',
  'project.location.manage',
  'project.document.manage'
]) AS code
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId", "createdAt")
SELECT role."id", permission."id", CURRENT_TIMESTAMP
FROM "Role" role
CROSS JOIN "Permission" permission
WHERE role."category" = 'SYSTEM'
  AND permission."code" LIKE 'project.%'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
