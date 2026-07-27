import {
  Body,
  Controller,
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
  CreateSupplierQuotationDto,
  SupplierQuotationsQuery,
  UpdateSupplierQuotationDto,
} from './procurement.dto';
import { ProcurementService } from './procurement.service';

@Controller('supplier-quotations')
export class SupplierQuotationController {
  constructor(
    @Inject(ProcurementService)
    private readonly procurement: ProcurementService,
  ) {}

  @Get()
  @RequirePermission('procurement.supplier_quotation.read')
  list(@Actor() actor: CurrentActor, @Query() query: SupplierQuotationsQuery) {
    return this.procurement.listSupplierQuotations(actor, query);
  }
  @Post()
  @RequirePermission('procurement.supplier_quotation.create')
  create(
    @Actor() actor: CurrentActor,
    @Body() data: CreateSupplierQuotationDto,
  ) {
    return this.procurement.createSupplierQuotation(actor, data);
  }
  @Get(':id')
  @RequirePermission('procurement.supplier_quotation.read')
  get(@Actor() actor: CurrentActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.procurement.getSupplierQuotation(actor, id);
  }
  @Patch(':id')
  @RequirePermission('procurement.supplier_quotation.update')
  update(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: UpdateSupplierQuotationDto,
  ) {
    return this.procurement.updateSupplierQuotation(actor, id, data);
  }
  @Post(':id/submit-review')
  @RequirePermission('procurement.supplier_quotation.review')
  review(@Actor() actor: CurrentActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.procurement.transitionSupplierQuotation(
      actor,
      id,
      'UNDER_REVIEW',
    );
  }
  @Post(':id/mark-compliant')
  @RequirePermission('procurement.supplier_quotation.review')
  compliant(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.procurement.transitionSupplierQuotation(actor, id, 'COMPLIANT');
  }
  @Post(':id/mark-partially-compliant')
  @RequirePermission('procurement.supplier_quotation.review')
  partiallyCompliant(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.procurement.transitionSupplierQuotation(
      actor,
      id,
      'PARTIALLY_COMPLIANT',
    );
  }
  @Post(':id/mark-non-compliant')
  @RequirePermission('procurement.supplier_quotation.review')
  nonCompliant(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.procurement.transitionSupplierQuotation(
      actor,
      id,
      'NON_COMPLIANT',
    );
  }
  @Post(':id/shortlist')
  @RequirePermission('procurement.supplier_quotation.review')
  shortlist(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.procurement.transitionSupplierQuotation(
      actor,
      id,
      'SHORTLISTED',
    );
  }
  @Post(':id/reject')
  @RequirePermission('procurement.supplier_quotation.review')
  reject(@Actor() actor: CurrentActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.procurement.transitionSupplierQuotation(actor, id, 'REJECTED');
  }
  @Post(':id/create-revision')
  @RequirePermission('procurement.supplier_quotation.update')
  revise(@Actor() actor: CurrentActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.procurement.reviseSupplierQuotation(actor, id);
  }
}
