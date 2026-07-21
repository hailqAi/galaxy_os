import {
  Body,
  Controller,
  ForbiddenException,
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
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { Actor, RequirePermission } from '../access-control/access.decorators';
import { CurrentActor } from '../access-control/current-actor';
import { PageQuery } from '../common.dto';
import {
  CreateUserDto,
  SetUserDepartmentsDto,
  SetUserRolesDto,
  SetManagedDepartmentsDto,
  SetScopedRoleAssignmentsDto,
  SetAccessProfileDto,
  UpdateMembershipDto,
  UpdateUserDto,
} from './users.dto';
import { UsersService } from './users.service';

class UsersQuery extends PageQuery {
  @IsOptional() @IsString() @Length(1, 120) search?: string;
  @IsOptional() @IsIn(['invited', 'active', 'disabled']) status?:
    | 'invited'
    | 'active'
    | 'disabled';
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsUUID() roleId?: string;
  @IsOptional() @IsIn(['active', 'disabled']) membershipStatus?:
    | 'active'
    | 'disabled';
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  mustChangePassword?: boolean;
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  locked?: boolean;
  @IsOptional()
  @IsIn(['displayName', 'email', 'role', 'createdAt', 'lastLoginAt'])
  sort?: 'displayName' | 'email' | 'role' | 'createdAt' | 'lastLoginAt';
  @IsOptional() @IsIn(['asc', 'desc']) direction?: 'asc' | 'desc';
}

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(@Inject(UsersService) private readonly users: UsersService) {}
  @Get() @RequirePermission('user.read') list(
    @Actor() actor: CurrentActor,
    @Query() query: UsersQuery,
  ) {
    return this.users.list(
      actor,
      Number(query.page ?? 1),
      Number(query.pageSize ?? 20),
      query,
    );
  }
  @Get(':id/capabilities')
  @RequirePermission('user.read', 'permission.read')
  capabilities(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.users.capabilities(actor, id);
  }
  @Get(':id/access-preview')
  @RequirePermission('user.capabilities.read')
  accessPreview(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.users.accessPreview(actor, id);
  }
  @Get(':id/sessions') @RequirePermission('user.session.revoke') sessions(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.users.sessions(actor, id);
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
  @Post(':id/reactivate') @RequirePermission('user.reactivate') reactivate(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.users.reactivate(actor, id);
  }
  @Get(':id/membership') @RequirePermission('membership.read') membership(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.users.getMembership(actor, id);
  }
  @Get(':id/audit') @RequirePermission('user.audit.read') audit(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.users.auditHistory(actor, id);
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
  @Put(':id/departments')
  @RequirePermission('department.member.manage')
  departments(
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
  @Put(':id/role-assignments')
  @RequirePermission('role.assign')
  roleAssignments(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: SetScopedRoleAssignmentsDto,
  ) {
    return this.users.setScopedRoleAssignments(actor, id, data.assignments);
  }
  @Put(':id/access-profile')
  @RequirePermission('role.assign', 'permission.assign')
  accessProfile(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: SetAccessProfileDto,
  ) {
    return this.users.setAccessProfile(actor, id, data);
  }
  @Put(':id/managed-departments')
  @RequirePermission('department.member.manage')
  managedDepartments(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: SetManagedDepartmentsDto,
  ) {
    return this.users.setManagedDepartments(actor, id, data.departmentIds);
  }
}

@ApiTags('system users')
@Controller('system/organizations/:organizationId/users')
export class SystemUsersController {
  constructor(@Inject(UsersService) private readonly users: UsersService) {}
  private scoped(actor: CurrentActor, organizationId: string) {
    if (actor.administrationScope !== 'SYSTEM')
      throw new ForbiddenException('System Administrator required');
    return { ...actor, organizationId };
  }
  @Get() @RequirePermission('system.organizations.manage') list(
    @Actor() actor: CurrentActor,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Query() query: UsersQuery,
  ) {
    return this.users.list(
      this.scoped(actor, organizationId),
      Number(query.page ?? 1),
      Number(query.pageSize ?? 20),
      query,
    );
  }
  @Post() @RequirePermission('system.organizations.manage') create(
    @Actor() actor: CurrentActor,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() data: CreateUserDto,
  ) {
    return this.users.create(this.scoped(actor, organizationId), data);
  }
  @Get(':id') @RequirePermission('system.organizations.manage') get(
    @Actor() actor: CurrentActor,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.users.get(this.scoped(actor, organizationId), id);
  }
}
