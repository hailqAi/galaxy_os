import { existsSync } from 'node:fs';
import { expect, it } from 'vitest';
import { nativeSource, documentText } from './ai-native-source';
import { activationFixture } from './ai-activation';
import { createHash } from 'node:crypto';
import ExcelJS from 'exceljs';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jhGQAAAAASUVORK5CYII=',
  'base64',
);
const source = {
  organizationId: 'o',
  projectId: 'p',
  roomId: 'r',
  sourceId: 'file',
  version: '1',
  text: '',
};
it('đọc XLSX bằng parser hiện hữu, giữ sheet/cell và giá trị lưu sẵn, không tính công thức', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Vật liệu');
  sheet.getCell('A1').value = 'VT-X928';
  sheet.getCell('B2').value = { formula: '21*2', result: 42 };
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
    'Vật liệu!B2: 42 [giá trị công thức lưu sẵn; không tính lại]',
  );
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
