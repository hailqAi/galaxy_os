import { expect, it } from 'vitest';
import JSZip from 'jszip';
import { renderDocument } from './ai-document';
import { activationFixture } from './ai-activation';

const sourceId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const input = () => ({
  version: 2,
  format: 'pptx',
  title: 'Báo giá native',
  blocks: [],
  presentation: {
    template: 'galaxy-light',
    slides: [
      {
        title: 'Báo giá nháp Việt Nam',
        elements: [
          {
            kind: 'text',
            x: 0.5,
            y: 1.3,
            w: 5,
            h: 0.5,
            text: 'Mã 0007392 · VND',
            fontSize: 20,
            bold: true,
          },
          {
            kind: 'shape',
            x: 0.5,
            y: 2,
            w: 3,
            h: 1,
            shape: 'rect',
            fillColor: 'E2EDFF',
          },
          { kind: 'image', x: 0.6, y: 2.1, w: 0.8, h: 0.8, sourceId },
          {
            kind: 'table',
            x: 0.5,
            y: 3.5,
            w: 6,
            h: 1.5,
            fontSize: 16,
            rows: [
              ['Mã', 'Tổng VND'],
              ['0007392', '275001.10'],
            ],
          },
          {
            kind: 'chart',
            x: 7,
            y: 1.5,
            w: 5.5,
            h: 4,
            title: 'Giá trị VND',
            labels: ['Tiền hàng', 'Thuế'],
            series: [{ name: 'VND', values: ['250001.00', '25000.10'] }],
          },
        ],
      },
    ],
  },
});

it('v2 creates editable PPTX objects, chart data, image bytes and a DRAFT layout under a native master', async () => {
  const image = activationFixture('image').media[0]!;
  const rendered = await renderDocument(input(), [
    { sourceId, mime: 'image/png', bytes: image.bytes },
  ]);
  expect(rendered.mime).toBe(
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  );
  const zip = await JSZip.loadAsync(rendered.bytes);
  const slide = await zip.file('ppt/slides/slide1.xml')!.async('string');
  expect(slide).toContain('Báo giá nháp Việt Nam');
  expect(slide).toContain('<p:sp>');
  expect(slide).toContain('<p:pic>');
  expect(slide).toContain('<a:tbl>');
  expect(slide).toContain('275001.10');
  const chart = await zip.file('ppt/charts/chart1.xml')!.async('string');
  expect(chart).toContain('25000.1');
  expect(chart).toContain('250001');
  expect(
    chart.match(/<c:barChart>(.*?)<\/c:barChart>/s)![1]!.match(/<c:axId /g),
  ).toHaveLength(2);
  const presentation = await zip.file('ppt/presentation.xml')!.async('string');
  expect(presentation.indexOf('<p:notesMasterIdLst>')).toBeLessThan(
    presentation.indexOf('<p:sldIdLst>'),
  );
  const master = await zip
    .file('ppt/slideMasters/slideMaster1.xml')!
    .async('string');
  expect(master).toContain('<p:sldLayoutIdLst>');
  const rels = await zip
    .file('ppt/slides/_rels/slide1.xml.rels')!
    .async('string');
  const layoutName = rels.match(
    /Type="[^"]*\/slideLayout" Target="\.\.\/slideLayouts\/([^"]+)"/,
  )![1]!;
  expect(
    await zip.file('ppt/slideLayouts/' + layoutName)!.async('string'),
  ).toContain('BẢN NHÁP');
  const media = Object.keys(zip.files).filter(
    (n) => n.startsWith('ppt/media/') && !zip.files[n]!.dir,
  );
  expect(media).toHaveLength(1);
  expect(await zip.file(media[0]!)!.async('nodebuffer')).toEqual(image.bytes);
  expect(rendered.text).toContain('0007392');
  for (const name of Object.keys(zip.files)) {
    expect(name).not.toMatch(/vbaProject|oleObject/i);
    if (name.endsWith('.rels'))
      expect(await zip.file(name)!.async('string')).not.toContain(
        'TargetMode="External"',
      );
  }
});

it.each(['outside-slide', 'overflow', 'url', 'unsafe-chart-number'])(
  'PPTX rejects %s rather than publishing a misleading preview',
  async (mode) => {
    const raw = input(),
      element = raw.presentation.slides[0]!.elements[0]!;
    if (mode === 'outside-slide') Object.assign(element, { x: 12, w: 3 });
    if (mode === 'overflow')
      Object.assign(element, {
        text: 'Điều khoản '.repeat(100),
        h: 0.2,
        fontSize: 36,
      });
    if (mode === 'url')
      Object.assign(raw.presentation.slides[0]!.elements[2]!, {
        path: 'https://private.invalid/image.png',
      });
    if (mode === 'unsafe-chart-number')
      Object.assign(raw.presentation.slides[0]!.elements[4]!, {
        series: [{ name: 'VND', values: ['123456789012345678.90', '1'] }],
      });
    await expect(
      renderDocument(raw, [
        {
          sourceId,
          mime: 'image/png',
          bytes: activationFixture('image').media[0]!.bytes,
        },
      ]),
    ).rejects.toThrow();
  },
);
