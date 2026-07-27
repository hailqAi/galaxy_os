import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { FilesModule } from '../files/files.module';
import { PrismaService } from '../prisma.service';
import { CommercialController } from './commercial.controller';
import { CommercialService } from './commercial.service';
import { QuotationDocumentsService } from './quotation-documents.service';

@Module({
  imports: [AuditModule, FilesModule],
  controllers: [CommercialController],
  providers: [CommercialService, QuotationDocumentsService, PrismaService],
})
export class CommercialModule {}
