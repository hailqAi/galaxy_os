-- AlterTable
ALTER TABLE "ChatDocumentRelease" ADD COLUMN     "publishedRecipients" JSONB,
ADD COLUMN     "reviewedRecipientHash" TEXT;
