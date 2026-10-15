import { SiwcCapabilityService } from './siwc-capabilities';
import { WorkspaceAgentService } from './workspace-agent.service';
import { ChatGptConnectionService } from './chatgpt-connection.service';
import { Body, Controller, Get, Inject, Post, Put } from '@nestjs/common';
import { Actor, RequirePermission } from '../access-control/access.decorators';
import { CurrentActor } from '../access-control/current-actor';
import { SetSettingDto } from './settings.dto';
import { SettingsService } from './settings.service';

@Controller('system/settings')
export class SystemSettingsController {
  constructor(
    @Inject(SettingsService) private readonly settings: SettingsService,
    @Inject(ChatGptConnectionService)
    private readonly connection: ChatGptConnectionService,
  ) {}
  @Get('chatgpt-connection') @RequirePermission('system.settings.read') chatGpt(
    @Actor() actor: CurrentActor,
  ) {
    return this.settings.chatGptConnection(actor);
  }
  @Post('chatgpt-connection')
  @RequirePermission('system.settings.update')
  checkChatGpt(@Actor() actor: CurrentActor) {
    return this.settings.checkChatGptConnection(actor);
  }
  @Post('chatgpt-connection/begin')
  @RequirePermission('system.settings.update')
  begin(@Actor() actor: CurrentActor) {
    return this.connection.begin(actor);
  }
  @Post('chatgpt-connection/cancel')
  @RequirePermission('system.settings.update')
  cancel(@Actor() actor: CurrentActor) {
    return this.connection.cancel(actor);
  }
  @Post('chatgpt-connection/disconnect')
  @RequirePermission('system.settings.update')
  disconnect(@Actor() actor: CurrentActor) {
    return this.connection.disconnect(actor);
  }
  @Put('chatgpt-connection/preferences')
  @RequirePermission('system.settings.update')
  preference(@Actor() actor: CurrentActor, @Body() input: unknown) {
    return this.settings.setChatGptPreference(actor, input);
  }
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

@Controller('system/settings/workspace-agents')
export class WorkspaceAgentSettingsController {
  constructor(
    @Inject(WorkspaceAgentService)
    private readonly workspace: WorkspaceAgentService,
  ) {}
  @Get() @RequirePermission('system.settings.read') metadata(
    @Actor() actor: CurrentActor,
  ) {
    return this.workspace.metadata(actor);
  }
  @Put() @RequirePermission('system.settings.update') configure(
    @Actor() actor: CurrentActor,
    @Body() input: unknown,
  ) {
    return this.workspace.configure(actor, input);
  }
}

@Controller('system/settings/chatgpt-capabilities')
export class SiwcCapabilityController {
  constructor(
    @Inject(SiwcCapabilityService)
    private readonly capabilities: SiwcCapabilityService,
  ) {}
  @Post('check') @RequirePermission('system.settings.update') check(
    @Actor() actor: CurrentActor,
    @Body() input: unknown,
  ) {
    return this.capabilities.check(actor, input);
  }
}
