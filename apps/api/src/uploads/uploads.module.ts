import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { FilesModule } from '../files/files.module';
import { ProjectsModule } from '../projects/projects.module';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';
@Module({
  imports: [FilesModule, ProjectsModule],
  controllers: [UploadsController],
  providers: [UploadsService, PrismaService],
  exports: [UploadsService],
})
export class UploadsModule {}
