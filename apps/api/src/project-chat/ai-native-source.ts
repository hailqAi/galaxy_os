import { createHash } from 'node:crypto';
import { extname } from 'node:path';
import { AiError } from './ai-registry';
import { chunks, extractText, SourceChunk, TextSource } from './ai-source';
import { validUploadHeader } from '../uploads/uploads.service';
import ExcelJS from 'exceljs';
import { Prisma } from '@prisma/client';
import { ToolDecimal } from './ai-tools';
import { assertBoundedWorkbook } from '../imports/imports.service';
import { docxMime, docxText } from '../files/office-document';
import { pptxMime, pptxText } from '../files/office-presentation';
import { validateImage } from './ai-document';
import { pdfProcess, xlsxProcess } from './ai-decoder-sandbox';
import { z } from 'zod';

export const xlsxMime =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function pdfTextFragment(text: string, startLine = 1, cursor?: number) {
  let offset = cursor ?? 0;
  if (cursor === undefined) {
    for (let line = 1; line < startLine; line++) {
      const newline = text.indexOf('\n', offset);
      if (newline < 0) throw new AiError('SOURCE_TEXT_UNAVAILABLE');
      offset = newline + 1;
    }
  }
  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset >= text.length ||
    /[\uDC00-\uDFFF]/.test(text[offset]!)
  )
    throw new AiError('PDF_CURSOR_INVALID');
  let end = Math.min(text.length, offset + 9600);
  if (offset === 0 && Buffer.byteLength(JSON.stringify(text)) <= 16000)
    end = text.length;
  if (Buffer.byteLength(JSON.stringify(text.slice(offset, end))) > 16000) {
    let low = offset,
      high = end;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (
        Buffer.byteLength(JSON.stringify(text.slice(offset, middle))) <= 16000
      )
        low = middle;
      else high = middle - 1;
    }
    end = low;
  }
  if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1]!)) end--;
  if (end <= offset) throw new AiError('PDF_CURSOR_INVALID');
  const before = text.slice(0, offset).split('\n');
  return {
    text: text.slice(offset, end),
    startLine: before.length,
    startColumn: before.at(-1)!.length + 1,
    offset,
    endOffset: end,
    totalLength: text.length,
    pageChecksum: createHash('sha256').update(text).digest('hex'),
  };
}

async function pdfPages(input: Buffer | string, signal?: AbortSignal) {
  const output = (
    await pdfProcess(
      'pdfinfo',
      [typeof input === 'string' ? '/input/source.pdf' : '-'],
      input,
      65536,
      'PDF_VALIDATION_UNAVAILABLE',
      signal,
    )
  ).toString('utf8');
  const pages = Number(/^Pages:\s+(\d+)\s*$/m.exec(output)?.[1]);
  if (
    !/^Encrypted:\s+no\s*$/m.test(output) ||
    !/^JavaScript:\s+no\s*$/m.test(output)
  )
    throw new AiError('SOURCE_UNAVAILABLE');
  if (!Number.isInteger(pages) || pages < 1 || pages > 2_147_483_647)
    throw new AiError('PDF_PAGE_LIMIT');
  return pages;
}

