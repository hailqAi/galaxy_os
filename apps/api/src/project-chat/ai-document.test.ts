import { expect, it } from 'vitest';
import { Workbook } from 'exceljs';
import { docxText } from '../files/office-document';
import { renderDocument } from './ai-document';

it('renders all 627 quotation table cells across bounded tables instead of rejecting the whole document', async () => {
  const { documentText } = await import('./ai-native-source');
  const { createHash } = await import('node:crypto');
  let cell = 0,
    row = 0;
  const rows = [7, 14, 12, 6, 10, 10, 6, 6, 4, 10, 11, 2, 8, 12];
  const blocks = rows.map((count) => ({
    kind: 'table',
    rows: Array.from({ length: count }, () =>
      Array.from({ length: ++row <= 37 ? 6 : 5 }, () => 'Q' + ++cell),
    ),
  }));
  expect(cell).toBe(627);
  const rendered = await renderDocument(
    { format: 'pdf', title: 'Complete quotation', blocks },
    [],
  );
  const parsed = await documentText(
    {
      organizationId: 'o',
      projectId: 'p',
      roomId: null,
      sourceId: 's',
      version: '1',
      text: '',
    },
    'quotation.pdf',
    'application/pdf',
    rendered.bytes,
    createHash('sha256').update(rendered.bytes).digest('hex'),
  );
  expect(parsed.status).toBe('READY');
  const found = new Set((parsed.text ?? '').match(/\bQ\d+\b/g));
  expect(found.size).toBe(627);
  expect(found.has('Q1')).toBe(true);
  expect(found.has('Q627')).toBe(true);
});

it('retains the document byte, table, block and image boundaries for complete reports', async () => {
  const raw = {
    format: 'docx',
    title: 'Bounded',
    blocks: Array.from({ length: 31 }, () => ({
      kind: 'paragraph',
      text: 'x'.repeat(4000),
    })),
  };
  expect(Buffer.byteLength(JSON.stringify(raw))).toBeLessThan(128000);
  expect((await renderDocument(raw, [])).bytes.length).toBeGreaterThan(0);
  await expect(
    renderDocument(
      { ...raw, blocks: [...raw.blocks, ...raw.blocks.slice(0, 2)] },
      [],
    ),
  ).rejects.toThrow('DOCUMENT_LIMIT');
  for (const blocks of [
    Array.from({ length: 61 }, () => ({ kind: 'paragraph', text: 'x' })),
    [{ kind: 'table', rows: Array.from({ length: 41 }, () => ['x']) }],
    [{ kind: 'table', rows: [Array(11).fill('x')] }],
  ])
    await expect(renderDocument({ ...raw, blocks }, [])).rejects.toThrow();
});

it('DOCX có grid đủ cột và thứ tự run properties hợp lệ theo OOXML', async () => {
  const file = await renderDocument(
    {
      format: 'docx',
      title: 'Báo giá nháp',
      blocks: [
        {
          kind: 'table',
          rows: [
            ['Mã', 'Giá'],
            ['0007392', '275001.10'],
          ],
        },
      ],
    },
    [],
  );
  const { docxParts } = await import('../files/office-document');
  const xml = docxParts(file.bytes).get('word/document.xml')!.toString();
  const table = xml.match(/<w:tbl>(.*?)<\/w:tbl>/s)![1]!;
  expect(table).toMatch(/<\/w:tblPr><w:tblGrid>.*?<\/w:tblGrid><w:tr>/s);
  expect(table.match(/<w:gridCol /g)).toHaveLength(2);
  const headingProperties = xml.match(/<w:rPr>(.*?)<\/w:rPr>/s)![1]!;
  expect(headingProperties).toMatch(/<w:b\/><w:sz /);
});

