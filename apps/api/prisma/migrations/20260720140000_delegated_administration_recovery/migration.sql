CREATE TYPE "AdministrationScope" AS ENUM ('SELF', 'MANAGED_DEPARTMENTS', 'ORGANIZATION');

ALTER TABLE "OrganizationMembership"
ADD COLUMN "administrationScope" "AdministrationScope" NOT NULL DEFAULT 'SELF';

ALTER TABLE "Role"
ADD COLUMN "isProtected" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "isDelegable" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "administrationTier" INTEGER NOT NULL DEFAULT 0;

-- Correct the preceding authentication migration's misplaced lastSeenAt column.
ALTER TABLE "PasswordCredential" DROP COLUMN IF EXISTS "lastSeenAt";
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "ManagedDepartment" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "managerId" UUID NOT NULL,
  "departmentId" UUID NOT NULL,
  "status" "RecordStatus" NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdByUserId" UUID,
  "expiresAt" TIMESTAMP(3),
  CONSTRAINT "ManagedDepartment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ManagedDepartment_managerId_departmentId_key" ON "ManagedDepartment"("managerId", "departmentId");
CREATE INDEX "ManagedDepartment_organizationId_managerId_status_idx" ON "ManagedDepartment"("organizationId", "managerId", "status");
ALTER TABLE "ManagedDepartment" ADD CONSTRAINT "ManagedDepartment_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "OrganizationMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManagedDepartment" ADD CONSTRAINT "ManagedDepartment_organizationId_departmentId_fkey" FOREIGN KEY ("organizationId", "departmentId") REFERENCES "Department"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManagedDepartment" ADD CONSTRAINT "ManagedDepartment_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "PasswordResetToken" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "requestIp" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");
CREATE INDEX "PasswordResetToken_userId_expiresAt_idx" ON "PasswordResetToken"("userId", "expiresAt");
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
