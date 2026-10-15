import { expect, it, vi } from 'vitest';
import {
  calculate,
  SIWC_PROJECT_READ_TOOLS,
  createToolRunner,
  toolInputs,
  toolDefinitions,
  type ToolName,
  memoryCitationSchema,
  savedMemoryCitations,
  citationHandle,
  savedToolSources,
  toolSourcesSchema,
  type ToolSource,
  pdfCoverageLedger,
  requestsWholeDocument,
} from './ai-tools';
import { createHash, randomUUID } from 'node:crypto';

it.each([
  'Read every page of the attached PDF, including the last-page fact; report the whole document.',
  'Read the entire attached PDF.',
  'Read the whole attached workbook.',
  'Analyze all sheets and all rows of this workbook.',
  'Rebuild the entire quotation from the attached PDF.',
  'Đọc toàn bộ tài liệu và kiểm tất cả các trang.',
  'Đọc toàn bộ đúng PDF đính kèm, chỉ dùng tài liệu này, không web.',
  'Làm lại tôi báo giá từ tệp đã gửi.',
  'Read every page of this PDF, but do not analyze images.',
  'Đọc toàn bộ tài liệu, không phân tích hình ảnh.',
  'Read every page of this PDF but do not analyze images.',
  'Read every page of this PDF, but only page 1 as an image.',
  'Đọc toàn bộ tài liệu, chỉ trang 1 cần kiểm hình.',
])('recognizes the whole-document request %s', (question) => {
  expect(requestsWholeDocument(question)).toBe(true);
});

it.each([
  'Read only page 1 of this PDF; do not read pages 2 or 3.',
  'Chỉ đọc trang 2 và kiểm đơn giá.',
  'Do not read the whole document; read page 1.',
  'Do not read the entire attached PDF; read only page 1.',
  'Read only page 1 of the whole attached workbook.',
  'Do not rebuild the entire quotation; read only page 1.',
  'Không đọc toàn bộ tài liệu; chỉ kiểm trang 1.',
  'Không cần đọc toàn bộ tệp; chỉ kiểm trang 1.',
  'Không cần đọc toàn bộ đúng PDF; chỉ kiểm trang 1.',
  'Không làm lại báo giá; chỉ đọc trang 1.',
  'Never read the full document; just page 1.',
  'Not all pages are required; read page 1.',
  'Read only page 1 of the whole document.',
  'Read only page 1 from the whole document.',
  'Calculate all three numbers: 1, 2, 3.',
  'Explain what a PDF is.',
])('keeps the narrower document request %s', (question) => {
  expect(requestsWholeDocument(question)).toBe(false);
});

