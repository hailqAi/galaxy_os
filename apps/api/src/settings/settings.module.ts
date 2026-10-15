import { SiwcCapabilityService } from './siwc-capabilities';
import { WorkspaceAgentService } from './workspace-agent.service';
import { AccessControlModule } from '../access-control/access-control.module';
import { ChatGptConnectionService } from './chatgpt-connection.service';
import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PrismaService } from '../prisma.service';
import {
  OrganizationSettingsController,
  SystemSettingsController,
  WorkspaceAgentSettingsController,
  SiwcCapabilityController,
} from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  imports: [AuditModule, AccessControlModule],
  controllers: [
    SystemSettingsController,
    OrganizationSettingsController,
    WorkspaceAgentSettingsController,
    SiwcCapabilityController,
  ],
  providers: [
    PrismaService,
    SettingsService,
    ChatGptConnectionService,
    WorkspaceAgentService,
    SiwcCapabilityService,
  ],
  exports: [ChatGptConnectionService, WorkspaceAgentService],
})
export class SettingsModule {}
