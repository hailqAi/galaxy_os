import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CurrentActor } from '../access-control/current-actor';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma.service';
import {
  CreateEstimateDto,
  CreateQuotationDto,
  EstimateLineDto,
  ReviseQuotationDto,
} from './commercial.dto';

@Injectable()
export class CommercialService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private project(actor: CurrentActor, projectId: string) {
    return this.prisma.project.findFirst({
      where: {
        id: projectId,
        organizationId: actor.organizationId,
        deletedAt: null,
      },
      select: { id: true, customerId: true },
    });
  }

  private line(data: EstimateLineDto, position: number) {
    const quantity = new Prisma.Decimal(data.quantity);
    const purchase = new Prisma.Decimal(data.netPurchasePrice);
    const rate = new Prisma.Decimal(data.exchangeRateSnapshot);
    const extras = [
      'freightEstimate',
      'taxEstimate',
      'installationCost',
      'otherCost',
    ].map((key) => new Prisma.Decimal(data[key as keyof EstimateLineDto] || 0));
    if (quantity.lte(0) || purchase.lt(0) || rate.lte(0))
      throw new UnprocessableEntityException('Invalid estimate amount');
    const baseCostVnd = quantity.mul(purchase).mul(rate);
    const totalCost = extras.reduce(
      (sum, value) => sum.add(value),
      baseCostVnd,
    );
    const selling = quantity.mul(new Prisma.Decimal(data.sellingPrice));
    return {
      ...data,
      quantity,
      netPurchasePrice: purchase,
      exchangeRateSnapshot: rate,
      baseCostVnd,
      totalCost,
      sellingPrice: new Prisma.Decimal(data.sellingPrice),
      freightEstimate: extras[0],
      taxEstimate: extras[1],
      installationCost: extras[2],
      otherCost: extras[3],
      margin: selling.eq(0) ? 0 : selling.sub(totalCost).div(selling),
      position,
    };
  }

  async listEstimates(actor: CurrentActor, projectId: string) {
    if (!(await this.project(actor, projectId)))
      throw new NotFoundException('Project not found');
    return this.prisma.estimate.findMany({
      where: { organizationId: actor.organizationId, projectId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getEstimate(actor: CurrentActor, projectId: string, id: string) {
    const item = await this.prisma.estimate.findFirst({
      where: { id, projectId, organizationId: actor.organizationId },
      include: {
        versions: {
          include: {
            lines: { orderBy: { position: 'asc' } },
            approvals: { orderBy: { createdAt: 'desc' } },
          },
          orderBy: { version: 'desc' },
        },
      },
    });
    if (!item) throw new NotFoundException('Estimate not found');
    if (!actor.permissions.includes('financial_margin.read'))
      return {
        ...item,
        versions: item.versions.map((version) => ({
          ...version,
          subtotalCost: undefined,
          lines: version.lines.map((line) => ({
            ...line,
            netPurchasePrice: undefined,
            baseCostVnd: undefined,
            totalCost: undefined,
            margin: undefined,
          })),
        })),
      };
    return item;
  }

  async createEstimate(
    actor: CurrentActor,
    projectId: string,
    data: CreateEstimateDto,
  ) {
    if (!(await this.project(actor, projectId)))
      throw new NotFoundException('Project not found');
    const lines = data.lines.map((line, index) => this.line(line, index));
    const subtotalCost = lines.reduce(
      (sum, line) => sum.add(line.totalCost),
      new Prisma.Decimal(0),
    );
    const subtotalSelling = lines.reduce(
      (sum, line) => sum.add(line.quantity.mul(line.sellingPrice)),
      new Prisma.Decimal(0),
    );
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.estimate.create({
        data: {
          organizationId: actor.organizationId,
          projectId,
          number: data.number,
          title: data.title,
          currency: data.currency.toUpperCase(),
          createdBy: actor.userId,
          versions: {
            create: {
              version: 1,
              createdBy: actor.userId,
              subtotalCost,
              subtotalSelling,
              lines: { create: lines },
            },
          },
        },
        include: { versions: { include: { lines: true } } },
      });
      await tx.activity.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          event: 'ESTIMATE_CREATED',
          entityType: 'Estimate',
          entityId: item.id,
        },
      });
      await this.audit.write(tx, actor, {
        action: 'ESTIMATE_CREATED',
        entityType: 'Estimate',
        entityId: item.id,
        afterData: item,
      });
      return item;
    });
  }

  async decideEstimate(
    actor: CurrentActor,
    projectId: string,
    id: string,
    decision: 'SUBMIT' | 'APPROVE' | 'REJECT',
    comment?: string,
  ) {
    const item = await this.prisma.estimate.findFirst({
      where: { id, projectId, organizationId: actor.organizationId },
    });
    if (!item) throw new NotFoundException('Estimate not found');
    const version = await this.prisma.estimateVersion.findUniqueOrThrow({
      where: {
        estimateId_version: { estimateId: id, version: item.currentVersion },
      },
    });
    const next =
      decision === 'SUBMIT'
        ? 'PENDING'
        : decision === 'APPROVE'
          ? 'APPROVED'
          : 'REJECTED';
    if (
      (decision === 'SUBMIT' && version.status !== 'DRAFT') ||
      (decision !== 'SUBMIT' && version.status !== 'PENDING')
    )
      throw new ConflictException('Invalid estimate transition');
    if (decision === 'APPROVE' && version.createdBy === actor.userId)
      throw new ForbiddenException('Creator cannot approve this estimate');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.estimateVersion.update({
        where: { id: version.id },
        data: {
          status: next,
          submittedAt: decision === 'SUBMIT' ? new Date() : undefined,
          approvedAt: decision === 'APPROVE' ? new Date() : undefined,
          approvedBy: decision === 'APPROVE' ? actor.userId : undefined,
        },
      });
      await tx.estimate.update({ where: { id }, data: { status: next } });
      await tx.estimateApproval.create({
        data: {
          estimateVersionId: version.id,
          actorId: actor.userId,
          decision,
          comment,
          version: version.version,
        },
      });
      await tx.activity.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          event: `ESTIMATE_${decision}`,
          entityType: 'Estimate',
          entityId: id,
        },
      });
      return updated;
    });
  }

  async createQuotation(
    actor: CurrentActor,
    projectId: string,
    data: CreateQuotationDto,
  ) {
    const project = await this.project(actor, projectId);
    if (!project) throw new NotFoundException('Project not found');
    const estimate = await this.prisma.estimate.findFirst({
      where: {
        id: data.estimateId,
        projectId,
        organizationId: actor.organizationId,
        status: 'APPROVED',
      },
      include: {
        versions: {
          where: { status: 'APPROVED' },
          include: { lines: true },
          take: 1,
          orderBy: { version: 'desc' },
        },
      },
    });
    if (!estimate?.versions[0])
      throw new UnprocessableEntityException('Approved estimate required');
    const source = estimate.versions[0];
    const lines = source.lines.map((line) => ({
      section: line.section,
      description: line.customDescription || line.itemType,
      quantity: line.quantity,
      unit: line.unit,
      unitPrice: line.sellingPrice,
      lineTotal: line.quantity.mul(line.sellingPrice),
      position: line.position,
    }));
    const subtotal = lines.reduce(
      (sum, line) => sum.add(line.lineTotal),
      new Prisma.Decimal(0),
    );
    const discount = new Prisma.Decimal(data.discount || 0);
    const tax = new Prisma.Decimal(data.tax || 0);
    const shipping = new Prisma.Decimal(data.shipping || 0);
    const installation = new Prisma.Decimal(data.installation || 0);
    const warranty = new Prisma.Decimal(data.warranty || 0);
    if (
      discount.gt(0) &&
      !actor.permissions.includes('quotation.discount.approve')
    )
      throw new ForbiddenException('Discount permission is required');
    const grandTotal = subtotal
      .sub(discount)
      .add(tax)
      .add(shipping)
      .add(installation)
      .add(warranty);
    if (grandTotal.lt(0))
      throw new UnprocessableEntityException('Invalid quotation total');
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.quotation.create({
        data: {
          organizationId: actor.organizationId,
          projectId,
          customerId: project.customerId,
          estimateId: estimate.id,
          number: data.number,
          currency: estimate.currency,
          createdBy: actor.userId,
          updatedBy: actor.userId,
          validUntil: data.validityDate,
          subtotal,
          discountAmount: discount,
          taxAmount: tax,
          shippingAmount: shipping,
          installationAmount: installation,
          warrantyAmount: warranty,
          grandTotal,
          versions: {
            create: {
              version: 1,
              validityDate: data.validityDate,
              paymentTerms: data.paymentTerms,
              deliveryTerms: data.deliveryTerms,
              warrantyTerms: data.warrantyTerms,
              installationTerms: data.installationTerms,
              notes: data.notes,
              subtotal,
              discount,
              tax,
              shipping,
              installation,
              warranty,
              grandTotal,
              createdBy: actor.userId,
              lines: { create: lines },
              sections: {
                create: [...new Set(lines.map(({ section }) => section))].map(
                  (title, position) => ({ title, position }),
                ),
              },
              statusHistory: {
                create: {
                  toStatus: 'DRAFT',
                  actorId: actor.userId,
                },
              },
            },
          },
        },
        include: { versions: { include: { lines: true } } },
      });
      const current = item.versions[0];
      if (current)
        await tx.quotation.update({
          where: { id: item.id },
          data: { currentVersionId: current.id },
        });
      await tx.activity.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          event: 'QUOTATION_CREATED',
          entityType: 'Quotation',
          entityId: item.id,
        },
      });
      return item;
    });
  }

  async listQuotations(actor: CurrentActor, projectId: string) {
    if (!(await this.project(actor, projectId)))
      throw new NotFoundException('Project not found');
    return this.prisma.quotation.findMany({
      where: { organizationId: actor.organizationId, projectId },
      include: {
        versions: {
          where: { version: { gte: 1 } },
          orderBy: { version: 'desc' },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getQuotation(actor: CurrentActor, projectId: string, id: string) {
    const item = await this.prisma.quotation.findFirst({
      where: { id, projectId, organizationId: actor.organizationId },
      include: {
        versions: {
          include: {
            lines: { orderBy: { position: 'asc' } },
            sections: { orderBy: { position: 'asc' } },
            terms: { orderBy: { position: 'asc' } },
            approvals: { orderBy: { createdAt: 'desc' } },
            documents: { orderBy: { generatedAt: 'desc' } },
            statusHistory: { orderBy: { createdAt: 'desc' } },
          },
          orderBy: { version: 'desc' },
        },
      },
    });
    if (!item) throw new NotFoundException('Quotation not found');
    return item;
  }

  async transitionQuotation(
    actor: CurrentActor,
    projectId: string,
    id: string,
    next: string,
    comment?: string,
  ) {
    const item = await this.prisma.quotation.findFirst({
      where: { id, projectId, organizationId: actor.organizationId },
    });
    if (!item) throw new NotFoundException('Quotation not found');
    const version = await this.prisma.quotationVersion.findUniqueOrThrow({
      where: {
        quotationId_version: {
          quotationId: id,
          version: item.currentVersion,
        },
      },
    });
    const allowed: Record<string, string[]> = {
      DRAFT: ['INTERNAL_REVIEW', 'CANCELLED'],
      INTERNAL_REVIEW: ['APPROVED', 'REJECTED', 'DRAFT'],
      APPROVED: ['SENT', 'CANCELLED'],
      SENT: ['ACCEPTED', 'REJECTED', 'EXPIRED'],
    };
    if (!allowed[version.status]?.includes(next))
      throw new ConflictException('Invalid quotation transition');
    if (next === 'APPROVED' && version.createdBy === actor.userId)
      throw new ForbiddenException('Creator cannot approve this quotation');
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.quotationVersion.update({
        where: { id: version.id },
        data: {
          status: next,
          sentAt: next === 'SENT' ? now : undefined,
          acceptedAt: next === 'ACCEPTED' ? now : undefined,
          rejectedAt: next === 'REJECTED' ? now : undefined,
        },
      });
      await tx.quotation.update({
        where: { id },
        data: {
          status: next,
          updatedBy: actor.userId,
          sentAt: next === 'SENT' ? now : undefined,
          acceptedAt: next === 'ACCEPTED' ? now : undefined,
          rejectedAt: next === 'REJECTED' ? now : undefined,
          expiredAt: next === 'EXPIRED' ? now : undefined,
        },
      });
      await tx.quotationStatusHistory.create({
        data: {
          quotationVersionId: version.id,
          fromStatus: version.status,
          toStatus: next,
          actorId: actor.userId,
          comment,
        },
      });
      if (['APPROVED', 'REJECTED'].includes(next))
        await tx.quotationApproval.create({
          data: {
            quotationVersionId: version.id,
            actorId: actor.userId,
            decision: next,
            comment,
          },
        });
      await tx.activity.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          event: `QUOTATION_${next}`,
          entityType: 'Quotation',
          entityId: id,
        },
      });
      return updated;
    });
  }

  async reviseQuotation(
    actor: CurrentActor,
    projectId: string,
    id: string,
    data: ReviseQuotationDto,
  ) {
    const item = await this.getQuotation(actor, projectId, id);
    const source = item.versions[0];
    if (!source || !['APPROVED', 'SENT', 'REJECTED'].includes(source.status))
      throw new ConflictException('Quotation cannot be revised');
    const discount = new Prisma.Decimal(data.discount ?? source.discount);
    if (
      discount.gt(0) &&
      !actor.permissions.includes('quotation.discount.approve')
    )
      throw new ForbiddenException('Discount permission is required');
    const tax = new Prisma.Decimal(data.tax ?? source.tax);
    const shipping = new Prisma.Decimal(data.shipping ?? source.shipping);
    const installation = new Prisma.Decimal(
      data.installation ?? source.installation,
    );
    const warranty = new Prisma.Decimal(data.warranty ?? source.warranty);
    const grandTotal = source.subtotal
      .sub(discount)
      .add(tax)
      .add(shipping)
      .add(installation)
      .add(warranty);
    return this.prisma.$transaction(async (tx) => {
      await tx.quotationVersion.update({
        where: { id: source.id },
        data: { status: 'SUPERSEDED' },
      });
      const revision = await tx.quotationVersion.create({
        data: {
          quotationId: id,
          version: source.version + 1,
          status: 'DRAFT',
          validityDate: data.validityDate ?? source.validityDate,
          paymentTerms: data.paymentTerms ?? source.paymentTerms,
          deliveryTerms: data.deliveryTerms ?? source.deliveryTerms,
          installationTerms: data.installationTerms ?? source.installationTerms,
          warrantyTerms: data.warrantyTerms ?? source.warrantyTerms,
          notes: data.notes ?? source.notes,
          subtotal: source.subtotal,
          discount,
          tax,
          shipping,
          installation,
          warranty,
          grandTotal,
          createdBy: actor.userId,
          lines: {
            create: source.lines.map(
              ({
                section,
                description,
                quantity,
                unit,
                unitPrice,
                lineTotal,
                position,
              }) => ({
                section,
                description,
                quantity,
                unit,
                unitPrice,
                lineTotal,
                position,
              }),
            ),
          },
          sections: {
            create: source.sections.map(({ title, position }) => ({
              title,
              position,
            })),
          },
          terms: {
            create: source.terms.map(({ termType, content, position }) => ({
              termType,
              content,
              position,
            })),
          },
          statusHistory: {
            create: { toStatus: 'DRAFT', actorId: actor.userId },
          },
        },
      });
      await tx.quotation.update({
        where: { id },
        data: {
          currentVersion: revision.version,
          currentVersionId: revision.id,
          status: 'DRAFT',
          discountAmount: discount,
          taxAmount: tax,
          shippingAmount: shipping,
          installationAmount: installation,
          warrantyAmount: warranty,
          grandTotal,
          validUntil: revision.validityDate,
          updatedBy: actor.userId,
        },
      });
      await tx.activity.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          event: 'QUOTATION_REVISED',
          entityType: 'Quotation',
          entityId: id,
          metadata: { from: source.version, to: revision.version },
        },
      });
      return revision;
    });
  }
}
