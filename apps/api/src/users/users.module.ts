import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PrismaService } from '../prisma.service';
import { SystemUsersController, UsersController } from './users.controller';
import { UsersService } from './users.service';
import { AccessControlModule } from '../access-control/access-control.module';

@Module({
  imports: [AuditModule, AccessControlModule],
  controllers: [UsersController, SystemUsersController],
  providers: [UsersService, PrismaService],
})
export class UsersModule {}
