import { Body, Controller, Get, Inject, Put } from '@nestjs/common';
import { Actor, RequirePermission } from '../access-control/access.decorators';
import { CurrentActor } from '../access-control/current-actor';
import { SetSettingDto } from './settings.dto';
import { SettingsService } from './settings.service';

@Controller('system/settings')
export class SystemSettingsController {
  constructor(
    @Inject(SettingsService) private readonly settings: SettingsService,
  ) {}
  @Get() @RequirePermission('system.settings.read') list(
    @Actor() actor: CurrentActor,
  ) {
    return this.settings.system(actor);
  }
  @Put() @RequirePermission('system.settings.update') set(
    @Actor() actor: CurrentActor,
    @Body() input: SetSettingDto,
  ) {
    return this.settings.setSystem(actor, input.key, input.value);
  }
}

@Controller('organization/settings')
export class OrganizationSettingsController {
  constructor(
    @Inject(SettingsService) private readonly settings: SettingsService,
  ) {}
  @Get() @RequirePermission('organization.settings.read') list(
    @Actor() actor: CurrentActor,
  ) {
    return this.settings.organization(actor);
  }
  @Put() @RequirePermission('organization.settings.update') set(
    @Actor() actor: CurrentActor,
    @Body() input: SetSettingDto,
  ) {
    return this.settings.setOrganization(actor, input.key, input.value);
  }
}
