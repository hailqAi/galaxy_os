import { docxParts } from '../files/office-document';
import { existsSync } from 'node:fs';
import { expect, it } from 'vitest';
import {
  nativeSource,
  documentText,
  scanPages,
  analyzeTable,
  pdfTextFragment,
  cachedPdfPage,
} from './ai-native-source';
import { activationFixture } from './ai-activation';
import { createHash } from 'node:crypto';
import { chunks } from './ai-source';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import {
  docxFixture as docx,
  scanPdfFixture,
  textPdfFixture,
} from '../../test/document-fixtures';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
  'base64',
);

it('reuses all verified full PDF extraction pages without losing layout, values or Unicode', () => {
  const original = 'a'.repeat(64),
    id = '50000000-0000-4000-8000-000000000101';
  const version = '1:' + original;
  const pages = [
    '① product\n\nquantity 2   € 1,50\n',
    'x'.repeat(1700) + '\nfinal fact\n',
  ];
  const text = pages.join('\f') + '\f';
  const indexed = pages.flatMap((page, offset) =>
    chunks({
      organizationId: id,
      projectId: id,
      roomId: null,
      sourceId: id,
      version,
      text: page,
    }).map((chunk) => ({
      ...chunk,
      page: offset + 1,
      text:
        '[Phạm vi: trích lớp chữ PDF; nội dung nằm trong ảnh chưa được đọc.]\n' +
        chunk.text,
    })),
  );
  const index = {
    status: 'READY',
    version,
    text: text.normalize('NFKC'),
    checksum: createHash('sha256').update(text).digest('hex'),
    chunks: indexed,
  };
  for (const page of [1, 2])
    expect(cachedPdfPage(index, original, page)).toMatchObject({
      text: pages[page - 1],
      processingMetadata: { pagesTotal: 2, extractionReused: true },
    });
  expect(cachedPdfPage(index, 'b'.repeat(64), 1)).toBeUndefined();
  expect(
    cachedPdfPage({ ...index, checksum: 'b'.repeat(64) }, original, 1),
  ).toBeUndefined();
  expect(
    cachedPdfPage({ ...index, status: 'REVOKED' }, original, 1),
  ).toBeUndefined();
  expect(
    cachedPdfPage({ ...index, chunks: indexed.slice(1) }, original, 1),
  ).toBeUndefined();
});

