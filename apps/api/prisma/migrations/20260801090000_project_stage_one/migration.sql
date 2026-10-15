CREATE TYPE "ProjectStage" AS ENUM ('STAGE_ONE', 'STAGE_TWO', 'STAGE_THREE', 'STAGE_FOUR', 'STAGE_FIVE');
CREATE TYPE "ProjectStageOneStep" AS ENUM ('ASSIGNMENT', 'SURVEY', 'PROPOSAL', 'FINANCIAL_PLANNING', 'KICKOFF_APPROVAL');
CREATE TYPE "ProjectStageApprovalDecision" AS ENUM ('APPROVED', 'APPROVED_WITH_COMMENTS', 'REVISION_REQUIRED', 'REJECTED');

CREATE TABLE "ProjectStageState" (
  "id" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "stage" "ProjectStage" NOT NULL,
  "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
  "completedBy" UUID,
  "completedAt" TIMESTAMP(3),
  "gateDecisionVersion" INTEGER NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectStageState_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectStageStep" (
  "id" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "stage" "ProjectStage" NOT NULL,
  "step" "ProjectStageOneStep" NOT NULL,
  "ownerUserId" UUID,
  "dueDate" TIMESTAMP(3),
  "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
  "notApplicableReason" TEXT,
  "notApplicableBy" UUID,
  "notApplicableAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectStageStep_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectStageApproval" (
  "id" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "stage" "ProjectStage" NOT NULL DEFAULT 'STAGE_ONE',
  "version" INTEGER NOT NULL,
  "status" "ApprovalStatus" NOT NULL DEFAULT 'DRAFT',
  "decision" "ProjectStageApprovalDecision",
  "submittedBy" UUID,
  "submittedAt" TIMESTAMP(3),
  "reviewedBy" UUID,
  "decidedAt" TIMESTAMP(3),
  "comments" TEXT,
  "evidenceFileId" UUID,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectStageApproval_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectStageOnePlan" (
  "projectId" UUID NOT NULL,
  "source" TEXT,
  "legalEntityText" TEXT,
  "scopeFlags" JSONB,
  "scopeNotes" TEXT,
  "plannedSurveyAt" TIMESTAMP(3),
  "plannedProposalAt" TIMESTAMP(3),
  "plannedFinancialPlanAt" TIMESTAMP(3),
  "plannedKickoffAt" TIMESTAMP(3),
  "responsibilityNotes" TEXT,
  "siteConstraints" TEXT,
  "proposalBaseline" TEXT,
  "proposalMilestones" JSONB,
  "proposalWbs" JSONB,
  "riskNotes" TEXT,
  "resourceNotes" TEXT,
  "preliminaryRevenue" DECIMAL(20,2),
  "preliminaryCost" DECIMAL(20,2),
  "preliminaryMargin" DECIMAL(20,2),
  "preliminaryCurrency" VARCHAR(3),
  "preliminaryFinancialPlanDate" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectStageOnePlan_pkey" PRIMARY KEY ("projectId")
);

CREATE UNIQUE INDEX "ProjectStageState_projectId_stage_key" ON "ProjectStageState"("projectId", "stage");
CREATE INDEX "ProjectStageState_projectId_stage_status_idx" ON "ProjectStageState"("projectId", "stage", "status");
CREATE UNIQUE INDEX "ProjectStageStep_projectId_stage_step_key" ON "ProjectStageStep"("projectId", "stage", "step");
CREATE INDEX "ProjectStageStep_projectId_stage_status_idx" ON "ProjectStageStep"("projectId", "stage", "status");
CREATE INDEX "ProjectStageStep_ownerUserId_dueDate_idx" ON "ProjectStageStep"("ownerUserId", "dueDate");
CREATE UNIQUE INDEX "ProjectStageApproval_projectId_stage_version_key" ON "ProjectStageApproval"("projectId", "stage", "version");
CREATE UNIQUE INDEX "ProjectStageApproval_projectId_idempotencyKey_key" ON "ProjectStageApproval"("projectId", "idempotencyKey");
CREATE INDEX "ProjectStageApproval_projectId_stage_status_createdAt_idx" ON "ProjectStageApproval"("projectId", "stage", "status", "createdAt");

ALTER TABLE "ProjectStageState" ADD CONSTRAINT "ProjectStageState_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectStageStep" ADD CONSTRAINT "ProjectStageStep_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectStageApproval" ADD CONSTRAINT "ProjectStageApproval_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectStageOnePlan" ADD CONSTRAINT "ProjectStageOnePlan_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "Permission" ("id", "code", "name", "description", "module", "isProtected", "isDelegable", "createdAt")
SELECT gen_random_uuid(), code, code, 'Stage 1 Project capability', 'project', false, true, CURRENT_TIMESTAMP
FROM unnest(ARRAY[
  'project.stage1.submit',
  'project.stage1.review',
  'project.stage1.finance.read',
  'project.stage1.finance.manage',
  'project.stage1.complete_gate',
  'project.survey.not_applicable'
]) AS code
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId", "createdAt")
SELECT role."id", permission."id", CURRENT_TIMESTAMP
FROM "Role" role
CROSS JOIN "Permission" permission
WHERE role."category" = 'SYSTEM'
  AND permission."code" IN (
    'project.stage1.submit',
    'project.stage1.review',
    'project.stage1.finance.read',
    'project.stage1.finance.manage',
    'project.stage1.complete_gate',
    'project.survey.not_applicable'
  )
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
