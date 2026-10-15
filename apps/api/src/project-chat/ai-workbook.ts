import { z } from 'zod';
import { Workbook, ValueType } from 'exceljs';
import { ToolDecimal } from './ai-decimal';
import { AiError } from './ai-registry';

const decimal = z.string().regex(/^-?(?:0|[1-9]\d{0,29})(?:\.\d{1,12})?$/);
const cell = z
  .string()
  .regex(/^[A-Z]{1,2}[1-9]\d{0,2}$/)
  .refine((address) => {
    const letters = address.match(/^[A-Z]+/)![0];
    return (
      [...letters].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) <= 50
    );
  });
const name = z
  .string()
  .min(1)
  .max(31)
  .refine(
    (value) =>
      Boolean(value.trim()) &&
      !value.startsWith("'") &&
      !value.endsWith("'") &&
      !/[[\]:*?/\\]/.test(value) &&
      [...value].every((c) => c.charCodeAt(0) >= 32),
  );
const format = z.enum(['general', 'integer', 'decimal2', 'percent2']);
export const workbookInput = z
  .object({
    sheets: z
      .array(
        z
          .object({
            name,
            cells: z
              .array(
                z.discriminatedUnion('kind', [
                  z
                    .object({
                      cell,
                      kind: z.literal('text'),
                      text: z
                        .string()
                        .max(4000)
                        .refine((value) =>
                          [...value].every(
                            (c) =>
                              c.charCodeAt(0) >= 32 ||
                              [9, 10, 13].includes(c.charCodeAt(0)),
                          ),
                        ),
                    })
                    .strict(),
                  z
                    .object({
                      cell,
                      kind: z.literal('number'),
                      value: decimal,
                      format,
                    })
                    .strict(),
                  z
                    .object({
                      cell,
                      kind: z.literal('formula'),
                      operation: z.enum([
                        'add',
                        'subtract',
                        'multiply',
                        'divide',
                      ]),
                      operands: z
                        .array(
                          z.union([
                            z.object({ value: decimal }).strict(),
                            z.object({ sheet: name, cell }).strict(),
                          ]),
                        )
                        .min(2)
                        .max(50),
                      decimalPlaces: z.number().int().min(0).max(12),
                      format,
                    })
                    .strict(),
                ]),
              )
              .max(400),
            images: z
              .array(
                z
                  .object({
                    cell,
                    sourceId: z.string().uuid(),
                    page: z
                      .number()
                      .int()
                      .min(1)
                      .max(2147483647)
                      .nullable()
                      .optional(),
                    caption: z.string().max(500),
                  })
                  .strict(),
              )
              .max(3),
          })
          .strict(),
      )
      .min(1)
      .max(10),
  })
  .strict()
  .refine(
    (value) =>
      value.sheets.reduce((n, s) => n + s.images.length, 0) <= 3 &&
      new Set(value.sheets.map((s) => s.name.toLocaleLowerCase('en-US')))
        .size === value.sheets.length &&
      value.sheets.every(
        (s) => new Set(s.cells.map((c) => c.cell)).size === s.cells.length,
      ),
  );
export type WorkbookInput = z.infer<typeof workbookInput>;
type Entry = WorkbookInput['sheets'][number]['cells'][number];
type Image = {
  sourceId: string;
  page?: number | null;
  mime: 'image/png' | 'image/jpeg';
  bytes: Buffer;
  width: number;
  height: number;
};

const safeNumber = (value: InstanceType<typeof ToolDecimal>) =>
  value.isFinite() &&
  value.sd() <= 15 &&
  value.abs().lt('1e30') &&
  new ToolDecimal(value.toNumber()).equals(value);

