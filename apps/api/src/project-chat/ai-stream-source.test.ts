import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { expect, it } from 'vitest';
import { streamTextSource, streamTextSelection } from './ai-stream-source';

const digest = (bytes: Buffer | string) =>
  createHash('sha256').update(bytes).digest('hex');

it('reads a requested original line beyond the derived prefix without retaining the skipped text', async () => {
  const row = Buffer.from('ạ🙂0007392,275001.10,'.repeat(50) + '\n');
  const marker = 'TAIL-ORIGINAL-7392\n' + 'ạ🙂'.repeat(2000);
  const skipped = 30000;
  expect(row.length * skipped).toBeGreaterThan(32 * 1024 * 1024);
  const stream = Readable.from(
    (function* () {
      for (let i = 0; i < skipped; i++) yield row;
      yield Buffer.from(marker);
      yield Buffer.alloc(65536, 65);
    })(),
  );
  const selected = await streamTextSelection(
    stream,
    row.length * skipped + Buffer.byteLength(marker) + 65536,
    skipped + 1,
  );
  expect(selected.text.startsWith(marker.slice(0, 100))).toBe(true);
  expect(selected.text.length).toBeLessThanOrEqual(3200);
  expect(selected.text).not.toMatch(/[\uD800-\uDBFF]$/);
  expect(selected).toMatchObject({
    startLine: skipped + 1,
    startColumn: 1,
    checksum: digest(selected.text),
  });
  expect(stream.destroyed).toBe(true);
});

it('rejects unavailable original lines and stops a stalled selected read on cancellation', async () => {
  await expect(
    streamTextSelection(Readable.from(Buffer.from('one\n')), 5, 1),
  ).rejects.toThrow('SOURCE_UNAVAILABLE');
  await expect(
    streamTextSelection(Readable.from(Buffer.from('one\n')), 4, 3),
  ).rejects.toThrow('SOURCE_TEXT_UNAVAILABLE');
  const stop = new AbortController();
  const stream = new Readable({ read() {} });
  const pending = streamTextSelection(stream, 10_000_000_000, 1, stop.signal);
  stop.abort();
  await expect(pending).rejects.toThrow();
  expect(stream.destroyed).toBe(true);
});

it('streams Vietnamese, surrogate pairs and long rows into bounded original-byte locators', async () => {
  const text = 'Mã,Tổng VND\n' + 'ạ🙂0007392,275001.10\n'.repeat(30_000);
  const bytes = Buffer.from(text);
  const result = await streamTextSource(
    Readable.from(
      (function* () {
        for (let i = 0; i < bytes.length; i += 101)
          yield bytes.subarray(i, i + 101);
      })(),
    ),
    bytes.length,
    digest(bytes),
  );
  expect(result.blocks.map((b) => b.text).join('')).toBe(text);
  expect(result.coverage).toMatchObject({
    coverage: 'COMPLETE',
    originalBytes: bytes.length,
    derivedBytes: bytes.length,
  });
  let offset = 0;
  for (const block of result.blocks) {
    expect(Buffer.byteLength(block.text)).toBeLessThanOrEqual(32768);
    expect(block.checksum).toBe(digest(block.text));
    expect(block.locator.byteStart).toBe(offset);
    offset += Buffer.byteLength(block.text);
    expect(block.locator.byteEnd).toBe(offset);
  }
  expect(Buffer.byteLength(result.text)).toBeLessThanOrEqual(262144);
  expect(text.startsWith(result.text)).toBe(true);
});

it('reads a bounded prefix and honestly reports partial coverage of a 10 GB original', async () => {
  let supplied = 0;
  const stream = Readable.from(
    (function* () {
      while (true) {
        supplied += 65536;
        yield Buffer.alloc(65536, 65);
      }
    })(),
  );
  const result = await streamTextSource(stream, 10_000_000_000, 'a'.repeat(64));
  expect(result.blocks).toHaveLength(1024);
  expect(result.coverage).toMatchObject({
    coverage: 'PARTIAL',
    readBytes: 33554432,
    derivedBytes: 33554432,
    originalBytes: 10_000_000_000,
  });
  expect(supplied).toBeLessThanOrEqual(33554432 + 2 * 65536);
  expect(stream.destroyed).toBe(true);
});

it('keeps the chunk count bounded when multibyte boundaries reduce each chunk size', async () => {
  const row = Buffer.from('Đơn giá 0007392 VND\n'.repeat(2000));
  const result = await streamTextSource(
    Readable.from(
      (function* () {
        for (let i = 0; i < 1000; i++) yield row;
      })(),
    ),
    row.length * 1000,
    'a'.repeat(64),
  );
  expect(result.blocks.length).toBeLessThanOrEqual(1024);
  expect(result.coverage.coverage).toBe('PARTIAL');
  expect(
    result.blocks.reduce(
      (sum, block) => sum + Buffer.byteLength(block.text),
      0,
    ),
  ).toBe(result.coverage.derivedBytes);
});

it('rejects corrupted complete streams, invalid UTF8, NUL and cancellation', async () => {
  for (const bytes of [Buffer.from([0xff]), Buffer.from('a\0b')])
    await expect(
      streamTextSource(Readable.from(bytes), bytes.length, digest(bytes)),
    ).rejects.toThrow();
  const bytes = Buffer.from('Mã thật');
  await expect(
    streamTextSource(Readable.from(bytes), bytes.length, 'a'.repeat(64)),
  ).rejects.toThrow('SOURCE_UNAVAILABLE');
  await expect(
    streamTextSource(Readable.from(bytes), bytes.length + 1, digest(bytes)),
  ).rejects.toThrow('SOURCE_UNAVAILABLE');
  const stop = new AbortController();
  stop.abort();
  const stream = Readable.from(bytes);
  await expect(
    streamTextSource(stream, bytes.length, digest(bytes), stop.signal),
  ).rejects.toThrow();
  expect(stream.destroyed).toBe(true);
});

it('bounds normalization without changing the original derivative', async () => {
  const bytes = Buffer.from('ﷺ'.repeat(100_000));
  const result = await streamTextSource(
    Readable.from(bytes),
    bytes.length,
    digest(bytes),
  );
  expect(result.blocks.map((block) => block.text).join('')).toBe(
    bytes.toString(),
  );
  expect(Buffer.byteLength(result.searchText)).toBeLessThanOrEqual(262144);
  expect(bytes.toString().normalize('NFKC').startsWith(result.searchText)).toBe(
    true,
  );
});