it('unions PDF fragment intervals, retains gaps and rejects conflicting page hashes', () => {
  const sourceId = randomUUID(),
    text = 'first middle final';
  const fragment = (from: number, to: number): ToolSource => ({
    handle:
      'T_' +
      from.toString(16).padStart(12, '0') +
      to.toString(16).padStart(12, '0'),
    label: 'Fragments.pdf',
    text: text.slice(from, to),
    version: 'proof-v1',
    provenance: 'AI_DRAFT',
    permissions: [],
    createdAt: new Date(0).toISOString(),
    file: {
      sourceIndexId: sourceId,
      version: '1',
      checksum: 'a'.repeat(64),
      page: 1,
      representation: 'PDF_TEXT_PAGE',
      selection: {
        parserVersion: 'pdf-page-v1',
        checksum: createHash('sha256')
          .update(text.slice(from, to))
          .digest('hex'),
        startLine: 1,
        startColumn: from + 1,
      },
      textPageCoverage: {
        pagesTotal: 1,
        complete: false,
        fragment: {
          from,
          to,
          total: text.length,
          pageChecksum: 'b'.repeat(64),
        },
      },
    },
  });
  const first = fragment(0, 5),
    last = fragment(12, text.length);
  expect(pdfCoverageLedger([first, last])[0]).toMatchObject({
    textCoverage: 'PARTIAL',
    missingTextFragments: [{ page: 1, from: 5, to: 12 }],
  });
  expect(
    pdfCoverageLedger([last, fragment(5, 12), first, first])[0],
  ).toMatchObject({
    textCoverage: 'FULL',
    completeTextPages: [1],
    missingTextRanges: [],
    missingTextFragments: [],
    visualCoverage: 'UNKNOWN',
    modelRead: 'UNKNOWN',
  });
  const complete = fragment(0, text.length);
  complete.file!.textPageCoverage = { pagesTotal: 1, complete: true };
  expect(pdfCoverageLedger([complete, last])[0]).toMatchObject({
    textCoverage: 'FULL',
    completeTextPages: [1],
    missingTextFragments: [],
  });
  expect(() =>
    pdfCoverageLedger([
      first,
      {
        ...last,
        file: {
          ...last.file!,
          textPageCoverage: {
            ...last.file!.textPageCoverage!,
            fragment: {
              from: 12,
              to: text.length,
              total: text.length,
              pageChecksum: 'c'.repeat(64),
            },
          },
        },
      },
    ]),
  ).toThrow('RUN_STATE_INVALID');
});

it.each([false, true])(
  'requires every nested property in the advertised strict tool schemas (officeReady=%s)',
  (officeReady) => {
    const inspect = (value: unknown) => {
      if (!value || typeof value !== 'object') return;
      if (Array.isArray(value)) {
        value.forEach(inspect);
        return;
      }
      const node = value as Record<string, unknown>;
      if (node.type === 'object') {
        expect(node.additionalProperties).toBe(false);
        expect(node.required).toEqual(
          Object.keys(node.properties as Record<string, unknown>),
        );
      }
      Object.values(node).forEach(inspect);
    };
    for (const definition of toolDefinitions(
      Object.keys(toolInputs) as ToolName[],
      officeReady,
    )) {
      expect(definition.function.strict).toBe(true);
      inspect(definition.function.parameters);
    }
  },
);

it('reports every PDF text page and missing range without treating original delivery as a full read', () => {
  const sourceId = randomUUID();
  const page = (number: number, complete = true): ToolSource => ({
    handle: 'T_' + number.toString(16).padStart(24, '0'),
    label: 'Coverage.pdf',
    text: 'Page text',
    version: 'proof-v1',
    provenance: 'AI_DRAFT',
    permissions: [],
    createdAt: new Date(0).toISOString(),
    file: {
      sourceIndexId: sourceId,
      version: '1',
      checksum: 'a'.repeat(64),
      page: number,
      representation: 'PDF_TEXT_PAGE',
      selection: {
        parserVersion: 'pdf-page-v1',
        checksum: 'b'.repeat(64),
        startLine: 1,
        startColumn: 1,
      },
      textPageCoverage: { pagesTotal: 20, complete },
    },
  });
  const original: ToolSource = {
    ...page(1),
    handle: 'T_' + 'f'.repeat(24),
    file: {
      sourceIndexId: sourceId,
      version: '1',
      checksum: 'a'.repeat(64),
      representation: 'PDF_ORIGINAL',
    },
  };
  expect(pdfCoverageLedger([original])).toEqual([
    expect.objectContaining({
      sourceId,
      pagesTotal: null,
      completeTextPages: [],
      missingTextRanges: null,
      textCoverage: 'UNKNOWN',
      visualCoverage: 'UNKNOWN',
      modelRead: 'UNKNOWN',
    }),
  ]);
  expect(
    pdfCoverageLedger([original, page(1), page(2, false), page(20), page(1)]),
  ).toEqual([
    expect.objectContaining({
      sourceId,
      pagesTotal: 20,
      completeTextPages: [1, 20],
      partialTextPages: [2],
      missingTextRanges: [{ from: 2, to: 19 }],
      textCoverage: 'PARTIAL',
      visualCoverage: 'UNKNOWN',
      modelRead: 'UNKNOWN',
    }),
  ]);
  expect(
    pdfCoverageLedger(Array.from({ length: 20 }, (_, i) => page(i + 1))),
  ).toEqual([
    expect.objectContaining({
      pagesTotal: 20,
      completeTextPages: Array.from({ length: 20 }, (_, i) => i + 1),
      missingTextRanges: [],
      textCoverage: 'FULL',
      visualCoverage: 'UNKNOWN',
      modelRead: 'UNKNOWN',
    }),
  ]);
});

