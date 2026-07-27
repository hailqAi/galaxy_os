-- CreateTable
CREATE TABLE "Forwarder" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "contactName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "activeStatus" "RecordStatus" NOT NULL DEFAULT 'active',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Forwarder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FreightQuotation" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "forwarderId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "quotationNumber" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "exchangeRateSnapshot" DECIMAL(20,6) NOT NULL,
    "freightAmount" DECIMAL(20,2) NOT NULL,
    "otherAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "validUntil" TIMESTAMP(3),
    "notes" TEXT,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FreightQuotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "shipmentNumber" TEXT NOT NULL,
    "projectId" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "purchaseOrderId" UUID NOT NULL,
    "productionOrderId" UUID,
    "forwarderId" UUID,
    "idempotencyKey" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "incoterms" TEXT,
    "originCountry" TEXT NOT NULL,
    "originLocation" TEXT NOT NULL,
    "destinationCountry" TEXT NOT NULL,
    "destinationLocation" TEXT NOT NULL,
    "portOfLoading" TEXT,
    "portOfDischarge" TEXT,
    "etd" TIMESTAMP(3),
    "eta" TIMESTAMP(3),
    "actualDeparture" TIMESTAMP(3),
    "actualArrival" TIMESTAMP(3),
    "containerNumber" TEXT,
    "sealNumber" TEXT,
    "billOfLading" TEXT,
    "airWaybill" TEXT,
    "trackingNumber" TEXT,
    "trackingMode" TEXT NOT NULL DEFAULT 'MANUAL',
    "status" TEXT NOT NULL DEFAULT 'PLANNING',
    "notes" TEXT,
    "createdBy" UUID NOT NULL,
    "updatedBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentLeg" (
    "id" UUID NOT NULL,
    "shipmentId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "mode" TEXT NOT NULL,
    "carrier" TEXT,
    "origin" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "etd" TIMESTAMP(3),
    "eta" TIMESTAMP(3),
    "actualDeparture" TIMESTAMP(3),
    "actualArrival" TIMESTAMP(3),
    "trackingReference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',

    CONSTRAINT "ShipmentLeg_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentPackage" (
    "id" UUID NOT NULL,
    "shipmentId" UUID NOT NULL,
    "packageNumber" TEXT NOT NULL,
    "packageType" TEXT,
    "grossWeight" DECIMAL(20,3),
    "netWeight" DECIMAL(20,3),
    "volume" DECIMAL(20,3),
    "dimensions" JSONB,
    "marks" TEXT,

    CONSTRAINT "ShipmentPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentItem" (
    "id" UUID NOT NULL,
    "shipmentId" UUID NOT NULL,
    "purchaseOrderLineId" UUID NOT NULL,
    "productId" UUID,
    "variantId" UUID,
    "quantity" DECIMAL(20,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "unitValue" DECIMAL(20,2) NOT NULL,
    "weight" DECIMAL(20,3),
    "volume" DECIMAL(20,3),
    "packageId" UUID,

    CONSTRAINT "ShipmentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentDocument" (
    "id" UUID NOT NULL,
    "shipmentId" UUID NOT NULL,
    "fileId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShipmentDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentStatusHistory" (
    "id" UUID NOT NULL,
    "shipmentId" UUID NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "previousEtd" TIMESTAMP(3),
    "nextEtd" TIMESTAMP(3),
    "previousEta" TIMESTAMP(3),
    "nextEta" TIMESTAMP(3),
    "actorId" UUID NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShipmentStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomsDeclaration" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "shipmentId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "declarationNumber" TEXT NOT NULL,
    "declarationDate" TIMESTAMP(3) NOT NULL,
    "customsOffice" TEXT NOT NULL,
    "importerLegalEntity" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "customsValue" DECIMAL(20,2) NOT NULL,
    "exchangeRateSnapshot" DECIMAL(20,6) NOT NULL,
    "dutyAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "vatAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "otherTaxAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "totalTaxAmount" DECIMAL(20,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "clearanceDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdBy" UUID NOT NULL,
    "updatedBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomsDeclaration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomsDeclarationLine" (
    "id" UUID NOT NULL,
    "customsDeclarationId" UUID NOT NULL,
    "shipmentItemId" UUID NOT NULL,
    "hsCode" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(20,3) NOT NULL,
    "customsValue" DECIMAL(20,2) NOT NULL,
    "dutyRate" DECIMAL(9,4) NOT NULL DEFAULT 0,
    "dutyAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,

    CONSTRAINT "CustomsDeclarationLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportTax" (
    "id" UUID NOT NULL,
    "customsDeclarationId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "taxableAmount" DECIMAL(20,2) NOT NULL,
    "rate" DECIMAL(9,4) NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "paymentReference" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportTax_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomsDocument" (
    "id" UUID NOT NULL,
    "customsDeclarationId" UUID NOT NULL,
    "fileId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomsDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomsStatusHistory" (
    "id" UUID NOT NULL,
    "customsDeclarationId" UUID NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "actorId" UUID NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomsStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LandedCost" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "shipmentId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "baseCurrency" TEXT NOT NULL,
    "totalAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "finalizedAt" TIMESTAMP(3),
    "finalizedBy" UUID,
    "idempotencyKey" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "createdBy" UUID NOT NULL,
    "updatedBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LandedCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LandedCostLine" (
    "id" UUID NOT NULL,
    "landedCostId" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "originalCurrency" TEXT NOT NULL,
    "originalAmount" DECIMAL(20,2) NOT NULL,
    "exchangeRateSnapshot" DECIMAL(20,6) NOT NULL,
    "baseAmount" DECIMAL(20,2) NOT NULL,
    "allocationMethod" TEXT NOT NULL,
    "manualReason" TEXT,

    CONSTRAINT "LandedCostLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LandedCostAllocation" (
    "id" UUID NOT NULL,
    "landedCostLineId" UUID NOT NULL,
    "shipmentItemId" UUID NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LandedCostAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LandedCostStatusHistory" (
    "id" UUID NOT NULL,
    "landedCostId" UUID NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "actorId" UUID NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LandedCostStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Forwarder_organizationId_activeStatus_idx" ON "Forwarder"("organizationId", "activeStatus");

-- CreateIndex
CREATE UNIQUE INDEX "Forwarder_organizationId_code_key" ON "Forwarder"("organizationId", "code");

-- CreateIndex
CREATE INDEX "FreightQuotation_organizationId_projectId_idx" ON "FreightQuotation"("organizationId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "FreightQuotation_organizationId_forwarderId_quotationNumber_key" ON "FreightQuotation"("organizationId", "forwarderId", "quotationNumber");

-- CreateIndex
CREATE INDEX "Shipment_organizationId_projectId_supplierId_purchaseOrderI_idx" ON "Shipment"("organizationId", "projectId", "supplierId", "purchaseOrderId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_organizationId_shipmentNumber_key" ON "Shipment"("organizationId", "shipmentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_organizationId_idempotencyKey_key" ON "Shipment"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "ShipmentLeg_shipmentId_sequence_key" ON "ShipmentLeg"("shipmentId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "ShipmentPackage_shipmentId_packageNumber_key" ON "ShipmentPackage"("shipmentId", "packageNumber");

-- CreateIndex
CREATE INDEX "ShipmentItem_shipmentId_productId_variantId_idx" ON "ShipmentItem"("shipmentId", "productId", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "ShipmentItem_shipmentId_purchaseOrderLineId_packageId_key" ON "ShipmentItem"("shipmentId", "purchaseOrderLineId", "packageId");

-- CreateIndex
CREATE INDEX "ShipmentDocument_fileId_idx" ON "ShipmentDocument"("fileId");

-- CreateIndex
CREATE UNIQUE INDEX "ShipmentDocument_shipmentId_type_version_key" ON "ShipmentDocument"("shipmentId", "type", "version");

-- CreateIndex
CREATE INDEX "ShipmentStatusHistory_shipmentId_createdAt_idx" ON "ShipmentStatusHistory"("shipmentId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomsDeclaration_organizationId_projectId_shipmentId_stat_idx" ON "CustomsDeclaration"("organizationId", "projectId", "shipmentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CustomsDeclaration_organizationId_declarationNumber_key" ON "CustomsDeclaration"("organizationId", "declarationNumber");

-- CreateIndex
CREATE UNIQUE INDEX "CustomsDeclarationLine_customsDeclarationId_shipmentItemId_key" ON "CustomsDeclarationLine"("customsDeclarationId", "shipmentItemId");

-- CreateIndex
CREATE INDEX "ImportTax_customsDeclarationId_idx" ON "ImportTax"("customsDeclarationId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomsDocument_customsDeclarationId_fileId_key" ON "CustomsDocument"("customsDeclarationId", "fileId");

-- CreateIndex
CREATE INDEX "CustomsStatusHistory_customsDeclarationId_createdAt_idx" ON "CustomsStatusHistory"("customsDeclarationId", "createdAt");

-- CreateIndex
CREATE INDEX "LandedCost_organizationId_projectId_shipmentId_status_idx" ON "LandedCost"("organizationId", "projectId", "shipmentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "LandedCost_organizationId_number_revision_key" ON "LandedCost"("organizationId", "number", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "LandedCost_organizationId_idempotencyKey_key" ON "LandedCost"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "LandedCostLine_landedCostId_idx" ON "LandedCostLine"("landedCostId");

-- CreateIndex
CREATE UNIQUE INDEX "LandedCostAllocation_landedCostLineId_shipmentItemId_key" ON "LandedCostAllocation"("landedCostLineId", "shipmentItemId");

-- CreateIndex
CREATE INDEX "LandedCostStatusHistory_landedCostId_createdAt_idx" ON "LandedCostStatusHistory"("landedCostId", "createdAt");

-- AddForeignKey
ALTER TABLE "FreightQuotation" ADD CONSTRAINT "FreightQuotation_forwarderId_fkey" FOREIGN KEY ("forwarderId") REFERENCES "Forwarder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_forwarderId_fkey" FOREIGN KEY ("forwarderId") REFERENCES "Forwarder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentLeg" ADD CONSTRAINT "ShipmentLeg_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentPackage" ADD CONSTRAINT "ShipmentPackage_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentItem" ADD CONSTRAINT "ShipmentItem_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentItem" ADD CONSTRAINT "ShipmentItem_purchaseOrderLineId_fkey" FOREIGN KEY ("purchaseOrderLineId") REFERENCES "PurchaseOrderLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentItem" ADD CONSTRAINT "ShipmentItem_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "ShipmentPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentDocument" ADD CONSTRAINT "ShipmentDocument_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentStatusHistory" ADD CONSTRAINT "ShipmentStatusHistory_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomsDeclaration" ADD CONSTRAINT "CustomsDeclaration_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomsDeclarationLine" ADD CONSTRAINT "CustomsDeclarationLine_customsDeclarationId_fkey" FOREIGN KEY ("customsDeclarationId") REFERENCES "CustomsDeclaration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomsDeclarationLine" ADD CONSTRAINT "CustomsDeclarationLine_shipmentItemId_fkey" FOREIGN KEY ("shipmentItemId") REFERENCES "ShipmentItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportTax" ADD CONSTRAINT "ImportTax_customsDeclarationId_fkey" FOREIGN KEY ("customsDeclarationId") REFERENCES "CustomsDeclaration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomsDocument" ADD CONSTRAINT "CustomsDocument_customsDeclarationId_fkey" FOREIGN KEY ("customsDeclarationId") REFERENCES "CustomsDeclaration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomsStatusHistory" ADD CONSTRAINT "CustomsStatusHistory_customsDeclarationId_fkey" FOREIGN KEY ("customsDeclarationId") REFERENCES "CustomsDeclaration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandedCost" ADD CONSTRAINT "LandedCost_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandedCostLine" ADD CONSTRAINT "LandedCostLine_landedCostId_fkey" FOREIGN KEY ("landedCostId") REFERENCES "LandedCost"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandedCostAllocation" ADD CONSTRAINT "LandedCostAllocation_landedCostLineId_fkey" FOREIGN KEY ("landedCostLineId") REFERENCES "LandedCostLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandedCostAllocation" ADD CONSTRAINT "LandedCostAllocation_shipmentItemId_fkey" FOREIGN KEY ("shipmentItemId") REFERENCES "ShipmentItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandedCostStatusHistory" ADD CONSTRAINT "LandedCostStatusHistory_landedCostId_fkey" FOREIGN KEY ("landedCostId") REFERENCES "LandedCost"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
