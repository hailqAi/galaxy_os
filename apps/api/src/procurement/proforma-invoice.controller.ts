import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Actor, RequirePermission } from '../access-control/access.decorators';
import { CurrentActor } from '../access-control/current-actor';
import {
  CreateProformaInvoiceDto,
  ProformaInvoiceDecisionDto,
  ProformaInvoiceDocumentDto,
  ProformaInvoicesQuery,
  UpdateProformaInvoiceDto,
} from './procurement.dto';
import { ProcurementService } from './procurement.service';

@Controller('proforma-invoices')
export class ProformaInvoiceController {
  constructor(
    @Inject(ProcurementService)
    private readonly procurement: ProcurementService,
  ) {}

  @Get()
  @RequirePermission('procurement.proforma_invoice.read')
  list(@Actor() actor: CurrentActor, @Query() query: ProformaInvoicesQuery) {
    return this.procurement.listProformaInvoices(actor, query);
  }

  @Post()
  @RequirePermission('procurement.proforma_invoice.create')
  create(@Actor() actor: CurrentActor, @Body() data: CreateProformaInvoiceDto) {
    return this.procurement.createProformaInvoice(actor, data);
  }

  @Get(':id')
  @RequirePermission('procurement.proforma_invoice.read')
  get(@Actor() actor: CurrentActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.procurement.getProformaInvoice(actor, id);
  }

  @Patch(':id')
  @RequirePermission('procurement.proforma_invoice.update')
  update(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: UpdateProformaInvoiceDto,
  ) {
    return this.procurement.updateProformaInvoice(actor, id, data);
  }

  @Delete(':id')
  @RequirePermission('procurement.proforma_invoice.update')
  remove(@Actor() actor: CurrentActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.procurement.deleteProformaInvoice(actor, id);
  }

  @Post(':id/verify')
  @RequirePermission('procurement.proforma_invoice.verify')
  verify(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: ProformaInvoiceDecisionDto,
  ) {
    return this.procurement.transitionProformaInvoice(
      actor,
      id,
      'VERIFIED',
      data.comment,
    );
  }

  @Post(':id/approve')
  @RequirePermission('procurement.proforma_invoice.approve')
  approve(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: ProformaInvoiceDecisionDto,
  ) {
    return this.procurement.transitionProformaInvoice(
      actor,
      id,
      'APPROVED',
      data.comment,
    );
  }

  @Post(':id/reject')
  @RequirePermission('procurement.proforma_invoice.approve')
  reject(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: ProformaInvoiceDecisionDto,
  ) {
    return this.procurement.rejectProformaInvoice(actor, id, data.comment);
  }

  @Post(':id/create-revision')
  @RequirePermission('procurement.proforma_invoice.create')
  revise(@Actor() actor: CurrentActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.procurement.reviseProformaInvoice(actor, id);
  }

  @Post(':id/supersede')
  @RequirePermission('procurement.proforma_invoice.approve')
  supersede(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: ProformaInvoiceDecisionDto,
  ) {
    return this.procurement.transitionProformaInvoice(
      actor,
      id,
      'SUPERSEDED',
      data.comment,
    );
  }

  @Post(':id/cancel')
  @RequirePermission('procurement.proforma_invoice.update')
  cancel(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: ProformaInvoiceDecisionDto,
  ) {
    return this.procurement.transitionProformaInvoice(
      actor,
      id,
      'CANCELLED',
      data.comment,
    );
  }

  @Post(':id/documents')
  @RequirePermission('procurement.proforma_invoice.update')
  document(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: ProformaInvoiceDocumentDto,
  ) {
    return this.procurement.addProformaInvoiceDocument(actor, id, data);
  }

  @Post(':id/create-payable')
  @RequirePermission('supplier_payable.create')
  payable(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.procurement.createSupplierPayableFromInvoice(actor, id);
  }
}
