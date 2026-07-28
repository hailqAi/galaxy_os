import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { IsDateString } from 'class-validator';
import { Actor, RequirePermission } from '../access-control/access.decorators';
import { CurrentActor } from '../access-control/current-actor';
import {
  CreateRequirementDto,
  CreateSurveyDto,
  UpdateRequirementDto,
  UpdateSurveyDto,
} from './discovery.dto';
import { DiscoveryService } from './discovery.service';
class ScheduleDto {
  @IsDateString() scheduledAt!: string;
}
@Controller('surveys')
export class SurveysController {
  constructor(
    @Inject(DiscoveryService) private readonly discovery: DiscoveryService,
  ) {}
  @Get() @RequirePermission('survey.read') list(@Actor() a: CurrentActor) {
    return this.discovery.surveys(a);
  }
  @Post() @RequirePermission('survey.create') create(
    @Actor() a: CurrentActor,
    @Body() d: CreateSurveyDto,
  ) {
    return this.discovery.createSurvey(a, d);
  }
  @Get(':id') @RequirePermission('survey.read') get(
    @Actor() a: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.discovery.survey(a, id);
  }
  @Patch(':id') @RequirePermission('survey.update') update(
    @Actor() a: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: UpdateSurveyDto,
  ) {
    return this.discovery.updateSurvey(a, id, d);
  }
  @Post(':id/schedule') @RequirePermission('survey.update') schedule(
    @Actor() a: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: ScheduleDto,
  ) {
    return this.discovery.scheduleSurvey(a, id, d.scheduledAt);
  }
  @Post(':id/complete') @RequirePermission('survey.update') complete(
    @Actor() a: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.discovery.completeSurvey(a, id);
  }
  @Post(':id/approve') @RequirePermission('survey.approve') approve(
    @Actor() a: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.discovery.approveSurvey(a, id);
  }
}
@Controller('requirements')
export class RequirementsController {
  constructor(
    @Inject(DiscoveryService) private readonly discovery: DiscoveryService,
  ) {}
  @Get() @RequirePermission('requirement.read') list(@Actor() a: CurrentActor) {
    return this.discovery.requirements(a);
  }
  @Post() @RequirePermission('requirement.create') create(
    @Actor() a: CurrentActor,
    @Body() d: CreateRequirementDto,
  ) {
    return this.discovery.createRequirement(a, d);
  }
  @Get(':id') @RequirePermission('requirement.read') get(
    @Actor() a: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.discovery.requirement(a, id);
  }
  @Patch(':id') @RequirePermission('requirement.update') update(
    @Actor() a: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: UpdateRequirementDto,
  ) {
    return this.discovery.updateRequirement(a, id, d);
  }
  @Post(':id/new-version') @RequirePermission('requirement.update') version(
    @Actor() a: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.discovery.newVersion(a, id);
  }
  @Post(':id/submit') @RequirePermission('requirement.update') submit(
    @Actor() a: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.discovery.approval(a, id, 'PENDING');
  }
  @Post(':id/approve') @RequirePermission('requirement.approve') approve(
    @Actor() a: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.discovery.approval(a, id, 'APPROVED');
  }
  @Post(':id/reject') @RequirePermission('requirement.approve') reject(
    @Actor() a: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.discovery.approval(a, id, 'REJECTED');
  }
}
