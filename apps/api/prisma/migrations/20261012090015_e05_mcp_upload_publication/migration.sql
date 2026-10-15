-- AlterTable
ALTER TABLE "UploadSession" ADD COLUMN     "mcpArtifactId" UUID;

-- AddForeignKey
ALTER TABLE "UploadSession" ADD CONSTRAINT "UploadSession_mcpArtifactId_fkey" FOREIGN KEY ("mcpArtifactId") REFERENCES "McpArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
