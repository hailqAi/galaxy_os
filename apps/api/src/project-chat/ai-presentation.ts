import { z } from 'zod';
import PptxGenJS from 'pptxgenjs';
import JSZip from 'jszip';
import PDFDocument from 'pdfkit';
import { resolve } from 'node:path';
import { AiError } from './ai-registry';
import { ToolDecimal } from './ai-decimal';

export { pptxMime } from '../files/office-presentation';
const text = z
  .string()
  .max(1000)
  .refine((value) =>
    [...value].every(
      (c) => c.charCodeAt(0) >= 32 || [9, 10, 13].includes(c.charCodeAt(0)),
    ),
  );
const box = {
  x: z.number().min(0).max(13.33),
  y: z.number().min(1.2).max(6.8),
  w: z.number().min(0.2).max(13),
  h: z.number().min(0.2).max(5.6),
};
const decimal = z.string().regex(/^-?(?:0|[1-9]\d{0,29})(?:\.\d{1,12})?$/);
export const presentationInput = z
  .object({
    template: z.enum(['galaxy-light', 'galaxy-dark']),
    slides: z
      .array(
        z
          .object({
            title: text.min(1).max(120),
            elements: z
              .array(
                z.discriminatedUnion('kind', [
                  z
                    .object({
                      kind: z.literal('text'),
                      ...box,
                      text,
                      fontSize: z.number().min(12).max(36),
                      bold: z.boolean(),
                    })
                    .strict(),
                  z
                    .object({
                      kind: z.literal('shape'),
                      ...box,
                      shape: z.enum(['rect', 'ellipse']),
                      fillColor: z.string().regex(/^[A-Fa-f0-9]{6}$/),
                    })
                    .strict(),
                  z
                    .object({
                      kind: z.literal('image'),
                      ...box,
                      sourceId: z.string().uuid(),
                    })
                    .strict(),
                  z
                    .object({
                      kind: z.literal('table'),
                      ...box,
                      fontSize: z.number().min(12).max(24),
                      rows: z.array(z.array(text).min(1).max(8)).min(1).max(12),
                    })
                    .strict(),
                  z
                    .object({
                      kind: z.literal('chart'),
                      ...box,
                      title: text.max(80),
                      labels: z.array(text.min(1).max(40)).min(1).max(6),
                      series: z
                        .array(
                          z
                            .object({
                              name: text.max(40),
                              values: z.array(decimal).min(1).max(6),
                            })
                            .strict(),
                        )
                        .min(1)
                        .max(3),
                    })
                    .strict(),
                ]),
              )
              .min(1)
              .max(20),
          })
          .strict(),
      )
      .min(1)
      .max(12),
  })
  .strict()
  .refine((input) => {
    const elements = input.slides.flatMap((slide) => slide.elements);
    return (
      elements.length <= 100 &&
      elements.filter((e) => e.kind === 'image').length <= 3 &&
      elements.every(
        (e) =>
          e.x + e.w <= 13.33 &&
          e.y + e.h <= 6.8 &&
          (e.kind !== 'table' ||
            e.rows.every((r) => r.length === e.rows[0]!.length)) &&
          (e.kind !== 'chart' ||
            e.series.every((s) => s.values.length === e.labels.length)),
      ) &&
      elements.reduce(
        (n, e) =>
          n +
          (e.kind === 'table'
            ? e.rows.reduce((sum, r) => sum + r.length, 0)
            : 0),
        0,
      ) <= 400
    );
  });
type PresentationInput = z.infer<typeof presentationInput>;
type Image = {
  sourceId: string;
  mime: 'image/png' | 'image/jpeg';
  bytes: Buffer;
  width: number;
  height: number;
};