it('rejects conflicting PDF totals and fabricated page completeness, and keeps large missing ranges bounded', () => {
  const sourceId = randomUUID();
  const proof: ToolSource = {
    handle: 'T_' + 'a'.repeat(24),
    label: 'Large.pdf',
    text: 'A bounded page',
    version: 'proof-v1',
    provenance: 'AI_DRAFT',
    permissions: [],
    createdAt: new Date(0).toISOString(),
    file: {
      sourceIndexId: sourceId,
      version: '1',
      checksum: 'a'.repeat(64),
      page: 1,
      representation: 'PDF_TEXT_PAGE',
      selection: {
        parserVersion: 'pdf-page-v1',
        checksum: 'b'.repeat(64),
        startLine: 1,
        startColumn: 1,
      },
      textPageCoverage: { pagesTotal: 2_147_483_647, complete: true },
    },
  };
  expect(pdfCoverageLedger([proof])[0]?.missingTextRanges).toEqual([
    { from: 2, to: 2_147_483_647 },
  ]);
  expect(() =>
    pdfCoverageLedger([
      proof,
      {
        ...proof,
        handle: 'T_' + 'b'.repeat(24),
        file: {
          ...proof.file!,
          textPageCoverage: { pagesTotal: 2, complete: true },
        },
      },
    ]),
  ).toThrow();
  expect(() =>
    pdfCoverageLedger([
      {
        ...proof,
        file: {
          ...proof.file!,
          page: 3,
          textPageCoverage: { pagesTotal: 2, complete: true },
        },
      },
    ]),
  ).toThrow();
  expect(() =>
    pdfCoverageLedger([
      {
        ...proof,
        file: {
          sourceIndexId: sourceId,
          version: '1',
          checksum: 'a'.repeat(64),
          representation: 'PDF_ORIGINAL',
          textPageCoverage: { pagesTotal: 20, complete: true },
        },
      },
    ]),
  ).toThrow();
});

