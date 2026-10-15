import { Module } from '@nestjs/common';
import { AccessControlModule } from '../access-control/access-control.module';
import { AuditModule } from '../audit/audit.module';
import { FilesModule } from '../files/files.module';
import { PrismaService } from '../prisma.service';
import { CommercialController } from './commercial.controller';
import { CommercialService } from './commercial.service';
import { QuotationDocumentsService } from './quotation-documents.service';

@Module({
  exports: [CommercialService],
  imports: [AccessControlModule, AuditModule, FilesModule],
  controllers: [CommercialController],
  providers: [CommercialService, QuotationDocumentsService, PrismaService],
})
export class CommercialModule {}
