import { expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderDocument } from './ai-document';
import { officePreview, officePreviewReady } from './ai-office-preview';
import { activationFixture } from './ai-activation';

it('does not claim Office READY without a pinned sandbox worker', async () => {
  const prior = process.env.GALAXY_AI_OFFICECLI;
  vi.stubEnv('GALAXY_AI_OFFICECLI', '');
  try {
    expect(await officePreviewReady()).toBe(false);
  } finally {
    if (prior === undefined) delete process.env.GALAXY_AI_OFFICECLI;
    else process.env.GALAXY_AI_OFFICECLI = prior;
  }
});
it.runIf(Boolean(process.env.GALAXY_AI_OFFICECLI))(
  'validates native OOXML and renders offline in the pinned sandbox without changing original bytes',
  async () => {
    expect(await officePreviewReady()).toBe(true);
    const file = await renderDocument(
      {
        format: 'docx',
        title: 'Kiểm preview',
        blocks: [
          { kind: 'paragraph', text: 'Mã 0007392 · 275001.10 VND' },
          { kind: 'page_break' },
          { kind: 'paragraph', text: 'Trang thứ hai' },
        ],
      },
      [],
    );
    const original = Buffer.from(file.bytes);
    const html = await officePreview(
      file.bytes,
      'docx',
      new AbortController().signal,
    );
    expect(html.toString()).toContain('0007392');
    expect(html.toString()).toContain('275001.10');
    expect(html.toString()).toContain('<span class="page-num-field">2</span>');
    expect(html.toString()).not.toMatch(/src:\s*local\('Be Vietnam Pro/);
    expect(html.toString()).toContain('src:url(data:font/ttf;base64,');
    expect(file.bytes).toEqual(original);
    const controller = new AbortController();
    controller.abort();
    await expect(
      officePreview(file.bytes, 'docx', controller.signal),
    ).rejects.toThrow();
    await expect(
      officePreview(
        Buffer.from('not an Office archive'),
        'docx',
        new AbortController().signal,
      ),
    ).rejects.toThrow();
  },
  60000,
);

it.runIf(Boolean(process.env.GALAXY_AI_OFFICECLI))(
  'validates and previews v2 sheets/formula caches and an editable PPT chart with the installed app dependency',
  async () => {
    const docs = [
      {
        version: 2,
        format: 'xlsx',
        title: 'Báo giá nhiều sheet',
        blocks: [],
        workbook: {
          sheets: [
            {
              name: 'Giá',
              cells: [
                { cell: 'A1', kind: 'text', text: '0007392' },
                {
                  cell: 'B1',
                  kind: 'number',
                  value: '125000.50',
                  format: 'decimal2',
                },
              ],
              images: [],
            },
            {
              name: 'Tổng',
              cells: [
                {
                  cell: 'A1',
                  kind: 'formula',
                  operation: 'multiply',
                  operands: [{ sheet: 'Giá', cell: 'B1' }, { value: '2.2' }],
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
      },
      {
        version: 2,
        format: 'pptx',
        title: 'Báo giá Việt',
        blocks: [],
        presentation: {
          template: 'galaxy-light',
          slides: [
            {
              title: 'Báo giá nháp',
              elements: [
                {
                  kind: 'table',
                  x: 0.5,
                  y: 1.5,
                  w: 6,
                  h: 1.5,
                  fontSize: 16,
                  rows: [
                    ['Mã', 'VND'],
                    ['0007392', '275001.10'],
                  ],
                },
                {
                  kind: 'chart',
                  x: 7,
                  y: 1.5,
                  w: 5.5,
                  h: 4,
                  title: 'VND',
                  labels: ['Tiền hàng', 'Thuế'],
                  series: [{ name: 'VND', values: ['250001.00', '25000.10'] }],
                },
              ],
            },
          ],
        },
      },
    ];
    for (const input of docs) {
      const file = await renderDocument(input, [
          {
            sourceId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
            mime: 'image/png',
            bytes: activationFixture('image').media[0]!.bytes,
          },
        ]),
        html = await officePreview(
          file.bytes,
          input.format as 'xlsx' | 'pptx',
          new AbortController().signal,
        );
      expect(html.toString()).toContain('0007392');
      expect(html.toString()).toMatch(/275[.,]?001[.,]10/);
      if (input.format === 'xlsx') {
        expect(html.toString()).toContain(
          '.sheet-content{display:block!important',
        );
        expect(html.toString()).toContain('caption.sr-only{position:static');
        expect(html.toString()).toContain('width:240px;height:240px');
      }
    }
  },
  60000,
);

it.runIf(Boolean(process.env.GALAXY_AI_OFFICECLI))(
  'previews the unchanged native Work workbook with prefixed OOXML and no pictures',
  async () => {
    const bytes = readFileSync(
      join(__dirname, '../../test/fixtures/e05-work-generated.xlsx'),
    );
    const original = Buffer.from(bytes);
    const html = await officePreview(
      bytes,
      'xlsx',
      new AbortController().signal,
    );
    expect(html.toString()).toContain('E05-A001');
    expect(html.toString()).toMatch(/583[.,]?200/);
    expect(bytes).toEqual(original);
  },
  60000,
);
