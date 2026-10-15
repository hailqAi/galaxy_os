import { z } from 'zod';
import { Workbook } from 'exceljs';
import JSZip from 'jszip';
import PDFDocument from 'pdfkit';
import { decodeImage } from './ai-decoder-sandbox';
import { crc32, inflateSync } from 'node:zlib';
import { resolve } from 'node:path';
import { AiError } from './ai-registry';
import { docxMime } from '../files/office-document';
import { renderWorkbook, workbookInput } from './ai-workbook';
import {
  presentationInput,
  pptxMime,
  renderPresentation,
} from './ai-presentation';
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
    format: z.enum(['docx', 'pdf', 'xlsx', 'pptx']),
    version: z
      .union([z.literal(1), z.literal(2)])
      .nullable()
      .optional(),
    workbook: workbookInput.nullable().optional(),
    presentation: presentationInput.nullable().optional(),
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
              page: z
                .number()
                .int()
                .min(1)
                .max(2147483647)
                .nullable()
                .optional(),
              caption: text,
            })
            .strict(),
        ]),
      )
      .min(0)
      .max(60)
      .refine(
        (blocks) =>
          blocks.filter((block) => block.kind === 'image').length <= 3,
      ),
  })
  .strict()
  .refine((input) =>
    input.version === 2 && input.format === 'xlsx'
      ? Boolean(input.workbook) &&
        !input.presentation &&
        input.blocks.length === 0
      : input.version === 2 && input.format === 'pptx'
        ? Boolean(input.presentation) &&
          !input.workbook &&
          input.blocks.length === 0
        : input.format !== 'pptx' &&
          !input.workbook &&
          !input.presentation &&
          input.blocks.length > 0,
  );
export type DocumentInput = z.infer<typeof documentInput>;
type DocumentImage = {
  sourceId: string;
  page?: number | null;
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

function dimensions(image: Pick<DocumentImage, 'mime' | 'bytes'>) {
  const bytes = image.bytes;
  if (image.mime === 'image/png' && bytes.length >= 24)
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  let offset = 2,
    frame: { width: number; height: number } | undefined,
    quantization = false,
    huffman = false;
  while (offset + 9 < bytes.length) {
    if (bytes[offset++] !== 255) break;
    const marker = bytes[offset++]!,
      length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) break;
    if (marker === 0xdb) quantization = true;
    if (marker === 0xc4) huffman = true;
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      if (
        bytes[offset + 2] !== 8 ||
        ![1, 3, 4].includes(bytes[offset + 7]!) ||
        length !== 8 + 3 * bytes[offset + 7]!
      )
        break;
      frame = {
        width: bytes.readUInt16BE(offset + 5),
        height: bytes.readUInt16BE(offset + 3),
      };
    }
    if (marker === 0xda) {
      const components = bytes[offset + 2]!;
      if (
        !frame ||
        !quantization ||
        !huffman ||
        components < 1 ||
        components > 4 ||
        length !== 6 + 2 * components ||
        !bytes
          .subarray(offset + length, bytes.length - 2)
          .some((byte) => byte !== 255)
      )
        break;
      return frame;
    }
    offset += length;
  }
  throw new AiError('DOCUMENT_IMAGE_UNAVAILABLE');
}

