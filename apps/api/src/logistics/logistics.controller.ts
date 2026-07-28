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
  CreateCustomsDto,
  CreateLandedCostDto,
  CreateShipmentDto,
  CustomsStatusDto,
  ForwarderDto,
  ShipmentDocumentDto,
  ShipmentItemDto,
  ShipmentLegDto,
  ShipmentPackageDto,
  ShipmentsQuery,
  ShipmentStatusDto,
  UpdateShipmentDto,
} from './logistics.dto';
import { LogisticsService } from './logistics.service';

@Controller()
export class LogisticsController {
  constructor(
    @Inject(LogisticsService) private readonly logistics: LogisticsService,
  ) {}

  @Get('forwarders')
  @RequirePermission('logistics.forwarder.read')
  forwarders(@Actor() actor: CurrentActor) {
    return this.logistics.forwarders(actor);
  }

  @Post('forwarders')
  @RequirePermission('logistics.forwarder.manage')
  createForwarder(@Actor() actor: CurrentActor, @Body() data: ForwarderDto) {
    return this.logistics.createForwarder(actor, data);
  }

  @Get('shipments')
  @RequirePermission('logistics.shipment.read')
  list(@Actor() actor: CurrentActor, @Query() query: ShipmentsQuery) {
    return this.logistics.list(actor, query);
  }

  @Post('shipments')
  @RequirePermission('logistics.shipment.create')
  create(@Actor() actor: CurrentActor, @Body() data: CreateShipmentDto) {
    return this.logistics.create(actor, data);
  }

  @Get('shipments/:id')
  @RequirePermission('logistics.shipment.read')
  get(@Actor() actor: CurrentActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.logistics.get(actor, id);
  }

  @Patch('shipments/:id')
  @RequirePermission('logistics.shipment.update')
  update(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: UpdateShipmentDto,
  ) {
    return this.logistics.update(actor, id, data);
  }

  @Post('shipments/:id/change-status')
  @RequirePermission('logistics.shipment.update')
  transition(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: ShipmentStatusDto,
  ) {
    return this.logistics.transition(actor, id, data);
  }

  @Post('shipments/:id/legs')
  @RequirePermission('logistics.shipment.update')
  leg(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: ShipmentLegDto,
  ) {
    return this.logistics.addLeg(actor, id, data);
  }

  @Post('shipments/:id/packages')
  @RequirePermission('logistics.shipment.update')
  shipmentPackage(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: ShipmentPackageDto,
  ) {
    return this.logistics.addPackage(actor, id, data);
  }

  @Post('shipments/:id/items')
  @RequirePermission('logistics.shipment.update')
  item(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: ShipmentItemDto,
  ) {
    return this.logistics.addItem(actor, id, data);
  }

  @Post('shipments/:id/documents')
  @RequirePermission('logistics.shipment.update')
  document(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: ShipmentDocumentDto,
  ) {
    return this.logistics.addDocument(actor, id, data);
  }

  @Post('shipments/:id/cancel')
  @RequirePermission('logistics.shipment.update')
  cancel(@Actor() actor: CurrentActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.logistics.transition(actor, id, { status: 'CANCELLED' });
  }

  @Post('shipments/:id/close')
  @RequirePermission('logistics.shipment.update')
  close(@Actor() actor: CurrentActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.logistics.transition(actor, id, { status: 'CLOSED' });
  }

  @Post('customs')
  @RequirePermission('logistics.customs.manage')
  customs(@Actor() actor: CurrentActor, @Body() data: CreateCustomsDto) {
    return this.logistics.createCustoms(actor, data);
  }

  @Get('customs')
  @RequirePermission('logistics.customs.read')
  listCustoms(@Actor() actor: CurrentActor) {
    return this.logistics.listCustoms(actor);
  }

  @Get('customs/:id')
  @RequirePermission('logistics.customs.read')
  getCustoms(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.logistics.getCustoms(actor, id);
  }

  @Post('customs/:id/change-status')
  @RequirePermission('logistics.customs.manage')
  customsStatus(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: CustomsStatusDto,
  ) {
    return this.logistics.transitionCustoms(actor, id, data);
  }

  @Post('landed-costs')
  @RequirePermission('logistics.landed_cost.manage')
  landedCost(@Actor() actor: CurrentActor, @Body() data: CreateLandedCostDto) {
    return this.logistics.createLandedCost(actor, data);
  }

  @Get('landed-costs')
  @RequirePermission('logistics.landed_cost.read')
  listLandedCosts(@Actor() actor: CurrentActor) {
    return this.logistics.listLandedCosts(actor);
  }

  @Get('landed-costs/:id')
  @RequirePermission('logistics.landed_cost.read')
  getLandedCost(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.logistics.getLandedCost(actor, id);
  }

  @Post('landed-costs/:id/finalize')
  @RequirePermission('logistics.landed_cost.finalize')
  finalize(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.logistics.finalizeLandedCost(actor, id);
  }
}
