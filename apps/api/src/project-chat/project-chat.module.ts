import { Module } from '@nestjs/common';
import { AccessControlModule } from '../access-control/access-control.module';
import { FilesModule } from '../files/files.module';
import { PrismaService } from '../prisma.service';
import { ProjectChatController } from './project-chat.controller';
import { ProjectChatService } from './project-chat.service';
import { TasksModule } from '../tasks/tasks.module';

@Module({
  imports: [AccessControlModule, FilesModule, TasksModule],
  controllers: [ProjectChatController],
  providers: [PrismaService, ProjectChatService],
})
export class ProjectChatModule {}
