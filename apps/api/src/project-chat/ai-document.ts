import { z } from 'zod';
import { Workbook } from 'exceljs';
import JSZip from 'jszip';
import PDFDocument from 'pdfkit';
import { inflateSync } from 'node:zlib';
import { resolve } from 'node:path';
import { AiError } from './ai-registry';
import { docxMime } from '../files/office-document';
const xlsxMime =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const text = z
  .string()
  .max(4000)
  .refine((value) =>
    [...value].every(
      (char) =>
        char.charCodeAt(0) >= 32 || [9, 10, 13].includes(char.charCodeAt(0)),
    ),
  );
export const documentInput = z
  .object({
    format: z.enum(['docx', 'pdf', 'xlsx']),
    title: text.min(1).max(120),
    blocks: z
      .array(
        z.discriminatedUnion('kind', [
          z.object({ kind: z.literal('heading'), text }).strict(),
          z.object({ kind: z.literal('paragraph'), text }).strict(),
          z
            .object({
              kind: z.literal('table'),
              rows: z.array(z.array(text).min(1).max(10)).min(1).max(40),
            })
            .strict(),
          z.object({ kind: z.literal('page_break') }).strict(),
          z
            .object({
              kind: z.literal('image'),
              sourceId: z.string().uuid(),
              caption: text,
            })
            .strict(),
        ]),
      )
      .min(1)
      .max(60)
      .refine(
        (blocks) =>
          blocks.filter((block) => block.kind === 'image').length <= 3 &&
          blocks.reduce(
            (sum, block) =>
              sum +
              (block.kind === 'table'
                ? block.rows.reduce((n, row) => n + row.length, 0)
                : 0),
            0,
          ) <= 400,
      ),
  })
  .strict();
export type DocumentInput = z.infer<typeof documentInput>;
type DocumentImage = {
  sourceId: string;
  mime: 'image/png' | 'image/jpeg';
  bytes: Buffer;
};
const escape = (value: string) =>
  value.replace(
    /[<>&"']/g,
    (c) =>
      ({
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        '"': '&quot;',
        "'": '&apos;',
      })[c]!,
  );
export const documentPlainText = (input: DocumentInput) =>
  [
    'BẢN NHÁP AI — CHƯA PHÊ DUYỆT',
    input.title,
    ...input.blocks.map((block) =>
      block.kind === 'table'
        ? block.rows.map((row) => row.join(' | ')).join('\n')
        : block.kind === 'image'
          ? block.caption
          : block.kind === 'page_break'
            ? '[Ngắt trang]'
            : block.text,
    ),
  ].join('\n');

export function documentDiff(before: string, after: string) {
  const difference = (left: string[], right: string[]) => {
    const counts = new Map<string, number>();
    for (const line of right) counts.set(line, (counts.get(line) ?? 0) + 1);
    return left.filter((line) => {
      const count = counts.get(line) ?? 0;
      if (count) {
        counts.set(line, count - 1);
        return false;
      }
      return Boolean(line);
    });
  };
  let remaining = 8000,
    truncated = false;
  const bound = (lines: string[]) =>
    lines.slice(0, 100).flatMap((line) => {
      if (remaining <= 3) {
        truncated = true;
        return [];
      }
      remaining -= 3;
      let result = '';
      for (const char of line) {
        const size = Buffer.byteLength(JSON.stringify(char)) - 2;
        if (size > remaining) {
          truncated = true;
          break;
        }
        result += char;
        remaining -= size;
      }
      return [result];
    });
  const removed = difference(before.split('\n'), after.split('\n')),
    added = difference(after.split('\n'), before.split('\n'));
  const result = { removed: bound(removed), added: bound(added) };
  return {
    ...result,
    truncated: truncated || removed.length > 100 || added.length > 100,
    coverage:
      'Đối chiếu dòng văn bản đã trích; không xác nhận tương đương định dạng, ảnh, vị trí hoặc nghĩa vụ. Tối đa100 dòng mỗi phía và8KB.',
  };
}

function dimensions(image: DocumentImage) {
  const bytes = image.bytes;
  if (image.mime === 'image/png' && bytes.length >= 24)
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset++] !== 255) break;
    const marker = bytes[offset++]!,
      length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) break;
    if ([0xc0, 0xc1, 0xc2].includes(marker))
      return {
        width: bytes.readUInt16BE(offset + 5),
        height: bytes.readUInt16BE(offset + 3),
      };
    offset += length;
  }
  throw new AiError('DOCUMENT_IMAGE_UNAVAILABLE');
}

