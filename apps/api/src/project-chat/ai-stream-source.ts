import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { AiError } from './ai-registry';

export const streamParserVersion = 'utf8-prefix-v1';
const maximumDerivedBytes = 32 * 1024 * 1024;
const maximumChunkBytes = 32768;

export async function streamTextSelection(
  stream: Readable,
  originalBytes: number,
  startLine: number,
  signal?: AbortSignal,
) {
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  let line = 1,
    readBytes = 0,
    text = '';
  const abort = () => stream.destroy(new AiError('REQUEST_CANCELLED'));
  signal?.addEventListener('abort', abort, { once: true });
  const consume = (value: string) => {
    if (value.includes('\0')) throw new AiError('SOURCE_UNAVAILABLE');
    let offset = 0;
    while (line < startLine) {
      const end = value.indexOf('\n', offset);
      if (end < 0) return;
      line++;
      offset = end + 1;
    }
    text += value.slice(offset, offset + 3200 - text.length);
  };
  try {
    signal?.throwIfAborted();
    if (
      !Number.isSafeInteger(originalBytes) ||
      originalBytes < 1 ||
      originalBytes > 10_000_000_000 ||
      !Number.isSafeInteger(startLine) ||
      startLine < 1 ||
      startLine > 10_000_000_000
    )
      throw new AiError('SOURCE_UNAVAILABLE');
    for await (const part of stream) {
      signal?.throwIfAborted();
      const bytes = Buffer.from(part);
      readBytes += bytes.length;
      if (readBytes > originalBytes)
        throw new AiError('SOURCE_VERSION_CHANGED');
      consume(decoder.decode(bytes, { stream: true }));
      if (text.length === 3200) break;
    }
    if (text.length < 3200) {
      if (readBytes !== originalBytes) throw new AiError('SOURCE_UNAVAILABLE');
      consume(decoder.decode());
    }
    if (line < startLine || !text) throw new AiError('SOURCE_TEXT_UNAVAILABLE');
    if (/[\uD800-\uDBFF]$/.test(text)) text = text.slice(0, -1);
    return {
      text,
      startLine,
      startColumn: 1,
      readBytes,
      checksum: createHash('sha256').update(text).digest('hex'),
    };
  } finally {
    signal?.removeEventListener('abort', abort);
    stream.destroy();
  }
}

function prefix(bytes: Buffer, limit: number) {
  let end = Math.min(bytes.length, limit);
  while (end < bytes.length && end > 0 && (bytes[end]! & 0xc0) === 0x80) end--;
  return bytes.subarray(0, end);
}

export async function streamTextSource(
  stream: Readable,
  originalBytes: number,
  originalChecksum: string,
  signal?: AbortSignal,
) {
  const blocks: {
    ordinal: number;
    text: string;
    checksum: string;
    locator: {
      byteStart: number;
      byteEnd: number;
      startLine: number;
      endLine: number;
      startColumn: number;
    };
  }[] = [];
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  const hash = createHash('sha256');
  let pending = '',
    text = '',
    readBytes = 0,
    derivedBytes = 0,
    line = 1,
    column = 1;
  let previewFull = false;
  const emit = (value: string) => {
    if (!value || blocks.length === 1024) return;
    const bytes = Buffer.from(value);
    const lines = value.split('\n');
    blocks.push({
      ordinal: blocks.length,
      text: value,
      checksum: createHash('sha256').update(bytes).digest('hex'),
      locator: {
        byteStart: derivedBytes,
        byteEnd: derivedBytes + bytes.length,
        startLine: line,
        endLine: line + lines.length - 1,
        startColumn: column,
      },
    });
    const remaining = 262144 - Buffer.byteLength(text);
    if (!previewFull && remaining > 0) {
      const selected = prefix(bytes, remaining);
      text += selected.toString('utf8');
      previewFull = selected.length < bytes.length;
    }
    derivedBytes += bytes.length;
    line += lines.length - 1;
    column =
      lines.length > 1 ? lines.at(-1)!.length + 1 : column + value.length;
  };
  const consume = (value: string) => {
    if (value.includes('\0')) throw new AiError('SOURCE_UNAVAILABLE');
    pending += value;
    while (Buffer.byteLength(pending) >= maximumChunkBytes) {
      const bytes = prefix(Buffer.from(pending), maximumChunkBytes);
      const value = bytes.toString('utf8');
      emit(value);
      pending = pending.slice(value.length);
    }
  };
  try {
    signal?.throwIfAborted();
    if (
      !Number.isSafeInteger(originalBytes) ||
      originalBytes < 1 ||
      originalBytes > 10_000_000_000
    )
      throw new AiError('SOURCE_UNAVAILABLE');
    for await (const part of stream) {
      signal?.throwIfAborted();
      const bytes = Buffer.from(part);
      if (
        readBytes + bytes.length > originalBytes &&
        originalBytes <= maximumDerivedBytes
      )
        throw new AiError('SOURCE_UNAVAILABLE');
      const selected = bytes.subarray(0, maximumDerivedBytes - readBytes);
      readBytes += selected.length;
      hash.update(selected);
      consume(decoder.decode(selected, { stream: true }));
      if (readBytes === maximumDerivedBytes) break;
    }
    const complete = originalBytes <= maximumDerivedBytes;
    if (complete) {
      consume(decoder.decode());
      if (
        readBytes !== originalBytes ||
        hash.digest('hex') !== originalChecksum
      )
        throw new AiError('SOURCE_UNAVAILABLE');
    } else if (readBytes !== maximumDerivedBytes)
      throw new AiError('SOURCE_UNAVAILABLE');
    emit(pending);
    return {
      blocks,
      text,
      searchText: prefix(Buffer.from(text.normalize('NFKC')), 262144).toString(
        'utf8',
      ),
      coverage: {
        parserVersion: streamParserVersion,
        coverage:
          complete && derivedBytes === originalBytes
            ? ('COMPLETE' as const)
            : ('PARTIAL' as const),
        originalBytes,
        readBytes,
        derivedBytes,
        originalChecksum,
        maximumDerivedBytes,
      },
    };
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new AiError('SOURCE_UNAVAILABLE');
  } finally {
    stream.destroy();
  }
}
