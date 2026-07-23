import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { PrismaService } from './prisma.service';
import { AccessControlModule } from './access-control/access-control.module';
import { AuditModule } from './audit/audit.module';
import { DepartmentsModule } from './departments/departments.module';
import { MeController } from './me.controller';
import { OrganizationsModule } from './organizations/organizations.module';
import { PermissionsModule } from './permissions/permissions.module';
import { RolesModule } from './roles/roles.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { MeService } from './me.service';
import { SettingsModule } from './settings/settings.module';
import { CustomFieldsModule } from './custom-fields/custom-fields.module';
import { CustomersModule } from './customers/customers.module';
import { LeadsModule } from './leads/leads.module';
import { OpportunitiesModule } from './opportunities/opportunities.module';
import { ProjectsModule } from './projects/projects.module';
import { TasksModule } from './tasks/tasks.module';
import { DiscoveryModule } from './discovery/discovery.module';
import { FilesModule } from './files/files.module';
import { CommentsModule } from './comments/comments.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ActivitiesModule } from './activities/activities.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { SearchModule } from './search/search.module';
import { ImportsModule } from './imports/imports.module';
import { MarketingModule } from './marketing/marketing.module';

@Module({
  imports: [
    AccessControlModule,
    AuthModule,
    AuditModule,
    OrganizationsModule,
    DepartmentsModule,
    UsersModule,
    RolesModule,
    PermissionsModule,
    SettingsModule,
    CustomFieldsModule,
    CustomersModule,
    LeadsModule,
    OpportunitiesModule,
    ProjectsModule,
    TasksModule,
    DiscoveryModule,
    FilesModule,
    CommentsModule,
    NotificationsModule,
    ActivitiesModule,
    DashboardModule,
    SearchModule,
    ImportsModule,
    MarketingModule,
  ],
  controllers: [HealthController, MeController],
  providers: [PrismaService, MeService],
})
export class AppModule {}