export function cachedPdfPage(
  index: {
    status: string;
    version: string;
    text: string;
    checksum: string | null;
    chunks: unknown;
  },
  originalChecksum: string,
  page: number,
) {
  if (
    index.status !== 'READY' ||
    !index.version.endsWith(':' + originalChecksum)
  )
    return;
  const parsed = z
    .array(
      z.object({
        organizationId: z.string().uuid(),
        projectId: z.string().uuid(),
        roomId: z.string().uuid().nullable(),
        sourceId: z.string().uuid(),
        version: z.string(),
        page: z.number().int().positive(),
        handle: z.string(),
        checksum: z.string().regex(/^[a-f0-9]{64}$/),
        text: z.string(),
        startLine: z.number().int().positive(),
        endLine: z.number().int().positive(),
        startColumn: z.number().int().positive(),
      }),
    )
    .safeParse(index.chunks);
  if (!parsed.success || !index.text.endsWith('\f')) return;
  const pagesTotal = index.text.split('\f').length - 1;
  if (page < 1 || page > pagesTotal) throw new AiError('INVALID_PAGE');
  const pages: string[] = [];
  const prefix =
    '[Phạm vi: trích lớp chữ PDF; nội dung nằm trong ảnh chưa được đọc.]\n';
  for (let current = 1; current <= pagesTotal; current++) {
    const parts = parsed.data.filter(
      (chunk) => chunk.page === current && chunk.version === index.version,
    );
    if (
      !parts.length ||
      new Set(parts.map((chunk) => chunk.checksum)).size !== 1
    )
      return;
    const lines: string[] = Array.from(
      { length: Math.max(...parts.map((chunk) => chunk.endLine)) },
      () => '',
    );
    for (const part of parts) {
      const text = part.text.startsWith(prefix)
        ? part.text.slice(prefix.length)
        : part.text;
      const values = text.split('\n');
      if (values.length !== part.endLine - part.startLine + 1) return;
      for (const [offset, value] of values.entries()) {
        const line = part.startLine - 1 + offset;
        const column = offset ? 0 : part.startColumn - 1;
        if (lines[line]!.length > column) return;
        lines[line] = lines[line]!.padEnd(column, ' ') + value;
      }
    }
    const text = lines.join('\n');
    if (createHash('sha256').update(text).digest('hex') !== parts[0]!.checksum)
      return;
    pages.push(text);
  }
  const full = pages.join('\f') + '\f';
  if (
    full.normalize('NFKC') !== index.text ||
    createHash('sha256').update(full).digest('hex') !== index.checksum
  )
    return;
  const text = pages[page - 1]!;
  return {
    text,
    chunks: parsed.data
      .filter((chunk) => chunk.page === page)
      .map((chunk) => ({
        ...chunk,
        text: chunk.text.startsWith(prefix)
          ? chunk.text.slice(prefix.length)
          : chunk.text,
      })),
    processingMetadata: {
      parserVersion: 'pdf-page-v1',
      scope: 'PDF_TEXT_ONLY',
      pagesTotal,
      page,
      coverage: 'PARTIAL',
      originalSent: false,
      extractedPages: [page],
      imagePages: [],
      extractionReused: true,
    },
  };
}

export async function pdfFileText(
  source: TextSource,
  name: string,
  path: string,
  page = 1,
  signal?: AbortSignal,
) {
  if (
    !/\.pdf$/i.test(name) ||
    extractText(name, 'application/pdf', new Uint8Array()).status ===
      'FORBIDDEN'
  )
    throw new AiError('SOURCE_UNAVAILABLE');
  const pages = await pdfPages(path, signal);
  if (!Number.isInteger(page) || page < 1 || page > pages)
    throw new AiError('INVALID_PAGE');
  const text = (
    await pdfProcess(
      'pdftotext',
      [
        '-f',
        String(page),
        '-l',
        String(page),
        '-layout',
        '-enc',
        'UTF-8',
        '/input/source.pdf',
        '-',
      ],
      path,
      262144,
      'PDF_TEXT_UNAVAILABLE',
      signal,
    )
  )
    .toString('utf8')
    .replace(/\f$/, '');
  const processingMetadata = {
    parserVersion: 'pdf-page-v1',
    scope: 'PDF_TEXT_ONLY',
    pagesTotal: pages,
    page,
    coverage: text.trim() ? 'PARTIAL' : 'NOT_READ',
    originalSent: false,
    extractedPages: text.trim() ? [page] : [],
    imagePages: [],
  };
  const indexed = chunks({ ...source, text }).map((chunk) => ({
    ...chunk,
    page,
    handle:
      'S_' +
      createHash('sha256')
        .update(`${chunk.handle}:page:${page}`)
        .digest('hex')
        .slice(0, 24),
  }));
  return {
    status: text.trim() ? 'READY' : 'UNSUPPORTED',
    text,
    chunks: indexed,
    processingMetadata,
    ...(text.trim() ? {} : { errorCode: 'PDF_SCAN_REQUIRES_VISION' }),
  };
}

