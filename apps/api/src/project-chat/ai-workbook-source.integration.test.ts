import { expect, it } from 'vitest';
import JSZip from 'jszip';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { analyzeTableFile, xlsxFileManifest } from './ai-native-source';

it('reads the actual E05 Work-generated workbook without rewriting its bytes', async () => {
  const path = join(__dirname, '../../test/fixtures/e05-work-generated.xlsx');
  const manifest = await xlsxFileManifest(path);
  expect(manifest.sheets).toHaveLength(1);
  const result = await analyzeTableFile(
    path,
    manifest.sheets[0]!.name,
    'D9:D13',
  );
  expect(
    result.cells.map((cell) => [cell.address, cell.value, cell.formula]),
  ).toEqual([
    ['D9', '600000', 'SUM(D6:D7)'],
    ['D10', '60000', 'ROUND(D9*C10,0)'],
    ['D11', '540000', 'D9-D10'],
    ['D12', '43200', 'ROUND(D11*C12,0)'],
    ['D13', '583200', 'SUM(D11:D12)'],
  ]);
});

async function fixture(
  sheet: string,
  read: (path: string) => Promise<void>,
  relationshipTarget = 'worksheets/sheet1.xml',
) {
  const directory = await mkdtemp(join(tmpdir(), 'galaxy-workbook-source-'));
  try {
    const zip = new JSZip();
    zip.file(
      'xl/workbook.xml',
      '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Quote" sheetId="1" r:id="r1"/></sheets></workbook>',
    );
    zip.file(
      'xl/_rels/workbook.xml.rels',
      `<Relationships><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="${relationshipTarget}"/></Relationships>`,
    );
    zip.file('xl/worksheets/sheet1.xml', sheet);
    zip.file(
      'xl/sharedStrings.xml',
      '<sst><si><t>0007392</t></si><si><r><t>last </t></r><r><t>fact</t></r></si></sst>',
    );
    zip.file(
      'xl/styles.xml',
      '<styleSheet><numFmts><numFmt numFmtId="164" formatCode="#,##0.00 VND"/></numFmts><cellXfs><xf numFmtId="0"/><xf numFmtId="164"/></cellXfs></styleSheet>',
    );
    // Stored padding tests file transport; 1002 populated rows test parsing.
    zip.file('xl/media/image1.png', Buffer.alloc(8_000_001));
    const path = join(directory, 'source.xlsx');
    await writeFile(path, await zip.generateAsync({ type: 'nodebuffer' }));
    await read(path);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

it('reads an internal worksheet relationship rooted at the OPC package', async () => {
  await fixture(
    '<worksheet><sheetData><row r="1"><c r="A1"><v>583200</v></c></row></sheetData></worksheet>',
    async (path) => {
      expect((await xlsxFileManifest(path)).sheets).toEqual([
        { name: 'Quote', rows: 1, columns: 1, populatedRows: 1 },
      ]);
      expect(
        (await analyzeTableFile(path, 'Quote', 'A1:A1')).cells[0],
      ).toMatchObject({
        address: 'A1',
        value: '583200',
      });
    },
    '/xl/worksheets/sheet1.xml',
  );
});

it.each([
  '/etc/passwd',
  '//xl/worksheets/sheet1.xml',
  '/../../xl/worksheets/sheet1.xml',
])(
  'rejects a worksheet target outside the internal package: %s',
  async (target) => {
    await fixture(
      '<worksheet><sheetData><row r="1"><c r="A1"><v>1</v></c></row></sheetData></worksheet>',
      async (path) => {
        await expect(xlsxFileManifest(path)).rejects.toThrow(
          'WORKBOOK_READ_UNAVAILABLE',
        );
      },
      target,
    );
  },
);

it('reads a local XLSX beyond 8MB and row9999 without the business-import row limit', async () => {
  const rows = Array.from(
    { length: 1002 },
    (_, i) => `<row r="${i + 1}"><c r="A${i + 1}"><v>${i}</v></c></row>`,
  ).join('');
  await fixture(
    '<worksheet><sheetData>' +
      rows +
      '<row r="10001"><c r="A10001" t="s"><v>0</v></c><c r="B10001" s="1"><f>0.1+0.2</f><v>0.3</v></c><c r="C10001"><f>1+1</f></c><c r="D10001" t="s"><v>1</v></c></row></sheetData></worksheet>',
    async (path) => {
      const manifest = await xlsxFileManifest(path);
      expect(manifest.sheets).toEqual([
        { name: 'Quote', rows: 10001, columns: 4, populatedRows: 1003 },
      ]);
      const result = await analyzeTableFile(path, 'Quote', 'A10001:D10001');
      expect(result.cells).toEqual([
        {
          address: 'A10001',
          value: '0007392',
          formula: null,
          format: 'General',
          recalculated: false,
        },
        {
          address: 'B10001',
          value: '0.3',
          formula: '0.1+0.2',
          format: '#,##0.00 VND',
          recalculated: false,
        },
        {
          address: 'C10001',
          value: null,
          formula: '1+1',
          format: 'General',
          recalculated: false,
        },
        {
          address: 'D10001',
          value: 'last fact',
          formula: null,
          format: 'General',
          recalculated: false,
        },
      ]);
      expect(result.numericGroups).toEqual([
        { format: '#,##0.00 VND', sum: '0.3', count: 1 },
      ]);
      expect(result.missingCount).toBe(1);
    },
  );
});

it('rejects XML entities without reading host files or treating them as cells', async () => {
  await fixture(
    '<!DOCTYPE worksheet [<!ENTITY private SYSTEM "file:///etc/passwd">]><worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>&private;</t></is></c></row></sheetData></worksheet>',
    async (path) => {
      await expect(analyzeTableFile(path, 'Quote', 'A1:A1')).rejects.toThrow(
        'WORKBOOK_READ_UNAVAILABLE',
      );
    },
  );
});

it('keeps a missing sheet recoverable and permits the correct sheet on the same original', async () => {
  await fixture(
    '<worksheet><sheetData><row r="1"><c r="A1"><v>2</v></c></row></sheetData></worksheet>',
    async (path) => {
      await expect(analyzeTableFile(path, 'Missing', 'A1:A1')).rejects.toThrow(
        'SHEET_NOT_FOUND',
      );
      expect(
        (await analyzeTableFile(path, 'Quote', 'A1:A1')).cells[0]?.value,
      ).toBe('2');
    },
  );
});

it('retains shared formula provenance when the master is outside the selected range', async () => {
  await fixture(
    '<worksheet><sheetData><row r="1"><c r="A1"><v>2</v></c><c r="B1"><f t="shared" si="0" ref="B1:B2">A1*2</f><v>4</v></c></row><row r="2"><c r="A2"><v>3</v></c><c r="B2"><f t="shared" si="0"/><v>6</v></c></row></sheetData></worksheet>',
    async (path) => {
      const follower = (await analyzeTableFile(path, 'Quote', 'B2:B2'))
        .cells[0];
      expect(follower).toMatchObject({
        value: '6',
        formula: null,
        formulaSource: { type: 'shared', sharedIndex: '0', range: null },
        recalculated: false,
      });
      expect(
        (await analyzeTableFile(path, 'Quote', 'B1:B1')).cells[0],
      ).toMatchObject({
        formula: 'A1*2',
        formulaSource: { type: 'shared', sharedIndex: '0', range: 'B1:B2' },
      });
    },
  );
});

it('labels an array formula follower whose master is outside the selected range', async () => {
  await fixture(
    '<worksheet><sheetData><row r="1"><c r="B1"><f t="array" ref="B1:B2">A1:A2*2</f><v>4</v></c></row><row r="2"><c r="B2"><v>6</v></c></row></sheetData></worksheet>',
    async (path) => {
      expect(
        (await analyzeTableFile(path, 'Quote', 'B2:B2')).cells[0],
      ).toMatchObject({
        value: '6',
        formula: null,
        formulaSource: { type: 'array', sharedIndex: null, range: 'B1:B2' },
        recalculated: false,
      });
    },
  );
});

it('labels a data table follower whose master is outside the selected range', async () => {
  await fixture(
    '<worksheet><sheetData><row r="1"><c r="B1"><f t="dataTable" ref="B1:B2" r1="A1"/><v>4</v></c></row><row r="2"><c r="B2"><v>6</v></c></row></sheetData></worksheet>',
    async (path) => {
      expect(
        (await analyzeTableFile(path, 'Quote', 'B2:B2')).cells[0],
      ).toMatchObject({
        value: '6',
        formula: null,
        formulaSource: { type: 'dataTable', sharedIndex: null, range: 'B1:B2' },
        recalculated: false,
      });
    },
  );
});

it('refuses a numeric group whose exact sum exceeds the existing Decimal precision', async () => {
  await fixture(
    '<worksheet><sheetData><row r="1"><c r="A1"><v>1e50</v></c><c r="B1"><v>1e-50</v></c></row></sheetData></worksheet>',
    async (path) => {
      await expect(analyzeTableFile(path, 'Quote', 'A1:B1')).rejects.toThrow(
        'CALCULATION_LIMIT',
      );
    },
  );
});

it('retains the 400-cell range bound and the XLSX coordinate bounds', async () => {
  await expect(
    analyzeTableFile('/missing.xlsx', 'Quote', 'A1:Z9999'),
  ).rejects.toThrow('TABLE_RANGE_LIMIT');
  await expect(
    analyzeTableFile('/missing.xlsx', 'Quote', 'XFE1:XFE1'),
  ).rejects.toThrow('TABLE_RANGE_LIMIT');
  await expect(
    analyzeTableFile('/missing.xlsx', 'Quote', 'A1048577:A1048577'),
  ).rejects.toThrow('TABLE_RANGE_LIMIT');
});
