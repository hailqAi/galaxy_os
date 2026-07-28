import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PrismaService } from '../prisma.service';
import {
  ContactsController,
  CustomersController,
} from './customers.controller';
import { CustomersService } from './customers.service';

@Module({
  imports: [AuditModule],
  controllers: [CustomersController, ContactsController],
  providers: [CustomersService, PrismaService],
})
export class CustomersModule {}
