import {
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';
import { Actor, RequirePermission } from '../access-control/access.decorators';
import { CurrentActor } from '../access-control/current-actor';
import { PageQuery } from '../common.dto';
import { AuditService } from './audit.service';

class AuditQuery extends PageQuery {
  @IsOptional() @IsUUID() actor?: string;
  @IsOptional() @IsString() action?: string;
  @IsOptional() @IsString() entityType?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

@ApiTags('system audit')
@Controller('system/audit-logs')
export class SystemAuditController {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}
  @Get() @RequirePermission('system.audit.read') list(
    @Actor() actor: CurrentActor,
    @Query() query: AuditQuery,
  ) {
    if (actor.administrationScope !== 'SYSTEM')
      throw new ForbiddenException('System Administrator required');
    return this.audit.listSystem({
      ...query,
      page: Number(query.page),
      pageSize: Number(query.pageSize),
    });
  }
}

@ApiTags('audit')
@Controller('audit-logs')
export class AuditController {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  @Get()
  @RequirePermission('audit.read')
  list(@Actor() actor: CurrentActor, @Query() query: AuditQuery) {
    return this.audit.list(actor, {
      ...query,
      page: Number(query.page),
      pageSize: Number(query.pageSize),
      from: query.from ? new Date(query.from) : undefined,
      to: query.to
        ? new Date(
            query.to.length === 10 ? `${query.to}T23:59:59.999Z` : query.to,
          )
        : undefined,
    });
  }
}
