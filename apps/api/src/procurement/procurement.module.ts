import { Module } from '@nestjs/common';
import { AccessControlModule } from '../access-control/access-control.module';
import { PrismaService } from '../prisma.service';
import { ProcurementController } from './procurement.controller';
import { ProcurementService } from './procurement.service';
import { RFQController } from './rfq.controller';
import { SupplierQuotationController } from './supplier-quotation.controller';
import { SupplierComparisonController } from './supplier-comparison.controller';
import { PurchaseOrderController } from './purchase-order.controller';
import { ProformaInvoiceController } from './proforma-invoice.controller';
import { SupplierPayablesController } from './supplier-payables.controller';
@Module({
  imports: [AccessControlModule],
  controllers: [
    ProcurementController,
    RFQController,
    SupplierQuotationController,
    SupplierComparisonController,
    PurchaseOrderController,
    ProformaInvoiceController,
    SupplierPayablesController,
  ],
  providers: [ProcurementService, PrismaService],
})
export class ProcurementModule {}
