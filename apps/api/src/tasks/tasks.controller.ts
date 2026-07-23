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
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';
import { Actor, RequirePermission } from '../access-control/access.decorators';
import { CurrentActor } from '../access-control/current-actor';
import { PageQuery } from '../common.dto';
import {
  ChangeTaskStatusDto,
  ChecklistDto,
  CreateTaskDto,
  TaskUsersDto,
  UpdateTaskDto,
} from './tasks.dto';
import { TasksService } from './tasks.service';
class TasksQuery extends PageQuery {
  @IsOptional() @IsString() @Length(1, 200) search?: string;
  @IsOptional()
  @IsIn(['TODO', 'IN_PROGRESS', 'BLOCKED', 'IN_REVIEW', 'DONE', 'CANCELLED'])
  status?:
    | 'TODO'
    | 'IN_PROGRESS'
    | 'BLOCKED'
    | 'IN_REVIEW'
    | 'DONE'
    | 'CANCELLED';
  @IsOptional() @IsIn(['LOW', 'NORMAL', 'HIGH', 'URGENT']) priority?:
    | 'LOW'
    | 'NORMAL'
    | 'HIGH'
    | 'URGENT';
  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsUUID() assigneeId?: string;
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  overdue?: boolean;
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  mine?: boolean;
  @IsOptional() @IsIn(['title', 'updatedAt', 'dueDate', 'priority']) sort?:
    | 'title'
    | 'updatedAt'
    | 'dueDate'
    | 'priority';
  @IsOptional() @IsIn(['asc', 'desc']) direction?: 'asc' | 'desc';
}
@Controller('tasks')
export class TasksController {
  constructor(@Inject(TasksService) private readonly tasks: TasksService) {}
  @Get() @RequirePermission('task.read') list(
    @Actor() a: CurrentActor,
    @Query() q: TasksQuery,
  ) {
    return this.tasks.list(a, q);
  }
  @Post() @RequirePermission('task.create') create(
    @Actor() a: CurrentActor,
    @Body() d: CreateTaskDto,
  ) {
    return this.tasks.create(a, d);
  }
  @Get(':id') @RequirePermission('task.read') get(
    @Actor() a: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tasks.get(a, id);
  }
  @Patch(':id') @RequirePermission('task.update') update(
    @Actor() a: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: UpdateTaskDto,
  ) {
    return this.tasks.update(a, id, d);
  }
  @Delete(':id') @RequirePermission('task.delete') remove(
    @Actor() a: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tasks.remove(a, id);
  }
  @Post(':id/assign') @RequirePermission('task.assign') assign(
    @Actor() a: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: TaskUsersDto,
  ) {
    return this.tasks.assign(a, id, d.userIds);
  }
  @Post(':id/watchers') @RequirePermission('task.update') watchers(
    @Actor() a: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: TaskUsersDto,
  ) {
    return this.tasks.watchers(a, id, d.userIds);
  }
  @Post(':id/change-status') @RequirePermission('task.update') status(
    @Actor() a: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: ChangeTaskStatusDto,
  ) {
    return this.tasks.changeStatus(a, id, d.status);
  }
  @Post(':id/complete') @RequirePermission('task.complete') complete(
    @Actor() a: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tasks.complete(a, id);
  }
  @Post(':id/checklist') @RequirePermission('task.update') checklist(
    @Actor() a: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: ChecklistDto,
  ) {
    return this.tasks.checklist(a, id, d);
  }
}
