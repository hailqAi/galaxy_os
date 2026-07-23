import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import ExcelJS from 'exceljs';
import { Readable } from 'node:stream';
import { CurrentActor } from '../access-control/current-actor';
import { PrismaService } from '../prisma.service';
import { CreateImportDto, ImportMappingDto } from './imports.dto';

const required: Record<string, string[]> = {
  Customer: ['displayName'],
  Contact: ['customerId', 'firstName'],
  Lead: ['name'],
  Project: ['code', 'name', 'customerId'],
};

@Injectable()
export class ImportsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async create(
    actor: CurrentActor,
    dto: CreateImportDto,
    file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Excel file is required');
    if (
      file.size > 5 * 1024 * 1024 ||
      !file.originalname.toLowerCase().endsWith('.xlsx')
    )
      throw new BadRequestException('Only .xlsx files up to 5 MB are allowed');
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.read(Readable.from(file.buffer));
    } catch {
      throw new BadRequestException('Invalid Excel workbook');
    }
    const sheet = workbook.worksheets[0];
    if (!sheet || sheet.rowCount < 1)
      throw new BadRequestException('Workbook is empty');
    const headers: string[] = [];
    sheet.getRow(1).eachCell({ includeEmpty: true }, (cell) => {
      headers.push(String(this.cellValue(cell.value) ?? '').trim());
    });
    if (!headers.length || headers.some((header) => !header))
      throw new BadRequestException('Header row is invalid');
    const rows = [];
    for (
      let rowNumber = 2;
      rowNumber <= Math.min(sheet.rowCount, 1002);
      rowNumber++
    ) {
      const row = sheet.getRow(rowNumber);
      if (!row.hasValues) continue;
      const rawData = Object.fromEntries(
        headers.map((header, index) => [
          header,
          this.cellValue(row.getCell(index + 1).value),
        ]),
      );
      rows.push({ rowNumber, rawData });
    }
    return this.prisma.importJob.create({
      data: {
        organizationId: actor.organizationId,
        uploadedById: actor.userId,
        entityType: dto.entityType,
        filename: file.originalname.replace(/[^\p{L}\p{N}._ -]/gu, '_'),
        totalRows: rows.length,
        rows: { create: rows },
      },
      include: { rows: { take: 20, orderBy: { rowNumber: 'asc' } } },
    });
  }

  list(actor: CurrentActor) {
    return this.prisma.importJob.findMany({
      where: { organizationId: actor.organizationId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async get(actor: CurrentActor, id: string) {
    const job = await this.prisma.importJob.findFirst({
      where: { id, organizationId: actor.organizationId },
      include: { rows: { orderBy: { rowNumber: 'asc' } } },
    });
    if (!job) throw new NotFoundException('Import job not found');
    return job;
  }

  async map(actor: CurrentActor, id: string, dto: ImportMappingDto) {
    const job = await this.get(actor, id);
    const missing = required[job.entityType]?.filter(
      (field) => !Object.values(dto.mapping).includes(field),
    );
    if (missing?.length)
      throw new BadRequestException(`Missing mappings: ${missing.join(', ')}`);
    return this.prisma.importJob.update({
      where: { id },
      data: { mapping: dto.mapping, status: 'MAPPED' },
    });
  }

  async validate(actor: CurrentActor, id: string) {
    const job = await this.get(actor, id);
    if (!job.mapping || typeof job.mapping !== 'object')
      throw new BadRequestException('Column mapping is required');
    const mapping = job.mapping as Record<string, string>;
    let validRows = 0;
    for (const row of job.rows) {
      const raw = row.rawData as Record<string, unknown>;
      const normalized = Object.fromEntries(
        Object.entries(mapping)
          .filter(([, field]) => field)
          .map(([column, field]) => [field, raw[column] ?? null]),
      );
      const errors = (required[job.entityType] ?? [])
        .filter((field) => !String(normalized[field] ?? '').trim())
        .map((field) => `${field} is required`);
      if (
        normalized.email &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(normalized.email))
      )
        errors.push('email is invalid');
      if (
        !errors.length &&
        (await this.duplicate(actor, job.entityType, normalized))
      )
        errors.push('duplicate record');
      if (!errors.length) validRows++;
      await this.prisma.importRow.update({
        where: { id: row.id },
        data: {
          normalizedData: normalized,
          errors,
          status: errors.length ? 'INVALID' : 'VALID',
        },
      });
    }
    return this.prisma.importJob.update({
      where: { id },
      data: {
        status: 'VALIDATED',
        validRows,
        invalidRows: job.rows.length - validRows,
      },
    });
  }

  async confirm(actor: CurrentActor, id: string) {
    const job = await this.get(actor, id);
    if (job.status === 'COMPLETED') return job;
    if (job.status !== 'VALIDATED')
      throw new ConflictException('Import must be validated first');
    return this.prisma.$transaction(async (tx) => {
      let importedRows = 0;
      for (const row of job.rows.filter((item) => item.status === 'VALID')) {
        const data = row.normalizedData as Record<string, string | null>;
        let created: { id: string };
        if (job.entityType === 'Customer')
          created = await tx.customer.create({
            data: {
              organizationId: actor.organizationId,
              displayName: String(data.displayName),
              type: data.type === 'COMPANY' ? 'COMPANY' : 'INDIVIDUAL',
              email: data.email,
              phone: data.phone,
              createdBy: actor.userId,
              updatedBy: actor.userId,
            },
          });
        else if (job.entityType === 'Lead')
          created = await tx.lead.create({
            data: {
              organizationId: actor.organizationId,
              name: String(data.name),
              companyName: data.companyName,
              email: data.email,
              phone: data.phone,
              createdBy: actor.userId,
              updatedBy: actor.userId,
            },
          });
        else if (job.entityType === 'Project')
          created = await tx.project.create({
            data: {
              organizationId: actor.organizationId,
              code: String(data.code),
              name: String(data.name),
              customerId: String(data.customerId),
              createdBy: actor.userId,
              updatedBy: actor.userId,
            },
          });
        else
          created = await tx.contact.create({
            data: {
              organizationId: actor.organizationId,
              customerId: String(data.customerId),
              firstName: String(data.firstName),
              lastName: data.lastName,
              displayName: `${data.firstName} ${data.lastName ?? ''}`.trim(),
              email: data.email,
              phone: data.phone,
              createdBy: actor.userId,
              updatedBy: actor.userId,
            },
          });
        await tx.importRow.update({
          where: { id: row.id },
          data: { status: 'IMPORTED', createdEntityId: created.id },
        });
        importedRows++;
      }
      return tx.importJob.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          importedRows,
          completedAt: new Date(),
        },
      });
    });
  }

  errors(actor: CurrentActor, id: string) {
    return this.get(actor, id).then((job) =>
      job.rows.filter((row) => row.status === 'INVALID'),
    );
  }

  private cellValue(
    value: ExcelJS.CellValue,
  ): string | number | boolean | null {
    if (value instanceof Date) return value.toISOString();
    if (value && typeof value === 'object') {
      if ('formula' in value)
        return String(value.result ?? '').replace(/^[=+\-@]/, "'");
      if ('text' in value) return value.text;
      return JSON.stringify(value);
    }
    return value ?? null;
  }

  private duplicate(
    actor: CurrentActor,
    entityType: string,
    data: Record<string, unknown>,
  ) {
    const alternatives = [
      data.email ? { email: String(data.email) } : undefined,
      data.phone ? { phone: String(data.phone) } : undefined,
    ].filter((value) => value !== undefined);
    if (entityType === 'Customer')
      return this.prisma.customer
        .count({
          where: {
            organizationId: actor.organizationId,
            deletedAt: null,
            OR: [
              ...alternatives,
              {
                displayName: {
                  equals: String(data.displayName),
                  mode: 'insensitive',
                },
              },
            ],
          },
        })
        .then(Boolean);
    if (entityType === 'Project')
      return this.prisma.project
        .count({
          where: {
            organizationId: actor.organizationId,
            code: String(data.code),
          },
        })
        .then(Boolean);
    if (entityType === 'Lead')
      return alternatives.length
        ? this.prisma.lead
            .count({
              where: {
                organizationId: actor.organizationId,
                deletedAt: null,
                status: { notIn: ['CONVERTED', 'ARCHIVED'] },
                OR: alternatives,
              },
            })
            .then(Boolean)
        : Promise.resolve(false);
    return alternatives.length
      ? this.prisma.contact
          .count({
            where: {
              organizationId: actor.organizationId,
              customerId: String(data.customerId),
              deletedAt: null,
              OR: alternatives,
            },
          })
          .then(Boolean)
      : Promise.resolve(false);
  }
}
