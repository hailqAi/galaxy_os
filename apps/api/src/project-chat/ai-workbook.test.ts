import { expect, it } from 'vitest';
import { Workbook, ValueType } from 'exceljs';
import { renderDocument } from './ai-document';
import { activationFixture } from './ai-activation';
import JSZip from 'jszip';

it('renders the complete 798-cell multi-sheet quotation and verifies every saved formula cache', async () => {
  const counts = [98, 290, 290, 53, 67];
  const sheets = counts.map((count, index) => ({
    name: 'Section ' + index,
    images: [],
    cells: Array.from({ length: count }, (_, row) =>
      row === count - 1
        ? {
            cell: 'A' + (row + 1),
            kind: 'formula',
            operation: 'add',
            operands: [
              { sheet: 'Section ' + index, cell: 'A1' },
              { sheet: 'Section ' + index, cell: 'A2' },
            ],
            decimalPlaces: 2,
            format: 'decimal2',
          }
        : {
            cell: 'A' + (row + 1),
            kind: 'number',
            value: row === 0 ? '12.50' : '2.25',
            format: 'decimal2',
          },
    ),
  }));
  const raw = {
    format: 'xlsx',
    version: 2,
    title: 'Complete quotation',
    blocks: [],
    workbook: { sheets },
  };
  expect(Buffer.byteLength(JSON.stringify(raw))).toBeGreaterThan(24000);
  const result = await renderDocument(raw, []),
    book = new Workbook();
  await book.xlsx.load(result.bytes as never);
  expect(book.worksheets).toHaveLength(5);
  expect(
    book.worksheets.reduce((sum, sheet) => sum + sheet.actualRowCount, 0),
  ).toBe(798);
  for (const [index, sheet] of book.worksheets.entries()) {
    expect(sheet.getCell('A1').value).toBe(12.5);
    expect(sheet.getCell('A' + counts[index]).result).toBe(14.75);
    expect(sheet.getCell('A' + counts[index]).type).toBe(ValueType.Formula);
  }
});

it('retains per-sheet cell limits and the combined document byte bound', async () => {
  const raw = {
    version: 2,
    format: 'xlsx',
    title: 'Bounded',
    blocks: [],
    workbook: {
      sheets: [
        {
          name: 'Data',
          images: [],
          cells: Array.from({ length: 401 }, (_, index) => ({
            cell: 'A' + (index + 1),
            kind: 'text',
            text: 'x',
          })),
        },
      ],
    },
  };
  await expect(renderDocument(raw, [])).rejects.toThrow();
  const cells = Array.from({ length: 400 }, (_, index) => ({
    cell: 'A' + (index + 1),
    kind: 'text',
    text: 'x'.repeat(400),
  }));
  await expect(
    renderDocument(
      { ...raw, workbook: { sheets: [{ name: 'Data', images: [], cells }] } },
      [],
    ),
  ).rejects.toThrow('DOCUMENT_LIMIT');
});

const input = () => ({
  version: 2,
  format: 'xlsx',
  title: 'Báo giá nhiều sheet',
  blocks: [],
  workbook: {
    sheets: [
      {
        name: 'Chi tiết',
        cells: [
          { cell: 'A1', kind: 'text', text: '0007392' },
          {
            cell: 'B1',
            kind: 'number',
            value: '125000.50',
            format: 'decimal2',
          },
          { cell: 'B2', kind: 'number', value: '2', format: 'integer' },
          {
            cell: 'C1',
            kind: 'formula',
            operation: 'multiply',
            operands: [
              { sheet: 'Chi tiết', cell: 'B1' },
              { sheet: 'Chi tiết', cell: 'B2' },
            ],
            decimalPlaces: 2,
            format: 'decimal2',
          },
        ],
        images: [],
      },
      {
        name: 'Tổng hợp',
        cells: [
          {
            cell: 'A1',
            kind: 'formula',
            operation: 'multiply',
            operands: [{ sheet: 'Chi tiết', cell: 'C1' }, { value: '1.1' }],
            decimalPlaces: 2,
            format: 'decimal2',
          },
        ],
        images: [
          {
            cell: 'C1',
            sourceId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
            caption: 'Ảnh nguồn',
          },
        ],
      },
    ],
  },
});

