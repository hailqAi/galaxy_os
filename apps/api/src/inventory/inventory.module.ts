import { Module } from '@nestjs/common';
import { AccessControlModule } from '../access-control/access-control.module';
import { PrismaService } from '../prisma.service';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { ReceivingController } from './receiving.controller';
import { ReceivingService } from './receiving.service';
import { InventoryOperationsController } from './operations.controller';
import { InventoryOperationsService } from './operations.service';

@Module({
  imports: [AccessControlModule],
  controllers: [
    InventoryController,
    ReceivingController,
    InventoryOperationsController,
  ],
  providers: [
    InventoryService,
    ReceivingService,
    InventoryOperationsService,
    PrismaService,
  ],
  exports: [InventoryService],
})
export class InventoryModule {}
