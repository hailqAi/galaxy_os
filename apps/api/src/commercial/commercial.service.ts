import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BusinessEntityPolicy } from '../access-control/business-entity.policy';
import { CurrentActor } from '../access-control/current-actor';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma.service';
import {
  CreateEstimateDto,
  CreateQuotationDto,
  EstimateLineDto,
  ReviseQuotationDto,
} from './commercial.dto';
import {
  calculateEstimateLine,
  sumEstimateCosts,
} from './project-financial-calculations';

@Injectable()
export class CommercialService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(BusinessEntityPolicy)
    private readonly policy: BusinessEntityPolicy,
  ) {}

  private project(
    actor: CurrentActor,
    projectId: string,
    requiredPermissions: string | readonly string[],
    db: Pick<Prisma.TransactionClient, 'project'> = this.prisma,
  ) {
    return db.project.findFirst({
      where: {
        id: projectId,
        ...this.policy.projectWhere(actor, requiredPermissions),
      },
      select: { id: true, customerId: true },
    });
  }

  private async lockProjectFor(
    tx: Prisma.TransactionClient,
    actor: CurrentActor,
    projectId: string,
    requiredPermissions: string | readonly string[],
  ) {
    const locked = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT "id" FROM "Project"
      WHERE "id" = ${projectId}::uuid
        AND "organizationId" = ${actor.organizationId}::uuid
        AND "deletedAt" IS NULL
      FOR UPDATE
    `);
    if (!locked.length) throw new NotFoundException('Project not found');
    const project = await this.project(
      actor,
      projectId,
      requiredPermissions,
      tx,
    );
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  private line(data: EstimateLineDto, position: number) {
    const priceStatus =
      data.priceStatus ??
      (data.netPurchasePrice === undefined ? 'MISSING' : 'PROVISIONAL');
    const sourceDocument = data.sourceDocument?.trim() || undefined;
    if ((priceStatus === 'MISSING') !== (data.netPurchasePrice === undefined))
      throw new UnprocessableEntityException('Invalid estimate price state');
    if (
      priceStatus === 'CONFIRMED' &&
      (!data.priceSourceType || !data.priceQuotedAt || !sourceDocument)
    )
      throw new UnprocessableEntityException(
        'Confirmed price requires dated source evidence',
      );
    const priceQuotedAt = data.priceQuotedAt
      ? new Date(data.priceQuotedAt)
      : undefined;
    const priceValidUntil = data.priceValidUntil
      ? new Date(data.priceValidUntil)
      : undefined;
    if (priceQuotedAt && priceValidUntil && priceValidUntil < priceQuotedAt)
      throw new UnprocessableEntityException(
        'Price validity cannot predate its source',
      );
    let calculation: ReturnType<typeof calculateEstimateLine>;
    try {
      calculation = calculateEstimateLine({
        sellQuantity: data.quantity,
        purchaseQuantity: data.purchaseQuantity,
        purchaseUnitPrice: data.netPurchasePrice ?? null,
        exchangeRate: data.exchangeRateSnapshot,
        sellingUnitPrice: data.sellingPrice,
        freight: data.freightEstimate,
        tax: data.taxEstimate,
        installation: data.installationCost,
        other: data.otherCost,
      });
    } catch {
      throw new UnprocessableEntityException('Invalid estimate amount');
    }
    const quantity = new Prisma.Decimal(data.quantity);
    const purchaseQuantity = new Prisma.Decimal(
      data.purchaseQuantity ?? data.quantity,
    );
    const purchase =
      data.netPurchasePrice === undefined
        ? null
        : new Prisma.Decimal(data.netPurchasePrice);
    const rate = new Prisma.Decimal(data.exchangeRateSnapshot);
    return {
      ...data,
      quantity,
      purchaseQuantity,
      netPurchasePrice: purchase,
      exchangeRateSnapshot: rate,
      baseCostVnd: purchase ? purchaseQuantity.mul(purchase).mul(rate) : null,
      totalCost:
        calculation.totalCost === null
          ? null
          : new Prisma.Decimal(calculation.totalCost),
      sellingPrice: new Prisma.Decimal(data.sellingPrice),
      freightEstimate: new Prisma.Decimal(data.freightEstimate ?? 0),
      taxEstimate: new Prisma.Decimal(data.taxEstimate ?? 0),
      installationCost: new Prisma.Decimal(data.installationCost ?? 0),
      otherCost: new Prisma.Decimal(data.otherCost ?? 0),
      margin:
        calculation.margin === null
          ? null
          : new Prisma.Decimal(calculation.margin),
      markup:
        calculation.markup === null
          ? null
          : new Prisma.Decimal(calculation.markup),
      priceStatus,
      sourceDocument,
      priceQuotedAt,
      priceValidUntil,
      contributesToTotal: data.contributesToTotal ?? true,
      position,
    };
  }

  async listEstimates(actor: CurrentActor, projectId: string) {
    if (!(await this.project(actor, projectId, 'estimate.read')))
      throw new NotFoundException('Project not found');
    return this.prisma.estimate.findMany({
      where: { organizationId: actor.organizationId, projectId },
      orderBy: { updatedAt: 'desc' },
      include: {
        versions: {
          orderBy: { version: 'desc' },
          take: 1,
          select: { id: true, version: true, status: true },
        },
      },
    });
  }

  async getEstimate(actor: CurrentActor, projectId: string, id: string) {
    const item = await this.prisma.estimate.findFirst({
      where: {
        id,
        projectId,
        organizationId: actor.organizationId,
        project: this.policy.projectWhere(actor, 'estimate.read'),
      },
      include: {
        versions: {
          include: {
            lines: { orderBy: { position: 'asc' } },
            approvals: { orderBy: { createdAt: 'desc' } },
            riskAllocations: {
              include: {
                risk: {
                  select: { id: true, code: true, title: true, status: true },
                },
              },
              orderBy: { createdAt: 'asc' },
            },
          },
          orderBy: { version: 'desc' },
        },
      },
    });
    if (!item) throw new NotFoundException('Estimate not found');
    const withContingency = {
      ...item,
      versions: item.versions.map((version) => {
        const approvedContingency = version.riskAllocations
          .filter(({ status }) => status === 'ALLOCATED')
          .reduce(
            (sum, allocation) => sum.add(allocation.approvedAmount),
            new Prisma.Decimal(0),
          );
        return {
          ...version,
          approvedContingency: approvedContingency.toFixed(2),
          totalCostWithContingency:
            version.subtotalCost === null
              ? null
              : new Prisma.Decimal(version.subtotalCost)
                  .add(approvedContingency)
                  .toFixed(2),
        };
      }),
    };
    if (
      !actor.permissions.includes('financial_margin.read') ||
      !(await this.project(actor, projectId, 'financial_margin.read'))
    )
      return {
        ...withContingency,
        versions: withContingency.versions.map((version) => ({
          ...version,
          subtotalCost: undefined,
          approvedContingency: undefined,
          totalCostWithContingency: undefined,
          riskAllocations: undefined,
          lines: version.lines.map((line) => ({
            ...line,
            listPrice: undefined,
            supplierDiscount: undefined,
            netPurchasePrice: undefined,
            baseCostVnd: undefined,
            freightEstimate: undefined,
            taxEstimate: undefined,
            installationCost: undefined,
            otherCost: undefined,
            totalCost: undefined,
            margin: undefined,
            markup: undefined,
          })),
        })),
      };
    return withContingency;
  }

  async createEstimate(
    actor: CurrentActor,
    projectId: string,
    data: CreateEstimateDto,
  ) {
    const lines = data.lines.map((line, index) => this.line(line, index));
    const subtotal = sumEstimateCosts(
      lines.map((line) => ({
        totalCost: line.totalCost?.toFixed(2) ?? null,
        contributesToTotal: line.contributesToTotal,
      })),
    );
    const subtotalCost =
      subtotal === null ? null : new Prisma.Decimal(subtotal);
    const subtotalSelling = lines
      .filter(({ contributesToTotal }) => contributesToTotal)
      .reduce(
        (sum, line) => sum.add(line.quantity.mul(line.sellingPrice)),
        new Prisma.Decimal(0),
      );
    return this.prisma.$transaction(async (tx) => {
      await this.lockProjectFor(tx, actor, projectId, [
        'estimate.create',
        'financial_margin.read',
      ]);
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
    return this.prisma.$transaction(async (tx) => {
      await this.lockProjectFor(
        tx,
        actor,
        projectId,
        decision === 'SUBMIT' ? 'estimate.update' : 'estimate.approve',
      );
      const item = await tx.estimate.findFirst({
        where: { id, projectId, organizationId: actor.organizationId },
      });
      if (!item) throw new NotFoundException('Estimate not found');
      const version = await tx.estimateVersion.findFirst({
        where: { estimateId: id, version: item.currentVersion },
        include: { lines: { select: { priceStatus: true } } },
      });
      if (!version) throw new NotFoundException('Estimate not found');
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
      if (
        decision === 'APPROVE' &&
        version.lines.some(({ priceStatus }) => priceStatus !== 'CONFIRMED')
      )
        throw new UnprocessableEntityException(
          'Confirmed price sources are required',
        );
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
    return this.prisma.$transaction(async (tx) => {
      const project = await this.lockProjectFor(
        tx,
        actor,
        projectId,
        discount.gt(0)
          ? ['quotation.create', 'quotation.discount.approve']
          : 'quotation.create',
      );
      const estimate = await tx.estimate.findFirst({
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
      const lines = source.lines
        .filter(({ contributesToTotal }) => contributesToTotal)
        .map((line) => ({
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
      const grandTotal = subtotal
        .sub(discount)
        .add(tax)
        .add(shipping)
        .add(installation)
        .add(warranty);
      if (grandTotal.lt(0))
        throw new UnprocessableEntityException('Invalid quotation total');
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
    if (!(await this.project(actor, projectId, 'quotation.read')))
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
      where: {
        id,
        projectId,
        organizationId: actor.organizationId,
        project: this.policy.projectWhere(actor, 'quotation.read'),
      },
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
    return {
      ...item,
      versions: item.versions.map((version) => ({
        ...version,
        documents: version.documents.map(
          ({ storageKey, checksum, sizeBytes, ...document }) => {
            void storageKey;
            void checksum;
            void sizeBytes;
            return document;
          },
        ),
      })),
    };
  }

  async transitionQuotation(
    actor: CurrentActor,
    projectId: string,
    id: string,
    next: string,
    comment?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockProjectFor(
        tx,
        actor,
        projectId,
        ['APPROVED', 'REJECTED'].includes(next)
          ? 'quotation.approve'
          : 'quotation.update',
      );
      const item = await tx.quotation.findFirst({
        where: { id, projectId, organizationId: actor.organizationId },
      });
      if (!item) throw new NotFoundException('Quotation not found');
      const version = await tx.quotationVersion.findFirst({
        where: { quotationId: id, version: item.currentVersion },
      });
      if (!version) throw new NotFoundException('Quotation not found');
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
    return this.prisma.$transaction(async (tx) => {
      await this.lockProjectFor(tx, actor, projectId, 'quotation.update');
      const item = await tx.quotation.findFirst({
        where: { id, projectId, organizationId: actor.organizationId },
      });
      if (!item) throw new NotFoundException('Quotation not found');
      const source = await tx.quotationVersion.findFirst({
        where: { quotationId: id, version: item.currentVersion },
        include: {
          lines: { orderBy: { position: 'asc' } },
          sections: { orderBy: { position: 'asc' } },
          terms: { orderBy: { position: 'asc' } },
        },
      });
      if (!source || !['APPROVED', 'SENT', 'REJECTED'].includes(source.status))
        throw new ConflictException('Quotation cannot be revised');
      const discount = new Prisma.Decimal(data.discount ?? source.discount);
      if (
        discount.gt(0) &&
        !actor.permissions.includes('quotation.discount.approve')
      )
        throw new ForbiddenException('Discount permission is required');
      if (
        discount.gt(0) &&
        !(await this.project(
          actor,
          projectId,
          ['quotation.update', 'quotation.discount.approve'],
          tx,
        ))
      )
        throw new NotFoundException('Project not found');
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
