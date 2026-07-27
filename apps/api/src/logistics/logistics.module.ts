import { Module } from '@nestjs/common';
import { AccessControlModule } from '../access-control/access-control.module';
import { PrismaService } from '../prisma.service';
import { LogisticsController } from './logistics.controller';
import { LogisticsService } from './logistics.service';

@Module({
  imports: [AccessControlModule],
  controllers: [LogisticsController],
  providers: [LogisticsService, PrismaService],
})
export class LogisticsModule {}
