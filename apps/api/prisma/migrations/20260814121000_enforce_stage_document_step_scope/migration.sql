ALTER TABLE "ProjectStageOneDocument"
  ADD CONSTRAINT "ProjectStageOneDocument_stageKey_step_check"
  CHECK (
    ("stageKey" = 'STAGE_1' AND "step" IS NOT NULL)
    OR ("stageKey" <> 'STAGE_1' AND "step" IS NULL)
  ) NOT VALID;

ALTER TABLE "ProjectStageOneDocument"
  VALIDATE CONSTRAINT "ProjectStageOneDocument_stageKey_step_check";
