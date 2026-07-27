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
  StorageLocationDto,
  WarehouseDto,
  WarehouseZoneDto,
} from './warehouse.dto';
import { WarehouseService } from './warehouse.service';

@Controller('warehouses')
export class WarehouseController {
  constructor(
    @Inject(WarehouseService) private readonly warehouses: WarehouseService,
  ) {}

  @Get()
  @RequirePermission('warehouse.read')
  list(@Actor() actor: CurrentActor, @Query('projectId') projectId?: string) {
    return this.warehouses.list(actor, projectId);
  }
  @Post()
  @RequirePermission('warehouse.manage')
  create(@Actor() actor: CurrentActor, @Body() data: WarehouseDto) {
    return this.warehouses.create(actor, data);
  }
  @Get(':id')
  @RequirePermission('warehouse.read')
  get(@Actor() actor: CurrentActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.warehouses.get(actor, id);
  }
  @Post(':id/zones')
  @RequirePermission('warehouse.manage')
  zone(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: WarehouseZoneDto,
  ) {
    return this.warehouses.addZone(actor, id, data);
  }
  @Post(':id/locations')
  @RequirePermission('warehouse.manage')
  location(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: StorageLocationDto,
  ) {
    return this.warehouses.addLocation(actor, id, data);
  }
}
