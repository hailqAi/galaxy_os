import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { extname } from 'node:path';
import { AiError } from './ai-registry';
import { chunks, extractText, SourceChunk, TextSource } from './ai-source';
import { validUploadHeader } from '../uploads/uploads.service';

export async function nativeSource(
  source: TextSource,
  name: string,
  mime: string,
  bytes: Buffer,
  checksum: string,
) {
  if (extractText(name, mime, new Uint8Array()).status === 'FORBIDDEN')
    throw new AiError('SOURCE_UNAVAILABLE');
  if (!bytes.length || bytes.length > 8_000_000)
    throw new AiError('INPUT_TOO_LARGE');
  if (createHash('sha256').update(bytes).digest('hex') !== checksum)
    throw new AiError('SOURCE_UNAVAILABLE');
  const extension = extname(name).toLowerCase();
  if (!['.png', '.jpg', '.jpeg', '.pdf'].includes(extension))
    throw new AiError('UNSUPPORTED_FILE');
  const expected =
    extension === '.pdf'
      ? 'application/pdf'
      : extension === '.png'
        ? 'image/png'
        : 'image/jpeg';
  if (
    mime !== expected ||
    !validUploadHeader(extension as '.pdf' | '.png' | '.jpg' | '.jpeg', bytes)
  )
    throw new AiError('SOURCE_UNAVAILABLE');
  let pages = 1;
  if (mime === 'application/pdf') {
    const output = await new Promise<string>((resolve, reject) => {
      // Local parser only: bounded process/input/output, no URL and no shell.
      const child = execFile(
        process.env.GALAXY_AI_PDFINFO ?? '/usr/bin/pdfinfo',
        ['-'],
        {
          timeout: 5000,
          maxBuffer: 65536,
          env: {
            PATH: process.env.PATH,
            LANG: 'C',
            ...(process.env.GALAXY_AI_PDF_LIBRARY_PATH
              ? { LD_LIBRARY_PATH: process.env.GALAXY_AI_PDF_LIBRARY_PATH }
              : {}),
          },
        },
        (error, stdout) =>
          error
            ? reject(new AiError('PDF_VALIDATION_UNAVAILABLE'))
            : resolve(stdout),
      );
      child.stdin?.on('error', () => {});
      child.stdin?.end(bytes);
    });
    pages = Number(/^Pages:\s+(\d+)\s*$/m.exec(output)?.[1]);
    if (
      !/^Encrypted:\s+no\s*$/m.test(output) ||
      !/^JavaScript:\s+no\s*$/m.test(output)
    )
      throw new AiError('SOURCE_UNAVAILABLE');
    if (!Number.isInteger(pages) || pages < 1 || pages > 10)
      throw new AiError('PDF_PAGE_LIMIT');
  }
  const metadata: SourceChunk[] = [];
  for (let page = 1; page <= pages; page++) {
    const locator = chunks({
      ...source,
      text: `${name} · bản ${source.version} · trang ${page}. Nội dung gửi native; chưa trích text cục bộ.`,
    })[0]!;
    metadata.push({ ...locator, page });
  }
  return { chunks: metadata, pages };
}
