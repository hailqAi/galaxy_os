import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import ExcelJS from 'exceljs';
import { CurrentActor } from '../access-control/current-actor';
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
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(FileStorage) private readonly storage: FileStorage,
  ) {}

  private async version(
    actor: CurrentActor,
    projectId: string,
    quotationId: string,
  ) {
    const quotation = await this.prisma.quotation.findFirst({
      where: {
        id: quotationId,
        projectId,
        organizationId: actor.organizationId,
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
    const storageKey = await this.storage.put(actor.organizationId, data);
    return this.prisma.quotationDocument.create({
      data: {
        quotationVersionId: version.id,
        language,
        format,
        storageKey,
        checksum: createHash('sha256').update(data).digest('hex'),
        generatedBy: actor.userId,
      },
    });
  }

  async download(
    actor: CurrentActor,
    projectId: string,
    quotationId: string,
    documentId: string,
  ) {
    await this.version(actor, projectId, quotationId);
    const document = await this.prisma.quotationDocument.findFirst({
      where: { id: documentId, quotationVersion: { quotationId } },
    });
    if (!document) throw new NotFoundException('Document not found');
    return { document, data: await this.storage.read(document.storageKey) };
  }
}
