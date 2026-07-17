import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Actor, RequirePermission } from '../access-control/access.decorators';
import { CurrentActor } from '../access-control/current-actor';
import { PageQuery } from '../common.dto';
import {
  CreateRoleDto,
  SetRolePermissionsDto,
  UpdateRoleDto,
} from './roles.dto';
import { RolesService } from './roles.service';

@ApiTags('roles')
@Controller('roles')
export class RolesController {
  constructor(@Inject(RolesService) private readonly roles: RolesService) {}
  @Get() @RequirePermission('role.read') list(
    @Actor() actor: CurrentActor,
    @Query() query: PageQuery,
  ) {
    return this.roles.list(actor, query.page, query.pageSize);
  }
  @Post() @RequirePermission('role.create') create(
    @Actor() actor: CurrentActor,
    @Body() data: CreateRoleDto,
  ) {
    return this.roles.create(actor, data);
  }
  @Get(':id') @RequirePermission('role.read') get(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.roles.get(actor, id);
  }
  @Patch(':id') @RequirePermission('role.update') update(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: UpdateRoleDto,
  ) {
    return this.roles.update(actor, id, data);
  }
  @Put(':id/permissions') @RequirePermission('role.update') permissions(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: SetRolePermissionsDto,
  ) {
    return this.roles.setPermissions(actor, id, data);
  }
  @Post(':id/archive') @RequirePermission('role.update') archive(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.roles.archive(actor, id);
  }
}
