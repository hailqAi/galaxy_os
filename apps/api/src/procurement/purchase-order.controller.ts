import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Actor, RequirePermission } from '../access-control/access.decorators';
import { CurrentActor } from '../access-control/current-actor';
import { CreatePurchaseOrderDto } from './procurement.dto';
import { ProcurementService } from './procurement.service';

@Controller('purchase-orders')
export class PurchaseOrderController {
  constructor(
    @Inject(ProcurementService)
    private readonly procurement: ProcurementService,
  ) {}
  @Get()
  @RequirePermission('procurement.purchase_order.read')
  list(@Actor() actor: CurrentActor, @Query('projectId') projectId?: string) {
    return this.procurement.listPurchaseOrders(actor, projectId);
  }
  @Post()
  @RequirePermission('procurement.purchase_order.create')
  create(@Actor() actor: CurrentActor, @Body() data: CreatePurchaseOrderDto) {
    return this.procurement.createPurchaseOrder(actor, data);
  }
  @Get(':id')
  @RequirePermission('procurement.purchase_order.read')
  get(@Actor() actor: CurrentActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.procurement.getPurchaseOrder(actor, id);
  }
  @Post(':id/submit')
  @RequirePermission('procurement.purchase_order.update')
  submit(@Actor() actor: CurrentActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.procurement.transitionPurchaseOrder(actor, id, 'SUBMITTED');
  }
  @Post(':id/approve')
  @RequirePermission('procurement.purchase_order.approve')
  approve(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.procurement.transitionPurchaseOrder(actor, id, 'APPROVED');
  }
  @Post(':id/reject')
  @RequirePermission('procurement.purchase_order.approve')
  reject(@Actor() actor: CurrentActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.procurement.transitionPurchaseOrder(actor, id, 'REJECTED');
  }
  @Post(':id/send')
  @RequirePermission('procurement.purchase_order.send')
  send(@Actor() actor: CurrentActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.procurement.transitionPurchaseOrder(actor, id, 'SENT');
  }
  @Post(':id/confirm')
  @RequirePermission('procurement.purchase_order.update')
  confirm(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.procurement.transitionPurchaseOrder(actor, id, 'CONFIRMED');
  }
  @Post(':id/cancel')
  @RequirePermission('procurement.purchase_order.update')
  cancel(@Actor() actor: CurrentActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.procurement.transitionPurchaseOrder(actor, id, 'CANCELLED');
  }
}
