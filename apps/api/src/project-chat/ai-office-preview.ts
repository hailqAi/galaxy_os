import { AiError } from './ai-registry';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { isAbsolute, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { boundedOfficeParts } from '../files/office-archive';
import { docxParts, officeXml } from '../files/office-document';
import { pptxParts } from '../files/office-presentation';
import { assertBoundedWorkbook } from '../imports/imports.service';
import { Workbook, type ImagePosition } from 'exceljs';
import { parse, serialize, type DefaultTreeAdapterMap } from 'parse5';

const binarySha =
  'a5ed6e4157fe9b24a099cd24ff30e89a4349b7a7d782d2b7de8d56294c7e1423';
let probe: { key: string; ready: Promise<boolean> } | undefined;
let active = 0;
let previewFont: Promise<Buffer> | undefined;
async function workbookImageSizes(html: string, bytes: Buffer) {
  // Text-only Work sheets need no image anchors or ExcelJS roundtrip.
  if (!/<img\b[^>]*\bclass=["'][^"']*\bxlsx-picture\b/i.test(html)) return html;
  const workbook = new Workbook();
  await workbook.xlsx.load(bytes as never);
  const sizes = new Map<string, { width: number; height: number }[]>();
  for (const [sheetIndex, sheet] of workbook.worksheets.entries())
    for (const image of sheet.getImages()) {
      const ext = (image.range as Partial<ImagePosition>).ext;
      if (!ext) continue;
      if (
        !Number.isFinite(ext.width) ||
        !Number.isFinite(ext.height) ||
        ext.width <= 0 ||
        ext.height <= 0 ||
        ext.width > 10_000 ||
        ext.height > 10_000
      )
        throw new AiError('DOCUMENT_LIMIT');
      const media = workbook.getImage(Number(image.imageId));
      if (!Buffer.isBuffer(media.buffer))
        throw new AiError('DOCUMENT_VALIDATION_FAILED');
      const { nativeCol, nativeRow } = image.range.tl;
      if (
        !Number.isInteger(nativeCol) ||
        !Number.isInteger(nativeRow) ||
        nativeCol < 0 ||
        nativeRow < 0
      )
        throw new AiError('DOCUMENT_VALIDATION_FAILED');
      const hash = createHash('sha256').update(media.buffer).digest('hex');
      const key = `${sheetIndex}:${nativeRow}:${nativeCol}:${hash}`;
      sizes.set(key, [...(sizes.get(key) ?? []), ext]);
    }
  if (!sizes.size) return html;
  const document = parse(html),
    stack: DefaultTreeAdapterMap['node'][] = [document];
  let visited = 0;
  while (stack.length) {
    const node = stack.pop()!;
    if (++visited > 100_000) throw new AiError('DOCUMENT_LIMIT');
    if (
      'tagName' in node &&
      node.tagName === 'img' &&
      node.attrs.some(
        (a) =>
          a.name === 'class' && a.value.split(/\s+/).includes('xlsx-picture'),
      )
    ) {
      const uri = node.attrs.find((a) => a.name === 'src')?.value;
      const parent = node.parentNode;
      if (
        uri &&
        /^data:image\/(?:png|jpeg|gif);base64,/.test(uri) &&
        parent &&
        'attrs' in parent
      ) {
        let ancestor: DefaultTreeAdapterMap['node'] | null = parent;
        let sheetIndex: string | undefined;
        while (ancestor && !sheetIndex) {
          if ('attrs' in ancestor)
            sheetIndex = ancestor.attrs.find(
              (a) => a.name === 'data-sheet',
            )?.value;
          ancestor = 'parentNode' in ancestor ? ancestor.parentNode : null;
        }
        const row = parent.attrs.find((a) => a.name === 'data-from-row')?.value;
        const col = parent.attrs.find((a) => a.name === 'data-from-col')?.value;
        const hash = createHash('sha256')
          .update(Buffer.from(uri.slice(uri.indexOf(',') + 1), 'base64'))
          .digest('hex');
        const size = sizes.get(`${sheetIndex}:${row}:${col}:${hash}`)?.shift();
        if (!size) continue;
        const style = parent.attrs.find((a) => a.name === 'style');
        if (!style) throw new AiError('DOCUMENT_VALIDATION_FAILED');
        // The pinned renderer estimates one-cell image sizes from whole columns.
        style.value =
          style.value.replace(/(?:^|;)\s*(?:width|height)\s*:[^;]*/g, '') +
          `;width:${size.width}px;height:${size.height}px`;
      }
    }
    if ('childNodes' in node) stack.push(...[...node.childNodes].reverse());
  }
  if ([...sizes.values()].some((values) => values.length))
    throw new AiError('DOCUMENT_VALIDATION_FAILED');
  return serialize(document);
}
function sandbox(binary: string, work?: string, format?: string) {
  return [
    '--unshare-all',
    '--new-session',
    '--die-with-parent',
    '--clearenv',
    '--ro-bind',
    '/usr',
    '/usr',
    '--ro-bind',
    '/lib',
    '/lib',
    '--ro-bind',
    '/lib64',
    '/lib64',
    '--ro-bind',
    '/etc/fonts',
    '/etc/fonts',
    '--proc',
    '/proc',
    '--dev',
    '/dev',
    '--tmpfs',
    '/tmp',
    '--ro-bind',
    binary,
    '/officecli',
    ...(work
      ? [
          '--bind',
          work,
          '/work',
          '--ro-bind',
          join(work, `input.${format}`),
          `/work/input.${format}`,
          '--chdir',
          '/work',
        ]
      : []),
    '--setenv',
    'HOME',
    '/tmp',
    '--setenv',
    'PATH',
    '/usr/bin:/bin',
    '--setenv',
    'DOTNET_SYSTEM_GLOBALIZATION_INVARIANT',
    '1',
    '--setenv',
    'DOTNET_GCHeapHardLimit',
    '0x20000000',
    '--setenv',
    'OFFICECLI_SKIP_UPDATE',
    '1',
    '/usr/bin/timeout',
    '25',
    '/officecli',
  ];
}
function run(
  binary: string,
  args: string[],
  signal?: AbortSignal,
  work?: string,
  format?: string,
) {
  return new Promise<string>((resolve, reject) => {
    execFile(
      '/usr/bin/bwrap',
      [...sandbox(binary, work, format), ...args],
      {
        env: {},
        signal,
        timeout: 27000,
        maxBuffer: 65536,
        killSignal: 'SIGKILL',
      },
      (error, stdout) =>
        error
          ? reject(
              new AiError(
                signal?.aborted ? 'REQUEST_CANCELLED' : 'OFFICE_PREVIEW_FAILED',
              ),
            )
          : resolve(stdout),
    );
  });
}
export async function officePreviewReady() {
  const binary = process.env.GALAXY_AI_OFFICECLI;
  if (!binary || !isAbsolute(binary)) return false;
  try {
    const details = await lstat(binary);
    if (
      !details.isFile() ||
      details.isSymbolicLink() ||
      !(details.mode & 0o111)
    )
      return false;
    const key = `${binary}:${details.dev}:${details.ino}:${details.size}:${details.mtimeMs}`;
    if (probe?.key !== key)
      probe = {
        key,
        ready: (async () => {
          const hash = createHash('sha256');
          for await (const part of createReadStream(binary)) hash.update(part);
          if (hash.digest('hex') !== binarySha) return false;
          return /\b1\.0\.156\b/.test(await run(binary, ['--version']));
        })().catch(() => false),
      };
    return await probe.ready;
  } catch {
    return false;
  }
}
export async function officePreview(
  bytes: Buffer,
  format: 'docx' | 'xlsx' | 'pptx',
  signal: AbortSignal,
): Promise<Buffer> {
  signal.throwIfAborted();
  if (!bytes.length || bytes.length > 8_000_000)
    throw new AiError('DOCUMENT_LIMIT');
  if (format === 'docx') docxParts(bytes);
  else if (format === 'pptx') pptxParts(bytes);
  else if (!assertBoundedWorkbook(bytes)) throw new AiError('UNSUPPORTED_FILE');
  for (const [name, data] of boundedOfficeParts(bytes)) {
    if (/\.(?:xml|rels)$/.test(name))
      officeXml(
        data,
        (tag) => {
          if (
            Object.values(tag.attributes).some(
              (a) => a.local === 'TargetMode' && a.value === 'External',
            ) ||
            ['altChunk', 'OLEObject'].includes(tag.local)
          )
            throw new AiError('UNSUPPORTED_FILE');
        },
        undefined,
        undefined,
        format.toUpperCase(),
      );
  }
  if (!(await officePreviewReady()))
    throw new AiError('OFFICE_PREVIEW_NOT_READY');
  signal.throwIfAborted();
  if (active >= 2) throw new AiError('OFFICE_PREVIEW_BUSY');
  active++;
  let work: string | undefined;
  try {
    work = await mkdtemp(join(tmpdir(), 'galaxy-office-preview-'));
    await writeFile(join(work, `input.${format}`), bytes, {
      mode: 0o600,
      flag: 'wx',
    });
    const binary = process.env.GALAXY_AI_OFFICECLI!;
    const validation = JSON.parse(
      await run(
        binary,
        ['validate', `/work/input.${format}`, '--json'],
        signal,
        work,
        format,
      ),
    );
    if (validation.success !== true)
      throw new AiError('DOCUMENT_VALIDATION_FAILED');
    await run(
      binary,
      ['view', `/work/input.${format}`, 'html', '-o', '/work/preview.html'],
      signal,
      work,
      format,
    );
    signal.throwIfAborted();
    const output = join(work, 'preview.html'),
      details = await lstat(output);
    if (!details.isFile() || details.size < 100 || details.size > 16_000_000)
      throw new AiError('DOCUMENT_LIMIT');
    const raw = (await readFile(output)).toString('utf8');
    const html = format === 'xlsx' ? await workbookImageSizes(raw, bytes) : raw;
    previewFont ??= readFile(
      resolve(__dirname, '../../../web/app/assets/be-vietnam-pro-3.ttf'),
    );
    const font = await previewFont;
    const preview = Buffer.from(
      html
        .replace(/@font-face\s*\{[^{}]*\}/gi, (face) =>
          /font-family:\s*(['"])Be Vietnam Pro\1\s*;/i.test(face) &&
          /src:\s*local\(/i.test(face)
            ? ''
            : face,
        )
        .replace(
          /<\/head>/i,
          `<style>@font-face{font-family:'Be Vietnam Pro';src:url(data:font/ttf;base64,${font.toString('base64')}) format('truetype')}body{font-family:'Be Vietnam Pro',sans-serif;overflow:auto}.sidebar,.sidebar-toggle,.toggle-zone,.sheet-tabs{display:none!important}.main,.slide-container{align-items:flex-start}.slide-wrapper{justify-content:flex-start}.sheet-slider{display:block;overflow:auto}.sheet-content{display:block!important;flex:none;margin-bottom:24px}caption.sr-only{position:static;width:auto;height:auto;clip:auto;white-space:normal;text-align:left;padding:12px;font-weight:bold}</style></head>`,
        ),
    );
    if (preview.length > 16_000_000) throw new AiError('DOCUMENT_LIMIT');
    return preview;
  } finally {
    active--;
    if (work) await rm(work, { recursive: true, force: true });
  }
}
