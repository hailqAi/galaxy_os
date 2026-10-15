-- DropForeignKey
ALTER TABLE "ChatDocumentRelease" DROP CONSTRAINT "ChatDocumentRelease_sourceId_fkey";

-- DropForeignKey
ALTER TABLE "ChatDocumentRelease" DROP CONSTRAINT "ChatDocumentRelease_sourceVersionId_fkey";

-- AlterTable
ALTER TABLE "ChatDocumentRelease" ADD COLUMN     "quotationApprovalId" UUID,
ADD COLUMN     "quotationDocumentId" UUID,
ALTER COLUMN "sourceId" DROP NOT NULL,
ALTER COLUMN "sourceVersionId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "ChatDocumentRelease" ADD CONSTRAINT "ChatDocumentRelease_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ProjectRequiredDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatDocumentRelease" ADD CONSTRAINT "ChatDocumentRelease_sourceVersionId_fkey" FOREIGN KEY ("sourceVersionId") REFERENCES "ProjectRequiredDocumentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatDocumentRelease" ADD CONSTRAINT "ChatDocumentRelease_quotationDocumentId_fkey" FOREIGN KEY ("quotationDocumentId") REFERENCES "QuotationDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatDocumentRelease" ADD CONSTRAINT "ChatDocumentRelease_quotationApprovalId_fkey" FOREIGN KEY ("quotationApprovalId") REFERENCES "QuotationApproval"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Exactly one approved source; nullable FKs do not permit ungrounded publications.
ALTER TABLE "ChatDocumentRelease" ADD CONSTRAINT "ChatDocumentRelease_source_contract_check" CHECK (
  ("sourceId" IS NOT NULL AND "sourceVersionId" IS NOT NULL AND "quotationDocumentId" IS NULL AND "quotationApprovalId" IS NULL)
  OR ("sourceId" IS NULL AND "sourceVersionId" IS NULL AND "quotationDocumentId" IS NOT NULL AND "quotationApprovalId" IS NOT NULL)
);