it('keeps page/range proofs of one original separate from the twelve-origin budget', () => {
  const sourceIndexId = randomUUID();
  const proof = (ordinal: number): ToolSource => ({
    handle: 'T_' + ordinal.toString(16).padStart(24, '0'),
    label: 'Synthetic source',
    text: 'Bounded original page',
    version: 'proof-v1',
    provenance: 'AI_DRAFT',
    permissions: [],
    createdAt: new Date(0).toISOString(),
    file: {
      sourceIndexId,
      version: 'original-v1',
      checksum: 'a'.repeat(64),
      page: ordinal + 1,
      representation: 'PDF_PAGE',
    },
  });
  const pages = Array.from({ length: 20 }, (_, i) => proof(i));
  expect(savedToolSources({ toolSources: pages })).toEqual(pages);
  const publicProofs = ['SNIPPET', 'PAGE'].map(
    (kind, i): ToolSource => ({
      ...proof(20 + i),
      file: undefined,
      provenance: 'PUBLIC_WEB',
      web: {
        url: 'https://example.org/catalogue',
        title: 'Public catalogue',
        retrievedAt: new Date(0).toISOString(),
        provider: 'NATIVE_SIWC',
        kind: kind as 'SNIPPET' | 'PAGE',
      },
    }),
  );
  expect(
    savedToolSources({ toolSources: [...pages, ...publicProofs] }),
  ).toHaveLength(22);
  const distinct = Array.from({ length: 13 }, (_, i) => ({
    ...proof(i),
    file: { ...proof(i).file!, sourceIndexId: randomUUID() },
  }));
  expect(savedToolSources({ toolSources: distinct.slice(0, 12) })).toHaveLength(
    12,
  );
  expect(savedToolSources({ toolSources: distinct })).toEqual([]);
  const changedVersions = pages.slice(0, 13).map((item, i) => ({
    ...item,
    file: { ...item.file!, version: 'original-v' + i },
  }));
  expect(savedToolSources({ toolSources: changedVersions })).toEqual([]);
  expect(
    savedToolSources({
      toolSources: Array.from({ length: 65 }, (_, i) => proof(i)),
    }),
  ).toEqual([]);
  expect(savedToolSources({ toolSources: [proof(0), proof(0)] })).toEqual([
    proof(0),
  ]);
  const legacyWeb = [
    publicProofs[0]!,
    {
      ...publicProofs[0]!,
      text: 'Another result of the same URL',
      version: 'other-snippet',
    },
  ];
  expect(savedToolSources({ toolSources: legacyWeb })).toEqual([
    publicProofs[0]!,
  ]);
  expect(toolSourcesSchema.safeParse(legacyWeb).success).toBe(false);
});

it('keeps distinct decimal results within one calculator origin and rejects ambiguous calculation proofs', () => {
  const results = Array.from({ length: 13 }, (_, i) => ({
    handle: 'T_' + i.toString(16).padStart(24, '0'),
    label: 'Calculation',
    text: JSON.stringify({ value: String(i + 1) }),
    version: 'result-' + i,
    provenance: 'AI_DRAFT',
    calculation: 'DECIMAL_V1',
    permissions: [],
    createdAt: new Date(0).toISOString(),
  }));
  expect(savedToolSources({ toolSources: results })).toEqual(results);
  expect(toolSourcesSchema.safeParse(results).success).toBe(true);
  for (const extra of [
    { permissions: ['project.read'] },
    { taskIds: [randomUUID()] },
    { taskIds: [] },
    { provenance: 'PUBLIC_WEB' },
    { calculation: 'UNVERIFIED_ENGINE' },
    {
      file: {
        sourceIndexId: randomUUID(),
        version: '1',
        checksum: 'a'.repeat(64),
        representation: 'PDF_ORIGINAL',
      },
    },
    {
      web: {
        url: 'https://example.org',
        title: 'Public',
        retrievedAt: new Date(0).toISOString(),
        provider: 'NATIVE_SIWC',
        kind: 'PAGE',
      },
    },
  ])
    expect(
      toolSourcesSchema.safeParse([{ ...results[0], ...extra }]).success,
    ).toBe(false);
  const legacy = results.map((result) => ({
    ...result,
    calculation: undefined,
  }));
  expect(savedToolSources({ toolSources: legacy.slice(0, 12) })).toHaveLength(
    12,
  );
  expect(savedToolSources({ toolSources: legacy })).toEqual([]);
  expect(
    toolSourcesSchema.safeParse([
      ...legacy.slice(0, 12),
      { ...results[12], handle: 'T_' + 'f'.repeat(24) },
    ]).success,
  ).toBe(false);
  expect(
    toolSourcesSchema.safeParse(
      Array.from({ length: 64 }, (_, i) => ({
        ...results[0],
        handle: 'T_' + i.toString(16).padStart(24, '0'),
      })),
    ).success,
  ).toBe(true);
  expect(
    toolSourcesSchema.safeParse(
      Array.from({ length: 65 }, (_, i) => ({
        ...results[0],
        handle: 'T_' + i.toString(16).padStart(24, '0'),
      })),
    ).success,
  ).toBe(false);
});

