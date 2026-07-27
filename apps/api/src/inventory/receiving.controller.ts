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
import {
  CreateGoodsReceiptDto,
  CreateQualityInspectionDto,
  GoodsReceiptsQuery,
} from './receiving.dto';
import { ReceivingService } from './receiving.service';

@Controller('inventory')
export class ReceivingController {
  constructor(
    @Inject(ReceivingService) private readonly receiving: ReceivingService,
  ) {}
  @Get('receipts')
  @RequirePermission('inventory.receipt.read')
  list(@Actor() actor: CurrentActor, @Query() query: GoodsReceiptsQuery) {
    return this.receiving.list(actor, query);
  }
  @Post('receipts')
  @RequirePermission('inventory.receipt.create')
  create(@Actor() actor: CurrentActor, @Body() data: CreateGoodsReceiptDto) {
    return this.receiving.create(actor, data);
  }
  @Get('receipts/:id')
  @RequirePermission('inventory.receipt.read')
  get(@Actor() actor: CurrentActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.receiving.get(actor, id);
  }
  @Post('receipts/:id/receive')
  @RequirePermission('inventory.receipt.post')
  receive(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.receiving.receive(actor, id);
  }
  @Post('receipts/:id/inspections')
  @RequirePermission('inventory.quality.inspect')
  inspect(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: CreateQualityInspectionDto,
  ) {
    return this.receiving.createInspection(actor, id, data);
  }
  @Post('inspections/:id/complete')
  @RequirePermission('inventory.quality.approve')
  complete(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.receiving.completeInspection(actor, id);
  }
}
