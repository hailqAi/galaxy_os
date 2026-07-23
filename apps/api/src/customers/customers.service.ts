import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CustomerStatus, CustomerType, Prisma } from '@prisma/client';
import { CurrentActor } from '../access-control/current-actor';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma.service';
import {
  CreateContactDto,
  CreateCustomerDto,
  UpdateContactDto,
  UpdateCustomerDto,
} from './customers.dto';

@Injectable()
export class CustomersService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async list(
    actor: CurrentActor,
    query: {
      page: number;
      pageSize: number;
      search?: string;
      type?: CustomerType;
      status?: CustomerStatus;
      ownerId?: string;
      sort?: 'displayName' | 'updatedAt';
      direction?: 'asc' | 'desc';
    },
  ) {
    const where: Prisma.CustomerWhereInput = {
      organizationId: actor.organizationId,
      deletedAt: null,
      type: query.type,
      status: query.status,
      ownerId: query.ownerId,
      OR: query.search
        ? ['displayName', 'phone', 'email', 'taxCode'].map((field) => ({
            [field]: { contains: query.search, mode: 'insensitive' },
          }))
        : undefined,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        include: {
          owner: { select: { id: true, displayName: true } },
          _count: { select: { contacts: true } },
        },
        orderBy: { [query.sort ?? 'updatedAt']: query.direction ?? 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.customer.count({ where }),
    ]);
    return {
      items,
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }

  async get(actor: CurrentActor, id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, organizationId: actor.organizationId, deletedAt: null },
      include: {
        owner: { select: { id: true, displayName: true } },
        contacts: {
          where: { deletedAt: null },
          orderBy: [{ isPrimary: 'desc' }, { displayName: 'asc' }],
        },
      },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  async create(actor: CurrentActor, data: CreateCustomerDto) {
    await this.assertUnique(actor, data);
    return this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.create({
        data: {
          ...data,
          organizationId: actor.organizationId,
          createdBy: actor.userId,
          updatedBy: actor.userId,
        },
      });
      await this.audit.write(tx, actor, {
        action: 'CUSTOMER_CREATED',
        entityType: 'Customer',
        entityId: customer.id,
        afterData: customer,
      });
      return customer;
    });
  }

  async update(actor: CurrentActor, id: string, data: UpdateCustomerDto) {
    const before = await this.get(actor, id);
    await this.assertUnique(actor, data, id);
    return this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.update({
        where: { id },
        data: { ...data, updatedBy: actor.userId, version: { increment: 1 } },
      });
      await this.audit.write(tx, actor, {
        action: 'CUSTOMER_UPDATED',
        entityType: 'Customer',
        entityId: id,
        beforeData: before,
        afterData: customer,
      });
      return customer;
    });
  }

  async remove(actor: CurrentActor, id: string) {
    await this.get(actor, id);
    return this.prisma.customer.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        updatedBy: actor.userId,
        version: { increment: 1 },
      },
    });
  }

  contacts(actor: CurrentActor, customerId: string) {
    return this.get(actor, customerId).then(({ contacts }) => contacts);
  }

  async createContact(
    actor: CurrentActor,
    customerId: string,
    data: CreateContactDto,
  ) {
    await this.get(actor, customerId);
    return this.prisma.$transaction(async (tx) => {
      if (data.isPrimary)
        await tx.contact.updateMany({
          where: {
            customerId,
            organizationId: actor.organizationId,
            deletedAt: null,
          },
          data: { isPrimary: false, updatedBy: actor.userId },
        });
      const contact = await tx.contact.create({
        data: {
          ...data,
          displayName:
            data.displayName ??
            [data.firstName, data.lastName].filter(Boolean).join(' '),
          customerId,
          organizationId: actor.organizationId,
          createdBy: actor.userId,
          updatedBy: actor.userId,
        },
      });
      await this.audit.write(tx, actor, {
        action: 'CONTACT_CREATED',
        entityType: 'Contact',
        entityId: contact.id,
        afterData: contact,
      });
      return contact;
    });
  }

  async updateContact(actor: CurrentActor, id: string, data: UpdateContactDto) {
    const before = await this.prisma.contact.findFirst({
      where: { id, organizationId: actor.organizationId, deletedAt: null },
    });
    if (!before) throw new NotFoundException('Contact not found');
    return this.prisma.$transaction(async (tx) => {
      if (data.isPrimary)
        await tx.contact.updateMany({
          where: {
            customerId: before.customerId,
            organizationId: actor.organizationId,
            deletedAt: null,
          },
          data: { isPrimary: false, updatedBy: actor.userId },
        });
      return tx.contact.update({
        where: { id },
        data: {
          ...data,
          displayName:
            data.displayName ??
            (data.firstName
              ? [data.firstName, data.lastName].filter(Boolean).join(' ')
              : undefined),
          updatedBy: actor.userId,
          version: { increment: 1 },
        },
      });
    });
  }

  async removeContact(actor: CurrentActor, id: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id, organizationId: actor.organizationId, deletedAt: null },
    });
    if (!contact) throw new NotFoundException('Contact not found');
    return this.prisma.contact.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isPrimary: false,
        updatedBy: actor.userId,
        version: { increment: 1 },
      },
    });
  }

  private async assertUnique(
    actor: CurrentActor,
    data: Pick<CreateCustomerDto, 'email' | 'phone' | 'taxCode'>,
    excludeId?: string,
  ) {
    const duplicate = await this.prisma.customer.findFirst({
      where: {
        organizationId: actor.organizationId,
        deletedAt: null,
        id: excludeId ? { not: excludeId } : undefined,
        OR: [
          { email: data.email },
          { phone: data.phone },
          { taxCode: data.taxCode },
        ].filter((item) => Object.values(item)[0]),
      },
    });
    if (duplicate)
      throw new ConflictException({
        message: 'Potential duplicate customer',
        customerId: duplicate.id,
      });
  }
}
