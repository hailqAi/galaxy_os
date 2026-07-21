import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PrismaService } from '../prisma.service';
import {
  OrganizationsController,
  SystemOrganizationsController,
} from './organizations.controller';
import { OrganizationsService } from './organizations.service';

@Module({
  imports: [AuditModule],
  controllers: [OrganizationsController, SystemOrganizationsController],
  providers: [OrganizationsService, PrismaService],
})
export class OrganizationsModule {}
