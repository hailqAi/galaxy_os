import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PrismaService } from '../prisma.service';
import { CustomFieldsController } from './custom-fields.controller';
import { CustomFieldsService } from './custom-fields.service';
import { AccessControlModule } from '../access-control/access-control.module';

@Module({
  imports: [AuditModule, AccessControlModule],
  controllers: [CustomFieldsController],
  providers: [PrismaService, CustomFieldsService],
})
export class CustomFieldsModule {}