it('xuất DOCX/XLSX thật, giữ tiếng Việt/bảng và không chạy công thức từ chuỗi', async () => {
  const input = {
    title: 'Bản nháp kiểm chứng',
    blocks: [
      { kind: 'heading', text: 'Điều khoản tiếng Việt' },
      { kind: 'paragraph', text: 'Chưa phê duyệt và chưa phát hành.' },
      {
        kind: 'table',
        rows: [
          ['Mã', 'Giá'],
          ['=HYPERLINK("http://private")', '123456789012345678.90'],
        ],
      },
      { kind: 'page_break' },
      { kind: 'paragraph', text: 'Trang sau giữ nguyên nguồn.' },
    ],
  };
  const docx = await renderDocument({ ...input, format: 'docx' }, []);
  expect(docxText(docx.bytes)).toContain('Điều khoản tiếng Việt');
  expect(docxText(docx.bytes)).toContain('123456789012345678.90');
  const xlsx = await renderDocument({ ...input, format: 'xlsx' }, []);
  const book = new Workbook();
  await book.xlsx.load(xlsx.bytes as never);
  const values: string[] = [];
  book.eachSheet((sheet) =>
    sheet.eachRow((row) =>
      row.eachCell((cell) => {
        expect(cell.type).not.toBe(6);
        values.push(String(cell.value));
      }),
    ),
  );
  expect(values).toContain('=HYPERLINK("http://private")');
  expect(values).toContain('123456789012345678.90');
});
it('PDF thật có font tiếng Việt, ngắt trang và ảnh bytes riêng', async () => {
  const result = await renderDocument(
    {
      format: 'pdf',
      title: 'Bản nháp tiếng Việt',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Kiểm chứng: nghĩa vụ chưa được phê duyệt.',
        },
        { kind: 'page_break' },
        {
          kind: 'table',
          rows: [
            ['Hạng mục', 'Giá'],
            ['Vách', '123.45'],
          ],
        },
      ],
    },
    [],
  );
  expect(result.bytes.subarray(0, 4).toString()).toBe('%PDF');
  expect(result.bytes.length).toBeGreaterThan(10000);
});

it('diff giữ dòng trùng, giới hạn bytes và công bố cắt ngắn trước lưu file', async () => {
  const { documentDiff } = await import('./ai-document');
  expect(documentDiff('Nghĩa vụ\nNghĩa vụ', 'Nghĩa vụ').removed).toEqual([
    'Nghĩa vụ',
  ]);
  const result = documentDiff('á'.repeat(50000), 'Mới');
  expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThan(10000);
  expect(result.truncated).toBe(true);
});

it('ảnh nhúng giữ binary và nguồn, giới hạn cả số block lặp', async () => {
  const { activationFixture } = await import('./ai-activation');
  const bytes = activationFixture('image').media[0]!.bytes,
    sourceId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
  const input = {
    format: 'docx',
    title: 'Ảnh kiểm chứng',
    blocks: [{ kind: 'image', sourceId, caption: 'Nguồn ảnh được phép' }],
  };
  const file = await renderDocument(input, [
    { sourceId, mime: 'image/png', bytes },
  ]);
  const { docxParts } = await import('../files/office-document');
  expect(docxParts(file.bytes).get('word/media/image1.png')).toEqual(bytes);
  const xlsx = await renderDocument({ ...input, format: 'xlsx' }, [
    { sourceId, mime: 'image/png', bytes },
  ]);
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(xlsx.bytes);
  const drawing = await zip.file('xl/drawings/drawing1.xml')!.async('string');
  expect(drawing).toContain('<xdr:oneCellAnchor>');
  expect(drawing).not.toMatch(/<xdr:oneCellAnchor[^>]+editAs=/);
  expect(await zip.file('xl/media/image1.png')!.async('nodebuffer')).toEqual(
    bytes,
  );
  await expect(
    renderDocument({ ...input, blocks: Array(4).fill(input.blocks[0]) }, [
      { sourceId, mime: 'image/png', bytes },
    ]),
  ).rejects.toThrow();
  const pdf = await renderDocument({ ...input, format: 'pdf' }, [
    { sourceId, mime: 'image/png', bytes },
  ]);
  expect(pdf.bytes.subarray(0, 4).toString()).toBe('%PDF');
});
it('PDF xuất đọc lại tiếng Việt, bảng và trang qua Poppler thật', async () => {
  const { documentText } = await import('./ai-native-source');
  const { createHash } = await import('node:crypto');
  const file = await renderDocument(
    {
      format: 'pdf',
      title: 'Bản nháp tiếng Việt',
      blocks: [
        { kind: 'paragraph', text: 'Nghĩa vụ chưa phê duyệt.' },
        { kind: 'page_break' },
        {
          kind: 'table',
          rows: [
            ['Mã', 'Giá'],
            ['TV-7392', '123.45'],
          ],
        },
      ],
    },
    [],
  );
  const result = await documentText(
    {
      organizationId: 'o',
      projectId: 'p',
      roomId: null,
      sourceId: 's',
      version: '1',
      text: '',
    },
    'Nhanh.pdf',
    'application/pdf',
    file.bytes,
    createHash('sha256').update(file.bytes).digest('hex'),
  );
  expect(result.status).toBe('READY');
  expect(result.text).toContain('Nghĩa vụ chưa phê duyệt');
  expect(result.text).toContain('TV-7392');
  expect(result.chunks?.some((chunk) => chunk.page === 2)).toBe(true);
});
it('diff bound theo JSON escape của TXT không tin cậy', async () => {
  const { documentDiff } = await import('./ai-document');
  expect(
    Buffer.byteLength(
      JSON.stringify(documentDiff(String.fromCharCode(1).repeat(8000), 'Mới')),
    ),
  ).toBeLessThan(10000);
});