function cellValueText(cell: ExcelJS.Cell) {
  const raw =
    cell.type === ExcelJS.ValueType.Formula ? cell.result : cell.value;
  return raw === undefined || raw === null
    ? null
    : raw instanceof Date
      ? raw.toISOString()
      : typeof raw === 'object'
        ? 'error' in raw
          ? raw.error
          : cell.text
        : String(raw);
}

export async function documentText(
  source: TextSource,
  name: string,
  mime: string,
  bytes: Buffer,
  checksum: string,
): Promise<{
  status: string;
  text?: string;
  chunks?: SourceChunk[];
  errorCode?: string;
}> {
  if (createHash('sha256').update(bytes).digest('hex') !== checksum)
    throw new AiError('SOURCE_UNAVAILABLE');
  if (mime === docxMime) {
    if (!/\.docx$/i.test(name)) throw new AiError('UNSUPPORTED_FILE');
    return { status: 'READY', text: docxText(bytes) };
  }
  if (mime === pptxMime) {
    if (!/\.pptx$/i.test(name)) throw new AiError('UNSUPPORTED_FILE');
    return { status: 'READY', text: pptxText(bytes) };
  }
  if (mime === xlsxMime) {
    if (
      !/\.xlsx$/i.test(name) ||
      bytes.length > 5_000_000 ||
      !assertBoundedWorkbook(bytes)
    )
      throw new AiError('UNSUPPORTED_FILE');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes as never);
    const lines: string[] = [];
    let size = 0;
    for (const sheet of workbook.worksheets)
      sheet.eachRow((row) =>
        row.eachCell((cell) => {
          const formula = cell.type === ExcelJS.ValueType.Formula;
          const displayed = cellValueText(cell);
          const line = `${sheet.name}!${cell.address}: ${formula && displayed === null ? '[chưa có giá trị lưu sẵn]' : (displayed ?? '')}${formula ? ` [công thức: ${cell.formula}; giá trị lưu sẵn; không tính lại]` : ''}${cell.numFmt ? ` [định dạng: ${cell.numFmt}]` : ''}`;
          size += Buffer.byteLength(line) + 1;
          if (size > 262_144) throw new AiError('INPUT_TOO_LARGE');
          lines.push(line);
        }),
      );
    return { status: 'READY', text: lines.join('\n') };
  }
  if (mime !== 'application/pdf') return extractText(name, mime, bytes);
  await nativeSource(source, name, mime, bytes, checksum);
  const text = (
    await pdfProcess(
      'pdftotext',
      ['-layout', '-enc', 'UTF-8', '-', '-'],
      bytes,
      262144,
      'PDF_TEXT_UNAVAILABLE',
    )
  ).toString('utf8');
  if (!text.trim())
    return { status: 'UNSUPPORTED', errorCode: 'PDF_SCAN_REQUIRES_VISION' };
  const indexed = text.split('\f').flatMap((page, offset) =>
    chunks({ ...source, text: page }).map((chunk) => ({
      ...chunk,
      text:
        '[Phạm vi: trích lớp chữ PDF; nội dung nằm trong ảnh chưa được đọc.]\n' +
        chunk.text,
      page: offset + 1,
      handle:
        'S_' +
        createHash('sha256')
          .update(`${chunk.handle}:page:${offset + 1}`)
          .digest('hex')
          .slice(0, 24),
    })),
  );
  return { status: 'READY', text, chunks: indexed };
}

