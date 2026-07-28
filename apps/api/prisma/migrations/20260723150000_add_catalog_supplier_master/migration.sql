CREATE TABLE "Brand" (
  "id" UUID NOT NULL, "organizationId" UUID NOT NULL, "name" TEXT NOT NULL,
  "country" TEXT, "website" TEXT, "brandType" TEXT, "ecosystem" TEXT,
  "defaultCurrency" TEXT NOT NULL DEFAULT 'EUR', "defaultLeadTimeDays" INTEGER,
  "warrantyPolicy" TEXT, "activeStatus" "RecordStatus" NOT NULL DEFAULT 'active',
  "notes" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Product" (
  "id" UUID NOT NULL, "organizationId" UUID NOT NULL, "brandId" UUID NOT NULL,
  "productCode" TEXT NOT NULL, "name" TEXT NOT NULL, "collection" TEXT,
  "category" TEXT, "description" TEXT, "unit" TEXT NOT NULL, "dimensions" JSONB,
  "weight" DECIMAL(20,3), "materials" TEXT, "finishes" TEXT, "technicalData" JSONB,
  "warrantyMonths" INTEGER, "installationRequired" BOOLEAN NOT NULL DEFAULT false,
  "serialTrackingRequired" BOOLEAN NOT NULL DEFAULT false,
  "lotTrackingRequired" BOOLEAN NOT NULL DEFAULT false,
  "activeStatus" "RecordStatus" NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ProductVariant" (
  "id" UUID NOT NULL, "productId" UUID NOT NULL, "code" TEXT NOT NULL,
  "name" TEXT NOT NULL, "attributes" JSONB NOT NULL,
  "activeStatus" "RecordStatus" NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Supplier" (
  "id" UUID NOT NULL, "organizationId" UUID NOT NULL, "legalName" TEXT NOT NULL,
  "tradingName" TEXT, "country" TEXT NOT NULL, "address" TEXT, "taxVatNumber" TEXT,
  "website" TEXT, "brandsSupplied" JSONB, "languages" TEXT[], "currency" TEXT NOT NULL,
  "paymentTerms" TEXT, "incoterms" TEXT, "typicalLeadTimeDays" INTEGER,
  "bankInformationReference" TEXT, "discountAgreement" TEXT, "territory" TEXT,
  "authorizedDistributorStatus" BOOLEAN NOT NULL DEFAULT false,
  "activeStatus" "RecordStatus" NOT NULL DEFAULT 'active', "riskNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SupplierContact" (
  "id" UUID NOT NULL, "organizationId" UUID NOT NULL, "supplierId" UUID NOT NULL,
  "name" TEXT NOT NULL, "position" TEXT, "department" TEXT, "email" TEXT, "phone" TEXT,
  "messagingReference" TEXT, "language" TEXT, "timezone" TEXT,
  "preferredCommunicationChannel" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "SupplierContact_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Brand_organizationId_name_key" ON "Brand"("organizationId","name");
CREATE INDEX "Brand_organizationId_activeStatus_idx" ON "Brand"("organizationId","activeStatus");
CREATE UNIQUE INDEX "Product_organizationId_productCode_key" ON "Product"("organizationId","productCode");
CREATE INDEX "Product_organizationId_brandId_activeStatus_idx" ON "Product"("organizationId","brandId","activeStatus");
CREATE UNIQUE INDEX "ProductVariant_productId_code_key" ON "ProductVariant"("productId","code");
CREATE INDEX "ProductVariant_productId_activeStatus_idx" ON "ProductVariant"("productId","activeStatus");
CREATE UNIQUE INDEX "Supplier_organizationId_legalName_key" ON "Supplier"("organizationId","legalName");
CREATE INDEX "Supplier_organizationId_activeStatus_idx" ON "Supplier"("organizationId","activeStatus");
CREATE INDEX "SupplierContact_organizationId_supplierId_idx" ON "SupplierContact"("organizationId","supplierId");
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Product" ADD CONSTRAINT "Product_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Product" ADD CONSTRAINT "Product_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierContact" ADD CONSTRAINT "SupplierContact_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierContact" ADD CONSTRAINT "SupplierContact_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
