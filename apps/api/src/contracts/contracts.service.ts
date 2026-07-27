import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CurrentActor } from '../access-control/current-actor';
import { PrismaService } from '../prisma.service';
import {
  AppendixTransitionDto,
  ContractTransitionDto,
  CreateAppendixDto,
  CreateContractDto,
  CreateGuaranteeDto,
  CreatePaymentSchedulesDto,
  RecordPaymentDto,
} from './contracts.dto';

@Injectable()
export class ContractsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  async list(actor: CurrentActor, projectId: string) {
    return this.prisma.contract.findMany({
      where: { organizationId: actor.organizationId, projectId },
      include: { appendices: true, guarantees: true },
      orderBy: { updatedAt: 'desc' },
    });
  }
  async get(actor: CurrentActor, projectId: string, id: string) {
    const item = await this.prisma.contract.findFirst({
      where: { id, organizationId: actor.organizationId, projectId },
      include: {
        appendices: { orderBy: { createdAt: 'desc' } },
        valueHistory: { orderBy: { effectiveDate: 'desc' } },
        guarantees: { orderBy: { expiryDate: 'asc' } },
        paymentSchedules: { orderBy: { sequence: 'asc' } },
        statusHistory: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!item) throw new NotFoundException('Contract not found');
    return item;
  }
  async create(
    actor: CurrentActor,
    projectId: string,
    data: CreateContractDto,
  ) {
    const quotation = await this.prisma.quotation.findFirst({
      where: {
        id: data.quotationId,
        projectId,
        organizationId: actor.organizationId,
        status: 'ACCEPTED',
      },
    });
    if (!quotation)
      throw new UnprocessableEntityException('Accepted quotation required');
    return this.prisma.$transaction(async (tx) => {
      const retentionPercent = new Prisma.Decimal(data.retentionPercent || 0);
      const warrantyRetentionPercent = new Prisma.Decimal(
        data.warrantyRetentionPercent || 0,
      );
      const contract = await tx.contract.create({
        data: {
          organizationId: actor.organizationId,
          projectId,
          customerId: quotation.customerId,
          quotationId: quotation.id,
          contractNumber: data.contractNumber,
          sellerLegalEntity: data.sellerLegalEntity,
          buyerLegalEntity: data.buyerLegalEntity,
          sellerRepresentative: data.sellerRepresentative,
          buyerRepresentative: data.buyerRepresentative,
          expectedCompletionDate: data.expectedCompletionDate,
          originalValue: quotation.grandTotal,
          currentValue: quotation.grandTotal,
          currency: quotation.currency,
          taxAmount: quotation.taxAmount,
          retentionPercent,
          retentionAmount: quotation.grandTotal.mul(retentionPercent).div(100),
          warrantyRetentionPercent,
          warrantyRetentionAmount: quotation.grandTotal
            .mul(warrantyRetentionPercent)
            .div(100),
          paymentTerms: null,
          deliveryTerms: null,
          installationTerms: null,
          warrantyTerms: null,
          terminationTerms: data.terminationTerms,
          createdBy: actor.userId,
          updatedBy: actor.userId,
          versions: {
            create: {
              version: 1,
              snapshot: {
                quotationId: quotation.id,
                value: quotation.grandTotal.toString(),
              },
              createdBy: actor.userId,
            },
          },
          valueHistory: {
            create: {
              previousValue: 0,
              changeValue: quotation.grandTotal,
              currentValue: quotation.grandTotal,
              effectiveDate: new Date(),
              createdBy: actor.userId,
            },
          },
          statusHistory: {
            create: { toStatus: 'DRAFT', actorId: actor.userId },
          },
        },
      });
      await tx.activity.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          event: 'CONTRACT_CREATED',
          entityType: 'Contract',
          entityId: contract.id,
        },
      });
      return contract;
    });
  }
  async transition(
    actor: CurrentActor,
    projectId: string,
    id: string,
    data: ContractTransitionDto,
  ) {
    const contract = await this.get(actor, projectId, id);
    const allowed: Record<string, string[]> = {
      DRAFT: ['INTERNAL_REVIEW', 'CANCELLED'],
      INTERNAL_REVIEW: ['NEGOTIATION', 'SIGNED', 'DRAFT'],
      NEGOTIATION: ['SIGNED', 'CANCELLED'],
      SIGNED: ['ACTIVE'],
      ACTIVE: ['SUSPENDED', 'COMPLETED', 'TERMINATED'],
      SUSPENDED: ['ACTIVE', 'TERMINATED'],
    };
    if (!allowed[contract.status]?.includes(data.status))
      throw new ConflictException('Invalid contract transition');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.contract.update({
        where: { id },
        data: {
          status: data.status,
          signedDate:
            data.status === 'SIGNED'
              ? (data.signedDate ?? new Date())
              : undefined,
          effectiveDate:
            data.status === 'ACTIVE'
              ? (data.effectiveDate ?? new Date())
              : undefined,
          updatedBy: actor.userId,
        },
      });
      await tx.contractStatusHistory.create({
        data: {
          contractId: id,
          fromStatus: contract.status,
          toStatus: data.status,
          actorId: actor.userId,
          comment: data.comment,
        },
      });
      await tx.activity.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          event: `CONTRACT_${data.status}`,
          entityType: 'Contract',
          entityId: id,
        },
      });
      return updated;
    });
  }
  async createAppendix(
    actor: CurrentActor,
    projectId: string,
    contractId: string,
    data: CreateAppendixDto,
  ) {
    const contract = await this.get(actor, projectId, contractId);
    if (!['SIGNED', 'ACTIVE', 'SUSPENDED'].includes(contract.status))
      throw new ConflictException('Signed contract required');
    return this.prisma.contractAppendix
      .create({
        data: {
          contractId,
          appendixNumber: data.appendixNumber,
          type: data.type,
          title: data.title,
          description: data.description,
          valueChange: data.valueChange,
          currency: data.currency,
          idempotencyKey: data.idempotencyKey,
          createdBy: actor.userId,
        },
      })
      .catch(async (error) => {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        )
          return this.prisma.contractAppendix.findUniqueOrThrow({
            where: { idempotencyKey: data.idempotencyKey },
          });
        throw error;
      });
  }
  async transitionAppendix(
    actor: CurrentActor,
    projectId: string,
    contractId: string,
    appendixId: string,
    data: AppendixTransitionDto,
  ) {
    await this.get(actor, projectId, contractId);
    const appendix = await this.prisma.contractAppendix.findFirst({
      where: { id: appendixId, contractId },
    });
    if (!appendix) throw new NotFoundException('Appendix not found');
    const allowed: Record<string, string[]> = {
      DRAFT: ['INTERNAL_REVIEW', 'CANCELLED'],
      INTERNAL_REVIEW: ['APPROVED', 'REJECTED'],
      APPROVED: ['SIGNED'],
      SIGNED: ['EFFECTIVE'],
    };
    if (!allowed[appendix.status]?.includes(data.status))
      throw new ConflictException('Invalid appendix transition');
    return this.prisma.$transaction(async (tx) => {
      if (data.status !== 'EFFECTIVE')
        return tx.contractAppendix.update({
          where: { id: appendixId },
          data: {
            status: data.status,
            signedDate:
              data.status === 'SIGNED'
                ? (data.signedDate ?? new Date())
                : undefined,
          },
        });
      const contract = await tx.contract.findUniqueOrThrow({
        where: { id: contractId },
      });
      const next = contract.currentValue.add(appendix.valueChange);
      if (next.lt(0))
        throw new UnprocessableEntityException(
          'Contract value cannot be negative',
        );
      await tx.contract.update({
        where: { id: contractId },
        data: { currentValue: next, updatedBy: actor.userId },
      });
      await tx.contractValueHistory.create({
        data: {
          contractId,
          appendixId,
          previousValue: contract.currentValue,
          changeValue: appendix.valueChange,
          currentValue: next,
          effectiveDate: data.effectiveDate ?? new Date(),
          createdBy: actor.userId,
        },
      });
      return tx.contractAppendix.update({
        where: { id: appendixId },
        data: {
          status: 'EFFECTIVE',
          effectiveDate: data.effectiveDate ?? new Date(),
        },
      });
    });
  }
  async schedules(
    actor: CurrentActor,
    projectId: string,
    contractId: string,
    data: CreatePaymentSchedulesDto,
  ) {
    const contract = await this.get(actor, projectId, contractId);
    const total = data.items.reduce(
      (sum, item) => sum.add(item.amount),
      new Prisma.Decimal(0),
    );
    if (total.gt(contract.currentValue))
      throw new UnprocessableEntityException('Schedules exceed contract value');
    return this.prisma.$transaction(
      data.items.map((item, index) =>
        this.prisma.customerPaymentSchedule.create({
          data: {
            organizationId: actor.organizationId,
            projectId,
            contractId,
            milestoneName: item.milestoneName,
            sequence: index + 1,
            dueDate: item.dueDate,
            percentage: item.percentage,
            amount: item.amount,
            currency: contract.currency,
            outstandingAmount: item.amount,
            condition: item.condition,
            createdBy: actor.userId,
          },
        }),
      ),
    );
  }
  async payment(
    actor: CurrentActor,
    projectId: string,
    data: RecordPaymentDto,
  ) {
    const paymentAmount = new Prisma.Decimal(data.amount);
    const allocated = data.allocations.reduce(
      (sum, item) => sum.add(item.amount),
      new Prisma.Decimal(0),
    );
    if (!allocated.eq(paymentAmount))
      throw new UnprocessableEntityException(
        'Allocations must equal payment amount',
      );
    const existing = await this.prisma.customerPayment.findUnique({
      where: { idempotencyKey: data.idempotencyKey },
    });
    if (existing) return existing;
    return this.prisma.$transaction(
      async (tx) => {
        const schedules = await tx.customerPaymentSchedule.findMany({
          where: {
            id: { in: data.allocations.map(({ scheduleId }) => scheduleId) },
            organizationId: actor.organizationId,
            projectId,
          },
        });
        if (schedules.length !== data.allocations.length)
          throw new NotFoundException('Payment schedule not found');
        for (const allocation of data.allocations) {
          const schedule = schedules.find(
            ({ id }) => id === allocation.scheduleId,
          )!;
          if (
            new Prisma.Decimal(allocation.amount).gt(schedule.outstandingAmount)
          )
            throw new UnprocessableEntityException(
              'Allocation exceeds outstanding amount',
            );
        }
        const payment = await tx.customerPayment.create({
          data: {
            organizationId: actor.organizationId,
            projectId,
            paymentDate: data.paymentDate,
            amount: paymentAmount,
            currency: data.currency,
            exchangeRate: data.exchangeRate || 1,
            paymentMethod: data.paymentMethod,
            bankReference: data.bankReference,
            receiptNumber: data.receiptNumber,
            notes: data.notes,
            recordedBy: actor.userId,
            idempotencyKey: data.idempotencyKey,
          },
        });
        for (const allocation of data.allocations) {
          const amount = new Prisma.Decimal(allocation.amount);
          const schedule = schedules.find(
            ({ id }) => id === allocation.scheduleId,
          )!;
          const outstanding = schedule.outstandingAmount.sub(amount);
          const paid = schedule.paidAmount.add(amount);
          await tx.paymentAllocation.create({
            data: { paymentId: payment.id, scheduleId: schedule.id, amount },
          });
          await tx.customerPaymentSchedule.update({
            where: { id: schedule.id },
            data: {
              paidAmount: paid,
              outstandingAmount: outstanding,
              status: outstanding.eq(0) ? 'PAID' : 'PARTIALLY_PAID',
            },
          });
        }
        await tx.activity.create({
          data: {
            organizationId: actor.organizationId,
            actorId: actor.userId,
            event: 'CUSTOMER_PAYMENT_RECORDED',
            entityType: 'CustomerPayment',
            entityId: payment.id,
          },
        });
        return payment;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async receivables(actor: CurrentActor, projectId: string) {
    const items = await this.prisma.customerPaymentSchedule.findMany({
      where: { organizationId: actor.organizationId, projectId },
      orderBy: { dueDate: 'asc' },
    });
    const now = Date.now();
    return items.map((item) => ({
      ...item,
      overdueDays:
        item.outstandingAmount.gt(0) && item.dueDate.getTime() < now
          ? Math.floor((now - item.dueDate.getTime()) / 86_400_000)
          : 0,
    }));
  }

  async guarantee(
    actor: CurrentActor,
    projectId: string,
    contractId: string,
    data: CreateGuaranteeDto,
  ) {
    await this.get(actor, projectId, contractId);
    if (data.expiryDate <= data.issueDate)
      throw new UnprocessableEntityException(
        'Guarantee expiry must follow issue date',
      );
    const guarantee = await this.prisma.contractGuarantee.create({
      data: { contractId, ...data },
    });
    await this.prisma.activity.create({
      data: {
        organizationId: actor.organizationId,
        actorId: actor.userId,
        event: 'CONTRACT_GUARANTEE_CREATED',
        entityType: 'ContractGuarantee',
        entityId: guarantee.id,
        metadata: { alertDays: [30, 14, 7] },
      },
    });
    return guarantee;
  }
}
