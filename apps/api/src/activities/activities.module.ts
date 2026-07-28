import { Module } from '@nestjs/common';
import { AccessControlModule } from '../access-control/access-control.module';
import { PrismaService } from '../prisma.service';
import { ActivitiesController } from './activities.controller';

@Module({
  imports: [AccessControlModule],
  controllers: [ActivitiesController],
  providers: [PrismaService],
})
export class ActivitiesModule {}
