import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CurrentActor } from '../access-control/current-actor';
import { PrismaService } from '../prisma.service';
import {
  BrandDto,
  ProductDto,
  SupplierContactDto,
  SupplierDto,
} from './catalog.dto';

@Injectable()
export class CatalogService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private result<T>(items: T[], page: number, pageSize: number, total: number) {
    return {
      items,
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async brands(
    actor: CurrentActor,
    page: number,
    pageSize: number,
    search?: string,
  ) {
    const where = {
      organizationId: actor.organizationId,
      activeStatus: 'active' as const,
      name: search
        ? { contains: search, mode: 'insensitive' as const }
        : undefined,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.brand.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.brand.count({ where }),
    ]);
    return this.result(items, page, pageSize, total);
  }

  createBrand(actor: CurrentActor, data: BrandDto) {
    return this.prisma.brand.create({
      data: {
        ...data,
        defaultCurrency: data.defaultCurrency.toUpperCase(),
        organizationId: actor.organizationId,
      },
    });
  }

  async products(
    actor: CurrentActor,
    page: number,
    pageSize: number,
    search?: string,
  ) {
    const where = {
      organizationId: actor.organizationId,
      activeStatus: 'active' as const,
      OR: search
        ? [
            { name: { contains: search, mode: 'insensitive' as const } },
            { productCode: { contains: search, mode: 'insensitive' as const } },
          ]
        : undefined,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        include: {
          brand: { select: { id: true, name: true } },
          variants: {
            where: { activeStatus: 'active' },
            orderBy: { name: 'asc' },
          },
        },
        orderBy: { name: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.product.count({ where }),
    ]);
    return this.result(items, page, pageSize, total);
  }

  async createProduct(actor: CurrentActor, data: ProductDto) {
    if (
      !(await this.prisma.brand.findFirst({
        where: {
          id: data.brandId,
          organizationId: actor.organizationId,
          activeStatus: 'active',
        },
      }))
    )
      throw new NotFoundException('Brand not found');
    return this.prisma.product.create({
      data: {
        ...data,
        dimensions: data.dimensions as Prisma.InputJsonValue | undefined,
        technicalData: data.technicalData as Prisma.InputJsonValue | undefined,
        organizationId: actor.organizationId,
      },
    });
  }

  async suppliers(
    actor: CurrentActor,
    page: number,
    pageSize: number,
    search?: string,
  ) {
    const where = {
      organizationId: actor.organizationId,
      activeStatus: 'active' as const,
      OR: search
        ? [
            { legalName: { contains: search, mode: 'insensitive' as const } },
            { tradingName: { contains: search, mode: 'insensitive' as const } },
          ]
        : undefined,
    };
    const select = {
      id: true,
      legalName: true,
      tradingName: true,
      country: true,
      currency: true,
      paymentTerms: true,
      incoterms: true,
      typicalLeadTimeDays: true,
      authorizedDistributorStatus: true,
      activeStatus: true,
      riskNotes: true,
      contacts: true,
    } as const;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.supplier.findMany({
        where,
        select,
        orderBy: { legalName: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.supplier.count({ where }),
    ]);
    return this.result(items, page, pageSize, total);
  }

  createSupplier(actor: CurrentActor, data: SupplierDto) {
    return this.prisma.supplier.create({
      data: {
        ...data,
        currency: data.currency.toUpperCase(),
        organizationId: actor.organizationId,
      },
      select: { id: true, legalName: true, country: true, currency: true },
    });
  }

  async addContact(
    actor: CurrentActor,
    supplierId: string,
    data: SupplierContactDto,
  ) {
    if (
      !(await this.prisma.supplier.findFirst({
        where: { id: supplierId, organizationId: actor.organizationId },
      }))
    )
      throw new NotFoundException('Supplier not found');
    return this.prisma.supplierContact.create({
      data: { ...data, supplierId, organizationId: actor.organizationId },
    });
  }

  async bankReference(actor: CurrentActor, supplierId: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, organizationId: actor.organizationId },
      select: { bankInformationReference: true },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');
    return supplier;
  }

  async setBankReference(
    actor: CurrentActor,
    supplierId: string,
    value: string,
  ) {
    if (
      !(await this.prisma.supplier.findFirst({
        where: { id: supplierId, organizationId: actor.organizationId },
      }))
    )
      throw new NotFoundException('Supplier not found');
    return this.prisma.supplier.update({
      where: { id: supplierId },
      data: { bankInformationReference: value },
      select: { id: true, bankInformationReference: true },
    });
  }
}
