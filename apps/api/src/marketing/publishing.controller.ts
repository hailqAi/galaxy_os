import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Actor, RequirePermission } from '../access-control/access.decorators';
import { CurrentActor } from '../access-control/current-actor';
import { ProcessDueDto, PublishingQuery } from './marketing.dto';
import { PublishingService } from './publishing.service';

@Controller('publishing-jobs')
export class PublishingController {
  constructor(
    @Inject(PublishingService)
    private readonly publishing: PublishingService,
  ) {}
  @Get()
  @RequirePermission('marketing.content.read')
  list(@Actor() actor: CurrentActor, @Query() query: PublishingQuery) {
    return this.publishing.list(actor, query);
  }
  @Get(':id')
  @RequirePermission('marketing.content.read')
  get(@Actor() actor: CurrentActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.publishing.get(actor, id);
  }
  @Post(':id/retry')
  @RequirePermission('marketing.content.publish')
  retry(@Actor() actor: CurrentActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.publishing.retry(actor, id);
  }
  @Post(':id/cancel')
  @RequirePermission('marketing.content.schedule')
  cancel(@Actor() actor: CurrentActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.publishing.cancel(actor, id);
  }
  @Post('process-due')
  @RequirePermission('marketing.content.publish')
  process(@Actor() actor: CurrentActor, @Body() dto: ProcessDueDto) {
    return this.publishing.processDue(actor, dto.limit);
  }
}
