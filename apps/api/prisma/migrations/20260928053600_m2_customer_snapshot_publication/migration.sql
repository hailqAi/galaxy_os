-- AlterTable
ALTER TABLE "ChatDocumentRelease" ADD COLUMN     "contractDocumentId" UUID,
ADD COLUMN     "installationPlanId" UUID,
ADD COLUMN     "paymentScheduleId" UUID,
ADD COLUMN     "prepareHash" TEXT,
ADD COLUMN     "prepareKey" UUID;

-- AlterTable
ALTER TABLE "ContractDocument" ADD COLUMN     "appendixId" UUID,
ADD COLUMN     "fileAssetId" UUID,
ADD COLUMN     "sourceFingerprint" TEXT,
ADD COLUMN     "sourceSnapshot" JSONB;

-- CreateIndex
CREATE UNIQUE INDEX "ChatDocumentRelease_roomId_preparedBy_prepareKey_key" ON "ChatDocumentRelease"("roomId", "preparedBy", "prepareKey");

-- AddForeignKey
ALTER TABLE "ChatDocumentRelease" ADD CONSTRAINT "ChatDocumentRelease_contractDocumentId_fkey" FOREIGN KEY ("contractDocumentId") REFERENCES "ContractDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatDocumentRelease" ADD CONSTRAINT "ChatDocumentRelease_paymentScheduleId_fkey" FOREIGN KEY ("paymentScheduleId") REFERENCES "CustomerPaymentSchedule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatDocumentRelease" ADD CONSTRAINT "ChatDocumentRelease_installationPlanId_fkey" FOREIGN KEY ("installationPlanId") REFERENCES "InstallationPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractDocument" ADD CONSTRAINT "ContractDocument_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "FileAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractDocument" ADD CONSTRAINT "ContractDocument_appendixId_fkey" FOREIGN KEY ("appendixId") REFERENCES "ContractAppendix"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Keep all legacy source families; require a grounded, idempotent snapshot for new ones.
ALTER TABLE "ChatDocumentRelease" DROP CONSTRAINT "ChatDocumentRelease_source_contract_check";
ALTER TABLE "ChatDocumentRelease" ADD CONSTRAINT "ChatDocumentRelease_source_contract_check" CHECK (
 num_nonnulls("sourceId", "quotationDocumentId", "technicalRevisionId", "sampleApprovalId", "handoverDocumentId", "contractDocumentId", "paymentScheduleId", "installationPlanId") = 1
 AND (("sourceId" IS NULL) = ("sourceVersionId" IS NULL))
 AND (("quotationDocumentId" IS NULL) = ("quotationApprovalId" IS NULL))
 AND (("technicalRevisionId" IS NULL AND "sampleApprovalId" IS NULL AND "handoverDocumentId" IS NULL AND "contractDocumentId" IS NULL AND "paymentScheduleId" IS NULL AND "installationPlanId" IS NULL) OR ("sourceFingerprint" IS NOT NULL AND "sourceSnapshot" IS NOT NULL))
 AND (("contractDocumentId" IS NULL AND "paymentScheduleId" IS NULL AND "installationPlanId" IS NULL) OR ("prepareKey" IS NOT NULL AND "prepareHash" IS NOT NULL))
);