export function validatedImageDimensions(
  image: Pick<DocumentImage, 'mime' | 'bytes'>,
) {
  const bytes = image.bytes;
  if (
    image.mime === 'image/png'
      ? bytes.length < 33 ||
        !bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) ||
        bytes.readUInt32BE(8) !== 13 ||
        bytes.toString('ascii', 12, 16) !== 'IHDR'
      : bytes.length < 4 ||
        bytes.readUInt16BE(0) !== 0xffd8 ||
        bytes.readUInt16BE(bytes.length - 2) !== 0xffd9
  )
    throw new AiError('DOCUMENT_IMAGE_UNAVAILABLE');
  // PNG pixels are decoded by PDFKit; bound the allocation before decoding.
  if (
    image.mime === 'image/png' &&
    (image.bytes.length < 24 ||
      image.bytes.readUInt32BE(16) * image.bytes.readUInt32BE(20) > 8_000_000)
  )
    throw new AiError('DOCUMENT_IMAGE_LIMIT');
  if (image.mime === 'image/png') {
    const depth = bytes[24]!,
      color = bytes[25]!,
      interlaced = bytes[28]!;
    const depths: Record<number, number[]> = {
      0: [1, 2, 4, 8, 16],
      2: [8, 16],
      3: [1, 2, 4, 8],
      4: [8, 16],
      6: [8, 16],
    };
    if (
      !depths[color]?.includes(depth) ||
      bytes[26] !== 0 ||
      bytes[27] !== 0 ||
      ![0, 1].includes(interlaced)
    )
      throw new AiError('DOCUMENT_IMAGE_UNAVAILABLE');
    const compressed: Buffer[] = [];
    let offset = 8;
    let ended = false;
    let palette = false;
    while (offset + 12 <= image.bytes.length) {
      const size = image.bytes.readUInt32BE(offset);
      if (offset + 12 + size > image.bytes.length)
        throw new AiError('DOCUMENT_IMAGE_UNAVAILABLE');
      const kind = bytes.toString('ascii', offset + 4, offset + 8);
      if (
        crc32(bytes.subarray(offset + 4, offset + 8 + size)) !==
        bytes.readUInt32BE(offset + 8 + size)
      )
        throw new AiError('DOCUMENT_IMAGE_UNAVAILABLE');
      if (kind === 'IHDR' && offset !== 8)
        throw new AiError('DOCUMENT_IMAGE_UNAVAILABLE');
      if (kind === 'PLTE') {
        if (!size || size > 768 || size % 3)
          throw new AiError('DOCUMENT_IMAGE_UNAVAILABLE');
        palette = true;
      }
      if (image.bytes.toString('ascii', offset + 4, offset + 8) === 'IDAT')
        compressed.push(image.bytes.subarray(offset + 8, offset + 8 + size));
      if (image.bytes.toString('ascii', offset + 4, offset + 8) === 'IEND') {
        if (size !== 0 || offset + 12 !== image.bytes.length)
          throw new AiError('DOCUMENT_IMAGE_UNAVAILABLE');
        ended = true;
      }
      offset += 12 + size;
    }
    if (!ended || !compressed.length || (color === 3 && !palette))
      throw new AiError('DOCUMENT_IMAGE_UNAVAILABLE');
    try {
      const decoded = inflateSync(Buffer.concat(compressed), {
        maxOutputLength: Math.min(
          64_000_000,
          image.bytes.readUInt32BE(16) * image.bytes.readUInt32BE(20) * 9 +
            1024,
        ),
      });
      const channels = (
        { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>
      )[color]!;
      const passes = interlaced
        ? [
            [0, 0, 8, 8],
            [4, 0, 8, 8],
            [0, 4, 4, 8],
            [2, 0, 4, 4],
            [0, 2, 2, 4],
            [1, 0, 2, 2],
            [0, 1, 1, 2],
          ]
        : [[0, 0, 1, 1]];
      let position = 0;
      for (const [x, y, dx, dy] of passes) {
        const columns = Math.max(
            0,
            Math.ceil((bytes.readUInt32BE(16) - x!) / dx!),
          ),
          rows = Math.max(0, Math.ceil((bytes.readUInt32BE(20) - y!) / dy!));
        if (!columns || !rows) continue;
        const rowBytes = 1 + Math.ceil((columns * channels * depth) / 8);
        for (let row = 0; row < rows; row++, position += rowBytes)
          if (position + rowBytes > decoded.length || decoded[position]! > 4)
            throw new AiError('DOCUMENT_IMAGE_UNAVAILABLE');
      }
      if (position !== decoded.length)
        throw new AiError('DOCUMENT_IMAGE_UNAVAILABLE');
    } catch {
      throw new AiError('DOCUMENT_IMAGE_LIMIT');
    }
  }
  const size = dimensions(image);
  if (!size.width || !size.height || size.width * size.height > 8_000_000)
    throw new AiError('DOCUMENT_IMAGE_LIMIT');
  return size;
}

export async function validateImage(
  image: Pick<DocumentImage, 'mime' | 'bytes'>,
  signal?: AbortSignal,
) {
  const size = validatedImageDimensions(image);
  try {
    await decodeImage(image.bytes, signal);
  } catch (error) {
    if (error instanceof AiError && error.code === 'DOCUMENT_DECODER_BUSY')
      throw error;
    throw new AiError(
      signal?.aborted ? 'REQUEST_CANCELLED' : 'DOCUMENT_IMAGE_UNAVAILABLE',
    );
  }
  return size;
}