export async function nativeSource(
  source: TextSource,
  name: string,
  mime: string,
  bytes: Buffer,
  checksum: string,
  signal?: AbortSignal,
  originalOnly = false,
) {
  signal?.throwIfAborted();
  if (extractText(name, mime, new Uint8Array()).status === 'FORBIDDEN')
    throw new AiError('SOURCE_UNAVAILABLE');
  if (!bytes.length || bytes.length > 8_000_000)
    throw new AiError('INPUT_TOO_LARGE');
  if (createHash('sha256').update(bytes).digest('hex') !== checksum)
    throw new AiError('SOURCE_UNAVAILABLE');
  const extension = extname(name).toLowerCase();
  if (!['.png', '.jpg', '.jpeg', '.pdf'].includes(extension))
    throw new AiError('UNSUPPORTED_FILE');
  const expected =
    extension === '.pdf'
      ? 'application/pdf'
      : extension === '.png'
        ? 'image/png'
        : 'image/jpeg';
  if (
    mime !== expected ||
    !validUploadHeader(extension as '.pdf' | '.png' | '.jpg' | '.jpeg', bytes)
  )
    throw new AiError('SOURCE_UNAVAILABLE');
  let pages = 1;
  if (mime === 'image/png' || mime === 'image/jpeg')
    await validateImage({ mime, bytes }, signal);
  if (mime === 'application/pdf') {
    pages = await pdfPages(bytes, signal);
    if (originalOnly)
      return {
        pages,
        chunks: chunks({
          ...source,
          text: `${name} · bản ${source.version} · ${pages} trang. Chỉ metadata của PDF gốc; chưa xác minh model đọc mọi trang.`,
        }),
      };
    if (pages > 10) throw new AiError('PDF_PAGE_LIMIT');
  }
  const metadata: SourceChunk[] = [];
  for (let page = 1; page <= pages; page++) {
    const locator = chunks({
      ...source,
      text: `${name} · bản ${source.version} · trang ${page}. Chỉ metadata; chưa trích chữ hoặc phân tích nội dung.`,
    })[0]!;
    metadata.push({ ...locator, page });
  }
  return { chunks: metadata, pages };
}

export async function scanPages(
  source: TextSource,
  name: string,
  input: Buffer | string,
  checksum: string,
  signal?: AbortSignal,
  page?: number,
) {
  if (
    !/\.pdf$/i.test(name) ||
    extractText(name, 'application/pdf', new Uint8Array()).status ===
      'FORBIDDEN'
  )
    throw new AiError('SOURCE_UNAVAILABLE');
  if (Buffer.isBuffer(input)) {
    if (!input.length || input.length > 8_000_000)
      throw new AiError('INPUT_TOO_LARGE');
    if (
      createHash('sha256').update(input).digest('hex') !== checksum ||
      !validUploadHeader('.pdf', input)
    )
      throw new AiError('SOURCE_UNAVAILABLE');
  }
  const native = { pages: await pdfPages(input, signal) };
  if (
    page !== undefined &&
    (!Number.isInteger(page) || page < 1 || page > native.pages)
  )
    throw new AiError('INVALID_PAGE');
  const count = Math.min(native.pages, 3);
  const selected = (
    page === undefined ? Array.from({ length: count }, (_, i) => i + 1) : [page]
  ).map((number) => {
    const text = `${name} · bản ${source.version} · trang ${number}. PDF đọc dạng ảnh: chỉ trang ${page ?? `1–${count}`}/${native.pages} được gửi ảnh để đọc; không khẳng định đã đọc các trang còn lại.`;
    const chunk = chunks({ ...source, text })[0]!;
    return {
      ...chunk,
      page: number,
      handle:
        'S_' +
        createHash('sha256')
          .update(`${chunk.handle}:render-page:${number}`)
          .digest('hex')
          .slice(0, 24),
    };
  });
  const media: { handle: string; mime: string; bytes: Buffer }[] = [];
  let total = 0;
  for (const chunk of selected) {
    signal?.throwIfAborted();
    const image = await pdfProcess(
      'pdftoppm',
      [
        '-f',
        String(chunk.page),
        '-l',
        String(chunk.page),
        '-singlefile',
        '-scale-to',
        '1600',
        '-png',
        typeof input === 'string' ? '/input/source.pdf' : '-',
      ],
      input,
      3_000_000,
      'PDF_RENDER_UNAVAILABLE',
      signal,
    );
    total += image.length;
    if (total > 8_000_000) throw new AiError('INPUT_TOO_LARGE');
    if (!validUploadHeader('.png', image))
      throw new AiError('PDF_RENDER_UNAVAILABLE');
    media.push({ handle: chunk.handle, mime: 'image/png', bytes: image });
  }
  return { pages: native.pages, chunks: selected, media };
}

