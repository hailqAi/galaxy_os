import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';
import { AccessControlModule } from '../access-control/access-control.module';
import { AuditModule } from '../audit/audit.module';
import { FilesModule } from '../files/files.module';

@Module({
  imports: [AccessControlModule, AuditModule, FilesModule],
  controllers: [ImportsController],
  providers: [ImportsService, PrismaService],
  exports: [ImportsService],
})
export class ImportsModule {}
