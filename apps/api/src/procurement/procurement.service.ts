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
import { PrismaService } from '../prisma.service';
import {
  CreatePurchaseRequestDto,
  CreatePurchaseOrderDto,
  CreateProformaInvoiceDto,
  CreateSupplierPaymentDto,
  CreateSupplierPaymentScheduleDto,
  GenerateSupplierPayableDto,
  AllocateSupplierPaymentDto,
  CreateClarificationDto,
  CreateRFQDto,
  CreateSupplierComparisonDto,
  CreateSupplierQuotationDto,
  PurchaseRequestsQuery,
  ProformaInvoiceDocumentDto,
  ProformaInvoicesQuery,
  SupplierPayablesQuery,
  RFQsQuery,
  SelectSupplierDto,
  SupplierQuotationsQuery,
  UpdateRFQDto,
  UpdatePurchaseRequestDto,
  UpdateProformaInvoiceDto,
  UpdateSupplierPaymentScheduleDto,
  UpdateSupplierQuotationDto,
} from './procurement.dto';
@Injectable()
export class ProcurementService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(BusinessEntityPolicy) private readonly policy: BusinessEntityPolicy,
  ) {}
  async get(actor: CurrentActor, id: string) {
    const item = await this.prisma.purchaseRequest.findFirst({
      where: {
        id,
        organizationId: actor.organizationId,
        deletedAt: null,
        project: this.policy.projectWhere(actor, 'purchase_request.read'),
      },
      include: {
        lines: { orderBy: { position: 'asc' } },
        approvals: { orderBy: { createdAt: 'desc' } },
        statusHistory: { orderBy: { createdAt: 'desc' } },
        project: { select: { id: true, name: true, projectManagerId: true } },
      },
    });
    if (!item) throw new NotFoundException('Purchase request not found');
    return item;
  }
  async list(actor: CurrentActor, q: PurchaseRequestsQuery) {
    const where: Prisma.PurchaseRequestWhereInput = {
      organizationId: actor.organizationId,
      deletedAt: null,
      project: this.policy.projectWhere(actor, 'purchase_request.read'),
      projectId: q.projectId,
      status: q.status,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.purchaseRequest.findMany({
        where,
        include: {
          project: { select: { id: true, name: true } },
          _count: { select: { lines: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.purchaseRequest.count({ where }),
    ]);
    return {
      items,
      page: q.page,
      pageSize: q.pageSize,
      total,
      totalPages: Math.ceil(total / q.pageSize),
    };
  }
  async create(actor: CurrentActor, data: CreatePurchaseRequestDto) {
    await this.policy.assertView(actor, 'Project', data.projectId);
    if (data.sourceType !== 'MANUAL' && !data.sourceId)
      throw new UnprocessableEntityException('Source is required');
    await this.validateSource(actor, data);
    const lines = data.lines.map((line, position) => {
      const quantity = new Prisma.Decimal(line.quantity);
      if (quantity.lte(0))
        throw new UnprocessableEntityException('Quantity must be positive');
      if (!line.productId && !line.customDescription)
        throw new UnprocessableEntityException(
          'Product or description is required',
        );
      return { ...line, quantity, position };
    });
    await this.prisma.$transaction(async (tx) => {
      const item = await tx.purchaseRequest.create({
        data: {
          organizationId: actor.organizationId,
          projectId: data.projectId,
          requestNumber: data.requestNumber,
          sourceType: data.sourceType,
          sourceId: data.sourceId,
          requestedById: actor.userId,
          departmentId: data.departmentId,
          requiredDate: data.requiredDate,
          priority: data.priority,
          notes: data.notes,
          createdBy: actor.userId,
          updatedBy: actor.userId,
          lines: { create: lines },
          statusHistory: {
            create: { toStatus: 'DRAFT', actorId: actor.userId },
          },
        },
        include: { lines: true },
      });
      await tx.activity.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          event: 'PURCHASE_REQUEST_CREATED',
          entityType: 'PurchaseRequest',
          entityId: item.id,
        },
      });
      return item;
    });
  }
  async update(
    actor: CurrentActor,
    id: string,
    data: UpdatePurchaseRequestDto,
  ) {
    const item = await this.get(actor, id);
    if (item.status !== 'DRAFT')
      throw new ConflictException('Approved or submitted request is immutable');
    return this.prisma.purchaseRequest.update({
      where: { id },
      data: { ...data, updatedBy: actor.userId, version: { increment: 1 } },
    });
  }
  async remove(actor: CurrentActor, id: string) {
    const item = await this.get(actor, id);
    if (item.status !== 'DRAFT')
      throw new ConflictException('Only draft can be deleted');
    return this.prisma.purchaseRequest.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: actor.userId },
    });
  }
  async transition(
    actor: CurrentActor,
    id: string,
    next: 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED',
    comment?: string,
  ) {
    const item = await this.get(actor, id);
    const allowed: Record<string, string[]> = {
      DRAFT: ['SUBMITTED', 'CANCELLED'],
      SUBMITTED: ['APPROVED', 'REJECTED', 'CANCELLED'],
    };
    if (!allowed[item.status]?.includes(next))
      throw new ConflictException('Invalid purchase request transition');
    if (!item.lines.length)
      throw new UnprocessableEntityException('Purchase request requires lines');
    if (next === 'APPROVED' && item.createdBy === actor.userId)
      throw new ForbiddenException('Creator cannot approve purchase request');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.purchaseRequest.update({
        where: { id },
        data: {
          status: next,
          updatedBy: actor.userId,
          version: { increment: 1 },
        },
      });
      await tx.purchaseRequestStatusHistory.create({
        data: {
          purchaseRequestId: id,
          fromStatus: item.status,
          toStatus: next,
          actorId: actor.userId,
          comment,
        },
      });
      if (['APPROVED', 'REJECTED'].includes(next))
        await tx.purchaseRequestApproval.create({
          data: {
            purchaseRequestId: id,
            actorId: actor.userId,
            decision: next,
            comment,
          },
        });
      await tx.activity.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          event: `PURCHASE_REQUEST_${next}`,
          entityType: 'PurchaseRequest',
          entityId: id,
        },
      });
      if (
        item.project.projectManagerId &&
        item.project.projectManagerId !== actor.userId
      )
        await tx.notification.create({
          data: {
            organizationId: actor.organizationId,
            recipientId: item.project.projectManagerId,
            actorId: actor.userId,
            type: `PURCHASE_REQUEST_${next}`,
            title: `Yêu cầu mua hàng ${item.requestNumber}`,
            body: `Trạng thái: ${next}`,
            entityType: 'Project',
            entityId: item.projectId,
            projectId: item.projectId,
            href: `/procurement/requests/${id}`,
          },
        });
      return updated;
    });
  }
  private async validateSource(
    actor: CurrentActor,
    data: CreatePurchaseRequestDto,
  ) {
    if (!data.sourceId) return;
    const where = {
      id: data.sourceId,
      organizationId: actor.organizationId,
      projectId: data.projectId,
    };
    const valid =
      data.sourceType === 'APPROVED_ESTIMATE'
        ? await this.prisma.estimate.findFirst({
            where: { ...where, status: 'APPROVED' },
          })
        : data.sourceType === 'ACCEPTED_QUOTATION'
          ? await this.prisma.quotation.findFirst({
              where: { ...where, status: 'ACCEPTED' },
            })
          : data.sourceType === 'SIGNED_CONTRACT'
            ? await this.prisma.contract.findFirst({
                where: { ...where, status: { in: ['SIGNED', 'ACTIVE'] } },
              })
            : data.sourceType === 'PROJECT_REQUIREMENT'
              ? await this.prisma.requirement.findFirst({
                  where: {
                    id: data.sourceId,
                    organizationId: actor.organizationId,
                    projectId: data.projectId,
                    approvalStatus: 'APPROVED',
                  },
                })
              : true;
    if (!valid)
      throw new UnprocessableEntityException(
        'Valid approved source is required',
      );
  }

  async listRFQs(actor: CurrentActor, q: RFQsQuery) {
    const where: Prisma.SupplierRFQWhereInput = {
      organizationId: actor.organizationId,
      deletedAt: null,
      projectId: q.projectId,
      purchaseRequestId: q.purchaseRequestId,
      status: q.status,
      rfqNumber: q.search
        ? { contains: q.search, mode: 'insensitive' }
        : undefined,
      recipients: q.supplierId
        ? { some: { supplierId: q.supplierId } }
        : undefined,
      purchaseRequest: {
        project: this.policy.projectWhere(actor, 'procurement.rfq.read'),
      },
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.supplierRFQ.findMany({
        where,
        include: {
          purchaseRequest: { select: { requestNumber: true } },
          _count: { select: { recipients: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.supplierRFQ.count({ where }),
    ]);
    return { items, page: q.page, pageSize: q.pageSize, total };
  }

  async getRFQ(actor: CurrentActor, id: string) {
    const item = await this.prisma.supplierRFQ.findFirst({
      where: {
        id,
        organizationId: actor.organizationId,
        deletedAt: null,
        purchaseRequest: {
          project: this.policy.projectWhere(actor, 'procurement.rfq.read'),
        },
      },
      include: {
        purchaseRequest: {
          select: {
            requestNumber: true,
            project: { select: { projectManagerId: true } },
          },
        },
        recipients: true,
        lines: { orderBy: { position: 'asc' } },
        clarifications: { orderBy: { askedAt: 'desc' } },
        documents: true,
        statusHistory: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!item) throw new NotFoundException('RFQ not found');
    return item;
  }

  async createRFQ(actor: CurrentActor, data: CreateRFQDto) {
    const request = await this.get(actor, data.purchaseRequestId);
    if (request.status !== 'APPROVED')
      throw new UnprocessableEntityException(
        'Approved purchase request required',
      );
    const suppliers = await this.prisma.supplier.findMany({
      where: {
        id: { in: [...new Set(data.supplierIds)] },
        organizationId: actor.organizationId,
        activeStatus: 'active',
      },
    });
    if (suppliers.length !== new Set(data.supplierIds).size)
      throw new UnprocessableEntityException('Active suppliers are required');
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.supplierRFQ.create({
        data: {
          organizationId: actor.organizationId,
          rfqNumber: data.rfqNumber,
          purchaseRequestId: request.id,
          projectId: request.projectId,
          responseDeadline: data.responseDeadline,
          requestedCurrency: data.requestedCurrency,
          requestedIncoterms: data.requestedIncoterms,
          deliveryDestination: data.deliveryDestination,
          deliveryCountry: data.deliveryCountry,
          technicalRequirements: data.technicalRequirements,
          commercialRequirements: data.commercialRequirements,
          language: data.language,
          createdBy: actor.userId,
          updatedBy: actor.userId,
          recipients: {
            create: suppliers.map((supplier) => ({
              supplierId: supplier.id,
              language: data.language,
            })),
          },
          lines: {
            create: request.lines.map((line) => ({
              purchaseRequestLineId: line.id,
              productId: line.productId,
              variantId: line.variantId,
              customDescription: line.customDescription,
              quantity: line.quantity,
              unit: line.unit,
              targetDeliveryDate: line.requiredDate,
              technicalRequirements: line.technicalRequirements,
              notes: line.notes,
              position: line.position,
            })),
          },
          statusHistory: {
            create: { toStatus: 'DRAFT', actorId: actor.userId },
          },
        },
        include: { recipients: true, lines: true },
      });
      await tx.activity.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          event: 'RFQ_CREATED',
          entityType: 'SupplierRFQ',
          entityId: item.id,
        },
      });
      return item;
    });
  }

  async updateRFQ(actor: CurrentActor, id: string, data: UpdateRFQDto) {
    const item = await this.getRFQ(actor, id);
    if (!['DRAFT', 'READY_TO_SEND'].includes(item.status))
      throw new ConflictException('Sent RFQ is immutable');
    return this.prisma.supplierRFQ.update({
      where: { id },
      data: { ...data, updatedBy: actor.userId, version: { increment: 1 } },
    });
  }

  async addRFQRecipients(
    actor: CurrentActor,
    id: string,
    supplierIds: string[],
  ) {
    const item = await this.getRFQ(actor, id);
    if (!['DRAFT', 'READY_TO_SEND'].includes(item.status))
      throw new ConflictException('Sent RFQ recipients are immutable');
    const suppliers = await this.prisma.supplier.findMany({
      where: {
        id: { in: [...new Set(supplierIds)] },
        organizationId: actor.organizationId,
        activeStatus: 'active',
      },
    });
    if (suppliers.length !== new Set(supplierIds).size)
      throw new UnprocessableEntityException('Active suppliers are required');
    await this.prisma.supplierRFQRecipient.createMany({
      data: suppliers.map((supplier) => ({
        rfqId: id,
        supplierId: supplier.id,
        language: item.language,
      })),
      skipDuplicates: true,
    });
    return this.getRFQ(actor, id);
  }

  async removeRFQRecipient(
    actor: CurrentActor,
    id: string,
    recipientId: string,
  ) {
    const item = await this.getRFQ(actor, id);
    if (!['DRAFT', 'READY_TO_SEND'].includes(item.status))
      throw new ConflictException('Sent RFQ recipients are immutable');
    const result = await this.prisma.supplierRFQRecipient.deleteMany({
      where: { id: recipientId, rfqId: id },
    });
    if (!result.count) throw new NotFoundException('Recipient not found');
    return { deleted: true };
  }

  async removeRFQ(actor: CurrentActor, id: string) {
    const item = await this.getRFQ(actor, id);
    if (!['DRAFT', 'CANCELLED'].includes(item.status))
      throw new ConflictException('Only draft or cancelled RFQ can be deleted');
    await this.prisma.supplierRFQ.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: actor.userId },
    });
    return { deleted: true };
  }

  async transitionRFQ(
    actor: CurrentActor,
    id: string,
    next: 'READY_TO_SEND' | 'SENT' | 'CLOSED' | 'CANCELLED',
  ) {
    const item = await this.getRFQ(actor, id);
    const allowed: Record<string, string[]> = {
      DRAFT: ['READY_TO_SEND', 'CANCELLED'],
      READY_TO_SEND: ['SENT', 'CANCELLED'],
      SENT: ['CLOSED', 'CANCELLED'],
      PARTIALLY_RESPONDED: ['CLOSED'],
      RESPONDED: ['CLOSED'],
    };
    if (!allowed[item.status]?.includes(next))
      throw new ConflictException('Invalid RFQ transition');
    if (next === 'SENT' && (!item.lines.length || !item.recipients.length))
      throw new UnprocessableEntityException(
        'RFQ requires lines and recipients',
      );
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.supplierRFQ.update({
        where: { id },
        data: {
          status: next,
          sentAt: next === 'SENT' ? now : undefined,
          closedAt: next === 'CLOSED' ? now : undefined,
          sendMode: next === 'SENT' ? 'MANUAL_OR_SIMULATED' : undefined,
          updatedBy: actor.userId,
        },
      });
      if (next === 'SENT')
        await tx.supplierRFQRecipient.updateMany({
          where: { rfqId: id },
          data: {
            sentAt: now,
            deliveryStatus: 'MANUAL_SEND_REQUIRED',
          },
        });
      await tx.supplierRFQStatusHistory.create({
        data: {
          rfqId: id,
          fromStatus: item.status,
          toStatus: next,
          actorId: actor.userId,
        },
      });
      await tx.activity.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          event: `RFQ_${next}`,
          entityType: 'SupplierRFQ',
          entityId: id,
        },
      });
      const managerId = item.purchaseRequest.project.projectManagerId;
      if (next === 'SENT' && managerId && managerId !== actor.userId)
        await tx.notification.create({
          data: {
            organizationId: actor.organizationId,
            recipientId: managerId,
            actorId: actor.userId,
            type: 'RFQ_SENT',
            title: `RFQ ${item.rfqNumber} cần theo dõi`,
            entityType: 'Project',
            entityId: item.projectId,
            projectId: item.projectId,
            href: `/procurement/rfqs/${id}`,
          },
        });
      return updated;
    });
  }

  async clarify(actor: CurrentActor, id: string, data: CreateClarificationDto) {
    const item = await this.getRFQ(actor, id);
    if (
      !item.recipients.some(({ supplierId }) => supplierId === data.supplierId)
    )
      throw new UnprocessableEntityException(
        'Supplier is not an RFQ recipient',
      );
    return this.prisma.supplierRFQClarification.create({
      data: { rfqId: id, ...data, createdBy: actor.userId },
    });
  }

  async listSupplierQuotations(
    actor: CurrentActor,
    query: SupplierQuotationsQuery,
  ) {
    const where: Prisma.SupplierQuotationWhereInput = {
      organizationId: actor.organizationId,
      deletedAt: null,
      rfqId: query.rfqId,
      supplierId: query.supplierId,
      status: query.status,
      quotationNumber: query.search
        ? { contains: query.search, mode: 'insensitive' }
        : undefined,
      rfq: {
        projectId: query.projectId,
        purchaseRequest: { project: this.policy.projectWhere(actor) },
      },
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.supplierQuotation.findMany({
        where,
        include: {
          rfq: { select: { rfqNumber: true, projectId: true } },
          _count: { select: { lines: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.supplierQuotation.count({ where }),
    ]);
    return { items, page: query.page, pageSize: query.pageSize, total };
  }

  async getSupplierQuotation(actor: CurrentActor, id: string) {
    const item = await this.prisma.supplierQuotation.findFirst({
      where: {
        id,
        organizationId: actor.organizationId,
        deletedAt: null,
        rfq: {
          purchaseRequest: { project: this.policy.projectWhere(actor) },
        },
      },
      include: {
        rfq: { select: { rfqNumber: true, projectId: true } },
        lines: { orderBy: { position: 'asc' } },
        documents: true,
        statusHistory: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!item) throw new NotFoundException('Supplier quotation not found');
    return item;
  }

  async createSupplierQuotation(
    actor: CurrentActor,
    data: CreateSupplierQuotationDto,
  ) {
    const rfq = await this.getRFQ(actor, data.rfqId);
    if (!['SENT', 'PARTIALLY_RESPONDED', 'RESPONDED'].includes(rfq.status))
      throw new UnprocessableEntityException('Sent RFQ required');
    if (!rfq.recipients.some((item) => item.supplierId === data.supplierId))
      throw new UnprocessableEntityException(
        'Supplier is not an RFQ recipient',
      );
    const rfqLines = new Map(rfq.lines.map((line) => [line.id, line]));
    if (
      data.lines.some(
        (line) =>
          !rfqLines.has(line.rfqLineId) ||
          new Prisma.Decimal(line.quantity).greaterThan(
            rfqLines.get(line.rfqLineId)!.quantity,
          ),
      )
    )
      throw new UnprocessableEntityException('Invalid RFQ line or quantity');
    const lines = data.lines.map((line, position) => {
      const listPrice = new Prisma.Decimal(line.listPrice);
      const discountPercent = new Prisma.Decimal(line.discountPercent ?? 0);
      const discountAmount = listPrice
        .mul(discountPercent)
        .div(100)
        .toDecimalPlaces(2);
      const netUnitPrice = listPrice.minus(discountAmount);
      return {
        ...line,
        productId: rfqLines.get(line.rfqLineId)!.productId,
        variantId: rfqLines.get(line.rfqLineId)!.variantId,
        discountPercent,
        discountAmount,
        netUnitPrice,
        netTotal: netUnitPrice
          .mul(new Prisma.Decimal(line.quantity))
          .toDecimalPlaces(2),
        position,
      };
    });
    const productTotal = lines.reduce(
      (sum, line) => sum.plus(line.netTotal),
      new Prisma.Decimal(0),
    );
    const shippingCost = new Prisma.Decimal(data.shippingCost ?? 0);
    const insuranceCost = new Prisma.Decimal(data.insuranceCost ?? 0);
    const discountAmount = new Prisma.Decimal(data.discountAmount ?? 0);
    const taxAmount = new Prisma.Decimal(data.taxAmount ?? 0);
    const totalAmount = productTotal
      .plus(shippingCost)
      .plus(insuranceCost)
      .minus(discountAmount)
      .plus(taxAmount);
    if (totalAmount.isNegative())
      throw new UnprocessableEntityException('Total cannot be negative');
    return this.prisma.$transaction(async (tx) => {
      const quotation = await tx.supplierQuotation.create({
        data: {
          organizationId: actor.organizationId,
          rfqId: rfq.id,
          supplierId: data.supplierId,
          supplierContactId: data.supplierContactId,
          quotationNumber: data.quotationNumber,
          quotationDate: data.quotationDate,
          receivedDate: data.receivedDate,
          validUntil: data.validUntil,
          currency: data.currency.toUpperCase(),
          exchangeRateSnapshot: data.exchangeRateSnapshot,
          incoterms: data.incoterms,
          paymentTerms: data.paymentTerms,
          productionLeadTimeDays: data.productionLeadTimeDays,
          shippingLeadTimeDays: data.shippingLeadTimeDays,
          warrantyTerms: data.warrantyTerms,
          shippingCost,
          insuranceCost,
          discountAmount,
          taxAmount,
          totalAmount,
          status: 'RECEIVED',
          notes: data.notes,
          createdBy: actor.userId,
          updatedBy: actor.userId,
          lines: { create: lines },
          statusHistory: {
            create: { toStatus: 'RECEIVED', actorId: actor.userId },
          },
        },
        include: { lines: true },
      });
      await tx.supplierRFQRecipient.updateMany({
        where: { rfqId: rfq.id, supplierId: data.supplierId },
        data: { responseStatus: 'RESPONDED' },
      });
      const pending = rfq.recipients.some(
        (recipient) =>
          recipient.supplierId !== data.supplierId &&
          recipient.responseStatus !== 'RESPONDED',
      );
      await tx.supplierRFQ.update({
        where: { id: rfq.id },
        data: { status: pending ? 'PARTIALLY_RESPONDED' : 'RESPONDED' },
      });
      await tx.activity.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          event: 'SUPPLIER_QUOTATION_RECEIVED',
          entityType: 'SupplierQuotation',
          entityId: quotation.id,
        },
      });
      return quotation;
    });
  }

  async updateSupplierQuotation(
    actor: CurrentActor,
    id: string,
    data: UpdateSupplierQuotationDto,
  ) {
    const item = await this.getSupplierQuotation(actor, id);
    if (['SELECTED', 'SUPERSEDED'].includes(item.status))
      throw new ConflictException('Selected quotation is immutable');
    return this.prisma.supplierQuotation.update({
      where: { id },
      data: { ...data, updatedBy: actor.userId },
    });
  }

  async transitionSupplierQuotation(
    actor: CurrentActor,
    id: string,
    next:
      | 'UNDER_REVIEW'
      | 'COMPLIANT'
      | 'PARTIALLY_COMPLIANT'
      | 'NON_COMPLIANT'
      | 'SHORTLISTED'
      | 'REJECTED',
  ) {
    const item = await this.getSupplierQuotation(actor, id);
    const allowed: Record<string, string[]> = {
      RECEIVED: ['UNDER_REVIEW', 'REJECTED'],
      UNDER_REVIEW: [
        'COMPLIANT',
        'PARTIALLY_COMPLIANT',
        'NON_COMPLIANT',
        'REJECTED',
      ],
      COMPLIANT: ['SHORTLISTED', 'REJECTED'],
      PARTIALLY_COMPLIANT: ['SHORTLISTED', 'REJECTED'],
    };
    if (!allowed[item.status]?.includes(next))
      throw new ConflictException('Invalid supplier quotation transition');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.supplierQuotation.update({
        where: { id },
        data: { status: next, updatedBy: actor.userId },
      });
      await tx.supplierQuotationStatusHistory.create({
        data: {
          supplierQuotationId: id,
          fromStatus: item.status,
          toStatus: next,
          actorId: actor.userId,
        },
      });
      await tx.activity.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          event: `SUPPLIER_QUOTATION_${next}`,
          entityType: 'SupplierQuotation',
          entityId: id,
        },
      });
      return updated;
    });
  }

  async reviseSupplierQuotation(actor: CurrentActor, id: string) {
    const item = await this.getSupplierQuotation(actor, id);
    if (item.status === 'SELECTED')
      throw new ConflictException('Selected quotation is immutable');
    return this.prisma.$transaction(async (tx) => {
      const revision = await tx.supplierQuotation.create({
        data: {
          organizationId: item.organizationId,
          rfqId: item.rfqId,
          supplierId: item.supplierId,
          supplierContactId: item.supplierContactId,
          quotationNumber: item.quotationNumber,
          quotationDate: new Date(),
          currency: item.currency,
          exchangeRateSnapshot: item.exchangeRateSnapshot,
          incoterms: item.incoterms,
          paymentTerms: item.paymentTerms,
          productionLeadTimeDays: item.productionLeadTimeDays,
          shippingLeadTimeDays: item.shippingLeadTimeDays,
          warrantyTerms: item.warrantyTerms,
          shippingCost: item.shippingCost,
          insuranceCost: item.insuranceCost,
          discountAmount: item.discountAmount,
          taxAmount: item.taxAmount,
          totalAmount: item.totalAmount,
          notes: item.notes,
          revision: item.revision + 1,
          supersedesId: item.id,
          createdBy: actor.userId,
          updatedBy: actor.userId,
          lines: {
            create: item.lines.map(({ id, supplierQuotationId, ...line }) => {
              void id;
              void supplierQuotationId;
              return line;
            }),
          },
          statusHistory: {
            create: { toStatus: 'DRAFT', actorId: actor.userId },
          },
        },
      });
      await tx.supplierQuotation.update({
        where: { id },
        data: { status: 'SUPERSEDED', updatedBy: actor.userId },
      });
      return revision;
    });
  }

  async createSupplierComparison(
    actor: CurrentActor,
    data: CreateSupplierComparisonDto,
  ) {
    const rfq = await this.getRFQ(actor, data.rfqId);
    const quotes = await this.prisma.supplierQuotation.findMany({
      where: {
        organizationId: actor.organizationId,
        rfqId: rfq.id,
        deletedAt: null,
        status: { in: ['COMPLIANT', 'PARTIALLY_COMPLIANT', 'SHORTLISTED'] },
      },
      include: { lines: true },
    });
    if (quotes.length < 2)
      throw new UnprocessableEntityException(
        'At least two reviewed quotations are required',
      );
    return this.prisma.supplierComparison.create({
      data: {
        organizationId: actor.organizationId,
        projectId: rfq.projectId,
        rfqId: rfq.id,
        purchaseRequestId: rfq.purchaseRequestId,
        baseCurrency: data.baseCurrency.toUpperCase(),
        exchangeRateDate: data.exchangeRateDate,
        createdBy: actor.userId,
        updatedBy: actor.userId,
        lines: {
          create: quotes.flatMap((quote) => {
            const productTotal = quote.lines.reduce(
              (sum, line) => sum.plus(line.netTotal),
              new Prisma.Decimal(0),
            );
            const extras = quote.shippingCost
              .plus(quote.insuranceCost)
              .plus(quote.taxAmount)
              .minus(quote.discountAmount);
            return quote.lines.map((line) => {
              const share = productTotal.isZero()
                ? new Prisma.Decimal(0)
                : line.netTotal.div(productTotal);
              return {
                supplierQuotationId: quote.id,
                supplierQuotationLineId: line.id,
                rfqLineId: line.rfqLineId,
                supplierId: quote.supplierId,
                originalCurrency: quote.currency,
                exchangeRateSnapshot: quote.exchangeRateSnapshot,
                netProductValue: line.netTotal,
                landedEstimateBase: line.netTotal
                  .plus(extras.mul(share))
                  .mul(quote.exchangeRateSnapshot)
                  .toDecimalPlaces(2),
                productionLeadTimeDays: quote.productionLeadTimeDays,
                shippingLeadTimeDays: quote.shippingLeadTimeDays,
                paymentTerms: quote.paymentTerms,
                warrantyTerms: quote.warrantyTerms,
                technicalCompliance: line.technicalCompliance,
              };
            });
          }),
        },
      },
      include: { lines: true },
    });
  }

  async getSupplierComparison(actor: CurrentActor, id: string) {
    const item = await this.prisma.supplierComparison.findFirst({
      where: {
        id,
        organizationId: actor.organizationId,
        rfq: {
          purchaseRequest: { project: this.policy.projectWhere(actor) },
        },
      },
      include: {
        rfq: { select: { rfqNumber: true } },
        lines: { orderBy: [{ rfqLineId: 'asc' }, { supplierId: 'asc' }] },
        selections: { orderBy: { createdAt: 'desc' } },
        approvals: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!item) throw new NotFoundException('Supplier comparison not found');
    return item;
  }

  async listSupplierComparisons(actor: CurrentActor) {
    return this.prisma.supplierComparison.findMany({
      where: {
        organizationId: actor.organizationId,
        rfq: {
          purchaseRequest: { project: this.policy.projectWhere(actor) },
        },
      },
      include: {
        rfq: { select: { rfqNumber: true } },
        _count: { select: { lines: true, selections: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
  }

  async selectSupplier(
    actor: CurrentActor,
    id: string,
    data: SelectSupplierDto,
  ) {
    const existing = await this.prisma.supplierSelection.findUnique({
      where: { idempotencyKey: data.idempotencyKey },
    });
    if (existing) return existing;
    const comparison = await this.getSupplierComparison(actor, id);
    if (!['DRAFT', 'SELECTION_DRAFT'].includes(comparison.status))
      throw new ConflictException('Comparison is not open for selection');
    const quoteLines = comparison.lines.filter(
      (line) => line.supplierQuotationId === data.supplierQuotationId,
    );
    if (!quoteLines.length)
      throw new UnprocessableEntityException(
        'Quotation is not in this comparison',
      );
    const selected = new Map(
      data.selectedLines.map((line) => [
        line.supplierQuotationLineId,
        new Prisma.Decimal(line.quantity),
      ]),
    );
    if (
      selected.size !== data.selectedLines.length ||
      [...selected].some(
        ([lineId, quantity]) =>
          !quoteLines.some(
            (line) =>
              line.supplierQuotationLineId === lineId &&
              quantity.greaterThan(0),
          ),
      )
    )
      throw new UnprocessableEntityException('Invalid selected lines');
    const quote = await this.prisma.supplierQuotation.findUniqueOrThrow({
      where: { id: data.supplierQuotationId },
      include: { lines: true },
    });
    const rfqQuantities = new Map(
      (
        await this.prisma.supplierRFQLine.findMany({
          where: { rfqId: comparison.rfqId },
        })
      ).map((line) => [line.id, line.quantity]),
    );
    const prior = comparison.selections
      .filter((selection) =>
        ['DRAFT', 'SUBMITTED', 'APPROVED'].includes(selection.status),
      )
      .flatMap(
        (selection) =>
          selection.selectedLines as {
            rfqLineId: string;
            quantity: string;
          }[],
      );
    const payload = quote.lines
      .filter((line) => selected.has(line.id))
      .map((line) => ({
        supplierQuotationLineId: line.id,
        rfqLineId: line.rfqLineId,
        quantity: selected.get(line.id)!.toString(),
      }));
    for (const line of payload) {
      const already = prior
        .filter((item) => item.rfqLineId === line.rfqLineId)
        .reduce((sum, item) => sum.plus(item.quantity), new Prisma.Decimal(0));
      if (
        already
          .plus(line.quantity)
          .greaterThan(rfqQuantities.get(line.rfqLineId) ?? 0)
      )
        throw new UnprocessableEntityException(
          'Selected quantity exceeds purchase request',
        );
    }
    return this.prisma.$transaction(async (tx) => {
      const selection = await tx.supplierSelection.create({
        data: {
          comparisonId: id,
          supplierQuotationId: quote.id,
          supplierId: quote.supplierId,
          selectedLines: payload,
          selectionReason: data.selectionReason,
          commercialAssessment: data.commercialAssessment,
          technicalAssessment: data.technicalAssessment,
          riskAssessment: data.riskAssessment,
          selectedBy: actor.userId,
          idempotencyKey: data.idempotencyKey,
        },
      });
      await tx.supplierComparison.update({
        where: { id },
        data: { status: 'SELECTION_DRAFT', updatedBy: actor.userId },
      });
      return selection;
    });
  }

  async transitionSupplierComparison(
    actor: CurrentActor,
    id: string,
    next: 'SUBMITTED' | 'APPROVED' | 'REJECTED',
  ) {
    const comparison = await this.getSupplierComparison(actor, id);
    if (
      (next === 'SUBMITTED' &&
        !['DRAFT', 'SELECTION_DRAFT'].includes(comparison.status)) ||
      (['APPROVED', 'REJECTED'].includes(next) &&
        comparison.status !== 'SUBMITTED')
    )
      throw new ConflictException('Invalid comparison transition');
    if (next === 'SUBMITTED' && !comparison.selections.length)
      throw new UnprocessableEntityException('Supplier selection required');
    if (
      ['APPROVED', 'REJECTED'].includes(next) &&
      comparison.createdBy === actor.userId
    )
      throw new ForbiddenException('Creator cannot approve own comparison');
    return this.prisma.$transaction(async (tx) => {
      await tx.supplierComparison.update({
        where: { id },
        data: { status: next, updatedBy: actor.userId },
      });
      await tx.supplierSelection.updateMany({
        where: { comparisonId: id },
        data:
          next === 'APPROVED'
            ? {
                status: 'APPROVED',
                approvedBy: actor.userId,
                approvedAt: new Date(),
              }
            : { status: next },
      });
      if (next === 'APPROVED')
        await tx.supplierQuotation.updateMany({
          where: {
            id: {
              in: comparison.selections.map(
                (selection) => selection.supplierQuotationId,
              ),
            },
          },
          data: { status: 'SELECTED', updatedBy: actor.userId },
        });
      await tx.supplierSelectionApproval.create({
        data: {
          comparisonId: id,
          actorId: actor.userId,
          decision: next,
        },
      });
      await tx.activity.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          event: `SUPPLIER_COMPARISON_${next}`,
          entityType: 'SupplierComparison',
          entityId: id,
        },
      });
    });
    return this.getSupplierComparison(actor, id);
  }

  async listPurchaseOrders(
    actor: CurrentActor,
    projectId?: string,
    page?: { page: number; pageSize: number },
  ) {
    return this.prisma.purchaseOrder.findMany({
      where: {
        organizationId: actor.organizationId,
        projectId,
        purchaseRequest: {
          project: this.policy.projectWhere(
            actor,
            'procurement.purchase_order.read',
          ),
        },
      },
      include: { _count: { select: { lines: true } } },
      orderBy: { updatedAt: 'desc' },
      take: page?.pageSize ?? 100,
      ...(page && { skip: (page.page - 1) * page.pageSize }),
    });
  }

  async getPurchaseOrder(actor: CurrentActor, id: string, permission?: string) {
    const item = await this.prisma.purchaseOrder.findFirst({
      where: {
        id,
        organizationId: actor.organizationId,
        purchaseRequest: {
          project: this.policy.projectWhere(actor, permission),
        },
      },
      include: {
        lines: { orderBy: { position: 'asc' } },
        approvals: { orderBy: { createdAt: 'desc' } },
        documents: { orderBy: { generatedAt: 'desc' } },
        statusHistory: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!item) throw new NotFoundException('Purchase order not found');
    return item;
  }

  async createPurchaseOrder(actor: CurrentActor, data: CreatePurchaseOrderDto) {
    const selection = await this.prisma.supplierSelection.findFirst({
      where: {
        id: data.supplierSelectionId,
        status: 'APPROVED',
        comparison: {
          organizationId: actor.organizationId,
          rfq: {
            purchaseRequest: { project: this.policy.projectWhere(actor) },
          },
        },
      },
      include: {
        comparison: { include: { rfq: { include: { lines: true } } } },
      },
    });
    if (!selection)
      throw new UnprocessableEntityException(
        'Approved supplier selection required',
      );
    const quote = await this.prisma.supplierQuotation.findUniqueOrThrow({
      where: { id: selection.supplierQuotationId },
      include: { lines: true },
    });
    const chosen = selection.selectedLines as {
      supplierQuotationLineId: string;
      rfqLineId: string;
      quantity: string;
    }[];
    const rfqLines = new Map(
      selection.comparison.rfq.lines.map((line) => [line.id, line]),
    );
    const quoteLines = new Map(quote.lines.map((line) => [line.id, line]));
    const lines = chosen.map((choice, position) => {
      const source = quoteLines.get(choice.supplierQuotationLineId);
      const rfqLine = rfqLines.get(choice.rfqLineId);
      if (!source || !rfqLine)
        throw new UnprocessableEntityException('Invalid selected line');
      const quantity = new Prisma.Decimal(choice.quantity);
      return {
        purchaseRequestLineId: rfqLine.purchaseRequestLineId,
        productId: source.productId,
        variantId: source.variantId,
        customDescription: source.description,
        quantity,
        unit: source.unit,
        unitPrice: source.listPrice,
        discount: source.discountAmount,
        netUnitPrice: source.netUnitPrice,
        lineTotal: source.netUnitPrice.mul(quantity).toDecimalPlaces(2),
        position,
      };
    });
    const subtotal = lines.reduce(
      (sum, line) => sum.plus(line.lineTotal),
      new Prisma.Decimal(0),
    );
    const ratio = quote.lines
      .reduce((sum, line) => sum.plus(line.netTotal), new Prisma.Decimal(0))
      .isZero()
      ? new Prisma.Decimal(0)
      : subtotal.div(
          quote.lines.reduce(
            (sum, line) => sum.plus(line.netTotal),
            new Prisma.Decimal(0),
          ),
        );
    const shippingAmount = quote.shippingCost.mul(ratio).toDecimalPlaces(2);
    const insuranceAmount = quote.insuranceCost.mul(ratio).toDecimalPlaces(2);
    const discountAmount = quote.discountAmount.mul(ratio).toDecimalPlaces(2);
    const taxAmount = quote.taxAmount.mul(ratio).toDecimalPlaces(2);
    return this.prisma.purchaseOrder.create({
      data: {
        organizationId: actor.organizationId,
        projectId: selection.comparison.projectId,
        poNumber: data.poNumber,
        supplierId: selection.supplierId,
        supplierSelectionId: selection.id,
        supplierQuotationId: quote.id,
        purchaseRequestId: selection.comparison.purchaseRequestId,
        currency: quote.currency,
        exchangeRateSnapshot: quote.exchangeRateSnapshot,
        incoterms: quote.incoterms,
        paymentTerms: quote.paymentTerms,
        billingAddress: data.billingAddress,
        deliveryAddress: data.deliveryAddress,
        expectedProductionStart: data.expectedProductionStart,
        expectedReadyDate: data.expectedReadyDate,
        subtotal,
        discountAmount,
        shippingAmount,
        insuranceAmount,
        taxAmount,
        totalAmount: subtotal
          .plus(shippingAmount)
          .plus(insuranceAmount)
          .minus(discountAmount)
          .plus(taxAmount),
        notes: data.notes,
        createdBy: actor.userId,
        updatedBy: actor.userId,
        lines: { create: lines },
        statusHistory: {
          create: { toStatus: 'DRAFT', actorId: actor.userId },
        },
      },
      include: { lines: true },
    });
  }

  async transitionPurchaseOrder(
    actor: CurrentActor,
    id: string,
    next:
      | 'SUBMITTED'
      | 'APPROVED'
      | 'REJECTED'
      | 'SENT'
      | 'CONFIRMED'
      | 'CANCELLED',
  ) {
    const item = await this.getPurchaseOrder(actor, id);
    const allowed: Record<string, string[]> = {
      DRAFT: ['SUBMITTED', 'CANCELLED'],
      SUBMITTED: ['APPROVED', 'REJECTED'],
      APPROVED: ['SENT', 'CANCELLED'],
      SENT: ['CONFIRMED', 'CANCELLED'],
    };
    if (!allowed[item.status]?.includes(next))
      throw new ConflictException('Invalid purchase order transition');
    if (
      ['APPROVED', 'REJECTED'].includes(next) &&
      item.createdBy === actor.userId
    )
      throw new ForbiddenException('Creator cannot approve own purchase order');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.purchaseOrder.update({
        where: { id },
        data: { status: next, updatedBy: actor.userId },
      });
      await tx.purchaseOrderStatusHistory.create({
        data: {
          purchaseOrderId: id,
          fromStatus: item.status,
          toStatus: next,
          actorId: actor.userId,
        },
      });
      if (['APPROVED', 'REJECTED'].includes(next))
        await tx.purchaseOrderApproval.create({
          data: {
            purchaseOrderId: id,
            actorId: actor.userId,
            decision: next,
          },
        });
      if (next === 'CONFIRMED')
        for (const line of item.lines)
          await tx.purchaseRequestLine.update({
            where: { id: line.purchaseRequestLineId },
            data: { orderedQuantity: { increment: line.quantity } },
          });
      await tx.activity.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          event: `PURCHASE_ORDER_${next}`,
          entityType: 'PurchaseOrder',
          entityId: id,
        },
      });
      return updated;
    });
  }

  async listProformaInvoices(
    actor: CurrentActor,
    query: ProformaInvoicesQuery,
  ) {
    const where: Prisma.ProformaInvoiceWhereInput = {
      organizationId: actor.organizationId,
      deletedAt: null,
      supplierId: query.supplierId,
      purchaseOrderId: query.purchaseOrderId,
      status: query.status,
      purchaseOrder: {
        projectId: query.projectId,
        purchaseRequest: {
          project: this.policy.projectWhere(
            actor,
            'procurement.proforma_invoice.read',
          ),
        },
      },
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.proformaInvoice.findMany({
        where,
        include: {
          supplier: { select: { id: true, legalName: true } },
          purchaseOrder: {
            select: {
              id: true,
              poNumber: true,
              projectId: true,
              purchaseRequest: {
                select: { project: { select: { id: true, name: true } } },
              },
            },
          },
          payable: {
            select: { paidAmount: true, outstandingAmount: true },
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.proformaInvoice.count({ where }),
    ]);
    return {
      items: items.map((item) => this.redactBankReference(actor, item)),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }

  async getProformaInvoice(actor: CurrentActor, id: string) {
    const item = await this.prisma.proformaInvoice.findFirst({
      where: {
        id,
        organizationId: actor.organizationId,
        deletedAt: null,
        purchaseOrder: {
          purchaseRequest: {
            project: this.policy.projectWhere(
              actor,
              'procurement.proforma_invoice.read',
            ),
          },
        },
      },
      include: {
        supplier: { select: { id: true, legalName: true } },
        purchaseOrder: {
          include: {
            lines: { orderBy: { position: 'asc' } },
            purchaseRequest: {
              select: { project: { select: { id: true, name: true } } },
            },
          },
        },
        lines: { orderBy: { position: 'asc' } },
        documents: { orderBy: { version: 'desc' } },
        statusHistory: { orderBy: { createdAt: 'desc' } },
        payable: true,
      },
    });
    if (!item) throw new NotFoundException('Proforma invoice not found');
    return this.redactBankReference(actor, item);
  }

  async createProformaInvoice(
    actor: CurrentActor,
    data: CreateProformaInvoiceDto,
  ) {
    if (
      data.bankReferenceProtected &&
      !actor.permissions.includes('bank_information.update')
    )
      throw new ForbiddenException(
        'Bank information update permission required',
      );
    const purchaseOrder = await this.prisma.purchaseOrder.findFirst({
      where: {
        id: data.purchaseOrderId,
        organizationId: actor.organizationId,
        status: { in: ['APPROVED', 'SENT', 'CONFIRMED'] },
        purchaseRequest: { project: this.policy.projectWhere(actor) },
      },
      include: {
        lines: true,
        proformaInvoices: {
          where: {
            deletedAt: null,
            status: { notIn: ['SUPERSEDED', 'CANCELLED'] },
          },
          include: { lines: true },
        },
      },
    });
    if (!purchaseOrder)
      throw new UnprocessableEntityException(
        'Approved purchase order required',
      );
    if (data.currency !== purchaseOrder.currency)
      throw new UnprocessableEntityException('PI currency must match PO');
    const exchangeRateSnapshot = new Prisma.Decimal(data.exchangeRateSnapshot);
    if (exchangeRateSnapshot.lte(0))
      throw new UnprocessableEntityException('Exchange rate must be positive');
    const poLines = new Map(purchaseOrder.lines.map((line) => [line.id, line]));
    const invoiced = new Map<string, Prisma.Decimal>();
    for (const invoice of purchaseOrder.proformaInvoices)
      for (const line of invoice.lines)
        invoiced.set(
          line.purchaseOrderLineId,
          (
            invoiced.get(line.purchaseOrderLineId) ?? new Prisma.Decimal(0)
          ).plus(line.quantity),
        );
    let exceedsCommitment = false;
    const lines = data.lines.map((line, position) => {
      const source = poLines.get(line.purchaseOrderLineId);
      if (!source)
        throw new UnprocessableEntityException('PI line must belong to PO');
      const quantity = new Prisma.Decimal(line.quantity);
      const unitPrice = new Prisma.Decimal(line.unitPrice);
      if (quantity.lte(0) || unitPrice.lt(0))
        throw new UnprocessableEntityException(
          'Quantity must be positive and price cannot be negative',
        );
      if (line.unit !== source.unit)
        throw new UnprocessableEntityException('PI unit must match PO line');
      if (
        (invoiced.get(source.id) ?? new Prisma.Decimal(0))
          .plus(quantity)
          .gt(source.quantity)
      )
        exceedsCommitment = true;
      return {
        purchaseOrderLineId: source.id,
        productId: source.productId,
        variantId: source.variantId,
        description: line.description,
        quantity,
        unit: line.unit,
        unitPrice,
        lineTotal: quantity.mul(unitPrice).toDecimalPlaces(2),
        notes: line.notes,
        position,
      };
    });
    const subtotal = lines.reduce(
      (sum, line) => sum.plus(line.lineTotal),
      new Prisma.Decimal(0),
    );
    const shippingAmount = new Prisma.Decimal(data.shippingAmount ?? 0);
    const insuranceAmount = new Prisma.Decimal(data.insuranceAmount ?? 0);
    const taxAmount = new Prisma.Decimal(data.taxAmount ?? 0);
    const otherAmount = new Prisma.Decimal(data.otherAmount ?? 0);
    if (
      [shippingAmount, insuranceAmount, taxAmount, otherAmount].some((value) =>
        value.lt(0),
      )
    )
      throw new UnprocessableEntityException('PI amounts cannot be negative');
    const totalAmount = subtotal
      .plus(shippingAmount)
      .plus(insuranceAmount)
      .plus(taxAmount)
      .plus(otherAmount);
    if (
      purchaseOrder.proformaInvoices
        .reduce(
          (sum, invoice) => sum.plus(invoice.totalAmount),
          new Prisma.Decimal(0),
        )
        .plus(totalAmount)
        .gt(purchaseOrder.totalAmount)
    )
      exceedsCommitment = true;
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.proformaInvoice.create({
        data: {
          organizationId: actor.organizationId,
          piNumber: data.piNumber,
          supplierId: purchaseOrder.supplierId,
          purchaseOrderId: purchaseOrder.id,
          piDate: data.piDate,
          receivedDate: data.receivedDate,
          dueDate: data.dueDate,
          currency: data.currency,
          exchangeRateSnapshot,
          subtotal,
          shippingAmount,
          insuranceAmount,
          taxAmount,
          otherAmount,
          totalAmount,
          paymentTerms: data.paymentTerms,
          bankReferenceProtected: data.bankReferenceProtected,
          notes: data.notes,
          exceedsCommitment,
          createdBy: actor.userId,
          updatedBy: actor.userId,
          lines: { create: lines },
          statusHistory: {
            create: { toStatus: 'DRAFT', actorId: actor.userId },
          },
        },
        include: { lines: true },
      });
      await tx.activity.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          event: 'PROFORMA_INVOICE_CREATED',
          entityType: 'ProformaInvoice',
          entityId: item.id,
        },
      });
      return this.redactBankReference(actor, item);
    });
  }

  async updateProformaInvoice(
    actor: CurrentActor,
    id: string,
    data: UpdateProformaInvoiceDto,
  ) {
    const item = await this.getProformaInvoice(actor, id);
    if (!['DRAFT', 'RECEIVED'].includes(item.status))
      throw new ConflictException('Approved PI is immutable');
    return this.prisma.proformaInvoice.update({
      where: { id },
      data: { ...data, updatedBy: actor.userId, version: { increment: 1 } },
    });
  }

  async deleteProformaInvoice(actor: CurrentActor, id: string) {
    const item = await this.getProformaInvoice(actor, id);
    if (item.status !== 'DRAFT')
      throw new ConflictException('Only draft PI can be deleted');
    return this.prisma.proformaInvoice.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: actor.userId },
    });
  }

  async transitionProformaInvoice(
    actor: CurrentActor,
    id: string,
    next: 'VERIFIED' | 'APPROVED' | 'SUPERSEDED' | 'CANCELLED',
    comment?: string,
  ) {
    const item = await this.getProformaInvoice(actor, id);
    const allowed: Record<string, string[]> = {
      DRAFT: ['VERIFIED', 'CANCELLED'],
      RECEIVED: ['VERIFIED', 'CANCELLED'],
      VERIFIED: ['APPROVED', 'CANCELLED'],
      APPROVED: ['SUPERSEDED', 'CANCELLED'],
    };
    if (!allowed[item.status]?.includes(next))
      throw new ConflictException('Invalid PI transition');
    if (
      next === 'APPROVED' &&
      item.exceedsCommitment &&
      !actor.permissions.includes(
        'procurement.proforma_invoice.over_commitment.approve',
      )
    )
      throw new ForbiddenException(
        'Over-commitment PI requires special approval',
      );
    if (next === 'APPROVED' && item.createdBy === actor.userId)
      throw new ForbiddenException('Creator cannot approve own PI');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.proformaInvoice.update({
        where: { id },
        data: { status: next, updatedBy: actor.userId },
      });
      await tx.proformaInvoiceStatusHistory.create({
        data: {
          proformaInvoiceId: id,
          fromStatus: item.status,
          toStatus: next,
          actorId: actor.userId,
          comment,
        },
      });
      await tx.activity.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          event: `PROFORMA_INVOICE_${next}`,
          entityType: 'ProformaInvoice',
          entityId: id,
        },
      });
      return updated;
    });
  }

  async rejectProformaInvoice(
    actor: CurrentActor,
    id: string,
    comment?: string,
  ) {
    const item = await this.getProformaInvoice(actor, id);
    if (item.status !== 'VERIFIED')
      throw new ConflictException('Only verified PI can be rejected');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.proformaInvoice.update({
        where: { id },
        data: { status: 'RECEIVED', updatedBy: actor.userId },
      });
      await tx.proformaInvoiceStatusHistory.create({
        data: {
          proformaInvoiceId: id,
          fromStatus: item.status,
          toStatus: 'RECEIVED',
          actorId: actor.userId,
          comment,
        },
      });
      await tx.activity.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          event: 'PROFORMA_INVOICE_REJECTED',
          entityType: 'ProformaInvoice',
          entityId: id,
        },
      });
      return updated;
    });
  }

  async reviseProformaInvoice(actor: CurrentActor, id: string) {
    const item = await this.getProformaInvoice(actor, id);
    if (!['APPROVED', 'SUPERSEDED'].includes(item.status))
      throw new ConflictException('Only approved PI can be revised');
    return this.prisma.proformaInvoice.create({
      data: {
        organizationId: item.organizationId,
        piNumber: item.piNumber,
        supplierId: item.supplierId,
        purchaseOrderId: item.purchaseOrderId,
        piDate: new Date(),
        currency: item.currency,
        exchangeRateSnapshot: item.exchangeRateSnapshot,
        subtotal: item.subtotal,
        shippingAmount: item.shippingAmount,
        insuranceAmount: item.insuranceAmount,
        taxAmount: item.taxAmount,
        otherAmount: item.otherAmount,
        totalAmount: item.totalAmount,
        paymentTerms: item.paymentTerms,
        notes: item.notes,
        exceedsCommitment: item.exceedsCommitment,
        supersedesId: item.id,
        version: item.version + 1,
        createdBy: actor.userId,
        updatedBy: actor.userId,
        lines: {
          create: item.lines.map((line) => ({
            purchaseOrderLineId: line.purchaseOrderLineId,
            productId: line.productId,
            variantId: line.variantId,
            description: line.description,
            quantity: line.quantity,
            unit: line.unit,
            unitPrice: line.unitPrice,
            lineTotal: line.lineTotal,
            notes: line.notes,
            position: line.position,
          })),
        },
        statusHistory: {
          create: { toStatus: 'DRAFT', actorId: actor.userId },
        },
      },
      include: { lines: true },
    });
  }

  async addProformaInvoiceDocument(
    actor: CurrentActor,
    id: string,
    data: ProformaInvoiceDocumentDto,
  ) {
    await this.getProformaInvoice(actor, id);
    const latest = await this.prisma.proformaInvoiceDocument.aggregate({
      where: { proformaInvoiceId: id },
      _max: { version: true },
    });
    return this.prisma.proformaInvoiceDocument.create({
      data: {
        proformaInvoiceId: id,
        version: (latest._max.version ?? 0) + 1,
        storageKey: data.storageKey,
        checksum: data.checksum.toLowerCase(),
        uploadedBy: actor.userId,
      },
    });
  }

  async createSupplierPayableFromInvoice(actor: CurrentActor, id: string) {
    const item = await this.getProformaInvoice(actor, id);
    if (item.status !== 'APPROVED')
      throw new ConflictException('Approved PI required');
    return this.prisma.supplierPayable.upsert({
      where: { proformaInvoiceId: id },
      update: {},
      create: {
        organizationId: actor.organizationId,
        projectId: item.purchaseOrder.projectId,
        supplierId: item.supplierId,
        purchaseOrderId: item.purchaseOrderId,
        proformaInvoiceId: id,
        amount: item.totalAmount,
        outstandingAmount: item.totalAmount,
        currency: item.currency,
        createdBy: actor.userId,
      },
    });
  }

  async listSupplierPayables(
    actor: CurrentActor,
    query: SupplierPayablesQuery,
  ) {
    const projectIds = await this.accessibleProjectIds(
      actor,
      query.projectId,
      'supplier_payable.read',
    );
    return this.prisma.supplierPayable.findMany({
      where: {
        organizationId: actor.organizationId,
        projectId: { in: projectIds },
        supplierId: query.supplierId,
        status: query.status,
      },
      include: {
        proformaInvoice: {
          select: { id: true, piNumber: true, dueDate: true },
        },
        schedules: { orderBy: { sequence: 'asc' } },
      },
      orderBy: { updatedAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });
  }

  async getSupplierPayable(
    actor: CurrentActor,
    id: string,
    permission?: string,
  ) {
    const item = await this.prisma.supplierPayable.findFirst({
      where: {
        id,
        organizationId: actor.organizationId,
        projectId: {
          in: await this.accessibleProjectIds(actor, undefined, permission),
        },
      },
      include: {
        proformaInvoice: true,
        schedules: {
          include: { allocations: true },
          orderBy: { sequence: 'asc' },
        },
        creditNotes: true,
      },
    });
    if (!item) throw new NotFoundException('Supplier payable not found');
    return {
      ...item,
      proformaInvoice: this.redactBankReference(actor, item.proformaInvoice),
    };
  }

  async generateSupplierPayable(
    actor: CurrentActor,
    data: GenerateSupplierPayableDto,
  ) {
    const invoice = await this.getProformaInvoice(
      actor,
      data.proformaInvoiceId,
    );
    if (invoice.status !== 'APPROVED')
      throw new ConflictException('Approved PI required');
    const schedules = data.schedules.map((schedule) => ({
      ...schedule,
      amount: new Prisma.Decimal(schedule.amount),
      percentage: schedule.percentage
        ? new Prisma.Decimal(schedule.percentage)
        : undefined,
    }));
    if (
      schedules.some((schedule) => schedule.amount.lte(0)) ||
      !schedules
        .reduce(
          (sum, schedule) => sum.plus(schedule.amount),
          new Prisma.Decimal(0),
        )
        .equals(invoice.totalAmount)
    )
      throw new UnprocessableEntityException(
        'Positive schedule amounts must equal PI total',
      );
    return this.prisma.$transaction(
      async (tx) => {
        const payable = await tx.supplierPayable.upsert({
          where: { proformaInvoiceId: invoice.id },
          update: {},
          create: {
            organizationId: actor.organizationId,
            projectId: invoice.purchaseOrder.projectId,
            supplierId: invoice.supplierId,
            purchaseOrderId: invoice.purchaseOrderId,
            proformaInvoiceId: invoice.id,
            amount: invoice.totalAmount,
            outstandingAmount: invoice.totalAmount,
            currency: invoice.currency,
            createdBy: actor.userId,
          },
          include: { schedules: true },
        });
        if (payable.schedules.length) return payable;
        await tx.supplierPaymentSchedule.createMany({
          data: schedules.map((schedule) => ({
            organizationId: actor.organizationId,
            projectId: payable.projectId,
            supplierId: payable.supplierId,
            purchaseOrderId: payable.purchaseOrderId,
            proformaInvoiceId: payable.proformaInvoiceId,
            supplierPayableId: payable.id,
            milestone: schedule.milestone,
            sequence: schedule.sequence,
            dueDate: schedule.dueDate,
            percentage: schedule.percentage,
            amount: schedule.amount,
            currency: payable.currency,
            exchangeRateSnapshot: invoice.exchangeRateSnapshot,
            condition: schedule.condition,
            dependencyType: schedule.dependencyType,
            dependencyId: schedule.dependencyId,
            dependencyStatus: schedule.dependencyStatus,
            outstandingAmount: schedule.amount,
            status: schedule.dueDate < new Date() ? 'OVERDUE' : 'PLANNED',
            createdBy: actor.userId,
          })),
        });
        await tx.activity.create({
          data: {
            organizationId: actor.organizationId,
            actorId: actor.userId,
            event: 'SUPPLIER_PAYABLE_GENERATED',
            entityType: 'SupplierPayable',
            entityId: payable.id,
          },
        });
        return payable;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async listSupplierPaymentSchedules(
    actor: CurrentActor,
    query: SupplierPayablesQuery,
  ) {
    return this.prisma.supplierPaymentSchedule.findMany({
      where: {
        organizationId: actor.organizationId,
        projectId: {
          in: await this.accessibleProjectIds(actor, query.projectId),
        },
        supplierId: query.supplierId,
        status: query.status,
      },
      orderBy: [{ dueDate: 'asc' }, { sequence: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });
  }

  async createSupplierPaymentSchedule(
    actor: CurrentActor,
    data: CreateSupplierPaymentScheduleDto,
  ) {
    const payable = await this.getSupplierPayable(
      actor,
      data.supplierPayableId,
    );
    const amount = new Prisma.Decimal(data.amount);
    const scheduled = payable.schedules.reduce(
      (sum, schedule) => sum.plus(schedule.amount),
      new Prisma.Decimal(0),
    );
    if (amount.lte(0) || scheduled.plus(amount).gt(payable.amount))
      throw new UnprocessableEntityException('Schedule exceeds payable amount');
    return this.prisma.supplierPaymentSchedule.create({
      data: {
        organizationId: actor.organizationId,
        projectId: payable.projectId,
        supplierId: payable.supplierId,
        purchaseOrderId: payable.purchaseOrderId,
        proformaInvoiceId: payable.proformaInvoiceId,
        supplierPayableId: payable.id,
        milestone: data.milestone,
        sequence: data.sequence,
        dueDate: data.dueDate,
        percentage: data.percentage,
        amount,
        currency: payable.currency,
        exchangeRateSnapshot: payable.proformaInvoice.exchangeRateSnapshot,
        condition: data.condition,
        dependencyType: data.dependencyType,
        dependencyId: data.dependencyId,
        dependencyStatus: data.dependencyStatus,
        outstandingAmount: amount,
        createdBy: actor.userId,
      },
    });
  }

  async updateSupplierPaymentSchedule(
    actor: CurrentActor,
    id: string,
    data: UpdateSupplierPaymentScheduleDto,
  ) {
    const item = await this.prisma.supplierPaymentSchedule.findFirst({
      where: {
        id,
        organizationId: actor.organizationId,
        projectId: { in: await this.accessibleProjectIds(actor) },
      },
    });
    if (!item)
      throw new NotFoundException('Supplier payment schedule not found');
    if (item.status === 'PAID')
      throw new ConflictException('Paid schedule is immutable');
    return this.prisma.supplierPaymentSchedule.update({
      where: { id },
      data,
    });
  }

  async listSupplierPayments(
    actor: CurrentActor,
    query: SupplierPayablesQuery,
  ) {
    const items = await this.prisma.supplierPayment.findMany({
      where: {
        organizationId: actor.organizationId,
        projectId: {
          in: await this.accessibleProjectIds(
            actor,
            query.projectId,
            'supplier_payment.read',
          ),
        },
        supplierId: query.supplierId,
        status: query.status,
      },
      include: { allocations: true },
      orderBy: { paymentDate: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });
    return items.map((item) => this.redactBankReference(actor, item));
  }

  async getSupplierPayment(
    actor: CurrentActor,
    id: string,
    permission?: string,
  ) {
    const item = await this.prisma.supplierPayment.findFirst({
      where: {
        id,
        organizationId: actor.organizationId,
        projectId: {
          in: await this.accessibleProjectIds(actor, undefined, permission),
        },
      },
      include: {
        allocations: { include: { schedule: true } },
        approvals: { orderBy: { createdAt: 'desc' } },
        statusHistory: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!item) throw new NotFoundException('Supplier payment not found');
    return this.redactBankReference(actor, item);
  }

  async createSupplierPayment(
    actor: CurrentActor,
    data: CreateSupplierPaymentDto,
  ) {
    if (
      data.bankReferenceProtected &&
      !actor.permissions.includes('bank_information.update')
    )
      throw new ForbiddenException(
        'Bank information update permission required',
      );
    await this.policy.assertView(actor, 'Project', data.projectId);
    const amount = new Prisma.Decimal(data.amount);
    const exchangeRateSnapshot = new Prisma.Decimal(data.exchangeRateSnapshot);
    if (amount.lte(0) || exchangeRateSnapshot.lte(0))
      throw new UnprocessableEntityException(
        'Payment and exchange rate must be positive',
      );
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: data.supplierId, organizationId: actor.organizationId },
      select: { id: true },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');
    return this.prisma.supplierPayment.upsert({
      where: {
        organizationId_idempotencyKey: {
          organizationId: actor.organizationId,
          idempotencyKey: data.idempotencyKey,
        },
      },
      update: {},
      create: {
        ...data,
        amount,
        exchangeRateSnapshot,
        organizationId: actor.organizationId,
        recordedBy: actor.userId,
        statusHistory: {
          create: { toStatus: 'DRAFT', actorId: actor.userId },
        },
      },
    });
  }

  async transitionSupplierPayment(
    actor: CurrentActor,
    id: string,
    next: 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED',
    comment?: string,
  ) {
    const item = await this.getSupplierPayment(actor, id);
    const allowed: Record<string, string[]> = {
      DRAFT: ['SUBMITTED', 'CANCELLED'],
      SUBMITTED: ['APPROVED', 'REJECTED', 'CANCELLED'],
    };
    if (!allowed[item.status]?.includes(next))
      throw new ConflictException('Invalid supplier payment transition');
    if (
      ['APPROVED', 'REJECTED'].includes(next) &&
      item.recordedBy === actor.userId
    )
      throw new ForbiddenException('Recorder cannot approve own payment');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.supplierPayment.update({
        where: { id },
        data: {
          status: next,
          approvedBy: next === 'APPROVED' ? actor.userId : undefined,
        },
      });
      await tx.supplierPaymentStatusHistory.create({
        data: {
          supplierPaymentId: id,
          fromStatus: item.status,
          toStatus: next,
          actorId: actor.userId,
          comment,
        },
      });
      if (['APPROVED', 'REJECTED'].includes(next))
        await tx.supplierPaymentApproval.create({
          data: {
            supplierPaymentId: id,
            actorId: actor.userId,
            decision: next,
            comment,
          },
        });
      await tx.activity.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          event: `SUPPLIER_PAYMENT_${next}`,
          entityType: 'SupplierPayment',
          entityId: id,
        },
      });
      if (item.recordedBy !== actor.userId)
        await tx.notification.create({
          data: {
            organizationId: actor.organizationId,
            recipientId: item.recordedBy,
            actorId: actor.userId,
            type: `SUPPLIER_PAYMENT_${next}`,
            title: `Supplier payment ${next.toLowerCase()}`,
            body: 'Supplier payment status changed',
            entityType: 'SupplierPayment',
            entityId: id,
          },
        });
      return updated;
    });
  }

  async allocateSupplierPayment(
    actor: CurrentActor,
    id: string,
    data: AllocateSupplierPaymentDto,
  ) {
    await this.getSupplierPayment(actor, id);
    return this.prisma.$transaction(
      async (tx) => {
        const payment = await tx.supplierPayment.findUniqueOrThrow({
          where: { id },
          include: { allocations: true },
        });
        if (payment.status !== 'APPROVED')
          throw new ConflictException('Approved payment required');
        const allocations = data.allocations.map((allocation) => ({
          ...allocation,
          amount: new Prisma.Decimal(allocation.amount),
        }));
        if (
          new Set(allocations.map(({ scheduleId }) => scheduleId)).size !==
          allocations.length
        )
          throw new UnprocessableEntityException(
            'Duplicate payment schedule allocation',
          );
        const existing = payment.allocations.reduce(
          (sum, allocation) => sum.plus(allocation.amount),
          new Prisma.Decimal(0),
        );
        const requested = allocations.reduce(
          (sum, allocation) => sum.plus(allocation.amount),
          new Prisma.Decimal(0),
        );
        if (
          allocations.some((allocation) => allocation.amount.lte(0)) ||
          existing.plus(requested).gt(payment.amount)
        )
          throw new UnprocessableEntityException(
            'Allocation exceeds payment amount',
          );
        const schedules = await tx.supplierPaymentSchedule.findMany({
          where: {
            id: { in: allocations.map(({ scheduleId }) => scheduleId) },
            organizationId: actor.organizationId,
            projectId: payment.projectId,
            supplierId: payment.supplierId,
            currency: payment.currency,
          },
        });
        if (
          schedules.length !==
          new Set(allocations.map(({ scheduleId }) => scheduleId)).size
        )
          throw new NotFoundException('Payment schedule not found');
        const byId = new Map(
          schedules.map((schedule) => [schedule.id, schedule]),
        );
        for (const allocation of allocations) {
          const schedule = byId.get(allocation.scheduleId)!;
          if (
            schedule.dependencyStatus &&
            schedule.dependencyStatus !== 'COMPLETED'
          )
            throw new ConflictException('Payment dependency is not complete');
          if (allocation.amount.gt(schedule.outstandingAmount))
            throw new UnprocessableEntityException(
              'Allocation exceeds schedule outstanding',
            );
          await tx.supplierPaymentAllocation.create({
            data: {
              paymentId: id,
              scheduleId: schedule.id,
              amount: allocation.amount,
            },
          });
          const outstanding = schedule.outstandingAmount.minus(
            allocation.amount,
          );
          await tx.supplierPaymentSchedule.update({
            where: { id: schedule.id },
            data: {
              paidAmount: { increment: allocation.amount },
              outstandingAmount: outstanding,
              status: outstanding.isZero() ? 'PAID' : 'PARTIALLY_PAID',
            },
          });
          await tx.supplierPayable.update({
            where: { id: schedule.supplierPayableId },
            data: {
              paidAmount: { increment: allocation.amount },
              outstandingAmount: { decrement: allocation.amount },
            },
          });
        }
        await tx.activity.create({
          data: {
            organizationId: actor.organizationId,
            actorId: actor.userId,
            event: 'SUPPLIER_PAYMENT_ALLOCATED',
            entityType: 'SupplierPayment',
            entityId: id,
          },
        });
        return tx.supplierPayment.findUnique({
          where: { id },
          include: { allocations: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async accessibleProjectIds(
    actor: CurrentActor,
    projectId?: string,
    permission?: string,
  ) {
    if (projectId) {
      await this.policy.assertView(actor, 'Project', projectId, permission);
      return [projectId];
    }
    const projects = await this.prisma.project.findMany({
      where: this.policy.projectWhere(actor, permission),
      select: { id: true },
    });
    return projects.map((project) => project.id);
  }

  private redactBankReference<
    T extends { bankReferenceProtected?: string | null },
  >(actor: CurrentActor, item: T): T | Omit<T, 'bankReferenceProtected'> {
    if (actor.permissions.includes('bank_information.read')) return item;
    const safe = { ...item };
    delete safe.bankReferenceProtected;
    return safe;
  }
}
