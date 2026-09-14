import { Module } from '@nestjs/common';
import { AccessControlModule } from '../access-control/access-control.module';
import { PrismaService } from '../prisma.service';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';
@Module({
  imports: [AccessControlModule],
  controllers: [ContractsController],
  providers: [ContractsService, PrismaService],
})
export class ContractsModule {}
