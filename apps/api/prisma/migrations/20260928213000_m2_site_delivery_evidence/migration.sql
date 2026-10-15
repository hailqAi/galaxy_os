-- Preflight: existing non-null SiteDelivery.evidenceFileId values must resolve to FileAsset.
-- Legacy rows keep nullable pins and remain unavailable for publication; no backfill.
BEGIN;

-- AlterTable
ALTER TABLE "ChatDocumentRelease" ADD COLUMN     "siteDeliveryId" UUID;

-- AlterTable
ALTER TABLE "SiteDelivery" ADD COLUMN     "clientKey" UUID,
ADD COLUMN     "evidenceChecksum" TEXT,
ADD COLUMN     "evidenceFileVersion" INTEGER,
ADD COLUMN     "requestHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "SiteDelivery_installationWorkOrderId_createdBy_clientKey_key" ON "SiteDelivery"("installationWorkOrderId", "createdBy", "clientKey");

-- AddForeignKey
ALTER TABLE "ChatDocumentRelease" ADD CONSTRAINT "ChatDocumentRelease_siteDeliveryId_fkey" FOREIGN KEY ("siteDeliveryId") REFERENCES "SiteDelivery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteDelivery" ADD CONSTRAINT "SiteDelivery_evidenceFileId_fkey" FOREIGN KEY ("evidenceFileId") REFERENCES "FileAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- New records are pinned and idempotent; legacy records retain their existing evidence ID.
ALTER TABLE "SiteDelivery" ADD CONSTRAINT "SiteDelivery_evidence_pin_check" CHECK (
  ("clientKey" IS NULL AND "requestHash" IS NULL AND "evidenceFileVersion" IS NULL AND "evidenceChecksum" IS NULL)
  OR ("clientKey" IS NOT NULL AND "requestHash" IS NOT NULL AND "requestHash" ~ '^[0-9a-f]{64}$'
    AND "evidenceFileId" IS NOT NULL AND "evidenceFileVersion" IS NOT NULL AND "evidenceFileVersion" > 0
    AND "evidenceChecksum" IS NOT NULL AND "evidenceChecksum" ~ '^[0-9a-f]{64}$')
);

ALTER TABLE "ChatDocumentRelease" DROP CONSTRAINT "ChatDocumentRelease_source_contract_check";
ALTER TABLE "ChatDocumentRelease" ADD CONSTRAINT "ChatDocumentRelease_source_contract_check" CHECK (
  num_nonnulls("sourceId", "quotationDocumentId", "technicalRevisionId", "sampleApprovalId", "handoverDocumentId", "contractDocumentId", "paymentScheduleId", "installationPlanId", "customerPaymentId", "siteDeliveryId") = 1
  AND (("sourceId" IS NULL) = ("sourceVersionId" IS NULL))
  AND (("quotationDocumentId" IS NULL) = ("quotationApprovalId" IS NULL))
  AND (("technicalRevisionId" IS NULL AND "sampleApprovalId" IS NULL AND "handoverDocumentId" IS NULL AND "contractDocumentId" IS NULL AND "paymentScheduleId" IS NULL AND "installationPlanId" IS NULL AND "customerPaymentId" IS NULL AND "siteDeliveryId" IS NULL)
    OR ("sourceFingerprint" IS NOT NULL AND "sourceSnapshot" IS NOT NULL))
  AND (("contractDocumentId" IS NULL AND "paymentScheduleId" IS NULL AND "installationPlanId" IS NULL AND "customerPaymentId" IS NULL AND "siteDeliveryId" IS NULL)
    OR ("prepareKey" IS NOT NULL AND "prepareHash" IS NOT NULL))
  AND ("siteDeliveryId" IS NULL OR COALESCE(
    jsonb_typeof("sourceSnapshot") = 'object'
    AND "sourceSnapshot"->>'sourceType' = 'SITE_DELIVERY'
    AND "sourceSnapshot"->>'sourceId' = "siteDeliveryId"::text, false))
);
COMMIT;
