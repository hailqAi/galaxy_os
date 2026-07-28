import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';
@Module({
  controllers: [UploadsController],
  providers: [UploadsService, PrismaService],
})
export class UploadsModule {}
