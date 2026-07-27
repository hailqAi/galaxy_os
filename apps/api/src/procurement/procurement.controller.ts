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
  CreatePurchaseRequestDto,
  ProcurementDecisionDto,
  PurchaseRequestsQuery,
  UpdatePurchaseRequestDto,
} from './procurement.dto';
import { ProcurementService } from './procurement.service';
@Controller('purchase-requests')
export class ProcurementController {
  constructor(
    @Inject(ProcurementService)
    private readonly procurement: ProcurementService,
  ) {}
  @Get() @RequirePermission('purchase_request.read') list(
    @Actor() a: CurrentActor,
    @Query() q: PurchaseRequestsQuery,
  ) {
    return this.procurement.list(a, q);
  }
  @Post() @RequirePermission('purchase_request.create') create(
    @Actor() a: CurrentActor,
    @Body() d: CreatePurchaseRequestDto,
  ) {
    return this.procurement.create(a, d);
  }
  @Get(':id') @RequirePermission('purchase_request.read') get(
    @Actor() a: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.procurement.get(a, id);
  }
  @Patch(':id') @RequirePermission('purchase_request.update') update(
    @Actor() a: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: UpdatePurchaseRequestDto,
  ) {
    return this.procurement.update(a, id, d);
  }
  @Delete(':id') @RequirePermission('purchase_request.delete') remove(
    @Actor() a: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.procurement.remove(a, id);
  }
  @Post(':id/submit') @RequirePermission('purchase_request.update') submit(
    @Actor() a: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: ProcurementDecisionDto,
  ) {
    return this.procurement.transition(a, id, 'SUBMITTED', d.comment);
  }
  @Post(':id/approve') @RequirePermission('purchase_request.approve') approve(
    @Actor() a: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: ProcurementDecisionDto,
  ) {
    return this.procurement.transition(a, id, 'APPROVED', d.comment);
  }
  @Post(':id/reject') @RequirePermission('purchase_request.approve') reject(
    @Actor() a: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: ProcurementDecisionDto,
  ) {
    return this.procurement.transition(a, id, 'REJECTED', d.comment);
  }
  @Post(':id/cancel') @RequirePermission('purchase_request.update') cancel(
    @Actor() a: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: ProcurementDecisionDto,
  ) {
    return this.procurement.transition(a, id, 'CANCELLED', d.comment);
  }
}