export async function renderDocument(raw: unknown, images: DocumentImage[]) {
  const input = documentInput.parse(raw);
  if (
    Buffer.byteLength(JSON.stringify(input)) > 24000 ||
    images.length > 3 ||
    images.reduce((sum, image) => sum + image.bytes.length, 0) > 5_000_000
  )
    throw new AiError('DOCUMENT_LIMIT');
  const imageFor = (sourceId: string) => {
    const image = images.find((item) => item.sourceId === sourceId);
    if (!image) throw new AiError('DOCUMENT_IMAGE_UNAVAILABLE');
    // PNG pixels are decoded by PDFKit; bound the allocation before decoding.
    if (
      image.mime === 'image/png' &&
      (image.bytes.length < 24 ||
        image.bytes.readUInt32BE(16) * image.bytes.readUInt32BE(20) > 8_000_000)
    )
      throw new AiError('DOCUMENT_IMAGE_LIMIT');
    if (image.mime === 'image/png') {
      const compressed: Buffer[] = [];
      let offset = 8;
      while (offset + 12 <= image.bytes.length) {
        const size = image.bytes.readUInt32BE(offset);
        if (offset + 12 + size > image.bytes.length)
          throw new AiError('DOCUMENT_IMAGE_UNAVAILABLE');
        if (image.bytes.toString('ascii', offset + 4, offset + 8) === 'IDAT')
          compressed.push(image.bytes.subarray(offset + 8, offset + 8 + size));
        offset += 12 + size;
      }
      try {
        inflateSync(Buffer.concat(compressed), {
          maxOutputLength: Math.min(
            64_000_000,
            image.bytes.readUInt32BE(16) * image.bytes.readUInt32BE(20) * 9 +
              1024,
          ),
        });
      } catch {
        throw new AiError('DOCUMENT_IMAGE_LIMIT');
      }
    }
    const size = dimensions(image);
    if (!size.width || !size.height || size.width * size.height > 8_000_000)
      throw new AiError('DOCUMENT_IMAGE_LIMIT');
    const scale = Math.min(320 / size.width, 240 / size.height);
    return {
      ...image,
      width: Math.max(1, Math.round(size.width * scale)),
      height: Math.max(1, Math.round(size.height * scale)),
    };
  };
  const blocks: DocumentInput['blocks'] = [
    { kind: 'heading', text: input.title },
    { kind: 'paragraph', text: 'BẢN NHÁP AI — CHƯA PHÊ DUYỆT' },
    ...input.blocks,
  ];
  let bytes: Buffer;
  if (input.format === 'xlsx') {
    const workbook = new Workbook();
    workbook.creator = 'Galaxy AI';
    workbook.created = new Date(0);
    workbook.modified = new Date(0);
    const sheet = workbook.addWorksheet('Bản nháp');
    sheet.columns = Array.from({ length: 10 }, () => ({ width: 25 }));
    for (const block of blocks) {
      if (block.kind === 'page_break') {
        if (sheet.lastRow) sheet.lastRow.addPageBreak();
        continue;
      }
      if (block.kind === 'image') {
        const image = imageFor(block.sourceId),
          row = sheet.addRow([block.caption]);
        const imageId = workbook.addImage({
          base64: image.bytes.toString('base64'),
          extension: image.mime === 'image/png' ? 'png' : 'jpeg',
        });
        sheet.addImage(imageId, {
          tl: { col: 0, row: row.number },
          ext: { width: image.width, height: image.height },
        });
        for (let i = 0; i < 13; i++) sheet.addRow([]);
        continue;
      }
      for (const values of block.kind === 'table'
        ? block.rows
        : [[block.text]]) {
        const row = sheet.addRow(values);
        row.eachCell((cell) => {
          cell.font = {
            name: 'Be Vietnam Pro',
            size: 12,
            bold: block.kind === 'heading',
          };
          cell.alignment = { wrapText: true, vertical: 'top' };
          cell.numFmt = '@';
        });
      }
    }
    // Text cells preserve Decimal precision and never interpret untrusted =,+,-,@ as formulas.
    bytes = Buffer.from(await workbook.xlsx.writeBuffer());
  } else if (input.format === 'docx') {
    const zip = new JSZip();
    const date = new Date('2000-01-01T00:00:00Z');
    const add = (path: string, value: string | Buffer) =>
      zip.file(path, value, { date });
    const p = (value: string, heading = false) =>
      `<w:p>${heading ? '<w:pPr><w:pStyle w:val="Heading1"/><w:keepNext/></w:pPr>' : ''}<w:r><w:rPr><w:rFonts w:ascii="Be Vietnam Pro" w:hAnsi="Be Vietnam Pro"/><w:sz w:val="24"/>${heading ? '<w:b/>' : ''}</w:rPr><w:t xml:space="preserve">${escape(value)}</w:t></w:r></w:p>`;
    let imageNumber = 0;
    const relationships: string[] = [
      '<Relationship Id="rStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>',
    ];
    add(
      'word/styles.xml',
      '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style></w:styles>',
    );
    const body = blocks
      .map((block) => {
        if (block.kind === 'page_break')
          return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
        if (block.kind === 'table')
          return `<w:tbl><w:tblPr><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((side) => `<w:${side} w:val="single" w:sz="4"/>`).join('')}</w:tblBorders></w:tblPr>${block.rows.map((row) => `<w:tr>${row.map((cell) => `<w:tc>${p(cell)}</w:tc>`).join('')}</w:tr>`).join('')}</w:tbl>`;
        if (block.kind === 'image') {
          const image = imageFor(block.sourceId),
            n = ++imageNumber,
            ext = image.mime === 'image/png' ? 'png' : 'jpg';
          add(`word/media/image${n}.${ext}`, image.bytes);
          relationships.push(
            `<Relationship Id="rId${n}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image${n}.${ext}"/>`,
          );
          // Standard DrawingML inline picture; no external relationship or executable object.
          const cx = image.width * 12700,
            cy = image.height * 12700;
          return `<w:p><w:r><w:drawing><wp:inline><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${n}" name="image${n}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${n}" name="image${n}.${ext}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId${n}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>${p(block.caption)}`;
        }
        return p(block.text, block.kind === 'heading');
      })
      .join('');
    add(
      '[Content_Types].xml',
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/document.xml" ContentType="${docxMime}.main+xml"/></Types>`,
    );
    add(
      '_rels/.rels',
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    );
    add(
      'word/_rels/document.xml.rels',
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships.join('')}</Relationships>`,
    );
    add(
      'word/document.xml',
      `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>`,
    );
    bytes = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
    });
  } else {
    const font = resolve(
      __dirname,
      '../../../web/app/assets/be-vietnam-pro-3.ttf',
    );
    const doc = new PDFDocument({
      size: 'A4',
      margin: 48,
      font,
      info: {
        Title: input.title,
        Creator: 'Galaxy AI',
        CreationDate: new Date(0),
        ModDate: new Date(0),
      },
    });
    let pages = 1;
    doc.on('pageAdded', () => {
      if (++pages > 20) throw new AiError('DOCUMENT_LIMIT');
    });
    const parts: Buffer[] = [];
    const output = new Promise<Buffer>((resolve, reject) => {
      doc.on('data', (part: Buffer) => parts.push(part));
      doc.on('end', () => resolve(Buffer.concat(parts)));
      doc.on('error', reject);
    });
    try {
      for (const block of blocks) {
        if (block.kind === 'page_break') {
          doc.addPage();
          continue;
        }
        if (block.kind === 'image') {
          const image = imageFor(block.sourceId);
          if (doc.y > 480) doc.addPage();
          doc.image(image.bytes, 48, doc.y, { fit: [480, 240] });
          doc.moveDown(18);
          doc.fontSize(10).text(block.caption);
          continue;
        }
        if (block.kind === 'table') {
          doc.fontSize(11);
          doc.table({
            data: block.rows,
            columnStyles: Array.from(
              { length: Math.max(...block.rows.map((row) => row.length)) },
              () => ({
                width:
                  (doc.page.width - 96) /
                  Math.max(...block.rows.map((row) => row.length)),
              }),
            ),
          });
          doc.moveDown();
          continue;
        }
        doc
          .fontSize(block.kind === 'heading' ? 16 : 12)
          .text(block.text, { lineGap: 5 })
          .moveDown();
      }
      doc.end();
    } catch (error) {
      doc.destroy();
      throw error;
    }
    bytes = await output;
  }
  if (bytes.length > 8_000_000) throw new AiError('DOCUMENT_LIMIT');
  return {
    bytes,
    mime:
      input.format === 'docx'
        ? docxMime
        : input.format === 'xlsx'
          ? xlsxMime
          : 'application/pdf',
    text: documentPlainText(input),
  };
}