function tableLimits(range: string): [number, number, number, number] {
  const match = /^([A-Z]{1,3})([1-9]\d{0,6}):([A-Z]{1,3})([1-9]\d{0,6})$/.exec(
    range,
  );
  const column = (value: string) =>
    [...value].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
  if (!match) throw new AiError('TABLE_RANGE_LIMIT');
  const left = column(match[1]!),
    top = Number(match[2]),
    right = column(match[3]!),
    bottom = Number(match[4]);
  if (
    left > right ||
    top > bottom ||
    right > 16384 ||
    bottom > 1048576 ||
    (right - left + 1) * (bottom - top + 1) > 400
  )
    throw new AiError('TABLE_RANGE_LIMIT');
  return [left, top, right, bottom];
}

const fileWorkbook = z
  .object({
    sheets: z
      .array(
        z
          .object({
            name: z.string().min(1).max(100),
            rows: z.number().int().min(0).max(1048576),
            columns: z.number().int().min(0).max(16384),
            populatedRows: z.number().int().min(0).max(1048576),
          })
          .strict(),
      )
      .min(1)
      .max(100),
    cells: z
      .array(
        z
          .object({
            address: z.string().regex(/^[A-Z]{1,3}[1-9]\d{0,6}$/),
            value: z.string().max(16000).nullable(),
            formula: z.string().max(16000).nullable(),
            formulaSource: z
              .object({
                type: z.enum(['shared', 'array', 'dataTable']),
                sharedIndex: z
                  .string()
                  .regex(/^\d{1,10}$/)
                  .nullable(),
                range: z.string().max(32).nullable(),
              })
              .strict()
              .nullable(),
            format: z.string().max(2000),
            numeric: z.boolean(),
          })
          .strict(),
      )
      .max(400),
    date1904: z.boolean(),
  })
  .strict();

export async function xlsxFileManifest(path: string, signal?: AbortSignal) {
  const output = await xlsxProcess(path, null, signal);
  const result = fileWorkbook.parse(JSON.parse(output.toString('utf8')));
  if (result.cells.length) throw new AiError('WORKBOOK_READ_UNAVAILABLE');
  return {
    sheets: result.sheets,
    date1904: result.date1904,
    scope: 'XLSX_SHEET_MANIFEST_ONLY',
    cellsRead: 0,
    modelRead: 'UNKNOWN',
  };
}