it('continues a long PDF line to its final fact without repeating or splitting Unicode', () => {
  const text = '😀'.repeat(9500) + ' DISTINCTIVE-LAST-FACT\nfinal row\n';
  let offset = 0;
  const fragments: string[] = [];
  while (offset < text.length) {
    const fragment = pdfTextFragment(text, 1, offset);
    expect(fragment.offset).toBe(offset);
    expect(fragment.endOffset).toBeGreaterThan(offset);
    expect(fragment.totalLength).toBe(text.length);
    expect(
      Buffer.byteLength(JSON.stringify(fragment.text)),
    ).toBeLessThanOrEqual(16000);
    expect(fragment.text).not.toMatch(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/);
    fragments.push(fragment.text);
    offset = fragment.endOffset;
  }
  expect(fragments.length).toBeGreaterThan(2);
  expect(fragments.join('')).toBe(text);
  expect(fragments.at(-1)).toContain('DISTINCTIVE-LAST-FACT');
  expect(() => pdfTextFragment(text, 1, 1)).toThrow('PDF_CURSOR_INVALID');
  expect(() => pdfTextFragment(text, 1, text.length + 1)).toThrow(
    'PDF_CURSOR_INVALID',
  );
});
const source = {
  organizationId: 'o',
  projectId: 'p',
  roomId: 'r',
  sourceId: 'file',
  version: '1',
  text: '',
};
const docxMime =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
it('validates a bounded PDF original without allocating metadata for every page', async () => {
  const bytes = await textPdfFixture(20);
  const checksum = createHash('sha256').update(bytes).digest('hex');
  const original = await nativeSource(
    source,
    'pages.pdf',
    'application/pdf',
    bytes,
    checksum,
    undefined,
    true,
  );
  expect(original.pages).toBe(20);
  expect(original.chunks).toHaveLength(1);
  expect(original.chunks[0]!.page).toBeUndefined();
  expect(original.chunks[0]!.text).toContain('20');
  expect(original.chunks[0]!.text).toContain('chưa');
  await expect(
    nativeSource(source, 'pages.pdf', 'application/pdf', bytes, checksum),
  ).rejects.toThrow('PDF_PAGE_LIMIT');
  await expect(
    nativeSource(
      source,
      'pages.pdf',
      'application/pdf',
      bytes,
      'b'.repeat(64),
      undefined,
      true,
    ),
  ).rejects.toThrow('SOURCE_UNAVAILABLE');
});
it('reads exactly a requested PDF page beyond ten and reports text-only partial coverage', async () => {
  const work = await mkdtemp(join(tmpdir(), 'galaxy-pdf-page-'));
  try {
    const path = join(work, 'pages.pdf');
    await writeFile(path, await textPdfFixture(16));
    const { pdfFileText } = await import('./ai-native-source');
    const result = await pdfFileText(source, 'pages.pdf', path, 11);
    expect(result.text).toContain('PAGE-11');
    expect(result.text).not.toContain('PAGE-10');
    expect(result.text).not.toContain('PAGE-12');
    expect(result.processingMetadata).toMatchObject({
      parserVersion: 'pdf-page-v1',
      pagesTotal: 16,
      page: 11,
      scope: 'PDF_TEXT_ONLY',
      coverage: 'PARTIAL',
      originalSent: false,
    });
    expect(result.chunks.every((chunk) => chunk.page === 11)).toBe(true);
    await expect(pdfFileText(source, 'pages.pdf', path, 17)).rejects.toThrow(
      'INVALID_PAGE',
    );
    const scanned = join(work, 'scan.pdf');
    await writeFile(scanned, scanPdfFixture(16));
    const rendered = await scanPages(
      source,
      'scan.pdf',
      scanned,
      'a'.repeat(64),
      undefined,
      11,
    );
    expect(rendered.pages).toBe(16);
    expect(rendered.chunks).toHaveLength(1);
    expect(rendered.chunks[0]!.page).toBe(11);
    expect(rendered.chunks[0]!.text).toContain('11/16');
    expect(rendered.media[0]!.bytes.subarray(1, 4).toString()).toBe('PNG');
    expect(await pdfFileText(source, 'scan.pdf', scanned, 11)).toMatchObject({
      status: 'UNSUPPORTED',
      errorCode: 'PDF_SCAN_REQUIRES_VISION',
      processingMetadata: { coverage: 'NOT_READ', page: 11, pagesTotal: 16 },
    });
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});
it('rejects zero PNG bit depth and a JPEG frame without scan data before egress', async () => {
  const noDepth = Buffer.from(png);
  noDepth[24] = 0;
  noDepth.writeUInt32BE(
    (await import('node:zlib')).crc32(noDepth.subarray(12, 29)),
    29,
  );
  const noScan = Buffer.from(
    'ffd8ffc00011080001000103011100021100031100ffd9',
    'hex',
  );
  for (const [name, mime, bytes] of [
    ['Bad.png', 'image/png', noDepth],
    ['Bad.jpg', 'image/jpeg', noScan],
  ] as const)
    await expect(
      nativeSource(
        source,
        name,
        mime,
        bytes,
        createHash('sha256').update(bytes).digest('hex'),
      ),
    ).rejects.toThrow();
});
it('decodes valid bounded JPEG pixels and rejects structurally plausible corrupt scan data', async () => {
  const sharp = (await import('sharp')).default;
  const bytes = await sharp({
    create: {
      width: 2,
      height: 2,
      channels: 3,
      background: { r: 0, g: 0, b: 255 },
    },
  })
    .jpeg()
    .toBuffer();
  expect(
    await nativeSource(
      source,
      'Blue.jpg',
      'image/jpeg',
      bytes,
      createHash('sha256').update(bytes).digest('hex'),
    ),
  ).toHaveProperty('chunks');
  const corrupt = Buffer.from(
    'ffd8ffdb0002ffc40002ffc00011080001000103011100021100031100ffda000c03010002000300003f0000ffd9',
    'hex',
  );
  await expect(
    nativeSource(
      source,
      'Bad.jpg',
      'image/jpeg',
      corrupt,
      createHash('sha256').update(corrupt).digest('hex'),
    ),
  ).rejects.toThrow();
});
it('đọc DOCX với đề mục, đoạn, bảng và nguồn ảnh; không giả đã đọc ảnh nhúng', async () => {
  const bytes = await docx();
  const result = await documentText(
    source,
    'Dieu-khoan.docx',
    docxMime,
    bytes,
    createHash('sha256').update(bytes).digest('hex'),
  );
  expect(result.status).toBe('READY');
  expect(result.text).toContain('[Đề mục Heading1] Điều khoản');
  expect(result.text).toContain('Bên A & B giữ bản gốc.');
  expect(result.text).toContain('[Bảng 1 · hàng 1 · ô 2] DOC-842');
  expect(result.text).toContain('word/media/image1.png');
  expect(result.text).toContain('chưa đọc nội dung ảnh');
});
it('DOCX chặn macro, DTD, embedded executable và ZIP nở lớn trước đọc', async () => {
  const cases: Record<string, string | Buffer>[] = [
    { 'word/vbaProject.bin': Buffer.from('macro') },
    { 'word/embeddings/object.exe': Buffer.from('MZ') },
    {
      'word/document.xml':
        '<!DOCTYPE x [<!ENTITY secret SYSTEM "file:///etc/passwd">]><x>&secret;</x>',
    },
    { 'word/media/bomb.png': Buffer.alloc(33 * 1024 * 1024, 65) },
  ];
  for (const parts of cases) {
    const bytes = await docx(parts);
    await expect(
      documentText(
        source,
        'Tai-lieu.docx',
        docxMime,
        bytes,
        createHash('sha256').update(bytes).digest('hex'),
      ),
    ).rejects.toThrow();
  }
});
it('DOCX ảnh liên kết ngoài chỉ ghi chưa đọc; không lấy URL ngoài', async () => {
  const bytes = await docx({
    'word/_rels/document.xml.rels':
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="http://169.254.169.254/secret" TargetMode="External"/></Relationships>',
  });
  const result = await documentText(
    source,
    'Lien-ket.docx',
    docxMime,
    bytes,
    createHash('sha256').update(bytes).digest('hex'),
  );
  expect(result.status).toBe('READY');
  expect(result.text).toContain('Ảnh liên kết ngoài — chưa đọc');
  expect(result.text).not.toContain('169.254');
});
it('đọc XLSX bằng parser hiện hữu, giữ sheet/cell và giá trị lưu sẵn, không tính công thức', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Vật liệu');
  sheet.getCell('A1').value = 'VT-X928';
  workbook.addWorksheet('Sheet 2').getCell('A1').value = '0007392';
  sheet.getCell('B2').value = { formula: '21*2', result: 42 };
  sheet.getCell('C2').value = { formula: '1+1' };
  sheet.getCell('D2').value = { formula: '1/0', result: { error: '#DIV/0!' } };
  sheet.getCell('E2').value = { formula: '0*1', result: 0 };
  sheet.getCell('B2').numFmt = '#,##0 "₫"';
  const bytes = Buffer.from(await workbook.xlsx.writeBuffer());
  const result = await documentText(
    source,
    'Vat-lieu.xlsx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    bytes,
    createHash('sha256').update(bytes).digest('hex'),
  );
  expect(result).toMatchObject({ status: 'READY' });
  expect(result.text).toContain('Vật liệu!A1: VT-X928');
  expect(result.text).toContain(
    'Vật liệu!B2: 42 [công thức: 21*2; giá trị lưu sẵn; không tính lại]',
  );
  expect(result.text).toContain('C2: [chưa có giá trị lưu sẵn]');
  expect(result.text).toContain('định dạng: #,##0');
  expect(result.text).toContain('Sheet 2!A1: 0007392');
  expect(result.text).toContain('D2: #DIV/0!');
  expect(result.text).not.toContain('[object Object]');
  expect(result.text).toContain('E2: 0');
  const range = await analyzeTable(bytes, 'Vật liệu', 'B2:E2');
  expect(range.cells.map((cell) => cell.value)).toEqual([
    '42',
    null,
    '#DIV/0!',
    '0',
  ]);
  expect(range.cells.every((cell) => cell.recalculated === false)).toBe(true);
  expect(range.numericGroups).toEqual([
    expect.objectContaining({ format: '#,##0 "₫"', count: 1, sum: '42' }),
    expect.objectContaining({ format: 'General', count: 1, sum: '0' }),
  ]);
});

