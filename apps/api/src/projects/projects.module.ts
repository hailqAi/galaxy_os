import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PrismaService } from '../prisma.service';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { AccessControlModule } from '../access-control/access-control.module';
import { ProjectProductsController } from './project-products.controller';
import { ProjectProductsService } from './project-products.service';
import { ProjectApproverResolver } from './project-approver-resolver.service';
import { ProjectStageOneController } from './project-stage-one.controller';
import { ProjectStageOneService } from './project-stage-one.service';
import { ImportsModule } from '../imports/imports.module';
import { ProjectStageTwoController } from './project-stage-two.controller';
import { ProjectStageTwoService } from './project-stage-two.service';
import { ProjectRisksController } from './project-risks.controller';
import { ProjectRisksService } from './project-risks.service';
@Module({
  imports: [AccessControlModule, AuditModule, ImportsModule],
  controllers: [
    ProjectsController,
    ProjectProductsController,
    ProjectStageOneController,
    ProjectStageTwoController,
    ProjectRisksController,
  ],
  providers: [
    ProjectsService,
    ProjectProductsService,
    ProjectApproverResolver,
    ProjectStageOneService,
    ProjectStageTwoService,
    ProjectRisksService,
    PrismaService,
  ],
  exports: [
    ProjectProductsService,
    ProjectStageOneService,
    ProjectStageTwoService,
    ProjectRisksService,
  ],
})
export class ProjectsModule {}