export async function renderPresentation(
  raw: PresentationInput,
  images: Image[],
  title: string,
) {
  const input = presentationInput.parse(raw),
    deck = new PptxGenJS();
  deck.layout = 'LAYOUT_WIDE';
  deck.author = 'Galaxy AI';
  deck.title = title;
  deck.theme = {
    headFontFace: 'Be Vietnam Pro',
    bodyFontFace: 'Be Vietnam Pro',
  };
  const dark = input.template === 'galaxy-dark',
    color = dark ? 'FFFFFF' : '172033';
  deck.defineSlideMaster({
    title: 'DRAFT',
    background: { color: dark ? '172033' : 'FFFFFF' },
    objects: [
      {
        text: {
          text: 'BẢN NHÁP — CHƯA PHÊ DUYỆT',
          options: { x: 0.4, y: 7.05, w: 11, h: 0.25, fontSize: 10, color },
        },
      },
    ],
    slideNumber: { x: 12, y: 7.05, color },
  });
  const measure = new PDFDocument({
    font: resolve(__dirname, '../../../web/app/assets/be-vietnam-pro-3.ttf'),
  });
  const fits = (value: string, size: number, width: number, height: number) => {
    const measured = measure
      .fontSize(size)
      .heightOfString(value, { width: width * 72, lineGap: 0 });
    if (!Number.isFinite(measured) || measured * 1.2 > height * 72)
      throw new AiError('PRESENTATION_TEXT_OVERFLOW');
  };
  const lines = ['BẢN NHÁP AI — CHƯA PHÊ DUYỆT', title];
  try {
    for (const [index, spec] of input.slides.entries()) {
      const slide = deck.addSlide('DRAFT');
      fits(spec.title, 28, 12, 0.7);
      slide.addText(spec.title, {
        x: 0.5,
        y: 0.3,
        w: 12,
        h: 0.7,
        fontSize: 28,
        color,
        margin: 0,
      });
      lines.push('[Slide ' + (index + 1) + '] ' + spec.title);
      for (const element of spec.elements) {
        const bounds = {
          x: element.x,
          y: element.y,
          w: element.w,
          h: element.h,
        };
        if (element.kind === 'text') {
          fits(element.text, element.fontSize, element.w, element.h);
          slide.addText(element.text, {
            ...bounds,
            fontSize: element.fontSize,
            bold: element.bold,
            color,
            margin: 0,
          });
          lines.push(element.text);
        } else if (element.kind === 'shape') {
          slide.addShape(deck.ShapeType[element.shape], {
            ...bounds,
            fill: { color: element.fillColor },
            line: { color: element.fillColor },
          });
        } else if (element.kind === 'image') {
          const image = images.find((i) => i.sourceId === element.sourceId);
          if (!image) throw new AiError('DOCUMENT_IMAGE_UNAVAILABLE');
          const scale = Math.min(
              element.w / image.width,
              element.h / image.height,
            ),
            w = image.width * scale,
            h = image.height * scale;
          slide.addImage({
            data: image.mime + ';base64,' + image.bytes.toString('base64'),
            x: element.x + (element.w - w) / 2,
            y: element.y + (element.h - h) / 2,
            w,
            h,
          });
          lines.push('Ảnh nguồn ' + element.sourceId);
        } else if (element.kind === 'table') {
          const columns = element.rows[0]!.length,
            rowH = element.h / element.rows.length;
          for (const row of element.rows)
            for (const value of row)
              fits(
                value,
                element.fontSize,
                element.w / columns - 8 / 72,
                rowH - 8 / 72,
              );
          slide.addTable(
            element.rows.map((row) => row.map((value) => ({ text: value }))),
            {
              ...bounds,
              fontSize: element.fontSize,
              color,
              fill: { color: dark ? '172033' : 'FFFFFF' },
              border: { pt: 1, color: dark ? 'AAAAAA' : '777777' },
              margin: 4,
              rowH,
              autoPage: false,
            },
          );
          lines.push(...element.rows.map((row) => row.join(' | ')));
        } else {
          const data = element.series.map((series) => ({
            name: series.name,
            labels: element.labels,
            values: series.values.map((value) => {
              const number = new ToolDecimal(value);
              if (
                !number.isFinite() ||
                number.sd() > 15 ||
                number.abs().gte('1e15') ||
                !new ToolDecimal(number.toNumber()).equals(number)
              )
                throw new AiError('DOCUMENT_PRECISION_REQUIRED');
              return number.toNumber();
            }),
          }));
          slide.addChart(deck.ChartType.bar, data, {
            ...bounds,
            showTitle: true,
            title: element.title,
            showValue: true,
            dataLabelFormatCode: '0.00',
            showLegend: data.length > 1,
            catAxisLabelColor: color,
            valAxisLabelColor: color,
            legendColor: color,
          });
          lines.push(
            element.title,
            ...element.series.map(
              (series) => series.name + ': ' + series.values.join(' | '),
            ),
          );
        }
      }
    }
  } finally {
    measure.destroy();
  }
  const zip = await JSZip.loadAsync(
    (await deck.write({ outputType: 'nodebuffer' })) as Buffer,
  );
  const presentation = await zip.file('ppt/presentation.xml')!.async('string'),
    notes = presentation.match(
      /<p:notesMasterIdLst>.*?<\/p:notesMasterIdLst>/s,
    );
  if (!notes || !presentation.includes('<p:sldIdLst>'))
    throw new AiError('DOCUMENT_VALIDATION_FAILED');
  // PptxGenJS4.0.1 misorders notes masters and emits an unused third 2D bar axis.
  zip.file(
    'ppt/presentation.xml',
    presentation
      .replace(notes[0], '')
      .replace('<p:sldIdLst>', notes[0] + '<p:sldIdLst>'),
  );
  for (const name of Object.keys(zip.files).filter((n) =>
    /^ppt\/charts\/chart\d+\.xml$/.test(n),
  )) {
    const xml = await zip.file(name)!.async('string');
    if (xml.includes('<c:serAx>'))
      throw new AiError('DOCUMENT_VALIDATION_FAILED');
    zip.file(
      name,
      xml.replace(/<c:barChart>(.*?)<\/c:barChart>/s, (_, body: string) => {
        const axes = [...body.matchAll(/<c:axId val="(\d+)"\/>/g)];
        if (axes.length !== 3 || axes[2]![1] !== '2094734556')
          throw new AiError('DOCUMENT_VALIDATION_FAILED');
        return '<c:barChart>' + body.replace(axes[2]![0], '') + '</c:barChart>';
      }),
    );
  }
  for (const name of Object.keys(zip.files).filter((n) => n.endsWith('.rels')))
    if (
      (await zip.file(name)!.async('string')).includes('TargetMode="External"')
    )
      throw new AiError('DOCUMENT_VALIDATION_FAILED');
  return {
    bytes: await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
    }),
    text: lines.join('\n'),
  };
}
