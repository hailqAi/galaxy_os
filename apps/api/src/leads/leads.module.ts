import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PrismaService } from '../prisma.service';
import { LeadsController, LeadSourcesController } from './leads.controller';
import { LeadsService } from './leads.service';

@Module({
  imports: [AuditModule],
  controllers: [LeadsController, LeadSourcesController],
  providers: [LeadsService, PrismaService],
})
export class LeadsModule {}
