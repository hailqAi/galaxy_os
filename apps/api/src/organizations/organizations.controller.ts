import { Body, Controller, Get, Inject, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Actor, RequirePermission } from '../access-control/access.decorators';
import { CurrentActor } from '../access-control/current-actor';
import { UpdateOrganizationDto } from './organizations.dto';
import { CreateOrganizationDto } from './organizations.dto';
import { OrganizationsService } from './organizations.service';

@ApiTags('organization')
@Controller('organization')
export class OrganizationsController {
  constructor(
    @Inject(OrganizationsService)
    private readonly organizations: OrganizationsService,
  ) {}
  @Get() @RequirePermission('organization.read') get(
    @Actor() actor: CurrentActor,
  ) {
    return this.organizations.get(actor);
  }
  @Patch() @RequirePermission('organization.update') update(
    @Actor() actor: CurrentActor,
    @Body() data: UpdateOrganizationDto,
  ) {
    return this.organizations.update(actor, data);
  }
}

@ApiTags('system organizations')
@Controller('system/organizations')
export class SystemOrganizationsController {
  constructor(
    @Inject(OrganizationsService)
    private readonly organizations: OrganizationsService,
  ) {}
  @Get() @RequirePermission('system.organizations.read') list(
    @Actor() actor: CurrentActor,
  ) {
    return this.organizations.listSystem(actor);
  }
  @Post() @RequirePermission('system.organizations.manage') create(
    @Actor() actor: CurrentActor,
    @Body() data: CreateOrganizationDto,
  ) {
    return this.organizations.createSystem(actor, data);
  }
}
