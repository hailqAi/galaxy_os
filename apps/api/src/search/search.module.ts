import { Module } from '@nestjs/common';
import { AccessControlModule } from '../access-control/access-control.module';
import { PrismaService } from '../prisma.service';
import { SearchService } from './search.service';
import { SearchController } from './search.controller';
import { TasksModule } from '../tasks/tasks.module';

@Module({
  imports: [AccessControlModule, TasksModule],
  controllers: [SearchController],
  providers: [PrismaService, SearchService],
  exports: [SearchService],
})
export class SearchModule {}