it('accepts only scoped source handles with the correct memory/history reference, never cached content', () => {
  const id = randomUUID(),
    scope = {
      organizationId: randomUUID(),
      projectId: randomUUID(),
      actorId: randomUUID(),
      conversationId: randomUUID(),
      answerId: randomUUID(),
      policyVersion: 'project-ai-p1-v1',
    };
  const handle = citationHandle(scope, 'MEMORY', id, '1'),
    ref = {
      handle,
      label: 'Private memory',
      kind: 'MEMORY',
      memoryRevisionId: id,
    };
  expect(memoryCitationSchema.parse(ref)).toEqual(ref);
  expect(savedMemoryCitations({ memoryCitations: [ref] })).toEqual([ref]);
  expect(savedMemoryCitations({})).toEqual([]);
  for (const extra of [
    { content: 'SECRET' },
    { historyAnswerId: id },
    { kind: 'HISTORY' },
    { handle: 'forged' },
  ])
    expect(
      savedMemoryCitations({ memoryCitations: [{ ...ref, ...extra }] }),
    ).toBeNull();
  expect(
    citationHandle({ ...scope, projectId: randomUUID() }, 'MEMORY', id, '1'),
  ).not.toBe(handle);
  expect(citationHandle(scope, 'MEMORY', id, '2')).not.toBe(handle);
  expect(citationHandle(scope, 'HISTORY', id, '1')).not.toBe(handle);
});

it('defines strict read-only memory/history contracts with server-owned scope', () => {
  const names = [
    'search_project_memory',
    'read_project_memory',
    'search_conversation_history',
  ] as ToolName[];
  const definitions = toolDefinitions(names);
  expect(definitions.map((d) => d.function.name)).toEqual(names);
  for (const d of definitions)
    expect(d.function.parameters).toMatchObject({
      additionalProperties: false,
    });
  const input = { query: 'cửa chính', visibility: 'ALL', limit: 5 };
  expect(toolInputs.search_project_memory.parse(input)).toEqual(input);
  for (const fields of [
    { projectId: 'forged' },
    { ownerId: 'forged' },
    { actorId: 'forged' },
    { query: '' },
    { limit: 11 },
  ])
    expect(() =>
      toolInputs.search_project_memory.parse({ ...input, ...fields }),
    ).toThrow();
});

