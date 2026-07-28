ALTER TABLE "Lead"
ADD COLUMN "attributionChannel" TEXT,
ADD COLUMN "contentItemId" UUID,
ADD COLUMN "utmCampaign" TEXT,
ADD COLUMN "utmMedium" TEXT,
ADD COLUMN "utmSource" TEXT;

CREATE INDEX "Lead_organizationId_campaignId_idx" ON "Lead"("organizationId", "campaignId");
CREATE INDEX "Lead_organizationId_contentItemId_idx" ON "Lead"("organizationId", "contentItemId");

ALTER TABLE "Lead" ADD CONSTRAINT "Lead_campaignId_fkey"
FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_contentItemId_fkey"
FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
