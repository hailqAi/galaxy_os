import { Module } from '@nestjs/common';
import { AccessControlModule } from '../access-control/access-control.module';
import { PrismaService } from '../prisma.service';
import { ProductionController } from './production.controller';
import { ProductionService } from './production.service';

@Module({
  exports: [ProductionService],
  imports: [AccessControlModule],
  controllers: [ProductionController],
  providers: [ProductionService, PrismaService],
})
export class ProductionModule {}
