import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditController, SystemAuditController } from './audit.controller';
import { AuditService } from './audit.service';

@Module({
  controllers: [AuditController, SystemAuditController],
  providers: [AuditService, PrismaService],
  exports: [AuditService],
})
export class AuditModule {}
