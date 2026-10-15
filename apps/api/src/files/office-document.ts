import { BadRequestException } from '@nestjs/common';
import { posix } from 'node:path';
import { SaxesParser, SaxesTagNS } from 'saxes';
import { boundedOfficeParts } from './office-archive';

export const docxMime =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const wordNamespaces = new Set([
  'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  'http://purl.oclc.org/ooxml/wordprocessingml/main',
]);
const attr = (tag: SaxesTagNS, local: string) =>
  Object.values(tag.attributes).find((a) => a.local === local)?.value;

export function officeXml(
  bytes: Buffer,
  open: (tag: SaxesTagNS) => void,
  close?: (tag: SaxesTagNS) => void,
  text?: (value: string) => void,
  format = 'DOCX',
) {
  if (bytes.length > 4_000_000)
    throw new BadRequestException(`Nội dung ${format} quá lớn`);
  const parser = new SaxesParser({ xmlns: true });
  let depth = 0;
  parser.on('doctype', () => {
    throw new BadRequestException(`${format} không cho phép DTD`);
  });
  parser.on('opentag', (tag) => {
    if (++depth > 128)
      throw new BadRequestException(`${format} lồng quá nhiều lớp`);
    open(tag);
  });
  parser.on('closetag', (tag) => {
    close?.(tag);
    depth--;
  });
  parser.on('text', (value) => text?.(value));
  parser.on('cdata', (value) => text?.(value));
  try {
    parser
      .write(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
      .close();
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    throw new BadRequestException(`XML ${format} không hợp lệ`);
  }
}
const xml = officeXml;

export function docxParts(bytes: Buffer) {
  if (bytes.length > 8_000_000) throw new BadRequestException('DOCX quá lớn');
  const parts = boundedOfficeParts(bytes);
  if (
    [...parts.keys()].some((name) =>
      /vbaProject|\/embeddings\/|\.(exe|dll|js|vbs)$/i.test(name),
    )
  )
    throw new BadRequestException('DOCX chứa macro hoặc đối tượng thực thi');
  const types = parts.get('[Content_Types].xml');
  let main = false;
  if (types)
    xml(types, (tag) => {
      const type = attr(tag, 'ContentType') ?? '';
      if (/macroEnabled|vbaProject/i.test(type))
        throw new BadRequestException('DOCX chứa macro');
      if (
        tag.local === 'Override' &&
        attr(tag, 'PartName') === '/word/document.xml' &&
        type === `${docxMime}.main+xml`
      )
        main = true;
    });
  if (!main || !parts.has('word/document.xml'))
    throw new BadRequestException('Tệp DOCX không hợp lệ');
  const root = parts.get('_rels/.rels');
  let targets = 0;
  if (root)
    xml(root, (tag) => {
      if (
        tag.local !== 'Relationship' ||
        !attr(tag, 'Type')?.endsWith('/officeDocument')
      )
        return;
      targets++;
      if (
        attr(tag, 'TargetMode') === 'External' ||
        !['word/document.xml', '/word/document.xml'].includes(
          attr(tag, 'Target') ?? '',
        )
      )
        throw new BadRequestException('Part chính DOCX chưa hỗ trợ');
    });
  if (targets !== 1) throw new BadRequestException('Quan hệ DOCX không hợp lệ');
  let depth = 0,
    bodies = 0;
  xml(
    parts.get('word/document.xml')!,
    (tag) => {
      depth++;
      if (
        depth === 1 &&
        (tag.local !== 'document' || !wordNamespaces.has(tag.uri))
      )
        throw new BadRequestException('Tài liệu DOCX không hợp lệ');
      if (depth === 2 && tag.local === 'body' && wordNamespaces.has(tag.uri))
        bodies++;
    },
    () => {
      depth--;
    },
  );
  if (bodies !== 1)
    throw new BadRequestException('Nội dung chính DOCX không hợp lệ');
  return parts;
}

export function docxText(bytes: Buffer) {
  const parts = docxParts(bytes);
  const images = new Map<string, string>();
  const relations = parts.get('word/_rels/document.xml.rels');
  if (relations)
    xml(relations, (tag) => {
      if (
        tag.local !== 'Relationship' ||
        !attr(tag, 'Type')?.endsWith('/image')
      )
        return;
      const id = attr(tag, 'Id'),
        target = attr(tag, 'Target');
      if (!id || !target) return;
      if (attr(tag, 'TargetMode') === 'External') {
        images.set(id, '[Ảnh liên kết ngoài — chưa đọc]');
        return;
      }
      const part = posix.normalize(
        posix.join('word', decodeURIComponent(target)),
      );
      if (!part.startsWith('word/media/') || !parts.has(part))
        throw new BadRequestException('Nguồn ảnh DOCX không hợp lệ');
      images.set(id, `[Ảnh ${part} — chưa đọc nội dung ảnh]`);
    });
  const lines: string[] = [];
  let paragraph = '',
    style = '',
    reading = false,
    size = 0,
    table = 0,
    row = 0,
    cell = 0;
  const tables: { table: number; row: number; cell: number }[] = [];
  const emit = (value: string) => {
    size += Buffer.byteLength(value) + 1;
    if (size > 262_144 || lines.length >= 10_000)
      throw new BadRequestException('Nội dung DOCX quá lớn');
    lines.push(value);
  };
  xml(
    parts.get('word/document.xml')!,
    (tag) => {
      if (wordNamespaces.has(tag.uri)) {
        if (tag.local === 'p') {
          paragraph = '';
          style = '';
        }
        if (tag.local === 'pStyle') style = attr(tag, 'val') ?? '';
        if (tag.local === 't') reading = true;
        if (tag.local === 'tab') paragraph += '\t';
        if (tag.local === 'br')
          paragraph += attr(tag, 'type') === 'page' ? ' [Ngắt trang] ' : '\n';
        if (tag.local === 'tbl') {
          tables.push({ table: ++table, row, cell });
          row = 0;
          cell = 0;
        }
        if (tag.local === 'tr') {
          row++;
          cell = 0;
        }
        if (tag.local === 'tc') cell++;
      }
      if (
        (tag.local === 'blip' &&
          [
            'http://schemas.openxmlformats.org/drawingml/2006/main',
            'http://purl.oclc.org/ooxml/drawingml/main',
          ].includes(tag.uri)) ||
        (tag.local === 'imagedata' &&
          tag.uri === 'urn:schemas-microsoft-com:vml')
      )
        paragraph +=
          images.get(
            attr(tag, 'embed') ?? attr(tag, 'link') ?? attr(tag, 'id') ?? '',
          ) ?? '[Ảnh chưa đọc — thiếu nguồn nhúng]';
    },
    (tag) => {
      if (!wordNamespaces.has(tag.uri)) return;
      if (tag.local === 't') reading = false;
      if (tag.local === 'p' && paragraph.trim()) {
        const current = tables.at(-1);
        emit(
          `${current ? `[Bảng ${current.table} · hàng ${row} · ô ${cell}] ` : style ? `[Đề mục ${style}] ` : ''}${paragraph.trim()}`,
        );
      }
      if (tag.local === 'tbl') {
        const parent = tables.pop()!;
        row = parent.row;
        cell = parent.cell;
      }
    },
    (value) => {
      if (reading) paragraph += value;
    },
  );
  if (
    [...parts.keys()].some((name) =>
      /^word\/(header|footer|footnotes|endnotes)/i.test(name),
    )
  )
    emit(
      '[Phạm vi: đã đọc nội dung chính; đầu/chân trang và chú thích chưa trích.]',
    );
  return lines.join('\n');
}
