import { Module } from '@nestjs/common';
import { AccessControlModule } from '../access-control/access-control.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PrismaService } from '../prisma.service';
import { InstallationController } from './installation.controller';
import { InstallationService } from './installation.service';

@Module({
  imports: [AccessControlModule, InventoryModule],
  controllers: [InstallationController],
  providers: [PrismaService, InstallationService],
})
export class InstallationModule {}
