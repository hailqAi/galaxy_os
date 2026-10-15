-- AlterTable
ALTER TABLE "ChatDocumentRelease" ADD COLUMN     "handoverDocumentId" UUID,
ADD COLUMN     "sampleApprovalId" UUID,
ADD COLUMN     "sourceFingerprint" TEXT,
ADD COLUMN     "sourceSnapshot" JSONB,
ADD COLUMN     "technicalRevisionId" UUID;

-- AddForeignKey
ALTER TABLE "ChatDocumentRelease" ADD CONSTRAINT "ChatDocumentRelease_technicalRevisionId_fkey" FOREIGN KEY ("technicalRevisionId") REFERENCES "TechnicalApprovalRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatDocumentRelease" ADD CONSTRAINT "ChatDocumentRelease_sampleApprovalId_fkey" FOREIGN KEY ("sampleApprovalId") REFERENCES "SampleApproval"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatDocumentRelease" ADD CONSTRAINT "ChatDocumentRelease_handoverDocumentId_fkey" FOREIGN KEY ("handoverDocumentId") REFERENCES "HandoverDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Pin exactly one source family; legacy proposal/quotation rows remain valid.
ALTER TABLE "ChatDocumentRelease" DROP CONSTRAINT "ChatDocumentRelease_source_contract_check";
ALTER TABLE "ChatDocumentRelease" ADD CONSTRAINT "ChatDocumentRelease_source_contract_check" CHECK (
  num_nonnulls("sourceId", "quotationDocumentId", "technicalRevisionId", "sampleApprovalId", "handoverDocumentId") = 1
  AND (("sourceId" IS NULL) = ("sourceVersionId" IS NULL))
  AND (("quotationDocumentId" IS NULL) = ("quotationApprovalId" IS NULL))
  AND (("technicalRevisionId" IS NULL AND "sampleApprovalId" IS NULL AND "handoverDocumentId" IS NULL)
    OR ("sourceFingerprint" IS NOT NULL AND "sourceSnapshot" IS NOT NULL))
);
