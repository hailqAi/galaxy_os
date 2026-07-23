ALTER TABLE "Notification" ADD COLUMN "actorId" UUID,ADD COLUMN "projectId" UUID,ADD COLUMN "archivedAt" TIMESTAMP(3),ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "Notification_idempotencyKey_key" ON "Notification"("idempotencyKey");
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_actorId_fkey" FOREIGN KEY("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_projectId_fkey" FOREIGN KEY("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
