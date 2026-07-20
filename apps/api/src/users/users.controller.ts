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
import { IsOptional, IsString, Length } from 'class-validator';
import { Actor, RequirePermission } from '../access-control/access.decorators';
import { CurrentActor } from '../access-control/current-actor';
import { PageQuery } from '../common.dto';
import {
  CreateUserDto,
  SetUserDepartmentsDto,
  SetUserRolesDto,
  UpdateMembershipDto,
  UpdateUserDto,
} from './users.dto';
import { UsersService } from './users.service';

class UsersQuery extends PageQuery {
  @IsOptional() @IsString() @Length(1, 120) search?: string;
}

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(@Inject(UsersService) private readonly users: UsersService) {}
  @Get() @RequirePermission('user.read') list(
    @Actor() actor: CurrentActor,
    @Query() query: UsersQuery,
  ) {
    return this.users.list(actor, query.page, query.pageSize, query.search);
  }
  @Post() @RequirePermission('user.create') create(
    @Actor() actor: CurrentActor,
    @Body() data: CreateUserDto,
  ) {
    return this.users.create(actor, data);
  }
  @Get(':id') @RequirePermission('user.read') get(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.users.get(actor, id);
  }
  @Patch(':id') @RequirePermission('user.update') update(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: UpdateUserDto,
  ) {
    return this.users.update(actor, id, data);
  }
  @Post(':id/disable') @RequirePermission('user.disable') disable(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.users.disable(actor, id);
  }
  @Get(':id/membership') @RequirePermission('membership.read') membership(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.users.getMembership(actor, id);
  }
  @Patch(':id/membership')
  @RequirePermission('membership.update')
  updateMembership(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: UpdateMembershipDto,
  ) {
    return this.users.updateMembership(actor, id, data);
  }
  @Put(':id/departments') @RequirePermission('membership.update') departments(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: SetUserDepartmentsDto,
  ) {
    return this.users.setDepartments(actor, id, data);
  }
  @Put(':id/roles') @RequirePermission('role.assign') roles(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: SetUserRolesDto,
  ) {
    return this.users.setRoles(actor, id, data);
  }
}
