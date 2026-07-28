import {
  Body,
  Controller,
  Delete,
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
  CommentsQuery,
  CreateCommentDto,
  UpdateCommentDto,
} from './comments.dto';
import { CommentsService } from './comments.service';
@Controller('comments')
export class CommentsController {
  constructor(
    @Inject(CommentsService) private readonly comments: CommentsService,
  ) {}
  @Get() @RequirePermission('comment.read') list(
    @Actor() a: CurrentActor,
    @Query() q: CommentsQuery,
  ) {
    return this.comments.list(a, q);
  }
  @Post() @RequirePermission('comment.create') create(
    @Actor() a: CurrentActor,
    @Body() d: CreateCommentDto,
  ) {
    return this.comments.create(a, d);
  }
  @Get(':id') @RequirePermission('comment.read') get(
    @Actor() a: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.comments.get(a, id);
  }
  @Patch(':id') @RequirePermission('comment.update_own') update(
    @Actor() a: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: UpdateCommentDto,
  ) {
    return this.comments.update(a, id, d.body);
  }
  @Delete(':id') @RequirePermission('comment.delete_own') remove(
    @Actor() a: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.comments.remove(a, id);
  }
  @Post(':id/replies') @RequirePermission('comment.create') reply(
    @Actor() a: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: CreateCommentDto,
  ) {
    return this.comments.reply(a, id, d);
  }
}
