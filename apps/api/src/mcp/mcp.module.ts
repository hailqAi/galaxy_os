import { McpRecordsService } from './mcp.records';
import { TasksModule } from '../tasks/tasks.module';
import { AfterSalesModule } from '../after-sales/after-sales.module';
import { InstallationModule } from '../installation/installation.module';
import { ProductionModule } from '../production/production.module';
import { LogisticsModule } from '../logistics/logistics.module';
import { ProcurementModule } from '../procurement/procurement.module';
import { ContractsModule } from '../contracts/contracts.module';
import { CommercialModule } from '../commercial/commercial.module';
import { CustomersModule } from '../customers/customers.module';
import { McpExecutionService } from './mcp.execution';
import { SearchModule } from '../search/search.module';
import { MarketingModule } from '../marketing/marketing.module';
import { MarketingService } from '../marketing/marketing.service';
import { McpBusinessTools } from './mcp.business';
import { ProjectsModule } from '../projects/projects.module';
import { Module } from '@nestjs/common';
import { AccessControlModule } from '../access-control/access-control.module';
import { FilesModule } from '../files/files.module';
import { PrismaService } from '../prisma.service';
import { ProjectChatModule } from '../project-chat/project-chat.module';
import { UploadsModule } from '../uploads/uploads.module';
import {
  McpController,
  McpConsentController,
  McpJobsController,
  McpConnectionController,
} from './mcp.controller';
import { McpOAuth } from './mcp.oauth';
import { McpJobsService } from './mcp.jobs.service';
import { McpEventsService } from './mcp.events.service';
import { McpResultsService } from './mcp.results.service';
import { McpNetwork } from './mcp.network';
import { McpServerService } from './mcp.server';
import { McpConnectionService } from './mcp.connection';

@Module({
  imports: [
    ...(process.env.FEATURE_MARKETING === 'true' ? [MarketingModule] : []),
    SearchModule,
    TasksModule,
    CustomersModule,
    CommercialModule,
    ContractsModule,
    ProcurementModule,
    LogisticsModule,
    ProductionModule,
    InstallationModule,
    AfterSalesModule,
    ProjectsModule,
    AccessControlModule,
    ProjectChatModule,
    FilesModule,
    UploadsModule,
  ],
  controllers: [
    McpController,
    McpConsentController,
    McpJobsController,
    McpConnectionController,
  ],
  providers: [
    ...(process.env.FEATURE_MARKETING === 'true' ? [] : [MarketingService]),
    PrismaService,
    McpOAuth,
    McpJobsService,
    McpEventsService,
    McpResultsService,
    McpNetwork,
    McpServerService,
    McpBusinessTools,
    McpRecordsService,
    McpExecutionService,
    McpConnectionService,
  ],
})
export class McpModule {}
