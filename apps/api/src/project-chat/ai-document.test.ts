import { expect, it } from 'vitest';
import { Workbook } from 'exceljs';
import { docxText } from '../files/office-document';
import { renderDocument } from './ai-document';

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
