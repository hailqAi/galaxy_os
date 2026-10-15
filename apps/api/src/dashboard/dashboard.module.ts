import { Module } from '@nestjs/common';
import { AccessControlModule } from '../access-control/access-control.module';
import { PrismaService } from '../prisma.service';
import { DashboardController } from './dashboard.controller';
import { TasksModule } from '../tasks/tasks.module';

@Module({
  imports: [AccessControlModule, TasksModule],
  controllers: [DashboardController],
  providers: [PrismaService],
})
export class DashboardModule {}
