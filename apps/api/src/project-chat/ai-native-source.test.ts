import { existsSync } from 'node:fs';
import { expect, it } from 'vitest';
import { nativeSource } from './ai-native-source';
import { createHash } from 'node:crypto';
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