export async function renderWorkbook(
  raw: WorkbookInput,
  images: Image[],
  title: string,
) {
  const input = workbookInput.parse(raw),
    workbook = new Workbook();
  workbook.creator = 'Galaxy AI';
  workbook.title = title;
  workbook.created = new Date(0);
  workbook.modified = new Date(0);
  workbook.calcProperties.fullCalcOnLoad = true;
  const entries = new Map<string, Entry>(),
    resolved = new Map<string, string>(),
    visiting = new Set<string>();
  const key = (sheet: string, address: string) =>
    JSON.stringify([sheet, address]);
  for (const sheet of input.sheets)
    for (const entry of sheet.cells)
      entries.set(key(sheet.name, entry.cell), entry);
  const evaluate = (id: string): string => {
    const cached = resolved.get(id);
    if (cached !== undefined) return cached;
    const entry = entries.get(id);
    if (!entry || entry.kind === 'text')
      throw new AiError('WORKBOOK_REFERENCE_INVALID');
    if (visiting.has(id)) throw new AiError('WORKBOOK_FORMULA_CYCLE');
    visiting.add(id);
    let result: string;
    if (entry.kind === 'number') result = entry.value;
    else {
      const operands = entry.operands.map((operand) =>
        'value' in operand
          ? operand.value
          : evaluate(key(operand.sheet, operand.cell)),
      );
      if (operands.some((value) => !safeNumber(new ToolDecimal(value))))
        throw new AiError('DOCUMENT_PRECISION_REQUIRED');
      let value = new ToolDecimal(operands[0]!);
      let binary = Number(operands[0]!);
      for (const [offset, operand] of operands.slice(1).entries()) {
        const next = new ToolDecimal(operand);
        if (entry.operation === 'divide' && next.isZero())
          throw new AiError('DIVISION_BY_ZERO');
        value =
          entry.operation === 'add'
            ? value.add(next)
            : entry.operation === 'subtract'
              ? value.sub(next)
              : entry.operation === 'multiply'
                ? value.mul(next)
                : value.div(next);
        if (!value.isFinite() || value.abs().gte('1e30'))
          throw new AiError('CALCULATION_LIMIT');
        if (offset < operands.length - 2 && !safeNumber(value))
          throw new AiError('DOCUMENT_PRECISION_REQUIRED');
        binary =
          entry.operation === 'add'
            ? binary + Number(operand)
            : entry.operation === 'subtract'
              ? binary - Number(operand)
              : entry.operation === 'multiply'
                ? binary * Number(operand)
                : binary / Number(operand);
      }
      result = value.toFixed(entry.decimalPlaces);
      if (
        !safeNumber(new ToolDecimal(result)) ||
        !Number.isFinite(binary) ||
        new ToolDecimal(binary).toFixed(entry.decimalPlaces) !== result
      )
        throw new AiError('DOCUMENT_PRECISION_REQUIRED');
    }
    visiting.delete(id);
    resolved.set(id, result);
    return result;
  };
  const lines = ['BẢN NHÁP AI — CHƯA PHÊ DUYỆT', title],
    expected: {
      sheet: string;
      cell: string;
      value: string | number;
      formula?: string;
    }[] = [];
  for (const spec of input.sheets) {
    const sheet = workbook.addWorksheet(spec.name);
    sheet.headerFooter.oddHeader = '&CBẢN NHÁP — CHƯA PHÊ DUYỆT';
    sheet.headerFooter.oddFooter =
      '&L' + title.replaceAll('&', '&&') + '&RTrang &P / &N';
    sheet.columns = Array.from({ length: 50 }, () => ({ width: 24 }));
    lines.push('[Sheet ' + spec.name + ']');
    for (const entry of spec.cells) {
      const target = sheet.getCell(entry.cell);
      target.font = { name: 'Be Vietnam Pro', size: 12 };
      target.alignment = { wrapText: true, vertical: 'top' };
      if (entry.kind === 'text') {
        target.value = entry.text;
        target.numFmt = '@';
        expected.push({
          sheet: spec.name,
          cell: entry.cell,
          value: entry.text,
        });
        lines.push(entry.cell + ': ' + entry.text);
        continue;
      }
      const value = evaluate(key(spec.name, entry.cell)),
        number = new ToolDecimal(value);
      target.numFmt = {
        general: 'General',
        integer: '0',
        decimal2: '0.00',
        percent2: '0.00%',
      }[entry.format];
      if (!safeNumber(number)) {
        target.value = value;
        target.numFmt = '@';
        expected.push({ sheet: spec.name, cell: entry.cell, value });
        lines.push(
          entry.cell +
            ': ' +
            value +
            ' (vượt độ chính xác Excel; giữ dạng text)',
        );
        continue;
      }
      if (entry.kind === 'number') {
        target.value = number.toNumber();
        expected.push({
          sheet: spec.name,
          cell: entry.cell,
          value: number.toNumber(),
        });
      } else {
        const symbol = { add: '+', subtract: '-', multiply: '*', divide: '/' }[
          entry.operation
        ];
        const expression = entry.operands
          .map((operand) =>
            'value' in operand
              ? '(' + operand.value + ')'
              : "'" + operand.sheet.replaceAll("'", "''") + "'!" + operand.cell,
          )
          .join(symbol);
        const formula =
          'ROUND((' + expression + '),' + entry.decimalPlaces + ')';
        target.value = { formula, result: number.toNumber() };
        expected.push({
          sheet: spec.name,
          cell: entry.cell,
          value: number.toNumber(),
          formula,
        });
      }
      lines.push(
        entry.cell +
          ': ' +
          value +
          (entry.kind === 'formula' ? ' [formula; cached value đã tính]' : ''),
      );
    }
    for (const specImage of spec.images) {
      const image = images.find(
        (i) =>
          i.sourceId === specImage.sourceId &&
          (i.page ?? null) === (specImage.page ?? null),
      );
      if (!image) throw new AiError('DOCUMENT_IMAGE_UNAVAILABLE');
      const cell = sheet.getCell(specImage.cell);
      sheet.addImage(
        workbook.addImage({
          base64: image.bytes.toString('base64'),
          extension: image.mime === 'image/png' ? 'png' : 'jpeg',
        }),
        {
          tl: { col: Number(cell.col) - 1, row: Number(cell.row) - 1 },
          ext: { width: image.width, height: image.height },
        },
      );
      lines.push('Ảnh ' + specImage.cell + ': ' + specImage.caption);
    }
  }
  const bytes = Buffer.from(await workbook.xlsx.writeBuffer()),
    check = new Workbook();
  await check.xlsx.load(bytes as never);
  for (const entry of expected) {
    const cell = check.getWorksheet(entry.sheet)?.getCell(entry.cell);
    if (
      !cell ||
      (entry.formula
        ? cell.type !== ValueType.Formula ||
          cell.formula !== entry.formula ||
          cell.result !== entry.value
        : cell.value !== entry.value)
    )
      throw new AiError('DOCUMENT_VALIDATION_FAILED');
  }
  return { bytes, text: lines.join('\n') };
}