it('rejects signature-only, malformed and excessive-size images before native media egress', async () => {
  const zero = Buffer.from(png);
  zero.writeUInt32BE(0, 16);
  const huge = Buffer.from(png);
  huge.writeUInt32BE(9000000, 16);
  const malformed = Buffer.from(png);
  malformed.write('XXXX', 12, 'ascii');
  for (const bytes of [
    png.subarray(0, 8),
    png.subarray(0, 24),
    zero,
    huge,
    malformed,
  ]) {
    await expect(
      nativeSource(
        source,
        'invalid.png',
        'image/png',
        bytes,
        createHash('sha256').update(bytes).digest('hex'),
      ),
    ).rejects.toThrow();
  }
});
it('đọc PDF text cục bộ với locator trang và MD UTF-8, không gọi vendor', async () => {
  const pdf = activationFixture('pdf').media[0]!.bytes;
  const result = await documentText(
    source,
    'Kiem-chung-AI.pdf',
    'application/pdf',
    pdf,
    createHash('sha256').update(pdf).digest('hex'),
  );
  expect(result.status).toBe('READY');
  expect(result.text).toContain('625');
  expect(result.chunks?.[0]).toMatchObject({ page: 1, version: '1' });
  const md = Buffer.from('# Nội dung thật\nMã A-431');
  expect(
    await documentText(
      source,
      'ghi-chu.md',
      'text/plain',
      md,
      createHash('sha256').update(md).digest('hex'),
    ),
  ).toMatchObject({ status: 'READY', text: md.toString() });
});
it('keeps original version and locator for verified image bytes and rejects mismatch', async () => {
  const checksum = createHash('sha256').update(png).digest('hex');
  const result = await nativeSource(
    source,
    'sample.png',
    'image/png',
    png,
    checksum,
  );
  expect(result.chunks[0]).toMatchObject({
    version: '1',
    sourceId: 'file',
    page: 1,
  });
  expect(result.chunks[0]!.text).toContain('Chỉ metadata');
  expect(result.chunks[0]!.text).not.toContain('Nội dung gửi native');
  await expect(
    nativeSource(source, 'sample.png', 'image/png', png, 'wrong'),
  ).rejects.toThrow('SOURCE_UNAVAILABLE');
  await expect(
    nativeSource(
      source,
      'sample.png',
      'image/png',
      Buffer.from('not an image'),
      'wrong',
    ),
  ).rejects.toThrow();
  await expect(
    nativeSource(
      source,
      'backup.pdf',
      'application/pdf',
      Buffer.from('%PDF-1.7'),
      'wrong',
    ),
  ).rejects.toThrow();
});
it('requires a real PDF parser; never counts pages with a guessed regular expression', async () => {
  await expect(
    nativeSource(
      source,
      'sample.pdf',
      'application/pdf',
      Buffer.from('%PDF-1.7\nwrong'),
      createHash('sha256').update('%PDF-1.7\nwrong').digest('hex'),
    ),
  ).rejects.toThrow();
});

