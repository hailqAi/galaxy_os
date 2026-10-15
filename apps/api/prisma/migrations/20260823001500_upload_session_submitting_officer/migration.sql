ALTER TABLE "UploadSession"
  ADD COLUMN "submittingOfficerId" UUID;

ALTER TABLE "UploadSession"
  ADD CONSTRAINT "UploadSession_submittingOfficerId_fkey"
  FOREIGN KEY ("submittingOfficerId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
