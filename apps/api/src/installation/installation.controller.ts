import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { Actor, RequirePermission } from '../access-control/access.decorators';
import { CurrentActor } from '../access-control/current-actor';
import {
  CreateInstallationPlanDto,
  CreateWorkOrderDto,
  InstallItemDto,
  PunchItemDto,
  ReleaseWorkOrderDto,
  ResolvePunchDto,
  SiteDailyLogDto,
} from './installation.dto';
import { InstallationService } from './installation.service';

@Controller('installation')
export class InstallationController {
  constructor(
    @Inject(InstallationService)
    private readonly installation: InstallationService,
  ) {}

  @Get('plans')
  @RequirePermission('installation.read')
  plans(@Actor() actor: CurrentActor, @Query('projectId') projectId: string) {
    return this.installation.plans(actor, projectId);
  }

  @Post('plans')
  @RequirePermission('installation.manage')
  createPlan(
    @Actor() actor: CurrentActor,
    @Body() data: CreateInstallationPlanDto,
  ) {
    return this.installation.createPlan(actor, data);
  }

  @Post('plans/:id/work-orders')
  @RequirePermission('installation.manage')
  createWorkOrder(
    @Actor() actor: CurrentActor,
    @Param('id') id: string,
    @Body() data: CreateWorkOrderDto,
  ) {
    return this.installation.createWorkOrder(actor, id, data);
  }

  @Get('work-orders/:id')
  @RequirePermission('installation.read')
  getWorkOrder(@Actor() actor: CurrentActor, @Param('id') id: string) {
    return this.installation.getWorkOrder(actor, id);
  }

  @Post('work-orders/:id/release')
  @RequirePermission('installation.release')
  release(
    @Actor() actor: CurrentActor,
    @Param('id') id: string,
    @Body() data: ReleaseWorkOrderDto,
  ) {
    return this.installation.release(actor, id, data);
  }

  @Post('work-orders/:id/items')
  @RequirePermission('installation.execute')
  installItem(
    @Actor() actor: CurrentActor,
    @Param('id') id: string,
    @Body() data: InstallItemDto,
  ) {
    return this.installation.installItem(actor, id, data);
  }

  @Post('work-orders/:id/daily-logs')
  @RequirePermission('installation.execute')
  addDailyLog(
    @Actor() actor: CurrentActor,
    @Param('id') id: string,
    @Body() data: SiteDailyLogDto,
  ) {
    return this.installation.addDailyLog(actor, id, data);
  }

  @Post('work-orders/:id/punch-items')
  @RequirePermission('installation.punch.manage')
  addPunch(
    @Actor() actor: CurrentActor,
    @Param('id') id: string,
    @Body() data: PunchItemDto,
  ) {
    return this.installation.addPunch(actor, id, data);
  }

  @Post('punch-items/:id/resolve')
  @RequirePermission('installation.punch.manage')
  resolvePunch(
    @Actor() actor: CurrentActor,
    @Param('id') id: string,
    @Body() data: ResolvePunchDto,
  ) {
    return this.installation.resolvePunch(actor, id, data);
  }

  @Post('punch-items/:id/verify')
  @RequirePermission('installation.punch.verify')
  verifyPunch(@Actor() actor: CurrentActor, @Param('id') id: string) {
    return this.installation.verifyPunch(actor, id);
  }
}