it('v2 emits multiple native sheets, preserves IDs and validates real formula caches and image bytes', async () => {
  const image = activationFixture('image').media[0]!;
  const rendered = await renderDocument(input(), [
    {
      bytes: image.bytes,
      mime: 'image/png',
      sourceId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
    },
  ]);
  const book = new Workbook();
  await book.xlsx.load(rendered.bytes as never);
  expect(book.worksheets.map((s) => s.name)).toEqual(['Chi tiết', 'Tổng hợp']);
  expect(book.getWorksheet('Chi tiết')!.getCell('A1').value).toBe('0007392');
  expect(book.getWorksheet('Chi tiết')!.getCell('B1').value).toBe(125000.5);
  const result = book.getWorksheet('Tổng hợp')!.getCell('A1');
  expect(result.type).toBe(ValueType.Formula);
  expect(result.result).toBe(275001.1);
  expect(result.formula).toContain("'Chi tiết'!C1");
  expect(rendered.text).toContain('275001.10');
  const zip = await JSZip.loadAsync(rendered.bytes);
  const media = Object.keys(zip.files).filter(
    (n) => n.startsWith('xl/media/') && !zip.files[n]!.dir,
  );
  expect(media).toHaveLength(1);
  expect(await zip.file(media[0]!)!.async('nodebuffer')).toEqual(image.bytes);
  for (const name of Object.keys(zip.files)) {
    expect(name).not.toMatch(/vbaProject|externalLinks/i);
    if (name.endsWith('.rels'))
      expect(await zip.file(name)!.async('string')).not.toContain(
        'TargetMode="External"',
      );
  }
});

it('v2 keeps untrusted text inert and preserves unsafe numeric precision as explicit text', async () => {
  const raw = input();
  raw.workbook.sheets = [
    {
      name: 'Số liệu',
      images: [],
      cells: [
        { cell: 'A1', kind: 'text', text: '=HYPERLINK("http://private")' },
        {
          cell: 'B1',
          kind: 'number',
          value: '123456789012345678.90',
          format: 'decimal2',
        },
      ],
    },
  ];
  const rendered = await renderDocument(raw, []),
    book = new Workbook();
  await book.xlsx.load(rendered.bytes as never);
  expect(book.worksheets[0]!.getCell('A1').type).toBe(ValueType.String);
  expect(book.worksheets[0]!.getCell('B1').value).toBe('123456789012345678.90');
  expect(rendered.text).toContain('giữ dạng text');
});

it.each([
  'cycle',
  'missing',
  'divide-zero',
  'precision',
  'external',
  'duplicate-sheet',
])('v2 rejects %s before storing a misleading workbook', async (mode) => {
  const raw = input();
  const formula = raw.workbook.sheets[0]!.cells[3]!;
  if (mode === 'cycle')
    Object.assign(formula, {
      operands: [{ sheet: 'Chi tiết', cell: 'C1' }, { value: '1' }],
    });
  if (mode === 'missing')
    Object.assign(formula, {
      operands: [{ sheet: 'Không có', cell: 'A1' }, { value: '1' }],
    });
  if (mode === 'divide-zero')
    Object.assign(formula, {
      operation: 'divide',
      operands: [{ value: '1' }, { value: '0' }],
    });
  if (mode === 'precision')
    Object.assign(formula, {
      operands: [{ value: '123456789012345678.90' }, { value: '1' }],
    });
  if (mode === 'external')
    Object.assign(formula, { formula: '=WEBSERVICE("http://private")' });
  if (mode === 'duplicate-sheet') raw.workbook.sheets[1]!.name = 'CHI TIẾT';
  await expect(renderDocument(raw, [])).rejects.toThrow();
});

it.each(['control-text', 'blank-sheet', 'apostrophe-sheet'])(
  'v2 rejects malformed OOXML input %s',
  async (mode) => {
    const raw = input();
    raw.workbook.sheets = [
      {
        name: 'Valid',
        cells: [{ cell: 'A1', kind: 'text', text: 'Safe' }],
        images: [],
      },
    ];
    if (mode === 'control-text')
      Object.assign(raw.workbook.sheets[0]!.cells[0]!, {
        text: 'bad\u0000text',
      });
    if (mode === 'blank-sheet') raw.workbook.sheets[0]!.name = ' ';
    if (mode === 'apostrophe-sheet') raw.workbook.sheets[0]!.name = "'Invalid";
    await expect(renderDocument(raw, [])).rejects.toThrow();
  },
);

