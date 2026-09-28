import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaService } from '../prisma.service';
import { DevelopmentAuthGuard } from './development-auth.guard';
import { PermissionGuard } from './permission.guard';
import { UserManagementPolicy } from './user-management.policy';
import { BusinessEntityPolicy } from './business-entity.policy';
import { ProjectChatPolicy } from './project-chat.policy';

@Module({
  providers: [
    PrismaService,
    { provide: APP_GUARD, useClass: DevelopmentAuthGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
    UserManagementPolicy,
    BusinessEntityPolicy,
    ProjectChatPolicy,
  ],
  exports: [UserManagementPolicy, BusinessEntityPolicy, ProjectChatPolicy],
})
export class AccessControlModule {}
