-- Replace single-column relations with organization-scoped relations.
ALTER TABLE "DepartmentMembership" DROP CONSTRAINT "DepartmentMembership_departmentId_fkey";
ALTER TABLE "UserRole" DROP CONSTRAINT "UserRole_roleId_fkey";

ALTER TABLE "DepartmentMembership" ALTER COLUMN "updatedAt" DROP DEFAULT;

CREATE UNIQUE INDEX "Department_organizationId_id_key"
ON "Department"("organizationId", "id");

CREATE UNIQUE INDEX "Role_organizationId_id_key"
ON "Role"("organizationId", "id");

ALTER TABLE "DepartmentMembership"
ADD CONSTRAINT "DepartmentMembership_organizationId_departmentId_fkey"
FOREIGN KEY ("organizationId", "departmentId")
REFERENCES "Department"("organizationId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DepartmentMembership"
ADD CONSTRAINT "DepartmentMembership_organizationId_userId_fkey"
FOREIGN KEY ("organizationId", "userId")
REFERENCES "OrganizationMembership"("organizationId", "userId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "UserRole"
ADD CONSTRAINT "UserRole_organizationId_roleId_fkey"
FOREIGN KEY ("organizationId", "roleId")
REFERENCES "Role"("organizationId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "UserRole"
ADD CONSTRAINT "UserRole_organizationId_userId_fkey"
FOREIGN KEY ("organizationId", "userId")
REFERENCES "OrganizationMembership"("organizationId", "userId")
ON DELETE RESTRICT ON UPDATE CASCADE;
