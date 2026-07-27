CREATE TABLE "ProformaInvoice" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "piNumber" TEXT NOT NULL,
    "supplierId" UUID NOT NULL,
    "purchaseOrderId" UUID NOT NULL,
    "piDate" TIMESTAMP(3) NOT NULL,
    "receivedDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "currency" TEXT NOT NULL,
    "exchangeRateSnapshot" DECIMAL(20,6) NOT NULL,
    "subtotal" DECIMAL(20,2) NOT NULL,
    "shippingAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "insuranceAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "otherAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(20,2) NOT NULL,
    "paymentTerms" TEXT,
    "bankReferenceProtected" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "exceedsCommitment" BOOLEAN NOT NULL DEFAULT false,
    "supersedesId" UUID,
    "createdBy" UUID NOT NULL,
    "updatedBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "ProformaInvoice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProformaInvoiceLine" (
    "id" UUID NOT NULL,
    "proformaInvoiceId" UUID NOT NULL,
    "purchaseOrderLineId" UUID NOT NULL,
    "productId" UUID,
    "variantId" UUID,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(20,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "unitPrice" DECIMAL(20,2) NOT NULL,
    "lineTotal" DECIMAL(20,2) NOT NULL,
    "notes" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ProformaInvoiceLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProformaInvoiceDocument" (
    "id" UUID NOT NULL,
    "proformaInvoiceId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "uploadedBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProformaInvoiceDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProformaInvoiceStatusHistory" (
    "id" UUID NOT NULL,
    "proformaInvoiceId" UUID NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "actorId" UUID NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProformaInvoiceStatusHistory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupplierPayable" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "purchaseOrderId" UUID NOT NULL,
    "proformaInvoiceId" UUID NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "paidAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "outstandingAmount" DECIMAL(20,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SupplierPayable_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProformaInvoice_organizationId_purchaseOrderId_supplierId_s_idx" ON "ProformaInvoice"("organizationId", "purchaseOrderId", "supplierId", "status", "deletedAt");
CREATE UNIQUE INDEX "ProformaInvoice_organizationId_piNumber_version_key" ON "ProformaInvoice"("organizationId", "piNumber", "version");
CREATE INDEX "ProformaInvoiceLine_proformaInvoiceId_position_idx" ON "ProformaInvoiceLine"("proformaInvoiceId", "position");
CREATE INDEX "ProformaInvoiceLine_purchaseOrderLineId_idx" ON "ProformaInvoiceLine"("purchaseOrderLineId");
CREATE UNIQUE INDEX "ProformaInvoiceDocument_proformaInvoiceId_version_key" ON "ProformaInvoiceDocument"("proformaInvoiceId", "version");
CREATE INDEX "ProformaInvoiceStatusHistory_proformaInvoiceId_createdAt_idx" ON "ProformaInvoiceStatusHistory"("proformaInvoiceId", "createdAt");
CREATE UNIQUE INDEX "SupplierPayable_proformaInvoiceId_key" ON "SupplierPayable"("proformaInvoiceId");

ALTER TABLE "ProformaInvoice" ADD CONSTRAINT "ProformaInvoice_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProformaInvoice" ADD CONSTRAINT "ProformaInvoice_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProformaInvoiceLine" ADD CONSTRAINT "ProformaInvoiceLine_proformaInvoiceId_fkey" FOREIGN KEY ("proformaInvoiceId") REFERENCES "ProformaInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProformaInvoiceDocument" ADD CONSTRAINT "ProformaInvoiceDocument_proformaInvoiceId_fkey" FOREIGN KEY ("proformaInvoiceId") REFERENCES "ProformaInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProformaInvoiceStatusHistory" ADD CONSTRAINT "ProformaInvoiceStatusHistory_proformaInvoiceId_fkey" FOREIGN KEY ("proformaInvoiceId") REFERENCES "ProformaInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierPayable" ADD CONSTRAINT "SupplierPayable_proformaInvoiceId_fkey" FOREIGN KEY ("proformaInvoiceId") REFERENCES "ProformaInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
