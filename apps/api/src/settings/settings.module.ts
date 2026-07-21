import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PrismaService } from '../prisma.service';
import {
  OrganizationSettingsController,
  SystemSettingsController,
} from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  imports: [AuditModule],
  controllers: [SystemSettingsController, OrganizationSettingsController],
  providers: [PrismaService, SettingsService],
})
export class SettingsModule {}
