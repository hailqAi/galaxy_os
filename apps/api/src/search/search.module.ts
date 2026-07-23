import { Module } from '@nestjs/common';
import { AccessControlModule } from '../access-control/access-control.module';
import { PrismaService } from '../prisma.service';
import { SearchController } from './search.controller';

@Module({
  imports: [AccessControlModule],
  controllers: [SearchController],
  providers: [PrismaService],
})
export class SearchModule {}
