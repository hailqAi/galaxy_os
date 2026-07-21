-- Sprint 1 enterprise identity, scoped authorization, hierarchy, settings, and custom fields.
CREATE TYPE "AssignmentScope" AS ENUM ('SYSTEM', 'ORGANIZATION', 'DEPARTMENT', 'SELF');
CREATE TYPE "OrganizationalUnitType" AS ENUM ('BOARD', 'DIVISION', 'DEPARTMENT', 'TEAM', 'OTHER');
CREATE TYPE "RoleCategory" AS ENUM ('SYSTEM', 'ORGANIZATION', 'EXECUTIVE', 'DEPARTMENT', 'STANDARD', 'CUSTOM');
CREATE TYPE "SettingScope" AS ENUM ('SYSTEM', 'ORGANIZATION');
CREATE TYPE "CustomFieldEntityType" AS ENUM ('USER', 'ORGANIZATION_MEMBER', 'DEPARTMENT', 'ROLE');
CREATE TYPE "CustomFieldDataType" AS ENUM ('TEXT', 'LONG_TEXT', 'NUMBER', 'BOOLEAN', 'DATE', 'DATETIME', 'SINGLE_SELECT', 'MULTI_SELECT', 'EMAIL', 'PHONE', 'URL');
ALTER TYPE "AdministrationScope" ADD VALUE 'SYSTEM';

DROP INDEX "UserRole_organizationId_userId_roleId_key";

ALTER TABLE "Department"
  ADD COLUMN "customData" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "displayOrder" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "managerMembershipId" UUID,
  ADD COLUMN "parentId" UUID,
  ADD COLUMN "unitType" "OrganizationalUnitType" NOT NULL DEFAULT 'DEPARTMENT';
ALTER TABLE "ManagedDepartment" ADD COLUMN "includeChildren" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "OrganizationMembership" ADD COLUMN "customData" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "Permission"
  ADD COLUMN "isDelegable" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "isProtected" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "module" TEXT NOT NULL DEFAULT 'general';
ALTER TABLE "Role"
  ADD COLUMN "category" "RoleCategory" NOT NULL DEFAULT 'CUSTOM',
  ADD COLUMN "createdByUserId" UUID,
  ADD COLUMN "customData" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "maximumScope" "AssignmentScope" NOT NULL DEFAULT 'DEPARTMENT';
ALTER TABLE "User" ADD COLUMN "customData" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "UserRole"
  ADD COLUMN "departmentId" UUID,
  ADD COLUMN "expiresAt" TIMESTAMP(3),
  ADD COLUMN "scopeType" "AssignmentScope" NOT NULL DEFAULT 'ORGANIZATION',
  ADD COLUMN "status" "RecordStatus" NOT NULL DEFAULT 'active';

CREATE TABLE "SystemSetting" (
  "id" UUID NOT NULL, "key" TEXT NOT NULL, "value" JSONB NOT NULL,
  "description" TEXT, "isDelegable" BOOLEAN NOT NULL DEFAULT false,
  "updatedByUserId" UUID, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "OrganizationSetting" (
  "id" UUID NOT NULL, "organizationId" UUID NOT NULL, "key" TEXT NOT NULL,
  "value" JSONB NOT NULL, "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrganizationSetting_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "CustomFieldDefinition" (
  "id" UUID NOT NULL, "scope" "SettingScope" NOT NULL, "organizationId" UUID,
  "entityType" "CustomFieldEntityType" NOT NULL, "key" TEXT NOT NULL, "label" TEXT NOT NULL,
  "description" TEXT, "dataType" "CustomFieldDataType" NOT NULL,
  "required" BOOLEAN NOT NULL DEFAULT false, "defaultValue" JSONB, "options" JSONB,
  "validation" JSONB, "visibilityPermission" TEXT, "editPermission" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0, "status" "RecordStatus" NOT NULL DEFAULT 'active',
  "createdByUserId" UUID, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "CustomFieldDefinition_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SystemSetting_key_key" ON "SystemSetting"("key");
CREATE INDEX "OrganizationSetting_organizationId_idx" ON "OrganizationSetting"("organizationId");
CREATE UNIQUE INDEX "OrganizationSetting_organizationId_key_key" ON "OrganizationSetting"("organizationId", "key");
CREATE INDEX "CustomFieldDefinition_scope_organizationId_entityType_status_sortOrder_idx" ON "CustomFieldDefinition"("scope", "organizationId", "entityType", "status", "sortOrder");
CREATE UNIQUE INDEX "CustomFieldDefinition_scope_organizationId_entityType_key_key" ON "CustomFieldDefinition"("scope", "organizationId", "entityType", "key");
CREATE UNIQUE INDEX "CustomFieldDefinition_system_entityType_key_key" ON "CustomFieldDefinition"("entityType", "key") WHERE "scope" = 'SYSTEM';
CREATE INDEX "Department_organizationId_parentId_displayOrder_idx" ON "Department"("organizationId", "parentId", "displayOrder");
CREATE INDEX "UserRole_organizationId_departmentId_status_idx" ON "UserRole"("organizationId", "departmentId", "status");
CREATE UNIQUE INDEX "UserRole_organizationId_userId_roleId_scopeType_departmentId_key" ON "UserRole"("organizationId", "userId", "roleId", "scopeType", "departmentId");
CREATE UNIQUE INDEX "UserRole_scoped_assignment_key" ON "UserRole"("organizationId", "userId", "roleId", "scopeType", COALESCE("departmentId", '00000000-0000-0000-0000-000000000000'::uuid));

ALTER TABLE "Department" ADD CONSTRAINT "Department_not_own_parent" CHECK ("parentId" IS NULL OR "parentId" <> "id");
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_scope_department_check" CHECK (("scopeType" = 'DEPARTMENT' AND "departmentId" IS NOT NULL) OR ("scopeType" <> 'DEPARTMENT' AND "departmentId" IS NULL));
ALTER TABLE "CustomFieldDefinition" ADD CONSTRAINT "CustomFieldDefinition_scope_organization_check" CHECK (("scope" = 'SYSTEM' AND "organizationId" IS NULL) OR ("scope" = 'ORGANIZATION' AND "organizationId" IS NOT NULL));

ALTER TABLE "Department" ADD CONSTRAINT "Department_organizationId_parentId_fkey" FOREIGN KEY ("organizationId", "parentId") REFERENCES "Department"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Department" ADD CONSTRAINT "Department_organizationId_managerMembershipId_fkey" FOREIGN KEY ("organizationId", "managerMembershipId") REFERENCES "OrganizationMembership"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Role" ADD CONSTRAINT "Role_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_organizationId_departmentId_fkey" FOREIGN KEY ("organizationId", "departmentId") REFERENCES "Department"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrganizationSetting" ADD CONSTRAINT "OrganizationSetting_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomFieldDefinition" ADD CONSTRAINT "CustomFieldDefinition_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomFieldDefinition" ADD CONSTRAINT "CustomFieldDefinition_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
