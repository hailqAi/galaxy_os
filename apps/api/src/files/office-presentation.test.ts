import { expect, it } from 'vitest';
import JSZip from 'jszip';
import { renderDocument } from '../project-chat/ai-document';
import { pptxText } from './office-presentation';

async function deck() {
  return renderDocument(
    {
      version: 2,
      format: 'pptx',
      title: 'Đọc bản nháp',
      blocks: [],
      presentation: {
        template: 'galaxy-light',
        slides: [
          {
            title: 'Nguồn tiếng Việt',
            elements: [
              {
                kind: 'text',
                x: 0.5,
                y: 1.5,
                w: 6,
                h: 1,
                text: 'Mã 0007392 · 275001.10 VND',
                fontSize: 20,
                bold: false,
              },
            ],
          },
        ],
      },
    },
    [],
  );
}
it('reads native slide text with slide numbers and keeps exact codes and units', async () => {
  expect(pptxText((await deck()).bytes)).toContain('Slide 1');
  expect(pptxText((await deck()).bytes)).toContain('0007392 · 275001.10 VND');
});
it.each(['external', 'macro', 'dtd', 'embedding', 'false-main'])(
  'rejects unsafe PPTX %s',
  async (mode) => {
    const zip = await JSZip.loadAsync((await deck()).bytes);
    if (mode === 'external')
      zip.file(
        'ppt/slides/_rels/slide1.xml.rels',
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rEvil" Type="image" TargetMode="External" Target="http://127.0.0.1/private"/></Relationships>',
      );
    if (mode === 'macro') zip.file('ppt/vbaProject.bin', Buffer.from('macro'));
    if (mode === 'embedding')
      zip.file('ppt/embeddings/evil.bin', Buffer.from('object'));
    if (mode === 'dtd')
      zip.file(
        'ppt/slides/slide1.xml',
        '<!DOCTYPE p:sld [<!ENTITY steal SYSTEM "file:///etc/passwd">]><p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">&steal;</p:sld>',
      );
    if (mode === 'false-main')
      zip.file(
        '[Content_Types].xml',
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
      );
    const bytes = await zip.generateAsync({ type: 'nodebuffer' });
    expect(() => pptxText(bytes)).toThrow();
  },
);

it('rejects embedded ZIPs without the required XLSX main part', async () => {
  const zip = await JSZip.loadAsync((await deck()).bytes),
    inner = new JSZip();
  inner.file('xl/blob.bin', Buffer.alloc(100));
  zip.file(
    'ppt/embeddings/Microsoft_Excel_Worksheet1.xlsx',
    await inner.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }),
  );
  expect(() => pptxText(Buffer.alloc(0))).toThrow();
  const bytes = await zip.generateAsync({ type: 'nodebuffer' });
  expect(() => pptxText(bytes)).toThrow();
});
it('shares the 32MiB expansion limit across all embedded workbooks', async () => {
  const { Workbook } = await import('exceljs');
  const book = new Workbook();
  book.addWorksheet('Chart').getCell('A1').value = '1';
  const inner = await JSZip.loadAsync(
    Buffer.from(await book.xlsx.writeBuffer()),
  );
  inner.file('xl/blob.bin', Buffer.alloc(17_000_000));
  const embedded = await inner.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
    }),
    zip = await JSZip.loadAsync((await deck()).bytes);
  for (let i = 1; i <= 3; i++)
    zip.file(`ppt/embeddings/Microsoft_Excel_Worksheet${i}.xlsx`, embedded);
  const bytes = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
  });
  expect(() => pptxText(bytes)).toThrow();
});
