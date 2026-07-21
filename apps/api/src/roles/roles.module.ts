import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AccessControlModule } from '../access-control/access-control.module';
import { PrismaService } from '../prisma.service';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';

@Module({
  imports: [AuditModule, AccessControlModule],
  controllers: [RolesController],
  providers: [RolesService, PrismaService],
})
export class RolesModule {}