export async function analyzeTableFile(
  path: string,
  sheetName: string,
  range: string,
  signal?: AbortSignal,
) {
  const limits = tableLimits(range);
  if (!sheetName.length || sheetName.length > 100)
    throw new AiError('SHEET_NOT_FOUND');
  const output = await xlsxProcess(path, { sheet: sheetName, limits }, signal);
  const raw = fileWorkbook.parse(JSON.parse(output.toString('utf8')));
  if (
    raw.sheets.length !== 1 ||
    raw.sheets[0]!.name !== sheetName ||
    raw.cells.length !==
      (limits[2] - limits[0] + 1) * (limits[3] - limits[1] + 1)
  )
    throw new AiError('WORKBOOK_READ_UNAVAILABLE');
  const numericGroups = new Map<
    string,
    {
      format: string;
      sum: Prisma.Decimal;
      count: number;
      lowestPower: number;
      highestPower: number;
    }
  >();
  const cells = raw.cells.map(({ numeric, formulaSource, ...cell }) => {
    if (numeric && cell.value !== null) {
      if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(cell.value))
        throw new AiError('WORKBOOK_READ_UNAVAILABLE');
      const value = new ToolDecimal(cell.value);
      if (
        !value.isFinite() ||
        value.sd() > 60 ||
        value.e < -1000 ||
        value.e > 1000
      )
        throw new AiError('CALCULATION_LIMIT');
      const group = numericGroups.get(cell.format) ?? {
        format: cell.format,
        sum: new ToolDecimal(0),
        count: 0,
        lowestPower: Infinity,
        highestPower: -Infinity,
      };
      if (!value.isZero()) {
        group.lowestPower = Math.min(
          group.lowestPower,
          value.e - value.sd() + 1,
        );
        group.highestPower = Math.max(group.highestPower, value.e);
        // Reserve carry digits for this bounded group before doing any arithmetic.
        if (
          group.highestPower -
            group.lowestPower +
            1 +
            Math.ceil(Math.log10(raw.cells.length)) >
          ToolDecimal.precision
        )
          throw new AiError('CALCULATION_LIMIT');
      }
      group.sum = group.sum.add(value);
      group.count++;
      numericGroups.set(cell.format, group);
    }
    return {
      ...cell,
      ...(formulaSource ? { formulaSource } : {}),
      recalculated: false as const,
    };
  });
  const result = {
    sheet: sheetName,
    range,
    cells,
    numericGroups: [...numericGroups.values()].map(
      ({ format, sum, count }) => ({
        format,
        sum: sum.toString(),
        count,
      }),
    ),
    missingCount: cells.filter((cell) => cell.value === null).length,
    date1904: raw.date1904,
    coverage:
      'Chỉ vùng ô yêu cầu; giữ giá trị XML, định dạng và hệ ngày gốc. formulaSource giữ loại và tham chiếu công thức shared/array/dataTable; formula=null không có nghĩa ô đó là giá trị literal, công thức tham chiếu chưa được resolve. Tổng các ô số có thể gồm cả ô tổng; không xác nhận tổng nghiệp vụ hoặc tính lại công thức.',
  };
  if (Buffer.byteLength(JSON.stringify(result)) > 32000)
    throw new AiError('TOOL_OUTPUT_TOO_LARGE');
  return result;
}

export async function analyzeTable(
  bytes: Buffer,
  sheetName: string,
  range: string,
) {
  const [left, top, right, bottom] = tableLimits(range);
  if (bytes.length > 5_000_000 || !assertBoundedWorkbook(bytes))
    throw new AiError('UNSUPPORTED_FILE');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as never);
  const sheet = workbook.getWorksheet(sheetName);
  if (!sheet) throw new AiError('SHEET_NOT_FOUND');
  const cells: {
    address: string;
    value: string | null;
    formula: string | null;
    format: string;
    recalculated: false;
  }[] = [];
  const numericGroups = new Map<
    string,
    { format: string; sum: Prisma.Decimal; count: number }
  >();
  for (let r = top; r <= bottom; r++)
    for (let c = left; c <= right; c++) {
      const cell = sheet.getCell(r, c),
        formula = cell.type === ExcelJS.ValueType.Formula;
      const raw = formula ? cell.result : cell.value;
      const format = cell.numFmt || 'General';
      const value = cellValueText(cell);
      cells.push({
        address: cell.address,
        value,
        formula: formula ? cell.formula : null,
        format,
        recalculated: false,
      });
      if (typeof raw === 'number' && Number.isFinite(raw)) {
        const group = numericGroups.get(format) ?? {
          format,
          sum: new ToolDecimal(0),
          count: 0,
        };
        group.sum = group.sum.add(String(raw));
        group.count++;
        numericGroups.set(format, group);
      }
    }
  const result = {
    sheet: sheetName,
    range,
    cells,
    numericGroups: [...numericGroups.values()].map((group) => ({
      ...group,
      sum: group.sum.toString(),
    })),
    missingCount: cells.filter((cell) => cell.value === null).length,
    coverage:
      'Chỉ vùng ô yêu cầu; tổng các ô số theo định dạng hiển thị, có thể gồm cả ô tổng. Không xác nhận tiền tệ hoặc tổng nghiệp vụ; không tính lại công thức.',
  };
  if (Buffer.byteLength(JSON.stringify(result)) > 32000)
    throw new AiError('TOOL_OUTPUT_TOO_LARGE');
  return result;
}
