-- AlterTable
ALTER TABLE "ChatRoom" ADD COLUMN     "productLineId" UUID,
ADD COLUMN     "taskId" UUID;

-- AddForeignKey
ALTER TABLE "ChatRoom" ADD CONSTRAINT "ChatRoom_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatRoom" ADD CONSTRAINT "ChatRoom_productLineId_fkey" FOREIGN KEY ("productLineId") REFERENCES "ProjectProductLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
