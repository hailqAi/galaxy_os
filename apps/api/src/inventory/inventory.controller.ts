import {
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { Actor, RequirePermission } from '../access-control/access.decorators';
import { CurrentActor } from '../access-control/current-actor';
import { InventoryQuery } from './inventory.dto';
import { InventoryService } from './inventory.service';

@Controller('inventory')
export class InventoryController {
  constructor(
    @Inject(InventoryService) private readonly inventory: InventoryService,
  ) {}
  @Get('items')
  @RequirePermission('inventory.read')
  items(@Actor() actor: CurrentActor, @Query() query: InventoryQuery) {
    return this.inventory.items(actor, query);
  }
  @Get('items/:id')
  @RequirePermission('inventory.read')
  item(@Actor() actor: CurrentActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.inventory.item(actor, id);
  }
  @Get('balances')
  @RequirePermission('inventory.read')
  balances(@Actor() actor: CurrentActor, @Query() query: InventoryQuery) {
    return this.inventory.balances(actor, query);
  }
  @Get('summary')
  @RequirePermission('inventory.read')
  summary(
    @Actor() actor: CurrentActor,
    @Query('projectId') projectId?: string,
  ) {
    return this.inventory.summary(actor, projectId);
  }
  @Get('transactions')
  @RequirePermission('inventory.read')
  transactions(@Actor() actor: CurrentActor, @Query() query: InventoryQuery) {
    return this.inventory.transactions(actor, query);
  }
  @Get('transactions/:id')
  @RequirePermission('inventory.read')
  transaction(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.inventory.transaction(actor, id);
  }
}
