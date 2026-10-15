import { Module } from '@nestjs/common';
import { AccessControlModule } from '../access-control/access-control.module';
import { PrismaService } from '../prisma.service';
import { FileStorage } from './file-storage';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { MultipartAdmissionInterceptor } from './multipart-admission.interceptor';
@Module({
  imports: [AccessControlModule],
  controllers: [FilesController],
  providers: [
    FilesService,
    FileStorage,
    MultipartAdmissionInterceptor,
    PrismaService,
  ],
  exports: [FileStorage, FilesService, MultipartAdmissionInterceptor],
})
export class FilesModule {}
