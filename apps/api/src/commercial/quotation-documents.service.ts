import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import ExcelJS from 'exceljs';
import { BusinessEntityPolicy } from '../access-control/business-entity.policy';
import { CurrentActor } from '../access-control/current-actor';
import { readEnvironment } from '../config/env';
import {
  assertFileCapacity,
  fileStorageReservationExpiry,
  lockOrganizationFileCapacity,
} from '../files/file-quota';
import { FileStorage } from '../files/file-storage';
import { PrismaService } from '../prisma.service';

function pdf(lines: string[]) {
  const safe = lines
    .join('\\n')
    .normalize('NFD')
    .replace(/[^\x20-\x7e\n]/g, '')
    .replace(/[()\\]/g, '\\$&')
    .replace(/\n/g, ') Tj T* (');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${safe.length + 32} >>\nstream\nBT /F1 10 Tf 40 800 Td 14 TL (${safe}) Tj ET\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let output = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(output));
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(output);
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((value) => `${String(value).padStart(10, '0')} 00000 n `)
    .join(
      '\n',
    )}\ntrailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(output);
}

@Injectable()
export class QuotationDocumentsService {
  private readonly environment = readEnvironment();
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(FileStorage) private readonly storage: FileStorage,
    @Inject(BusinessEntityPolicy)
    private readonly policy: BusinessEntityPolicy,
  ) {}

  private view<
    T extends {
      storageKey?: string;
      checksum?: string;
      sizeBytes?: bigint | null;
    },
  >(document: T) {
    const { storageKey, checksum, sizeBytes, ...value } = document;
    void storageKey;
    void checksum;
    void sizeBytes;
    return value;
  }

  private async version(
    actor: CurrentActor,
    projectId: string,
    quotationId: string,
    requiredPermission: string,
    db: Pick<Prisma.TransactionClient, 'quotation'> = this.prisma,
  ) {
    const quotation = await db.quotation.findFirst({
      where: {
        id: quotationId,
        projectId,
        organizationId: actor.organizationId,
        project: this.policy.projectWhere(actor, requiredPermission),
      },
      include: {
        versions: {
          where: { version: { gte: 1 } },
          orderBy: { version: 'desc' },
          take: 1,
          include: { lines: { orderBy: { position: 'asc' } } },
        },
      },
    });
    if (!quotation?.versions[0])
      throw new NotFoundException('Quotation not found');
    return { quotation, version: quotation.versions[0] };
  }

  private async lockProjectFor(
    tx: Prisma.TransactionClient,
    actor: CurrentActor,
    projectId: string,
    requiredPermission: string,
  ) {
    const locked = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT "id" FROM "Project"
      WHERE "id" = ${projectId}::uuid
        AND "organizationId" = ${actor.organizationId}::uuid
        AND "deletedAt" IS NULL
      FOR UPDATE
    `);
    if (!locked.length) throw new NotFoundException('Quotation not found');
    const project = await tx.project.findFirst({
      where: {
        id: projectId,
        ...this.policy.projectWhere(actor, requiredPermission),
      },
      select: { id: true },
    });
    if (!project) throw new NotFoundException('Quotation not found');
  }

  async generate(
    actor: CurrentActor,
    projectId: string,
    quotationId: string,
    format: 'PDF' | 'XLSX',
    language: 'VI' | 'EN' | 'BILINGUAL',
  ) {
    const { quotation, version } = await this.version(
      actor,
      projectId,
      quotationId,
      'quotation.export',
    );
    let data: Buffer;
    if (format === 'XLSX') {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Quotation');
      sheet.addRow([
        quotation.number,
        `V${version.version}`,
        quotation.currency,
      ]);
      sheet.addRow([
        'Section',
        'Description',
        'Quantity',
        'Unit',
        'Unit price',
        'Total',
      ]);
      version.lines.forEach((line) =>
        sheet.addRow([
          line.section,
          line.description,
          line.quantity.toString(),
          line.unit,
          line.unitPrice.toString(),
          line.lineTotal.toString(),
        ]),
      );
      sheet.addRow(['Grand total', version.grandTotal.toString()]);
      data = Buffer.from(await workbook.xlsx.writeBuffer());
    } else {
      data = pdf([
        `GALAXY CENTRE - QUOTATION ${quotation.number} V${version.version}`,
        ...version.lines.map(
          (line) =>
            `${line.section} | ${line.description} | ${line.quantity} ${line.unit} | ${line.lineTotal} ${quotation.currency}`,
        ),
        `GRAND TOTAL: ${version.grandTotal} ${quotation.currency}`,
      ]);
    }
    const reservationId = randomUUID();
    const storageKey = this.storage.createKey(actor.organizationId);
    try {
      await this.prisma.$transaction(async (tx) => {
        await lockOrganizationFileCapacity(tx, actor.organizationId);
        await assertFileCapacity(tx, {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          incomingBytes: BigInt(data.length),
          staging: false,
          organizationLimitBytes: BigInt(
            this.environment.UPLOAD_ORGANIZATION_QUOTA_BYTES,
          ),
          globalLimitBytes: BigInt(this.environment.UPLOAD_GLOBAL_QUOTA_BYTES),
          unmeasuredFileBytes: BigInt(this.environment.UPLOAD_MAX_FILE_BYTES),
          actorStagingLimit: this.environment.UPLOAD_ACTOR_STAGING_LIMIT,
        });
        await tx.fileStorageReservation.create({
          data: {
            id: reservationId,
            organizationId: actor.organizationId,
            actorId: actor.userId,
            storageKey,
            sizeBytes: BigInt(data.length),
            expiresAt: fileStorageReservationExpiry(),
          },
        });
      });
      await this.storage.putStream(
        actor.organizationId,
        Readable.from(data),
        storageKey,
        reservationId,
      );
      return await this.prisma.$transaction(async (tx) => {
        await this.lockProjectFor(tx, actor, projectId, 'quotation.export');
        const current = await tx.quotation.findFirst({
          where: {
            id: quotationId,
            projectId,
            organizationId: actor.organizationId,
            currentVersion: version.version,
          },
          select: { id: true },
        });
        if (!current) throw new ConflictException('Quotation changed; retry');
        const reservation = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
          SELECT "id" FROM "FileStorageReservation"
          WHERE "id" = ${reservationId}::uuid AND "expiresAt" > NOW()
          FOR UPDATE
        `);
        if (!reservation.length)
          throw new ConflictException('File storage reservation expired');
        await this.storage.publishPending(storageKey, reservationId);
        const document = await tx.quotationDocument.create({
          data: {
            quotationVersionId: version.id,
            language,
            format,
            storageKey,
            checksum: createHash('sha256').update(data).digest('hex'),
            sizeBytes: BigInt(data.length),
            generatedBy: actor.userId,
          },
        });
        await tx.fileStorageReservation.delete({
          where: { id: reservationId },
        });
        return this.view(document);
      });
    } catch (error) {
      const reservation = await this.prisma.fileStorageReservation
        .findUnique({ where: { id: reservationId }, select: { id: true } })
        .catch(() => undefined);
      if (reservation) {
        try {
          await this.storage.removePending(storageKey, reservationId);
          await this.storage.remove(storageKey);
          await this.prisma.fileStorageReservation.deleteMany({
            where: { id: reservationId, storageKey },
          });
        } catch {
          // Keep the reservation charged so periodic cleanup can retry safely.
        }
      }
      throw error;
    }
  }

  async download(
    actor: CurrentActor,
    projectId: string,
    quotationId: string,
    documentId: string,
  ) {
    await this.version(actor, projectId, quotationId, 'quotation.read');
    const document = await this.prisma.quotationDocument.findFirst({
      where: { id: documentId, quotationVersion: { quotationId } },
    });
    if (!document) throw new NotFoundException('Document not found');
    return {
      document: this.view(document),
      data: await this.storage.read(document.storageKey),
    };
  }
}