it('Decimal tính thật, không làm mất phần lẻ hoặc coi giá thiếu là 0', () => {
  expect(
    calculate({
      operation: 'add',
      operands: ['0.1', '0.2'],
      decimalPlaces: null,
    }).value,
  ).toBe('0.3');
  expect(
    calculate({
      operation: 'multiply',
      operands: ['999999999999999.99', '3'],
      decimalPlaces: 2,
    }).value,
  ).toBe('2999999999999999.97');
  expect(() =>
    calculate({
      operation: 'divide',
      operands: ['5', '0'],
      decimalPlaces: null,
    }),
  ).toThrow();
  expect(() =>
    toolInputs.calculate.parse({
      operation: 'add',
      operands: ['', '1'],
      decimalPlaces: null,
    }),
  ).toThrow();
  expect(() =>
    toolInputs.calculate.parse({
      operation: 'add',
      operands: ['1e999', '1'],
      decimalPlaces: null,
    }),
  ).toThrow();
});
it('tool schema không nhận Project/actor/SQL/path do model cung cấp', () => {
  for (const extra of [
    { projectId: 'other' },
    { actorId: 'admin' },
    { sql: 'select *' },
    { path: '/etc/passwd' },
  ])
    expect(() =>
      toolInputs.search_project_sources.parse({
        query: 'mã hàng',
        limit: 5,
        ...extra,
      }),
    ).toThrow();
  expect(() =>
    toolInputs.read_project_source.parse({
      sourceId: '../../secret',
      representation: 'text',
      page: null,
      imageId: null,
    }),
  ).toThrow();
});
it('mỗi request có budget/cancel và cache tool riêng; cùng arguments không tạo output lặp', async () => {
  const execute = vi.fn(async () => ({ content: '{"value":"0.3"}' }));
  const controller = new AbortController();
  const run = createToolRunner(execute, controller.signal);
  const args = JSON.stringify({
    operation: 'add',
    operands: ['0.1', '0.2'],
    decimalPlaces: null,
  });
  await run('calculate', args);
  await run('calculate', args);
  expect(execute).toHaveBeenCalledTimes(1);
  for (let i = 0; i < 6; i++) await run('calculate', args);
  await expect(run('calculate', args)).rejects.toThrow('TOOL_CALL_LIMIT');
  const another = createToolRunner(execute, controller.signal);
  await another('calculate', args);
  expect(execute).toHaveBeenCalledTimes(2);
  controller.abort();
  await expect(another('calculate', args)).rejects.toThrow();
});
it('tool không có trong allowlist hoặc dữ liệu quá lớn không được thực thi', async () => {
  const execute = vi.fn(async () => ({ content: 'x'.repeat(33000) }));
  const run = createToolRunner(execute, new AbortController().signal);
  await expect(run('shell', '{"command":"env"}')).rejects.toThrow(
    'TOOL_NOT_AVAILABLE',
  );
  expect(execute).not.toHaveBeenCalled();
  await expect(
    run(
      'calculate',
      JSON.stringify({
        operation: 'add',
        operands: ['1', '2'],
        decimalPlaces: null,
      }),
    ),
  ).rejects.toThrow('TOOL_OUTPUT_TOO_LARGE');
});
it('cancel kết thúc chờ tool đang chạy, không chờ promise treo', async () => {
  const controller = new AbortController();
  const run = createToolRunner(() => new Promise(() => {}), controller.signal);
  const pending = run(
    'calculate',
    JSON.stringify({
      operation: 'add',
      operands: ['1', '2'],
      decimalPlaces: null,
    }),
  );
  controller.abort();
  await expect(pending).rejects.toThrow();
}, 500);

it('tổng Decimal(20,2) giữ phần lẻ khi cộng nhiều dòng tối đa', async () => {
  const { decimalTotal } = await import('./ai-tools');
  expect(decimalTotal(['999999999999999999.99', '999999999999999999.99'])).toBe(
    '1999999999999999999.98',
  );
});

it('tool chậm có deadline riêng và truyền abort xuống handler', async () => {
  vi.useFakeTimers();
  try {
    let captured: AbortSignal | undefined;
    const run = createToolRunner(async (name, input, key, signal) => {
      expect(name).toBe('calculate');
      expect(input).toBeTruthy();
      expect(key).toMatch(/^[a-f0-9]{64}$/);
      captured = signal;
      return new Promise(() => {});
    }, new AbortController().signal);
    const pending = run(
      'calculate',
      JSON.stringify({
        operation: 'add',
        operands: ['1', '2'],
        decimalPlaces: null,
      }),
    );
    const rejected = expect(pending).rejects.toThrow('TOOL_TIMEOUT');
    await vi.advanceTimersByTimeAsync(20000);
    await rejected;
    expect(captured?.aborted).toBe(true);
  } finally {
    vi.useRealTimers();
  }
});

it('tracker schemas are bounded and reject model supplied scope', () => {
  const list = { page: 1, pageSize: 2, status: null, mine: false };
  expect(toolInputs.task_list.parse(list)).toEqual(list);
  for (const extra of [
    { projectId: 'other' },
    { actorId: 'admin' },
    { sql: 'select 1' },
  ])
    expect(() => toolInputs.task_list.parse({ ...list, ...extra })).toThrow();
  expect(() =>
    toolInputs.task_list.parse({ ...list, pageSize: 100 }),
  ).toThrow();
  expect(() => toolInputs.task_get.parse({ taskId: '../secret' })).toThrow();
  expect(() =>
    toolInputs.task_history.parse({
      taskId: 'd44348d5-89aa-46b2-8590-57c596275b28',
      page: 0,
      pageSize: 20,
    }),
  ).toThrow();
});

