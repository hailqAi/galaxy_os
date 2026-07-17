import { Body, Controller, Get, Inject, Patch } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Actor, RequirePermission } from '../access-control/access.decorators';
import { CurrentActor } from '../access-control/current-actor';
import { UpdateOrganizationDto } from './organizations.dto';
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
