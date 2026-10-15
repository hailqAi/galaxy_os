import JSZip from 'jszip';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { createWriteStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
  'base64',
);
export async function docxFixture(parts: Record<string, string | Buffer> = {}) {
  const zip = new JSZip();
  zip.file(
    '_rels/.rels',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.file(
    '[Content_Types].xml',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    'word/document.xml',
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Điều khoản</w:t></w:r></w:p><w:p><w:r><w:t>Bên A &amp; B giữ bản gốc.</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Mã</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>DOC-842</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:p><w:r><w:drawing><a:blip r:embed="rId1"/></w:drawing></w:r></w:p></w:body></w:document>',
  );
  zip.file(
    'word/_rels/document.xml.rels',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/></Relationships>',
  );
  zip.file('word/media/image1.png', png);
  for (const [name, value] of Object.entries(parts)) zip.file(name, value);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

export function scanPdfFixture(pages = 1) {
  const content = 'q 160 0 0 160 20 20 cm /Im1 Do Q';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${Array.from({ length: pages }, (_, i) => `${5 + i} 0 R`).join(' ')}] /Count ${pages} >>`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length 3 >>\nstream\nABC\nendstream',
    ...Array.from(
      { length: pages },
      () =>
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /XObject << /Im1 4 0 R >> >> /Contents 3 0 R >>',
    ),
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const [i, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((n) => String(n).padStart(10, '0') + ' 00000 n ')
    .join(
      '\n',
    )}\ntrailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

export async function textPdfFixture(pages: number) {
  const document = new PDFDocument({ autoFirstPage: false });
  const parts: Buffer[] = [];
  const ended = new Promise<Buffer>((done, reject) => {
    document.on('data', (part: Buffer) => parts.push(part));
    document.on('end', () => done(Buffer.concat(parts)));
    document.on('error', reject);
  });
  for (let page = 1; page <= pages; page++)
    document.addPage().text(`PAGE-${page} quantity 2 price 12.50 total 25.00`);
  document.end();
  return ended;
}

export async function longLinePdfFixture() {
  const document = new PDFDocument({ size: [9000, 300], margin: 10 });
  const parts: Buffer[] = [];
  const ended = new Promise<Buffer>((done, reject) => {
    document.on('data', (part: Buffer) => parts.push(part));
    document.on('end', () => done(Buffer.concat(parts)));
    document.on('error', reject);
  });
  document
    .fontSize(0.25)
    .text('A'.repeat(25000) + ' DISTINCTIVE-LAST-FACT', { lineBreak: false });
  document.end();
  return ended;
}

export async function xlsxFixture() {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Đối chiếu');
  sheet.addRow(['Mã', 'Giá trị']);
  sheet.addRow(['XLS-7391', { formula: '21*2', result: 42 }]);
  sheet.getCell('B2').numFmt = '#,##0 "₫"';
  return Buffer.from(await book.xlsx.writeBuffer());
}

export async function largeWorkbookFixture(path: string, totalBytes: number) {
  const write = async (padding: number, flags: 'w' | 'wx') => {
    const zip = new JSZip();
    zip.file(
      '[Content_Types].xml',
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>',
    );
    zip.file(
      '_rels/.rels',
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    );
    zip.file(
      'xl/workbook.xml',
      '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Rows" sheetId="1" r:id="r1"/><sheet name="Quote" sheetId="2" r:id="r2"/></sheets></workbook>',
    );
    zip.file(
      'xl/_rels/workbook.xml.rels',
      '<Relationships><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="r2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>',
    );
    const rows = Array.from(
      { length: 1002 },
      (_, i) => `<row r="${i + 1}"><c r="A${i + 1}"><v>${i}</v></c></row>`,
    ).join('');
    zip.file(
      'xl/worksheets/sheet1.xml',
      '<worksheet><sheetData>' + rows + '</sheetData></worksheet>',
    );
    zip.file(
      'xl/worksheets/sheet2.xml',
      '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>FIRST-0007392</t></is></c></row><row r="5001"><c r="A5001" t="inlineStr"><is><t>MIDDLE-0007392</t></is></c></row><row r="10001"><c r="A10001" t="inlineStr"><is><t>LAST-0007392</t></is></c><c r="B10001" s="1"><f>12.50*2</f><v>25.00</v></c><c r="C10001"><f>1+1</f></c></row></sheetData></worksheet>',
    );
    zip.file(
      'xl/styles.xml',
      '<styleSheet><cellXfs><xf numFmtId="0"/><xf numFmtId="4"/></cellXfs></styleSheet>',
    );
    // Padding verifies physical upload bytes; populated XML rows verify reader work.
    zip.file(
      'xl/media/padding.bin',
      Readable.from(
        (async function* () {
          const block = Buffer.alloc(262144);
          for (
            let remaining = padding;
            remaining > 0;
            remaining -= block.length
          )
            yield block.subarray(0, Math.min(block.length, remaining));
        })(),
      ),
    );
    await pipeline(
      zip.generateNodeStream({ streamFiles: true, compression: 'STORE' }),
      createWriteStream(path, { flags, mode: 0o600 }),
    );
  };
  await write(0, 'wx');
  const overhead = (await stat(path)).size;
  if (!Number.isSafeInteger(totalBytes) || totalBytes <= overhead)
    throw new Error('Workbook fixture size is invalid');
  await write(totalBytes - overhead, 'w');
  if ((await stat(path)).size !== totalBytes)
    throw new Error('Workbook fixture size differs from the requested bytes');
}
