import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
} from '@nestjs/common';
import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../access-control/access.decorators';
import { PrismaService } from '../prisma.service';
import { Actor } from '../access-control/access.decorators';
import { CurrentActor } from '../access-control/current-actor';
import { AuditService } from '../audit/audit.service';

class UpdatePermissionDto {
  @IsOptional() @IsString() @Length(1, 120) name?: string;
  @IsOptional() @IsString() @Length(1, 500) description?: string;
  @IsOptional() @IsBoolean() isDelegable?: boolean;
}

@ApiTags('permissions')
@Controller('permissions')
export class PermissionsController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}
  @Get() @RequirePermission('permission.read') list() {
    return this.prisma.permission.findMany({ orderBy: { code: 'asc' } });
  }
  @Patch(':id') @RequirePermission('system.permissions.manage') update(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: UpdatePermissionDto,
  ) {
    if (actor.administrationScope !== 'SYSTEM')
      throw new ForbiddenException('System Administrator required');
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.permission.findUniqueOrThrow({ where: { id } });
      const after = await tx.permission.update({ where: { id }, data });
      await this.audit.write(tx, actor, {
        action: 'permission.catalogue.update',
        entityType: 'Permission',
        entityId: id,
        beforeData: before,
        afterData: after,
      });
      return after;
    });
  }
}
