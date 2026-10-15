import { Readable } from 'node:stream';
import { expect, it } from 'vitest';
import { readTextPage } from './mcp.text';
it('seeks bounded UTF-8 byte pages without losing split Unicode characters', async () => {
  const original = '\ufeffMã🙂\nQ-001,2,100000\n',
    bytes = Buffer.from(original);
  let offset: number | null = 0,
    combined = '';
  while (offset !== null) {
    const chunks = [...bytes.subarray(offset)].map((byte) =>
      Buffer.from([byte]),
    );
    const page = await readTextPage(Readable.from(chunks), offset, 3);
    expect(page.offset_unit).toBe('UTF8_BYTES');
    combined += page.content;
    offset = page.next_offset;
  }
  expect(combined).toBe(original);
});
it('rejects invalid encoding instead of inventing replacement text', async () => {
  await expect(
    readTextPage(Readable.from([Buffer.from([0xff])]), 0, 3),
  ).rejects.toThrow('MCP_TEXT_ENCODING_UNSUPPORTED');
});
it('does not rescan preceding pages of a large text source', async () => {
  const bytes = Buffer.alloc(1024 * 1024, 97);
  let offset: number | null = 0,
    read = 0;
  while (offset !== null) {
    const start = offset;
    const stream = Readable.from(
      (function* () {
        for (let pos = start; pos < bytes.length; pos += 4096) {
          const chunk = bytes.subarray(pos, pos + 4096);
          read += chunk.length;
          yield chunk;
        }
      })(),
    );
    const page = await readTextPage(stream, offset, 32768);
    offset = page.next_offset;
  }
  expect(read).toBeLessThan(bytes.length * 2);
});
