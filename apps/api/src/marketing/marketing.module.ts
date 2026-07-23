import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { MarketingController } from './marketing.controller';
import { MarketingService } from './marketing.service';
import { PublishingController } from './publishing.controller';
import {
  FakePublishingProvider,
  PublishingService,
} from './publishing.service';

@Module({
  controllers: [MarketingController, PublishingController],
  providers: [
    MarketingService,
    PublishingService,
    FakePublishingProvider,
    PrismaService,
  ],
})
export class MarketingModule {}
