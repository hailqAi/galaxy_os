import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { PermissionsController } from './permissions.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [PermissionsController],
  providers: [PrismaService],
})
export class PermissionsModule {}
