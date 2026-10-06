import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { dirname, extname, join } from 'node:path';
import { AiError } from './ai-registry';
import { chunks, extractText, SourceChunk, TextSource } from './ai-source';
import { validUploadHeader } from '../uploads/uploads.service';
import ExcelJS from 'exceljs';
import { assertBoundedWorkbook } from '../imports/imports.service';
import { docxMime, docxText } from '../files/office-document';

export const xlsxMime =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

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
          const line = `${sheet.name}!${cell.address}: ${formula && cell.result === undefined ? '[chưa có giá trị lưu sẵn]' : cell.text}${formula ? ` [công thức: ${cell.formula}; giá trị lưu sẵn; không tính lại]` : ''}${cell.numFmt ? ` [định dạng: ${cell.numFmt}]` : ''}`;
          size += Buffer.byteLength(line) + 1;
          if (size > 262_144) throw new AiError('INPUT_TOO_LARGE');
          lines.push(line);
        }),
      );
    return { status: 'READY', text: lines.join('\n') };
  }
  if (mime !== 'application/pdf') return extractText(name, mime, bytes);
  await nativeSource(source, name, mime, bytes, checksum);
  const text = await new Promise<string>((resolve, reject) => {
    const child = execFile(
      join(
        dirname(process.env.GALAXY_AI_PDFINFO ?? '/usr/bin/pdfinfo'),
        'pdftotext',
      ),
      ['-layout', '-enc', 'UTF-8', '-', '-'],
      {
        timeout: 5000,
        maxBuffer: 262144,
        env: {
          PATH: process.env.PATH,
          LANG: 'C',
          ...(process.env.GALAXY_AI_PDF_LIBRARY_PATH
            ? { LD_LIBRARY_PATH: process.env.GALAXY_AI_PDF_LIBRARY_PATH }
            : {}),
        },
      },
      (error, output) =>
        error ? reject(new AiError('PDF_TEXT_UNAVAILABLE')) : resolve(output),
    );
    child.stdin?.on('error', () => {});
    child.stdin?.end(bytes);
  });
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
) {
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
  if (mime === 'application/pdf') {
    const output = await new Promise<string>((resolve, reject) => {
      // Local parser only: bounded process/input/output, no URL and no shell.
      const child = execFile(
        process.env.GALAXY_AI_PDFINFO ?? '/usr/bin/pdfinfo',
        ['-'],
        {
          timeout: 5000,
          maxBuffer: 65536,
          env: {
            PATH: process.env.PATH,
            LANG: 'C',
            ...(process.env.GALAXY_AI_PDF_LIBRARY_PATH
              ? { LD_LIBRARY_PATH: process.env.GALAXY_AI_PDF_LIBRARY_PATH }
              : {}),
          },
        },
        (error, stdout) =>
          error
            ? reject(new AiError('PDF_VALIDATION_UNAVAILABLE'))
            : resolve(stdout),
      );
      child.stdin?.on('error', () => {});
      child.stdin?.end(bytes);
    });
    pages = Number(/^Pages:\s+(\d+)\s*$/m.exec(output)?.[1]);
    if (
      !/^Encrypted:\s+no\s*$/m.test(output) ||
      !/^JavaScript:\s+no\s*$/m.test(output)
    )
      throw new AiError('SOURCE_UNAVAILABLE');
    if (!Number.isInteger(pages) || pages < 1 || pages > 10)
      throw new AiError('PDF_PAGE_LIMIT');
  }
  const metadata: SourceChunk[] = [];
  for (let page = 1; page <= pages; page++) {
    const locator = chunks({
      ...source,
      text: `${name} · bản ${source.version} · trang ${page}. Nội dung gửi native; chưa trích text cục bộ.`,
    })[0]!;
    metadata.push({ ...locator, page });
  }
  return { chunks: metadata, pages };
}

export async function scanPages(
  source: TextSource,
  name: string,
  bytes: Buffer,
  checksum: string,
  signal?: AbortSignal,
) {
  const native = await nativeSource(
    source,
    name,
    'application/pdf',
    bytes,
    checksum,
  );
  const count = Math.min(native.pages, 3);
  const selected = native.chunks.slice(0, count).map((chunk) => ({
    ...chunk,
    text: `${name} · bản ${source.version} · trang ${chunk.page}. PDF scan: chỉ trang 1–${count}/${native.pages} được gửi ảnh để đọc; không khẳng định đã đọc các trang còn lại.`,
  }));
  const media: { handle: string; mime: string; bytes: Buffer }[] = [];
  let total = 0;
  for (const chunk of selected) {
    signal?.throwIfAborted();
    const image = await new Promise<Buffer>((resolve, reject) => {
      const child = execFile(
        join(
          dirname(process.env.GALAXY_AI_PDFINFO ?? '/usr/bin/pdfinfo'),
          'pdftoppm',
        ),
        [
          '-f',
          String(chunk.page),
          '-l',
          String(chunk.page),
          '-singlefile',
          '-scale-to',
          '1600',
          '-png',
          '-',
        ],
        {
          timeout: 5000,
          maxBuffer: 3_000_000,
          encoding: 'buffer',
          signal,
          env: {
            PATH: process.env.PATH,
            LANG: 'C',
            ...(process.env.GALAXY_AI_PDF_LIBRARY_PATH
              ? { LD_LIBRARY_PATH: process.env.GALAXY_AI_PDF_LIBRARY_PATH }
              : {}),
          },
        },
        (error, stdout) =>
          error
            ? reject(new AiError('PDF_RENDER_UNAVAILABLE'))
            : resolve(stdout),
      );
      child.stdin?.on('error', () => {});
      child.stdin?.end(bytes);
    });
    total += image.length;
    if (total > 8_000_000) throw new AiError('INPUT_TOO_LARGE');
    if (!validUploadHeader('.png', image))
      throw new AiError('PDF_RENDER_UNAVAILABLE');
    media.push({ handle: chunk.handle, mime: 'image/png', bytes: image });
  }
  return { pages: native.pages, chunks: selected, media };
}
