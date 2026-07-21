import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PrismaService } from '../prisma.service';
import { DepartmentsController } from './departments.controller';
import { DepartmentsService } from './departments.service';

@Module({
  imports: [AuditModule],
  controllers: [DepartmentsController],
  providers: [DepartmentsService, PrismaService],
})
export class DepartmentsModule {}
