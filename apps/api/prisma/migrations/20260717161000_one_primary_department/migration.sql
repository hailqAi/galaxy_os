-- Enforce at most one primary department per user and organization.
CREATE UNIQUE INDEX "DepartmentMembership_one_primary_per_organization_user"
ON "DepartmentMembership" ("organizationId", "userId")
WHERE "isPrimary" = true;
