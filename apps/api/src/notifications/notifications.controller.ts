import {
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
import { NotificationsQuery } from './notifications.dto';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@RequirePermission('notification.read')
export class NotificationsController {
  constructor(
    @Inject(NotificationsService)
    private readonly notifications: NotificationsService,
  ) {}

  @Get() list(
    @Actor() actor: CurrentActor,
    @Query() query: NotificationsQuery,
  ) {
    return this.notifications.list(actor, query);
  }
  @Get('unread-count') unreadCount(@Actor() actor: CurrentActor) {
    return this.notifications.unreadCount(actor);
  }
  @Post('read-all') readAll(@Actor() actor: CurrentActor) {
    return this.notifications.readAll(actor);
  }
  @Post(':id/read') read(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.notifications.markRead(actor, id, true);
  }
  @Post(':id/unread') unread(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.notifications.markRead(actor, id, false);
  }
  @Post(':id/archive') archive(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.notifications.archive(actor, id);
  }
}
