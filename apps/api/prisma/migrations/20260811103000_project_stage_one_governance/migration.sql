ALTER TABLE "ProjectStageOnePlan"
ADD COLUMN "governanceCoordinatorUserIds" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];
