import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
  RequirementsController,
  SurveysController,
} from './discovery.controller';
import { DiscoveryService } from './discovery.service';
@Module({
  controllers: [SurveysController, RequirementsController],
  providers: [DiscoveryService, PrismaService],
})
export class DiscoveryModule {}
