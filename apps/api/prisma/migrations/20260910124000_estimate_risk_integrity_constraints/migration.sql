ALTER TABLE "EstimateLineItem"
  ADD CONSTRAINT "EstimateLineItem_priceSourceType_check"
    CHECK (
      "priceSourceType" IS NULL
      OR "priceSourceType" IN ('SUPPLIER_QUOTATION', 'HISTORICAL', 'STANDARD', 'MANUAL')
    ),
  ADD CONSTRAINT "EstimateLineItem_confirmedSource_check"
    CHECK (
      "priceStatus" <> 'CONFIRMED'
      OR (
        "priceSourceType" IS NOT NULL
        AND "priceQuotedAt" IS NOT NULL
        AND NULLIF(BTRIM("sourceDocument"), '') IS NOT NULL
      )
    ),
  ADD CONSTRAINT "EstimateLineItem_priceValidity_check"
    CHECK (
      "priceQuotedAt" IS NULL
      OR "priceValidUntil" IS NULL
      OR "priceValidUntil" >= "priceQuotedAt"
    );

ALTER TABLE "ProjectRisk"
  ADD CONSTRAINT "ProjectRisk_category_check"
    CHECK (
      "category" IN (
        'DESIGN', 'CUSTOMER', 'SUPPLIER', 'PRODUCTION', 'QUALITY_SAFETY',
        'LOGISTICS', 'SITE', 'INSTALLATION', 'FINANCIAL', 'CONTRACT',
        'WARRANTY', 'SCHEDULE'
      )
    ),
  ADD CONSTRAINT "ProjectRisk_stage_check"
    CHECK (
      "stage" IN ('STAGE_ONE', 'STAGE_TWO', 'STAGE_THREE', 'STAGE_FOUR', 'STAGE_FIVE')
    ),
  ADD CONSTRAINT "ProjectRisk_status_check"
    CHECK ("status" IN ('OPEN', 'TREATING', 'ACCEPTED', 'OCCURRED', 'CLOSED')),
  ADD CONSTRAINT "ProjectRisk_emv_check"
    CHECK (
      ("probability" IS NULL AND "emv" IS NULL)
      OR (
        "probability" IS NOT NULL
        AND "emv" = ROUND("probability" * "financialImpact", 2)
      )
    );

ALTER TABLE "EstimateRiskAllocation"
  ADD CONSTRAINT "EstimateRiskAllocation_status_check"
    CHECK ("status" IN ('ALLOCATED', 'USED', 'RELEASED'));
