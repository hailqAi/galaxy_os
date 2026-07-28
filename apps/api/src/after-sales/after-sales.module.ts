import { Module } from '@nestjs/common';
import { AccessControlModule } from '../access-control/access-control.module';
import { PrismaService } from '../prisma.service';
import { AfterSalesController } from './after-sales.controller';
import { AfterSalesService } from './after-sales.service';

@Module({
  imports: [AccessControlModule],
  controllers: [AfterSalesController],
  providers: [PrismaService, AfterSalesService],
})
export class AfterSalesModule {}