it.skipIf(!existsSync(process.env.GALAXY_AI_PDFINFO ?? '/usr/bin/pdfinfo'))(
  'validates a real one-page PDF and pins page/version locators',
  async () => {
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R >>',
      '<< /Length 0 >>\nstream\n\nendstream',
    ];
    let document = '%PDF-1.4\n';
    const offsets = [0];
    for (const [i, object] of objects.entries()) {
      offsets.push(Buffer.byteLength(document));
      document += `${i + 1} 0 obj\n${object}\nendobj\n`;
    }
    const xref = Buffer.byteLength(document);
    document += `xref\n0 5\n0000000000 65535 f \n${offsets
      .slice(1)
      .map((n) => String(n).padStart(10, '0') + ' 00000 n ')
      .join(
        '\n',
      )}\ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    const bytes = Buffer.from(document);
    const result = await nativeSource(
      source,
      'fixture.pdf',
      'application/pdf',
      bytes,
      createHash('sha256').update(bytes).digest('hex'),
    );
    expect(result.pages).toBe(1);
    expect(result.chunks).toHaveLength(1);
    expect(result.chunks[0]).toMatchObject({
      page: 1,
      version: '1',
      sourceId: 'file',
    });
  },
);

it('PDF scan render PNG cục bộ, giữ locator và giới hạn 3 trang đầu rõ ràng', async () => {
  const bytes = scanPdfFixture(4);
  const checksum = createHash('sha256').update(bytes).digest('hex');
  expect(
    await documentText(source, 'Scan.pdf', 'application/pdf', bytes, checksum),
  ).toMatchObject({
    status: 'UNSUPPORTED',
    errorCode: 'PDF_SCAN_REQUIRES_VISION',
  });
  const rendered = await scanPages(source, 'Scan.pdf', bytes, checksum);
  expect(rendered.pages).toBe(4);
  expect(rendered.media).toHaveLength(3);
  expect(rendered.chunks.map((c) => c.page)).toEqual([1, 2, 3]);
  expect(rendered.chunks[0]?.text).toContain('chỉ trang 1–3/4');
  for (const page of rendered.media) {
    expect(page.mime).toBe('image/png');
    expect(page.bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(rendered.chunks.some((c) => c.handle === page.handle)).toBe(true);
  }
  await expect(scanPages(source, 'Scan.pdf', bytes, 'wrong')).rejects.toThrow(
    'SOURCE_UNAVAILABLE',
  );
});

it('DOCX theo root relationship thật, XML lỗi trả lỗi input và nhận locator ảnh VML', async () => {
  const decoy = await docx({
    '_rels/.rels':
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/actual.xml"/></Relationships>',
  });
  expect(() => docxParts(decoy)).toThrow();
  const invalid = await docx({ '[Content_Types].xml': '<Types>' });
  try {
    docxParts(invalid);
    expect.fail('must reject');
  } catch (error) {
    expect((error as { getStatus?: () => number }).getStatus?.()).toBe(400);
  }
  const bytes = await docx({
    'word/document.xml':
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body><w:p><w:r><w:pict><v:imagedata r:id="rId1"/></w:pict></w:r></w:p></w:body></w:document>',
  });
  const result = await documentText(
    source,
    'VM.docx',
    docxMime,
    bytes,
    createHash('sha256').update(bytes).digest('hex'),
  );
  expect(result.text).toContain('word/media/image1.png');
});

it('đọc riêng trang PDF được yêu cầu giữ đúng locator, không tự đọc hết', async () => {
  const bytes = scanPdfFixture(4),
    checksum = createHash('sha256').update(bytes).digest('hex');
  const result = await scanPages(
    source,
    'Trang.pdf',
    bytes,
    checksum,
    undefined,
    4,
  );
  expect(result.chunks.map((chunk) => chunk.page)).toEqual([4]);
  expect(result.media).toHaveLength(1);
  expect(result.chunks[0]?.text).toContain('chỉ trang 4/4');
  await expect(
    scanPages(source, 'Trang.pdf', bytes, checksum, undefined, 5),
  ).rejects.toThrow('INVALID_PAGE');
});

it('phân tích vùng XLSX dùng cached value, giữ công thức/tiền tệ và phân biệt ô thiếu', async () => {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook(),
    sheet = workbook.addWorksheet('Dự toán');
  sheet.getCell('A1').value = 0.1;
  sheet.getCell('A2').value = 0.2;
  sheet.getCell('A3').value = { formula: 'SUM(A1:A2)', result: 0.3 };
  sheet.getCell('B1').value = { formula: 'NOW()' };
  sheet.getCell('C1').value = 200;
  sheet.getCell('C1').numFmt = '#,##0.00 "VND"';
  const bytes = Buffer.from(await workbook.xlsx.writeBuffer());
  const { analyzeTable } = await import('./ai-native-source');
  const result = await analyzeTable(bytes, 'Dự toán', 'A1:C3');
  expect(result.cells.find((cell) => cell.address === 'A3')).toMatchObject({
    formula: 'SUM(A1:A2)',
    value: '0.3',
    recalculated: false,
  });
  expect(result.cells.find((cell) => cell.address === 'B1')).toMatchObject({
    value: null,
    recalculated: false,
  });
  expect(
    result.numericGroups.find((group) => group.format === 'General')?.sum,
  ).toBe('0.6');
  expect(
    result.numericGroups.find((group) => group.format.includes('VND'))?.sum,
  ).toBe('200');
  await expect(analyzeTable(bytes, 'Dự toán', 'A1:ZZ9999')).rejects.toThrow(
    'TABLE_RANGE_LIMIT',
  );
});