export async function renderDocument(
  raw: unknown,
  images: DocumentImage[],
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const input = documentInput.parse(raw);
  if (
    // Reserve half the bounded 256 KB text transport for surrounding context.
    Buffer.byteLength(JSON.stringify(input)) > 128000 ||
    images.length > 3 ||
    images.reduce((sum, image) => sum + image.bytes.length, 0) > 5_000_000
  )
    throw new AiError('DOCUMENT_LIMIT');
  const sizes: { width: number; height: number }[] = [];
  for (const image of images) sizes.push(await validateImage(image, signal));
  const imageFor = (sourceId: string, page?: number | null) => {
    const image = images.find(
      (item) =>
        item.sourceId === sourceId && (item.page ?? null) === (page ?? null),
    );
    if (!image) throw new AiError('DOCUMENT_IMAGE_UNAVAILABLE');
    const size = sizes[images.indexOf(image)]!;
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
  let outputText = documentPlainText(input);
  if (input.format === 'pptx' && input.presentation) {
    const rendered = await renderPresentation(
      input.presentation,
      images.map((image) => imageFor(image.sourceId, image.page)),
      input.title,
    );
    bytes = rendered.bytes;
    outputText = rendered.text;
  } else if (input.format === 'xlsx') {
    if (input.version === 2 && input.workbook) {
      const rendered = await renderWorkbook(
        input.workbook,
        images.map((image) => imageFor(image.sourceId, image.page)),
        input.title,
      );
      bytes = rendered.bytes;
      outputText = rendered.text;
    } else {
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
          const image = imageFor(block.sourceId, block.page),
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
    }
    if (images.length) {
      // ExcelJS emits editAs on oneCellAnchor, where OOXML does not permit it.
      const zip = await JSZip.loadAsync(bytes);
      for (const name of Object.keys(zip.files).filter((path) =>
        /^xl\/drawings\/drawing\d+\.xml$/.test(path),
      )) {
        const drawing = zip.file(name)!;
        zip.file(
          name,
          (await drawing.async('string')).replaceAll(
            '<xdr:oneCellAnchor editAs="oneCell">',
            '<xdr:oneCellAnchor>',
          ),
        );
      }
      bytes = await zip.generateAsync({ type: 'nodebuffer' });
    }
  } else if (input.format === 'docx') {
    const zip = new JSZip();
    const date = new Date('2000-01-01T00:00:00Z');
    const add = (path: string, value: string | Buffer) =>
      zip.file(path, value, { date });
    const p = (value: string, heading = false) =>
      `<w:p>${heading ? '<w:pPr><w:pStyle w:val="Heading1"/><w:keepNext/></w:pPr>' : ''}<w:r><w:rPr><w:rFonts w:ascii="Be Vietnam Pro" w:hAnsi="Be Vietnam Pro"/>${heading ? '<w:b/>' : ''}<w:sz w:val="24"/></w:rPr><w:t xml:space="preserve">${escape(value).replaceAll('\n', '</w:t><w:br/><w:t xml:space="preserve">')}</w:t></w:r></w:p>`;
    let imageNumber = 0;
    const relationships: string[] = [
      '<Relationship Id="rStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>',
      '<Relationship Id="rHeader" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>',
      '<Relationship Id="rFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>',
    ];
    add(
      'word/header1.xml',
      `<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${p('BẢN NHÁP AI — CHƯA PHÊ DUYỆT')}</w:hdr>`,
    );
    add(
      'word/footer1.xml',
      `<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${p(input.title)}<w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:t xml:space="preserve">Trang </w:t></w:r><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>`,
    );
    add(
      'word/styles.xml',
      '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style></w:styles>',
    );
    const body = blocks
      .map((block) => {
        if (block.kind === 'page_break')
          return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
        if (block.kind === 'table') {
          const columns = Math.max(...block.rows.map((row) => row.length));
          const grid = Array.from(
            { length: columns },
            () => `<w:gridCol w:w="${Math.floor(9638 / columns)}"/>`,
          ).join('');
          return `<w:tbl><w:tblPr><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((side) => `<w:${side} w:val="single" w:sz="4"/>`).join('')}</w:tblBorders></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${block.rows.map((row) => `<w:tr>${row.map((cell) => `<w:tc>${p(cell)}</w:tc>`).join('')}</w:tr>`).join('')}</w:tbl>`;
        }
        if (block.kind === 'image') {
          const image = imageFor(block.sourceId, block.page),
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
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/document.xml" ContentType="${docxMime}.main+xml"/></Types>`,
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
      `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${body}<w:sectPr><w:headerReference w:type="default" r:id="rHeader"/><w:footerReference w:type="default" r:id="rFooter"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1134" w:bottom="1440" w:left="1134" w:header="360" w:footer="360"/></w:sectPr></w:body></w:document>`,
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
      bufferPages: true,
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
          const image = imageFor(block.sourceId, block.page);
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
      const range = doc.bufferedPageRange();
      for (let page = range.start; page < range.start + range.count; page++) {
        doc.switchToPage(page);
        doc
          .fontSize(9)
          .text('BẢN NHÁP AI — CHƯA PHÊ DUYỆT', 48, 18, { lineBreak: false });
        doc.text(
          `Trang ${page + 1} / ${range.count}`,
          48,
          doc.page.height - 32,
          { width: doc.page.width - 96, align: 'center', lineBreak: false },
        );
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
      input.format === 'pptx'
        ? pptxMime
        : input.format === 'docx'
          ? docxMime
          : input.format === 'xlsx'
            ? xlsxMime
            : 'application/pdf',
    text: outputText,
  };
}
