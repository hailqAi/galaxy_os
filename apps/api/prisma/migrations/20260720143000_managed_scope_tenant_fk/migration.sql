CREATE UNIQUE INDEX "OrganizationMembership_organizationId_id_key"
ON "OrganizationMembership"("organizationId", "id");

ALTER TABLE "ManagedDepartment"
DROP CONSTRAINT "ManagedDepartment_managerId_fkey";

ALTER TABLE "ManagedDepartment"
ADD CONSTRAINT "ManagedDepartment_organizationId_managerId_fkey"
FOREIGN KEY ("organizationId", "managerId")
REFERENCES "OrganizationMembership"("organizationId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;
