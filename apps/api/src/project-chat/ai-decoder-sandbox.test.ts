import { PassThrough } from 'node:stream';
import { createHash } from 'node:crypto';
import { expect, it, vi } from 'vitest';

const calls = vi.hoisted(
  () =>
    [] as {
      binary: string;
      args: string[];
      options: Record<string, unknown>;
    }[],
);
vi.mock('node:child_process', () => ({
  execFile: vi.fn(
    (
      binary: string,
      args: string[],
      options: Record<string, unknown>,
      done: (error: Error | null, output: string | Buffer) => void,
    ) => {
      calls.push({ binary, args, options });
      const operation =
        binary === '/usr/bin/bwrap'
          ? args
              .find((arg) => /\/(pdfinfo|pdftotext|pdftoppm)$/.test(arg))
              ?.split('/')
              .at(-1)
          : binary.split('/').at(-1);
      const output =
        operation === 'pdfinfo'
          ? 'Pages: 1\nEncrypted: no\nJavaScript: no\n'
          : operation === 'pdftotext'
            ? 'SYNTHETIC PAGE ONE\f'
            : args.includes('/usr/bin/node')
              ? 'OK'
              : Buffer.from(
                  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
                  'base64',
                );
      queueMicrotask(() => done(null, output));
      return { stdin: new PassThrough() };
    },
  ),
}));
vi.mock('sharp', () => ({
  default: () => ({
    raw: () => ({ timeout: () => ({ toBuffer: async () => Buffer.alloc(2) }) }),
  }),
}));

import { documentText, scanPages } from './ai-native-source';
import { validateImage } from './ai-document';
import * as decoder from './ai-decoder-sandbox';
import { AiError } from './ai-registry';

it('preserves decoder backpressure through image validation', async () => {
  const busy = vi
    .spyOn(decoder, 'decodeImage')
    .mockRejectedValue(new AiError('DOCUMENT_DECODER_BUSY'));
  try {
    const bytes = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
      'base64',
    );
    await expect(validateImage({ mime: 'image/png', bytes })).rejects.toThrow(
      'DOCUMENT_DECODER_BUSY',
    );
  } finally {
    busy.mockRestore();
  }
});

it('runs all PDF operations in an isolated no-network worker with bounded resources', async () => {
  calls.length = 0;
  const bytes = Buffer.from('%PDF-1.4\nSYNTHETIC\n%%EOF\n');
  const source = {
    organizationId: 'o',
    projectId: 'p',
    roomId: 'r',
    sourceId: 'f',
    version: '1',
    text: '',
  };
  const checksum = createHash('sha256').update(bytes).digest('hex');
  await documentText(
    source,
    'Synthetic.pdf',
    'application/pdf',
    bytes,
    checksum,
  );
  await scanPages(source, 'Synthetic.pdf', bytes, checksum);
  expect(calls).toHaveLength(4);
  for (const call of calls) {
    expect(call.binary).toBe('/usr/bin/bwrap');
    expect(call.args).toEqual(
      expect.arrayContaining([
        '--unshare-all',
        '--clearenv',
        '--die-with-parent',
        '/usr/bin/prlimit',
        '/usr/bin/timeout',
      ]),
    );
    expect(call.options.env).toEqual({});
    expect(call.options.killSignal).toBe('SIGKILL');
    expect(call.args.some((arg) => arg.startsWith('--as='))).toBe(true);
    expect(call.args).not.toContain('/home');
    expect(call.args).not.toContain('/home/galaxy_os');
  }
});

it('decodes untrusted image pixels outside the API process in the same isolated worker', async () => {
  calls.length = 0;
  const bytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
    'base64',
  );
  await validateImage({ mime: 'image/png', bytes });
  expect(calls).toHaveLength(1);
  expect(calls[0]!.binary).toBe('/usr/bin/bwrap');
  expect(calls[0]!.args).toEqual(
    expect.arrayContaining([
      '--unshare-all',
      '--clearenv',
      '--die-with-parent',
      '/usr/bin/node',
      '--max-old-space-size=128',
    ]),
  );
  expect(calls[0]!.options.env).toEqual({});
});
