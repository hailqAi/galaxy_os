import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../access-control/access.decorators';
import { PrismaService } from '../prisma.service';

@ApiTags('permissions')
@Controller('permissions')
export class PermissionsController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  @Get() @RequirePermission('permission.read') list() {
    return this.prisma.permission.findMany({ orderBy: { code: 'asc' } });
  }
}
