import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Actor, RequirePermission } from '../access-control/access.decorators';
import { CurrentActor } from '../access-control/current-actor';
import {
  CampaignDto,
  ContentDto,
  MarketingQuery,
  ScheduleDto,
  VariantDto,
} from './marketing.dto';
import { MarketingService } from './marketing.service';

@Controller()
export class MarketingController {
  constructor(
    @Inject(MarketingService) private readonly marketing: MarketingService,
  ) {}
  @Get('campaigns')
  @RequirePermission('marketing.campaign.read')
  campaigns(@Actor() actor: CurrentActor) {
    return this.marketing.listCampaigns(actor);
  }
  @Post('campaigns')
  @RequirePermission('marketing.campaign.create')
  createCampaign(@Actor() actor: CurrentActor, @Body() dto: CampaignDto) {
    return this.marketing.createCampaign(actor, dto);
  }
  @Get('content')
  @RequirePermission('marketing.content.read')
  content(@Actor() actor: CurrentActor, @Query() query: MarketingQuery) {
    return this.marketing.listContent(actor, query);
  }
  @Post('content')
  @RequirePermission('marketing.content.create')
  createContent(@Actor() actor: CurrentActor, @Body() dto: ContentDto) {
    return this.marketing.createContent(actor, dto);
  }
  @Get('content/:id')
  @RequirePermission('marketing.content.read')
  getContent(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.marketing.getContent(actor, id);
  }
  @Patch('content/:id')
  @RequirePermission('marketing.content.update')
  updateContent(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ContentDto,
  ) {
    return this.marketing.updateContent(actor, id, dto);
  }
  @Post('content/:id/variants')
  @RequirePermission('marketing.content.update')
  variant(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VariantDto,
  ) {
    return this.marketing.variant(actor, id, dto);
  }
  @Post('content/:id/submit-review')
  @RequirePermission('marketing.content.review')
  submit(@Actor() actor: CurrentActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.marketing.transition(actor, id, 'submit-review');
  }
  @Post('content/:id/approve')
  @RequirePermission('marketing.content.approve')
  approve(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.marketing.transition(actor, id, 'approve');
  }
  @Post('content/:id/reject')
  @RequirePermission('marketing.content.approve')
  reject(@Actor() actor: CurrentActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.marketing.transition(actor, id, 'reject');
  }
  @Post('content/:id/schedule')
  @RequirePermission('marketing.content.schedule')
  schedule(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ScheduleDto,
  ) {
    return this.marketing.schedule(actor, id, dto);
  }
  @Post('content/:id/cancel-schedule')
  @RequirePermission('marketing.content.schedule')
  cancel(@Actor() actor: CurrentActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.marketing.cancelSchedule(actor, id);
  }
}