it('rejects cancellation through an intermediate value beyond Excel precision', async () => {
  const raw = input();
  raw.workbook.sheets = [
    {
      name: 'Precision',
      images: [],
      cells: [
        {
          cell: 'A1',
          kind: 'formula',
          operation: 'add',
          operands: [
            { value: '100000000000000' },
            { value: '0.01' },
            { value: '-100000000000000' },
            { value: '1' },
          ],
          decimalPlaces: 2,
          format: 'decimal2',
        },
      ],
    } as never,
  ];
  await expect(renderDocument(raw, [])).rejects.toMatchObject({
    code: 'DOCUMENT_PRECISION_REQUIRED',
  });
});

it('rejects a formula whose binary arithmetic rounds differently from its decimal cache', async () => {
  const raw = input();
  raw.workbook.sheets = [
    {
      name: 'Precision',
      images: [],
      cells: [
        {
          cell: 'A1',
          kind: 'formula',
          operation: 'multiply',
          operands: [{ value: '0.05' }, { value: '0.70' }],
          decimalPlaces: 2,
          format: 'decimal2',
        },
      ],
    } as never,
  ];
  await expect(renderDocument(raw, [])).rejects.toMatchObject({
    code: 'DOCUMENT_PRECISION_REQUIRED',
  });
});

it('rounds a recurring final division and verifies the resulting numeric cache', async () => {
  const raw = input();
  raw.workbook.sheets = [
    {
      name: 'Rounded',
      images: [],
      cells: [
        {
          cell: 'A1',
          kind: 'formula',
          operation: 'divide',
          operands: [{ value: '1' }, { value: '3' }],
          decimalPlaces: 2,
          format: 'decimal2',
        },
      ],
    } as never,
  ];
  const file = await renderDocument(raw, []),
    book = new Workbook();
  await book.xlsx.load(file.bytes as never);
  expect(book.worksheets[0]!.getCell('A1').result).toBe(0.33);
  expect(book.worksheets[0]!.getCell('A1').formula).toBe('ROUND(((1)/(3)),2)');
});

it('selects each PDF page by source and page in a typed multi-sheet workbook', async () => {
  const { textPdfFixture } = await import('../../test/document-fixtures');
  const { scanPages } = await import('./ai-native-source');
  const { createHash } = await import('node:crypto');
  const sourceId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
    bytes = await textPdfFixture(2),
    checksum = createHash('sha256').update(bytes).digest('hex');
  const images = [];
  for (const page of [1, 2]) {
    const rendered = await scanPages(
      {
        organizationId: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
        projectId: 'cccccccc-cccc-4ccc-cccc-cccccccccccc',
        roomId: null,
        sourceId,
        version: '1:' + checksum,
        text: '',
      },
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
  const raw = {
    ...input(),
    workbook: {
      sheets: [
        {
          name: 'Pages',
          cells: [],
          images: [1, 2].map((page) => ({
            sourceId,
            page,
            cell: page === 1 ? 'A1' : 'A20',
            caption: 'Page ' + page,
          })),
        },
      ],
    },
  };
  const file = await renderDocument(raw, images),
    zip = await JSZip.loadAsync(file.bytes);
  expect(await zip.file('xl/media/image1.png')!.async('nodebuffer')).toEqual(
    images[0]!.bytes,
  );
  expect(await zip.file('xl/media/image2.png')!.async('nodebuffer')).toEqual(
    images[1]!.bytes,
  );
  const missing = {
    ...raw,
    workbook: {
      sheets: [
        {
          ...raw.workbook.sheets[0],
          images: [{ sourceId, page: 3, cell: 'A1', caption: 'Missing' }],
        },
      ],
    },
  };
  await expect(renderDocument(missing, images)).rejects.toThrow(
    'DOCUMENT_IMAGE_UNAVAILABLE',
  );
});
