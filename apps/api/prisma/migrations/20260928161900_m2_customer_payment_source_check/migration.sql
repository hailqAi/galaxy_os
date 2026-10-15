ALTER TABLE "ChatDocumentRelease"
DROP CONSTRAINT "ChatDocumentRelease_source_contract_check";

ALTER TABLE "ChatDocumentRelease"
ADD CONSTRAINT "ChatDocumentRelease_source_contract_check" CHECK (
  num_nonnulls(
    "sourceId",
    "quotationDocumentId",
    "technicalRevisionId",
    "sampleApprovalId",
    "handoverDocumentId",
    "contractDocumentId",
    "paymentScheduleId",
    "installationPlanId",
    "customerPaymentId"
  ) = 1
  AND (("sourceId" IS NULL) = ("sourceVersionId" IS NULL))
  AND (("quotationDocumentId" IS NULL) = ("quotationApprovalId" IS NULL))
  AND (
    (
      "technicalRevisionId" IS NULL
      AND "sampleApprovalId" IS NULL
      AND "handoverDocumentId" IS NULL
      AND "contractDocumentId" IS NULL
      AND "paymentScheduleId" IS NULL
      AND "installationPlanId" IS NULL
      AND "customerPaymentId" IS NULL
    )
    OR ("sourceFingerprint" IS NOT NULL AND "sourceSnapshot" IS NOT NULL)
  )
  AND (
    (
      "contractDocumentId" IS NULL
      AND "paymentScheduleId" IS NULL
      AND "installationPlanId" IS NULL
      AND "customerPaymentId" IS NULL
    )
    OR ("prepareKey" IS NOT NULL AND "prepareHash" IS NOT NULL)
  )
);
