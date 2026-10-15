import { BadRequestException } from '@nestjs/common';
import { posix } from 'node:path';
import { SaxesTagNS } from 'saxes';
import { boundedOfficeParts } from './office-archive';
import { officeXml } from './office-document';
export const pptxMime =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const attr = (tag: SaxesTagNS, name: string) =>
  Object.values(tag.attributes).find((a) => a.local === name)?.value;
const fail = () => {
  throw new BadRequestException(
    'PPTX không hợp lệ hoặc chứa nội dung chưa hỗ trợ',
  );
};

export function pptxParts(bytes: Buffer) {
  if (!bytes.length || bytes.length > 8_000_000) fail();
  const budget = { bytes: 0, entries: 0 };
  const parts = boundedOfficeParts(bytes, budget);
  let main = false,
    root = 0;
  for (const [name, data] of parts) {
    if (name.endsWith('/')) {
      if (data.length) fail();
      continue;
    }
    if (/vbaProject|oleObject|_xmlsignatures|\.(?:exe|dll|js|vbs)$/i.test(name))
      fail();
    if (name.includes('/embeddings/')) {
      if (
        !/^ppt\/embeddings\/[^/]+\.xlsx$/.test(name) ||
        data.length > 1_000_000
      )
        fail();
      const workbook = boundedOfficeParts(data, budget);
      let workbookMain = false,
        workbookRoot = 0,
        workbookXml = false;
      for (const [entry, content] of workbook) {
        if (/vbaProject|externalLinks|embeddings/i.test(entry)) fail();
        if (/\.(?:xml|rels)$/.test(entry))
          officeXml(
            content,
            (tag) => {
              if (
                tag.local === 'f' ||
                attr(tag, 'TargetMode') === 'External' ||
                /macroEnabled|vbaProject/i.test(attr(tag, 'ContentType') ?? '')
              )
                fail();
              if (
                entry === '[Content_Types].xml' &&
                tag.local === 'Override' &&
                attr(tag, 'PartName') === '/xl/workbook.xml' &&
                attr(tag, 'ContentType') ===
                  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml'
              )
                workbookMain = true;
              if (
                entry === '_rels/.rels' &&
                tag.local === 'Relationship' &&
                attr(tag, 'Type')?.endsWith('/officeDocument')
              ) {
                if (
                  !['xl/workbook.xml', '/xl/workbook.xml'].includes(
                    attr(tag, 'Target') ?? '',
                  )
                )
                  fail();
                workbookRoot++;
              }
              if (
                entry === 'xl/workbook.xml' &&
                tag.local === 'workbook' &&
                tag.uri ===
                  'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
              )
                workbookXml = true;
            },
            undefined,
            undefined,
            'PPTX',
          );
      }
      if (!workbookMain || workbookRoot !== 1 || !workbookXml) fail();
    }
    if (!/\.(?:xml|rels)$/.test(name)) continue;
    officeXml(
      data,
      (tag) => {
        if (
          attr(tag, 'TargetMode') === 'External' ||
          /macroEnabled|vbaProject/i.test(attr(tag, 'ContentType') ?? '')
        )
          fail();
        if (tag.local === 'oleObj') fail();
        if (
          name === '[Content_Types].xml' &&
          tag.local === 'Override' &&
          attr(tag, 'PartName') === '/ppt/presentation.xml' &&
          attr(tag, 'ContentType') === `${pptxMime}.main+xml`
        )
          main = true;
        if (
          name === '_rels/.rels' &&
          tag.local === 'Relationship' &&
          attr(tag, 'Type')?.endsWith('/officeDocument')
        ) {
          if (
            !['ppt/presentation.xml', '/ppt/presentation.xml'].includes(
              attr(tag, 'Target') ?? '',
            )
          )
            fail();
          root++;
        }
      },
      undefined,
      undefined,
      'PPTX',
    );
  }
  if (!main || root !== 1 || !parts.has('ppt/presentation.xml')) fail();
  return parts;
}

export function pptxText(bytes: Buffer) {
  const parts = pptxParts(bytes),
    relations = new Map<string, string>(),
    slides: string[] = [],
    lines: string[] = [];
  const rels = parts.get('ppt/_rels/presentation.xml.rels');
  if (!rels) fail();
  officeXml(
    rels!,
    (tag) => {
      if (
        tag.local !== 'Relationship' ||
        !attr(tag, 'Type')?.endsWith('/slide')
      )
        return;
      const id = attr(tag, 'Id'),
        target = attr(tag, 'Target');
      if (!id || !target) fail();
      const name = posix.normalize(posix.join('ppt', target!));
      if (!/^ppt\/slides\/slide\d+\.xml$/.test(name) || !parts.has(name))
        fail();
      relations.set(id!, name);
    },
    undefined,
    undefined,
    'PPTX',
  );
  officeXml(
    parts.get('ppt/presentation.xml')!,
    (tag) => {
      if (tag.local !== 'sldId') return;
      const id = Object.values(tag.attributes).find(
        (a) => a.local === 'id' && a.uri.endsWith('/relationships'),
      )?.value;
      if (!id || !relations.has(id) || slides.length >= 100) fail();
      slides.push(relations.get(id!)!);
    },
    undefined,
    undefined,
    'PPTX',
  );
  if (!slides.length) fail();
  let size = 0;
  for (const [i, name] of slides.entries()) {
    let reading = false,
      text = '';
    officeXml(
      parts.get(name)!,
      (tag) => {
        if (tag.local === 't' && tag.uri.endsWith('/drawingml/2006/main'))
          reading = true;
      },
      (tag) => {
        if (tag.local === 't') reading = false;
        if (tag.local === 'p' && text.trim()) {
          lines.push(`Slide ${i + 1}: ${text.trim()}`);
          text = '';
        }
      },
      (value) => {
        if (!reading) return;
        size += Buffer.byteLength(value);
        if (size > 262_144 || lines.length >= 10_000) fail();
        text += value;
      },
      'PPTX',
    );
  }
  return (
    '[Phạm vi: chữ native trong slide; ảnh/chart/layout chưa được phân tích.]\n' +
    lines.join('\n')
  );
}
