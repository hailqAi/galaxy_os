import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { Actor, RequirePermission } from '../access-control/access.decorators';
import { CurrentActor } from '../access-control/current-actor';
import {
  CreateEstimateDto,
  CreateQuotationDto,
  DecisionDto,
  GenerateQuotationDocumentDto,
  ReviseQuotationDto,
} from './commercial.dto';
import { CommercialService } from './commercial.service';
import { QuotationDocumentsService } from './quotation-documents.service';

@Controller('projects/:projectId')
export class CommercialController {
  constructor(
    @Inject(CommercialService) private readonly commercial: CommercialService,
    @Inject(QuotationDocumentsService)
    private readonly documents: QuotationDocumentsService,
  ) {}

  @Get('estimates')
  @RequirePermission('estimate.read')
  estimates(
    @Actor() a: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ) {
    return this.commercial.listEstimates(a, projectId);
  }
  @Post('estimates')
  @RequirePermission('estimate.create')
  createEstimate(
    @Actor() a: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() d: CreateEstimateDto,
  ) {
    return this.commercial.createEstimate(a, projectId, d);
  }
  @Get('estimates/:id')
  @RequirePermission('estimate.read')
  estimate(
    @Actor() a: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.commercial.getEstimate(a, projectId, id);
  }
  @Post('estimates/:id/submit')
  @RequirePermission('estimate.update')
  submit(
    @Actor() a: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: DecisionDto,
  ) {
    return this.commercial.decideEstimate(
      a,
      projectId,
      id,
      'SUBMIT',
      d.comment,
    );
  }
  @Post('estimates/:id/approve')
  @RequirePermission('estimate.approve')
  approve(
    @Actor() a: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: DecisionDto,
  ) {
    return this.commercial.decideEstimate(
      a,
      projectId,
      id,
      'APPROVE',
      d.comment,
    );
  }
  @Post('estimates/:id/reject')
  @RequirePermission('estimate.approve')
  reject(
    @Actor() a: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: DecisionDto,
  ) {
    return this.commercial.decideEstimate(
      a,
      projectId,
      id,
      'REJECT',
      d.comment,
    );
  }
  @Post('quotations')
  @RequirePermission('quotation.create')
  quotation(
    @Actor() a: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() d: CreateQuotationDto,
  ) {
    return this.commercial.createQuotation(a, projectId, d);
  }
  @Get('quotations')
  @RequirePermission('quotation.read')
  quotations(
    @Actor() a: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ) {
    return this.commercial.listQuotations(a, projectId);
  }
  @Get('quotations/:id')
  @RequirePermission('quotation.read')
  getQuotation(
    @Actor() a: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.commercial.getQuotation(a, projectId, id);
  }
  @Post('quotations/:id/submit')
  @RequirePermission('quotation.update')
  submitQuotation(
    @Actor() a: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.commercial.transitionQuotation(
      a,
      projectId,
      id,
      'INTERNAL_REVIEW',
    );
  }
  @Post('quotations/:id/mark-sent')
  @RequirePermission('quotation.update')
  sentQuotation(
    @Actor() a: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.commercial.transitionQuotation(a, projectId, id, 'SENT');
  }
  @Post('quotations/:id/mark-accepted')
  @RequirePermission('quotation.update')
  acceptQuotation(
    @Actor() a: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.commercial.transitionQuotation(a, projectId, id, 'ACCEPTED');
  }
  @Post('quotations/:id/approve')
  @RequirePermission('quotation.approve')
  approveQuotation(
    @Actor() a: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: DecisionDto,
  ) {
    return this.commercial.transitionQuotation(
      a,
      projectId,
      id,
      'APPROVED',
      d.comment,
    );
  }
  @Post('quotations/:id/reject')
  @RequirePermission('quotation.approve')
  rejectQuotation(
    @Actor() a: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: DecisionDto,
  ) {
    return this.commercial.transitionQuotation(
      a,
      projectId,
      id,
      'REJECTED',
      d.comment,
    );
  }
  @Post('quotations/:id/revisions')
  @RequirePermission('quotation.update')
  reviseQuotation(
    @Actor() a: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: ReviseQuotationDto,
  ) {
    return this.commercial.reviseQuotation(a, projectId, id, d);
  }
  @Post('quotations/:id/documents')
  @RequirePermission('quotation.export')
  document(
    @Actor() a: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: GenerateQuotationDocumentDto,
  ) {
    return this.documents.generate(a, projectId, id, d.format, d.language);
  }
  @Get('quotations/:id/documents/:documentId/download')
  @RequirePermission('quotation.read')
  async downloadDocument(
    @Actor() a: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Res({ passthrough: true })
    response: { setHeader(name: string, value: string): void },
  ) {
    const result = await this.documents.download(a, projectId, id, documentId);
    response.setHeader(
      'Content-Type',
      result.document.format === 'PDF'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="quotation.${result.document.format.toLowerCase()}"`,
    );
    return new StreamableFile(result.data);
  }
}