it('Word uses native DRAFT headers, page footers and real line breaks', async () => {
  const file = await renderDocument(
    {
      format: 'docx',
      title: 'Bản nháp có trang',
      blocks: [
        { kind: 'paragraph', text: 'Dòng một\nDòng hai' },
        { kind: 'page_break' },
        { kind: 'paragraph', text: 'Trang hai' },
      ],
    },
    [],
  );
  const { docxParts } = await import('../files/office-document');
  const parts = docxParts(file.bytes),
    main = parts.get('word/document.xml')!.toString();
  expect(main).toContain('w:headerReference');
  expect(main).toContain('w:footerReference');
  expect(main).toContain('<w:br/>');
  expect(parts.get('word/header1.xml')!.toString()).toContain('CHƯA PHÊ DUYỆT');
  expect(parts.get('word/footer1.xml')!.toString()).toContain('PAGE');
});

it('embeds the selected PDF page independently when two images share an original source', async () => {
  const { textPdfFixture } = await import('../../test/document-fixtures');
  const { scanPages, documentText } = await import('./ai-native-source');
  const { createHash } = await import('node:crypto');
  const { docxParts } = await import('../files/office-document');
  const { default: JSZip } = await import('jszip');
  const sourceId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
  const bytes = await textPdfFixture(2),
    checksum = createHash('sha256').update(bytes).digest('hex');
  const source = {
    organizationId: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
    projectId: 'cccccccc-cccc-4ccc-cccc-cccccccccccc',
    roomId: null,
    sourceId,
    version: '1:' + checksum,
    text: '',
  };
  const images = [];
  for (const page of [1, 2]) {
    const rendered = await scanPages(
      source,
      'pages.pdf',
      bytes,
      checksum,
      undefined,
      page,
    );
    images.push({
      sourceId,
      page,
      mime: 'image/png' as const,
      bytes: rendered.media[0]!.bytes,
    });
  }
  expect(images[0]!.bytes.equals(images[1]!.bytes)).toBe(false);
  const raw = {
    format: 'docx',
    title: 'Pages from an authorized original',
    blocks: [1, 2].map((page) => ({
      kind: 'image',
      sourceId,
      page,
      caption: 'PDF page ' + page,
    })),
  };
  const docx = await renderDocument(raw, images);
  expect(docxParts(docx.bytes).get('word/media/image1.png')).toEqual(
    images[0]!.bytes,
  );
  expect(docxParts(docx.bytes).get('word/media/image2.png')).toEqual(
    images[1]!.bytes,
  );
  const xlsx = await renderDocument({ ...raw, format: 'xlsx' }, images);
  const zip = await JSZip.loadAsync(xlsx.bytes);
  expect(await zip.file('xl/media/image1.png')!.async('nodebuffer')).toEqual(
    images[0]!.bytes,
  );
  expect(await zip.file('xl/media/image2.png')!.async('nodebuffer')).toEqual(
    images[1]!.bytes,
  );
  const pdf = await renderDocument({ ...raw, format: 'pdf' }, images);
  const parsed = await documentText(
    source,
    'pages-output.pdf',
    'application/pdf',
    pdf.bytes,
    createHash('sha256').update(pdf.bytes).digest('hex'),
  );
  expect(parsed.text).toContain('PDF page 1');
  expect(parsed.text).toContain('PDF page 2');
  await expect(
    renderDocument({ ...raw, blocks: [{ ...raw.blocks[0], page: 3 }] }, images),
  ).rejects.toThrow('DOCUMENT_IMAGE_UNAVAILABLE');
  await expect(
    renderDocument({ ...raw, blocks: [{ ...raw.blocks[0], page: 0 }] }, images),
  ).rejects.toThrow();
});
