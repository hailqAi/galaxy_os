import { ProjectAiWorkspaceService } from './project-ai-workspace.service';
import { WorkspaceConnectorAuth } from './workspace-connector-auth';
import {
  ProjectAiWorkspaceController,
  WorkspaceConnectorAuthController,
  WorkspaceAgentMcpController,
} from './project-ai-workspace.controller';
import { SettingsModule } from '../settings/settings.module';
import { AuditModule } from '../audit/audit.module';
import { ProjectAiMemoryService } from './project-ai-memory.service';
import { ProjectAiHistoryService } from './project-ai-history.service';
import { ProjectsModule } from '../projects/projects.module';
import { ProjectAiService } from './project-ai.service';
import { Module } from '@nestjs/common';
import { AccessControlModule } from '../access-control/access-control.module';
import { FilesModule } from '../files/files.module';
import { PrismaService } from '../prisma.service';
import { ProjectChatController } from './project-chat.controller';
import { ProjectChatService } from './project-chat.service';
import { TasksModule } from '../tasks/tasks.module';

@Module({
  imports: [
    AccessControlModule,
    FilesModule,
    TasksModule,
    ProjectsModule,
    SettingsModule,
    AuditModule,
  ],
  controllers: [
    ProjectChatController,
    ProjectAiWorkspaceController,
    WorkspaceConnectorAuthController,
    WorkspaceAgentMcpController,
  ],
  providers: [
    PrismaService,
    ProjectChatService,
    ProjectAiService,
    ProjectAiMemoryService,
    ProjectAiHistoryService,
    ProjectAiWorkspaceService,
    WorkspaceConnectorAuth,
  ],
  exports: [ProjectAiService],
})
export class ProjectChatModule {}