it('exposes the approved existing record and spreadsheet executors on SIWC', () => {
  expect(SIWC_PROJECT_READ_TOOLS).toContain('read_project_records');
  expect(SIWC_PROJECT_READ_TOOLS).toContain('analyze_table');
});

it('advertises PPTX only when the pinned Office sandbox is ready', async () => {
  const { toolDefinitions } = await import('./ai-tools');
  const disabled = toolDefinitions(['create_document']);
  expect(
    toolDefinitions(['create_document'], true)[0]!.function.parameters
      .properties!.format,
  ).toEqual(
    expect.objectContaining({ enum: expect.arrayContaining(['pptx']) }),
  );
  expect(disabled[0]!.function.parameters.properties!.format).not.toEqual(
    expect.objectContaining({ enum: expect.arrayContaining(['pptx']) }),
  );
});

it('requires the exact source version for v2 revisions while preserving legacy draft calls', () => {
  const base = {
    format: 'xlsx',
    version: 2,
    title: 'Sửa nháp',
    blocks: [],
    workbook: {
      sheets: [
        {
          name: 'Sheet',
          cells: [{ cell: 'A1', kind: 'text', text: '0007392' }],
          images: [],
        },
      ],
    },
    sourceId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
  };
  expect(toolInputs.revise_draft.safeParse(base).success).toBe(false);
  expect(
    toolInputs.revise_draft.safeParse({
      ...base,
      sourceVersion: '1:' + 'a'.repeat(64),
    }).success,
  ).toBe(true);
  expect(
    toolInputs.revise_draft.safeParse({
      format: 'pdf',
      title: 'Legacy',
      blocks: [{ kind: 'paragraph', text: 'Nháp' }],
      sourceId: base.sourceId,
    }).success,
  ).toBe(true);
});
it('counts complete workbook coverage only after every sheet cell rectangle is covered at one original version', async () => {
  const { xlsxCoverageLedger } = await import('./ai-tools');
  const id = '11111111-1111-4111-8111-111111111111';
  const base = {
    label: 'Workbook',
    text: '{}',
    version: 'proof',
    provenance: 'AI_DRAFT' as const,
    permissions: [],
    createdAt: '2026-10-11T00:00:00.000Z',
  };
  const original = {
    sourceIndexId: id,
    version: 'v1',
    checksum: 'a'.repeat(64),
  };
  const manifest = {
    ...base,
    handle: 'T_' + 'a'.repeat(24),
    file: {
      ...original,
      representation: 'XLSX_MANIFEST' as const,
      workbookSheets: [
        { name: 'Quote', rows: 3, columns: 3, populatedRows: 3 },
        { name: 'Other', rows: 1, columns: 2, populatedRows: 1 },
      ],
    },
  };
  const range = (handle: string, sheet: string, selection: string) => ({
    ...base,
    handle: 'T_' + handle.repeat(24),
    file: { ...original, sheet, range: selection },
  });
  const first = range('b', 'Quote', 'A1:C2');
  const overlap = range('c', 'Quote', 'A2:C3');
  const other = range('d', 'Other', 'A1:B1');
  const partial = xlsxCoverageLedger([manifest, first, first, overlap])[0]!;
  expect(partial.textCoverage).toBe('PARTIAL');
  expect(partial.sheets).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: 'Quote',
        cellsRead: 9,
        cellsTotal: 9,
        completeRows: 3,
        textCoverage: 'FULL',
      }),
      expect.objectContaining({
        name: 'Other',
        cellsRead: 0,
        cellsTotal: 2,
        completeRows: 0,
        textCoverage: 'PARTIAL',
        nextMissingRange: 'A1:B1',
      }),
    ]),
  );
  expect(
    xlsxCoverageLedger([manifest, first, overlap, other])[0],
  ).toMatchObject({
    textCoverage: 'FULL',
    modelRead: 'UNKNOWN',
    formulaEvaluation: 'NOT_RUN',
  });
  expect(
    xlsxCoverageLedger([
      manifest,
      first,
      overlap,
      { ...other, file: { ...other.file, version: 'v2' } },
    ]).find((row) => row.version === 'v1')?.textCoverage,
  ).toBe('PARTIAL');
});
it('keeps missing workbook manifests unknown and bounds sparse, empty and conflicting coverage proofs', async () => {
  const { xlsxCoverageLedger, toolSourceSchema } = await import('./ai-tools');
  const base = {
    label: 'Book',
    text: '{}',
    version: 'proof',
    provenance: 'AI_DRAFT' as const,
    permissions: [],
    createdAt: '2026-10-11T00:00:00.000Z',
  };
  const file = {
    sourceIndexId: '11111111-1111-4111-8111-111111111111',
    version: 'v1',
    checksum: 'a'.repeat(64),
  };
  const range = {
    ...base,
    handle: 'T_' + 'a'.repeat(24),
    file: { ...file, sheet: 'Sparse', range: 'XFC1048576:XFD1048576' },
  };
  const manifest = {
    ...base,
    handle: 'T_' + 'b'.repeat(24),
    file: {
      ...file,
      representation: 'XLSX_MANIFEST' as const,
      workbookSheets: [
        { name: 'Sparse', rows: 1048576, columns: 16384, populatedRows: 1 },
        { name: 'Empty', rows: 0, columns: 0, populatedRows: 0 },
      ],
    },
  };
  expect(xlsxCoverageLedger([range])[0]).toMatchObject({
    textCoverage: 'UNKNOWN',
    sheets: [],
  });
  const ledger = xlsxCoverageLedger([manifest, range])[0]!;
  expect(ledger.sheets[0]).toMatchObject({
    cellsTotal: 17179869184,
    cellsRead: 2,
    completeRows: 0,
    nextMissingRange: 'A1:OJ1',
    textCoverage: 'PARTIAL',
  });
  expect(ledger.sheets[1]).toMatchObject({
    cellsTotal: 0,
    cellsRead: 0,
    completeRows: 0,
    nextMissingRange: null,
    textCoverage: 'FULL',
  });
  expect(() =>
    xlsxCoverageLedger([
      manifest,
      {
        ...manifest,
        handle: 'T_' + 'c'.repeat(24),
        file: {
          ...manifest.file,
          workbookSheets: [
            { name: 'Sparse', rows: 2, columns: 2, populatedRows: 1 },
          ],
        },
      },
    ]),
  ).toThrow('RUN_STATE_INVALID');
  expect(() =>
    xlsxCoverageLedger([
      manifest,
      { ...range, file: { ...range.file, range: 'A1:XFD1048576' } },
    ]),
  ).toThrow('RUN_STATE_INVALID');
  expect(() =>
    xlsxCoverageLedger([manifest, range, { ...range, text: 'changed' }]),
  ).toThrow('RUN_STATE_INVALID');
  expect(() =>
    xlsxCoverageLedger([
      manifest,
      { ...range, file: { ...range.file, sheet: 'Missing' } },
    ]),
  ).toThrow('RUN_STATE_INVALID');
  expect(
    toolSourceSchema.safeParse({
      ...manifest,
      file: {
        ...manifest.file,
        workbookSheets: [
          ...manifest.file.workbookSheets,
          manifest.file.workbookSheets[0],
        ],
      },
    }).success,
  ).toBe(false);
  expect(
    toolSourceSchema.safeParse({
      ...manifest,
      file: { ...manifest.file, representation: 'PDF_ORIGINAL' },
    }).success,
  ).toBe(false);
});
