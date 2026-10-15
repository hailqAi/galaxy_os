import { expect, it } from 'vitest';
import {
  assembleHistory,
  packHistoryContinuation,
  historyBudget,
  type HistoryAssemblyInput,
} from './ai-history';
import { chatGptRequest } from './ai-chatgpt-plan';
import { scanPdfFixture } from '../../test/document-fixtures';
import { executionMetadata } from './ai-registry';

it.each(['artifact', 'error'])(
  'keeps a bounded receipt for a completed large document %s without resending its generated body',
  async (kind) => {
    const { createHash } = await import('node:crypto');
    const question = {
      role: 'user',
      content: 'Keep all original items, images and payment conditions.',
    };
    const source = {
      role: 'developer',
      content: 'Original evidence and payment conditions remain here.',
    };
    const call = {
      type: 'function_call',
      namespace: 'galaxy',
      name: 'create_document',
      call_id: 'completed-create',
      arguments: JSON.stringify({
        format: 'xlsx',
        title: 'Quotation',
        body: 'Generated cell values '.repeat(4000),
      }),
    };
    const output = {
      type: 'function_call_output',
      call_id: call.call_id,
      output: JSON.stringify(
        kind === 'artifact'
          ? {
              artifact: {
                sourceId: '11111111-1111-4111-8111-111111111111',
                format: 'xlsx',
                provenance: 'AI_DRAFT',
              },
              notice: 'Unapproved',
            }
          : { status: 'ERROR', errorCode: 'WORKBOOK_REFERENCE_INVALID' },
      ),
    };
    const pending = { ...call, call_id: 'pending-create' };
    const packed = packHistoryContinuation(
      [source, question, call, output, pending],
      question,
    );
    expect(packed).toContain(question);
    expect(packed).toContain(source);
    expect(packed).toContain(pending);
    expect(packed).not.toContain(call);
    expect(packed).not.toContain(output);
    const receipt = packed.find(
      (item) => item !== source && item !== question && item !== pending,
    ) as { content: string };
    expect(receipt.content).toContain(
      createHash('sha256').update(call.arguments).digest('hex'),
    );
    expect(receipt.content).toContain(output.output);
    expect(Buffer.byteLength(receipt.content)).toBeLessThan(1500);
    expect(packHistoryContinuation(packed, question)).toEqual(packed);
    const budget = historyBudget({
      ...input(),
      inputItems: packed.filter((item) => item !== pending),
      question: question.content,
    });
    expect(budget.textBytes).toBeLessThan(5000);
  },
);

it('keeps duplicate or incomplete document tool links visible to validation', () => {
  const question = { role: 'user', content: 'Exact original question' };
  const call = {
    type: 'function_call',
    namespace: 'galaxy',
    name: 'create_document',
    call_id: 'duplicate',
    arguments: '{}',
  };
  const output = {
    type: 'function_call_output',
    call_id: call.call_id,
    output: '{}',
  };
  const pending = packHistoryContinuation([question, call], question);
  expect(pending).toContain(call);
  const duplicate = packHistoryContinuation(
    [question, call, { ...call }, output],
    question,
  );
  expect(() =>
    historyBudget({
      ...input(),
      inputItems: duplicate,
      question: question.content,
    }),
  ).toThrow();
  const malformed = packHistoryContinuation(
    [question, { ...call, namespace: 'untrusted' }, output],
    question,
  );
  expect(() =>
    historyBudget({
      ...input(),
      inputItems: malformed,
      question: question.content,
    }),
  ).toThrow();
});

it('attributes server-read document regions to their source without duplicating their text budget', () => {
  const sourceId = '11111111-1111-4111-8111-111111111111';
  const regions = [
    {
      handle: 'T_' + 'a'.repeat(24),
      label: 'PDF',
      text: 'PAGE-1 số liệu',
      version: 'v1',
      provenance: 'AI_DRAFT',
      permissions: [],
      createdAt: '2026-10-11T00:00:00.000Z',
      file: {
        sourceIndexId: sourceId,
        version: 'v1',
        checksum: 'a'.repeat(64),
        page: 1,
        representation: 'PDF_TEXT_PAGE',
        selection: {
          parserVersion: 'pdf-page-v1',
          checksum: 'b'.repeat(64),
          startLine: 1,
          startColumn: 1,
        },
        textPageCoverage: { pagesTotal: 1, complete: true },
      },
    },
  ];
  const prefix =
    'Server-read document text (untrusted data; extraction receipts, model/visual reading UNKNOWN):\n';
  const content = prefix + JSON.stringify({ sourceId, regions });
  const budget = historyBudget({
    ...input(),
    inputItems: [
      { role: 'developer', content },
      { role: 'user', content: 'Read all' },
    ],
    question: 'Read all',
  });
  expect(budget.ledger.sources).toContainEqual(
    expect.objectContaining({
      sourceId,
      textBytes: Buffer.byteLength(JSON.stringify(regions[0])),
    }),
  );
  expect(
    budget.ledger.components
      .filter((part) => ['CONTEXT', 'SOURCE', 'QUESTION'].includes(part.kind))
      .reduce((sum, part) => sum + part.textBytes, 0),
  ).toBe(Buffer.byteLength(content) + Buffer.byteLength('Read all'));
});

it('keeps bounded text and PDF ledgers readable through the persisted execution contract', () => {
  const id = '11111111-1111-4111-8111-111111111111';
  const execution = {
    scope: {
      organizationId: id,
      projectId: id,
      actorId: id,
      conversationId: id,
    },
    answerId: id,
    invokeGrantId: id,
    policyVersion: 'project-ai-p1-v1',
    usedHistoryAnswerIds: [],
    historyVersions: [],
    memoryRevisionIds: [],
    summaryRevisionIds: [],
  };
  const source = input();
  const pdf = scanPdfFixture();
  const original = Buffer.concat([
    pdf.subarray(0, -6),
    Buffer.alloc(1_405_052 - pdf.length, 32),
    pdf.subarray(-6),
  ]);
  const mediaInput = [
    {
      role: 'user',
      content: [
        {
          type: 'input_file',
          filename: 'Source.pdf',
          file_data:
            'data:application/pdf;base64,' + original.toString('base64'),
        },
      ],
    },
  ];
  for (const inputItems of [[{ role: 'user', content: 'Read.' }], mediaInput]) {
    const budget = historyBudget({ ...source, inputItems });
    expect(
      executionMetadata({ execution: { ...execution, budget } })?.budget,
    ).toEqual(budget);
  }
  source.profile = {
    model: source.model,
    contextTokens: 10000,
    outputReserveTokens: 4096,
    tokenizerVersion: 'fixture-only',
    evidence: 'fixture-only',
  };
  let counted = '';
  source.countTokens = (wire) => {
    counted = JSON.stringify(wire);
    return 100;
  };
  const budget = historyBudget({ ...source, inputItems: mediaInput });
  expect(counted).not.toContain(original.toString('base64'));
  expect(budget).toMatchObject({
    status: 'UNVERIFIED',
    inputTokens: null,
    inputLimit: null,
    tokenizerVersion: null,
  });
  expect(
    executionMetadata({ execution: { ...execution, budget } })?.budget,
  ).toEqual(budget);
  for (const invalid of [
    { ...budget, bytes: budget.bytes + 1000000 },
    { ...budget, textBytes: 256001 },
    { ...budget, media: [{ ...budget.media[0], bytes: 8_000_001 }] },
    {
      ...budget,
      status: 'VERIFIED',
      inputTokens: 100,
      inputLimit: 5904,
      tokenizerVersion: 'fixture-only',
    },
  ])
    expect(
      executionMetadata({ execution: { ...execution, budget: invalid } }),
    ).toBeNull();
});

const input = (): HistoryAssemblyInput => ({
  model: 'account-model',
  instructions: 'General assistant',
  tools: ['task_list'],
  context: { role: 'developer', content: 'Verified scope A' },
  question: 'Cửa chính cao bao nhiêu?',
  turns: Array.from({ length: 12 }, (_, i) => ({
    id: String(i),
    question: `Turn ${i}`,
    answer: `${i}. 2400 mm`,
  })),
  summaries: [],
  memories: [],
  profile: null,
});

it('budgets opaque encrypted continuation separately from ordinary text and never certifies its tokens', () => {
  const source = input();
  source.profile = {
    model: source.model,
    contextTokens: 300000,
    outputReserveTokens: 4096,
    tokenizerVersion: 'fixture-only',
    evidence: 'fixture-only',
  };
  let counted = '';
  source.countTokens = (wire) => {
    counted = JSON.stringify(wire);
    return 200000;
  };
  const encrypted = 'r'.repeat(100000);
  const inputItems = [
    { role: 'user', content: 'x'.repeat(180000) },
    {
      type: 'reasoning',
      id: 'provider-continuation',
      summary: [{ type: 'summary_text', text: 'Known summary text' }],
      encrypted_content: encrypted,
    },
  ];
  const budget = historyBudget({ ...source, inputItems });
  expect(counted).not.toContain(encrypted);
  expect(counted).toContain('Known summary text');
  expect(budget).toMatchObject({
    status: 'UNVERIFIED',
    inputTokens: null,
    inputLimit: null,
    tokenizerVersion: null,
    ledger: {
      opaqueContinuationBytes: encrypted.length,
      opaqueContinuationTokenEstimate: null,
    },
  });
  expect(budget.bytes).toBeGreaterThan(256000);
  expect(budget.textBytes).toBeLessThan(200000);
  const execution = {
    scope: {
      organizationId: '11111111-1111-4111-8111-111111111111',
      projectId: '11111111-1111-4111-8111-111111111111',
      actorId: '11111111-1111-4111-8111-111111111111',
      conversationId: '11111111-1111-4111-8111-111111111111',
    },
    answerId: '11111111-1111-4111-8111-111111111111',
    invokeGrantId: '11111111-1111-4111-8111-111111111111',
    policyVersion: 'project-ai-p1-v1',
    usedHistoryAnswerIds: [],
    historyVersions: [],
    memoryRevisionIds: [],
    summaryRevisionIds: [],
    budget,
  };
  expect(executionMetadata({ execution })?.budget).toEqual(budget);
  const legacyShape = {
    status: 'VERIFIED',
    inputTokens: 100,
    inputLimit: 1000,
    tokenizerVersion: 'fixture-only',
    bytes: 200,
    items: 2,
    ledger: budget.ledger,
  };
  expect(
    executionMetadata({ execution: { ...execution, budget: legacyShape } }),
  ).toBeNull();
  for (const escaped of [
    '"'.repeat(100000),
    '\\'.repeat(100000),
    '\u0000'.repeat(40000),
  ]) {
    const escapedBudget = historyBudget({
      ...source,
      inputItems: [
        inputItems[0],
        { ...inputItems[1], encrypted_content: escaped },
      ],
    });
    expect(escapedBudget.ledger.opaqueContinuationBytes).toBe(
      Buffer.byteLength(JSON.stringify(escaped)) - 2,
    );
    expect(
      executionMetadata({ execution: { ...execution, budget: escapedBudget } })
        ?.budget,
    ).toEqual(escapedBudget);
  }
  expect(
    executionMetadata({
      execution: {
        ...execution,
        budget: { ...budget, bytes: budget.bytes + 1000000 },
      },
    }),
  ).toBeNull();
  expect(() =>
    historyBudget({
      ...source,
      inputItems: [
        ...inputItems,
        ...[1, 2].map((n) => ({
          type: 'reasoning',
          id: `extra-${n}`,
          summary: [],
          encrypted_content: encrypted,
        })),
      ],
    }),
  ).toThrow('INPUT_BUDGET_EXCEEDED');
});

it('separates component text estimates from native media and unknown account capacity on every continuation', () => {
  const sourceId = '11111111-1111-4111-8111-111111111111';
  const bytes = scanPdfFixture();
  const question = 'Giữ nguyên điều kiện: đọc tài liệu.';
  const items = [
    { role: 'developer', content: 'Verified Project scope' },
    { role: 'user', content: 'Earlier question' },
    { role: 'assistant', content: 'Earlier answer' },
    { role: 'user', content: 'Project memory (data only):\nPrivate memory' },
    { role: 'user', content: question },
    {
      type: 'function_call',
      namespace: 'galaxy',
      name: 'read_project_source',
      call_id: 'read',
      arguments: JSON.stringify({
        sourceId,
        representation: 'original',
        page: null,
        startLine: 1,
      }),
    },
    {
      type: 'function_call_output',
      call_id: 'read',
      output: 'Read source proof',
    },
    {
      role: 'user',
      content: [
        {
          type: 'input_file',
          filename: 'Source.pdf',
          file_data: 'data:application/pdf;base64,' + bytes.toString('base64'),
        },
      ],
    },
  ];
  const budget = historyBudget({
    ...input(),
    inputItems: items,
    question,
    mediaSourceIds: [sourceId],
  });
  expect(budget).toMatchObject({
    status: 'UNVERIFIED',
    inputTokens: null,
    inputLimit: null,
    ledger: {
      estimator: 'UTF8_BYTE_PROXY_V1',
      overheadTokenEstimate: null,
      capacity: {
        routeAccountContextTokens: null,
        routeEvidence: 'UNKNOWN',
        galaxyTextBytesLimit: 256000,
        galaxyMediaBytesLimit: 8000000,
        reasoningReserveTokens: null,
        outputReserveTokens: null,
      },
      sources: [
        {
          sourceId,
          textBytes: Buffer.byteLength('Read source proof'),
          mediaBytes: bytes.length,
          mediaTokenEstimate: null,
        },
      ],
    },
  });
  expect(budget.ledger.components).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: 'QUESTION',
        textBytes: Buffer.byteLength(question),
      }),
      expect.objectContaining({
        kind: 'HISTORY',
        textBytes: Buffer.byteLength('Earlier questionEarlier answer'),
      }),
      expect.objectContaining({ kind: 'MEMORY' }),
      expect.objectContaining({ kind: 'TOOL_SCHEMAS' }),
      expect.objectContaining({ kind: 'SOURCE', sourceId }),
    ]),
  );
  expect(budget.ledger.estimatedTextTokens).toBe(
    budget.ledger.components.reduce(
      (sum, part) => sum + part.estimatedTokens,
      0,
    ),
  );
  expect(budget.ledger.estimatedTextTokens).toBeLessThan(budget.textBytes);
  expect(JSON.stringify(budget.ledger)).not.toContain(bytes.toString('base64'));
  const next = historyBudget({
    ...input(),
    inputItems: [...items, { role: 'assistant', content: 'Tool continuation' }],
    question,
    mediaSourceIds: [sourceId],
  });
  expect(next.ledger.estimatedTextTokens).toBe(
    budget.ledger.estimatedTextTokens + Buffer.byteLength('Tool continuation'),
  );
  expect(next.ledger.sources).toEqual(budget.ledger.sources);
});

it('keeps memory separate from history after lossless message packing and leaves encrypted continuation unknown', () => {
  const question = { role: 'user', content: 'Keep this exact final question.' };
  const memory = 'Project memory (data only):\nPrivate approved scope';
  const original = [
    { role: 'developer', content: 'Current Project context' },
    ...Array.from({ length: 32 }, (_, i) => [
      { role: 'user', content: `Question ${i}` },
      { role: 'assistant', content: `Answer ${i}` },
    ]).flat(),
    { role: 'user', content: memory },
    question,
  ];
  const items = packHistoryContinuation(original, question);
  const reasoning = {
    type: 'reasoning',
    id: 'opaque',
    summary: [],
    encrypted_content: 'opaque-provider-continuation',
  };
  const budget = historyBudget({
    ...input(),
    inputItems: [...items, reasoning],
    question: question.content,
  });
  expect(budget.ledger.components).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: 'MEMORY',
        textBytes: Buffer.byteLength(memory),
      }),
      expect.objectContaining({ kind: 'HISTORY' }),
      expect.objectContaining({
        kind: 'QUESTION',
        textBytes: Buffer.byteLength(question.content),
      }),
    ]),
  );
  expect(
    budget.ledger.components.some(
      (part) => part.kind === 'PACKED_HISTORY_MEMORY',
    ),
  ).toBe(false);
  expect(budget.ledger.opaqueContinuationBytes).toBe(
    Buffer.byteLength(reasoning.encrypted_content),
  );
  expect(budget.ledger.opaqueContinuationTokenEstimate).toBeNull();
  expect(budget.status).toBe('UNVERIFIED');
});

it('keeps native PDF bytes out of text accounting and reports unknown media token cost honestly', () => {
  const pdf = scanPdfFixture();
  const original = Buffer.concat([
    pdf.subarray(0, -6),
    Buffer.alloc(1_405_052 - pdf.length, 32),
    pdf.subarray(-6),
  ]);
  const budget = historyBudget({
    ...input(),
    inputItems: [
      {
        role: 'user',
        content: [
          { type: 'input_text', text: 'Read the source.' },
          {
            type: 'input_file',
            filename: 'Source.pdf',
            file_data:
              'data:application/pdf;base64,' + original.toString('base64'),
          },
        ],
      },
    ],
  });
  expect(budget).toMatchObject({
    status: 'UNVERIFIED',
    inputTokens: null,
    inputLimit: null,
  });
  expect(budget.bytes).toBeGreaterThan(1_800_000);
  expect(budget).toHaveProperty('textBytes');
  expect((budget as unknown as { textBytes: number }).textBytes).toBeLessThan(
    20000,
  );
  expect(budget).toHaveProperty('media', [
    expect.objectContaining({
      kind: 'input_file',
      bytes: 1_405_052,
      estimatedTokens: null,
      evidence: 'UNKNOWN',
    }),
  ]);
});
it('packs more than eight complete pairs, preserves Unicode and never invents token counts', () => {
  const source = input();
  const result = assembleHistory(source);
  expect(result.usedAnswerIds).toHaveLength(12);
  expect(result.inputItems.at(-1)).toEqual({
    role: 'user',
    content: source.question,
  });
  expect(result.inputItems).toContainEqual({
    role: 'assistant',
    content: '0. 2400 mm',
  });
  expect(result.budget).toMatchObject({
    status: 'UNVERIFIED',
    inputTokens: null,
    tokenizerVersion: null,
  });
  expect(result.budget.bytes).toBe(
    Buffer.byteLength(
      JSON.stringify(
        chatGptRequest({
          model: source.model,
          instructions: source.instructions,
          tools: source.tools,
          input: result.inputItems,
        }),
      ),
    ),
  );
});
it('counts the expanded wire request with a verified counter and reserves output space', () => {
  const source = input();
  let counted = '';
  source.profile = {
    model: 'account-model',
    contextTokens: 10000,
    outputReserveTokens: 4096,
    tokenizerVersion: 'fixture-counter-v1',
    evidence: 'fixture-only',
  };
  source.countTokens = (wire) => {
    counted = JSON.stringify(wire);
    return Buffer.byteLength(counted);
  };
  const result = assembleHistory(source);
  expect(result.budget.status).toBe('VERIFIED');
  expect(result.budget.inputTokens).toBe(result.budget.bytes);
  expect(counted).toContain('namespace');
  expect(counted).toContain('parameters');
  source.countTokens = () => 6000;
  expect(() => assembleHistory(source)).toThrow('INPUT_BUDGET_EXCEEDED');
  source.profile.model = 'different';
  expect(() => assembleHistory(source)).toThrow('HISTORY_PROFILE_MISMATCH');
});
it('preserves whole turns within byte/item limits and deduplicates summary coverage', () => {
  const source = input();
  source.turns = Array.from({ length: 60 }, (_, i) => ({
    id: String(i),
    question: 'question',
    answer: '回答 '.repeat(4000),
  }));
  source.summaries = [
    {
      revisionId: 'summary',
      content: '0 was 2400 mm',
      coveredAnswerIds: ['0'],
    },
  ];
  source.memories = [{ revisionId: 'memory', content: '2400 mm' }];
  const result = assembleHistory(source);
  expect(result.usedAnswerIds.length).toBeLessThan(60);
  expect(result.budget.bytes).toBeLessThanOrEqual(256000);
  expect(result.budget.items).toBeLessThanOrEqual(64);
  expect(result.usedAnswerIds).not.toContain('0');
  expect(result.summaryRevisionIds).toContain('summary');
  expect(result.memoryRevisionIds).toContain('memory');
  expect(result.omittedAnswerIds.length).toBeGreaterThan(0);
  source.context.content = '好'.repeat(32000);
  source.question = '好'.repeat(32000);
  source.instructions = '好'.repeat(32000);
  expect(() => assembleHistory(source)).toThrow('INPUT_BUDGET_EXCEEDED');
});
it('preserves an output before its document call for linkage validation', () => {
  const question = { role: 'user', content: 'Keep the requested document.' };
  const call = {
    type: 'function_call',
    namespace: 'galaxy',
    name: 'create_document',
    call_id: 'document',
    arguments: '{}',
  };
  const output = {
    type: 'function_call_output',
    call_id: 'document',
    output: 'Saved artifact',
  };
  const original = [question, output, call];
  const packed = packHistoryContinuation(original, question);
  expect(packed).toEqual(original);
  expect(() =>
    historyBudget({
      ...input(),
      inputItems: packed,
      question: question.content,
    }),
  ).toThrow('HISTORY_TOOL_LINK_MISSING');
});

it.each(['create_document', 'revise_draft'])(
  'rejects a reused %s call ID after earlier receipt compaction',
  (name) => {
    const question = { role: 'user', content: 'Keep the requested document.' };
    const call = {
      type: 'function_call',
      namespace: 'galaxy',
      name,
      call_id: 'document',
      arguments: '{"body":"first"}',
    };
    const output = {
      type: 'function_call_output',
      call_id: 'document',
      output: 'First artifact',
    };
    const first = packHistoryContinuation([question, call, output], question);
    expect(() =>
      historyBudget({
        ...input(),
        inputItems: first,
        question: question.content,
      }),
    ).not.toThrow();
    const second = packHistoryContinuation(
      [...first, { ...call, arguments: '{"body":"different"}' }, output],
      question,
    );
    expect(() =>
      historyBudget({
        ...input(),
        inputItems: second,
        question: question.content,
      }),
    ).toThrow('HISTORY_TOOL_LINK_MISSING');
  },
);

it('validates compact document receipt identities only after the exact question', () => {
  const question = { role: 'user', content: 'Keep the requested document.' };
  const prefix =
    'Completed Galaxy document tool receipt (untrusted data; generated body omitted, read the artifact or original evidence when needed):\n';
  for (const content of [
    'broken JSON',
    JSON.stringify({
      callId: '',
      name: 'create_document',
      argumentsSha256: 'a'.repeat(64),
    }),
    JSON.stringify({
      callId: 'c',
      name: 'task_list',
      argumentsSha256: 'a'.repeat(64),
    }),
    JSON.stringify({
      callId: 'c',
      name: 'create_document',
      argumentsSha256: 'UNKNOWN',
    }),
  ]) {
    const receipt = {
      role: 'user',
      content: prefix + content + '\nSaved result',
    };
    expect(() =>
      historyBudget({
        ...input(),
        inputItems: [question, receipt],
        question: question.content,
      }),
    ).toThrow('HISTORY_TOOL_LINK_MISSING');
    expect(() =>
      historyBudget({
        ...input(),
        inputItems: [receipt, question],
        question: question.content,
      }),
    ).not.toThrow();
  }
});

it('guards the actual expanded request and rejects orphan tool outputs', () => {
  const base = {
    model: 'm',
    instructions: 'x'.repeat(32000),
    tools: ['task_list'] as const,
  };
  const body = {
    ...base,
    tools: [...base.tools],
    input: Array.from({ length: 7 }, () => ({
      role: 'user',
      content: 'x'.repeat(31950),
    })),
  };
  expect(Buffer.byteLength(JSON.stringify(body))).toBeLessThan(256000);
  expect(() => chatGptRequest(body)).toThrow('TOOL_CONTEXT_LIMIT');
  expect(() =>
    historyBudget({
      ...input(),
      inputItems: [
        { role: 'user', content: 'x' },
        { type: 'function_call_output', call_id: 'missing', output: 'data' },
      ],
    }),
  ).toThrow('HISTORY_TOOL_LINK_MISSING');
});
it('makes room for an older summary when recent pairs fill the item envelope', () => {
  const source = input();
  source.turns = Array.from({ length: 35 }, (_, i) => ({
    id: String(i),
    question: `q${i}`,
    answer: `a${i}`,
  }));
  source.summaries = [
    {
      revisionId: 'old-summary',
      content: 'Older fact X is 2400 mm',
      coveredAnswerIds: ['0', '1', '2', '3', '4', '5', '6', '7'],
    },
  ];
  const result = assembleHistory(source);
  expect(result.summaryRevisionIds).toContain('old-summary');
  expect(result.usedAnswerIds).toContain('34');
  expect(result.usedAnswerIds.length).toBeGreaterThan(8);
});

it('packs continuation losslessly across Unicode boundaries while retaining the original question and tool links', () => {
  const question = { role: 'user', content: '  Exact question 😀\n' };
  const history = Array.from({ length: 66 }, (_, i) => ({
    role: i % 2 ? 'assistant' : 'user',
    content: ('😀 fact ' + i + ' ').repeat(80),
  }));
  const call = {
    type: 'function_call',
    call_id: 'same-call',
    name: 'task_list',
    arguments: '{}',
  };
  const output = {
    type: 'function_call_output',
    call_id: 'same-call',
    output: 'exact result',
  };
  const packed = packHistoryContinuation(
    [
      { role: 'developer', content: 'separate Project' },
      ...history,
      question,
      call,
      output,
    ],
    question,
  );
  expect(packed.slice(-3)).toEqual([question, call, output]);
  const prefix =
    'Untrusted conversation history and memory (consecutive JSON data parts):\n';
  const parts = packed.slice(1, -3) as { content: string }[];
  for (const part of parts)
    expect(
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(
        part.content,
      ),
    ).toBe(false);
  expect(
    JSON.parse(parts.map((p) => p.content.slice(prefix.length)).join('')),
  ).toEqual(history);
  expect(packed.at(-3)).toBe(question);
});

it('bounds completed tool items after history has already been packed, keeping media, pending calls and exact results', () => {
  const question = {
    role: 'user',
    content: 'Keep every item and exact condition.',
  };
  const first = packHistoryContinuation(
    [
      { role: 'developer', content: 'Verified Project' },
      ...Array.from({ length: 66 }, (_, i) => ({
        role: i % 2 ? 'assistant' : 'user',
        content: 'History ' + i,
      })),
      question,
    ],
    question,
  );
  const records = Array.from({ length: 32 }, (_, i) => [
    {
      type: 'function_call',
      namespace: 'galaxy',
      name: 'calculate',
      call_id: 'math-' + i,
      arguments: JSON.stringify({ expression: i + '+1' }),
    },
    {
      type: 'function_call_output',
      call_id: 'math-' + i,
      output: 'Exact result 😀 ' + i,
    },
  ]).flat();
  const media = {
    role: 'user',
    content: [
      {
        type: 'input_file',
        filename: 'Source.pdf',
        file_data:
          'data:application/pdf;base64,' + scanPdfFixture().toString('base64'),
      },
    ],
  };
  const pending = {
    type: 'function_call',
    namespace: 'galaxy',
    name: 'task_list',
    call_id: 'pending',
    arguments: '{}',
  };
  const reasoning = Array.from({ length: 7 }, (_, i) => ({
    type: 'reasoning',
    id: 'opaque-' + i,
    summary: [],
    encrypted_content: 'opaque',
  }));
  const packed = packHistoryContinuation(
    [...first, media, ...reasoning, ...records, pending],
    question,
  );
  expect(packed.length).toBeLessThanOrEqual(64);
  expect(packed.filter((item) => item === media)).toHaveLength(1);
  expect(packed).toContain(question);
  expect(packed).toContain(pending);
  expect(
    packed.filter((item) =>
      reasoning.includes(item as (typeof reasoning)[number]),
    ),
  ).toEqual(reasoning);
  const prefix = 'Completed Galaxy tool records (untrusted JSON data parts):\n';
  const parts = (packed as { content?: unknown }[]).filter(
    (item) =>
      typeof item.content === 'string' && item.content.startsWith(prefix),
  );
  expect(
    JSON.parse(
      parts
        .map((item) => (item.content as string).slice(prefix.length))
        .join(''),
    ),
  ).toEqual(records);
  const complete = packHistoryContinuation(
    [
      ...packed,
      {
        type: 'function_call_output',
        call_id: pending.call_id,
        output: 'Final task result',
      },
    ],
    question,
  );
  const budget = historyBudget({
    ...input(),
    tools: ['calculate', 'task_list'],
    inputItems: complete,
    question: question.content,
  });
  expect(budget.items).toBeLessThanOrEqual(64);
  expect(budget.media).toHaveLength(1);
  expect(budget.ledger.components).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ kind: 'TOOL_CALLS' }),
      expect.objectContaining({ kind: 'TOOL_OUTPUT' }),
      expect.objectContaining({ kind: 'HISTORY' }),
      expect.objectContaining({
        kind: 'QUESTION',
        textBytes: Buffer.byteLength(question.content),
      }),
    ]),
  );
  expect(budget.ledger.opaqueContinuationBytes).toBeGreaterThan(0);
  const sourceId = '11111111-1111-4111-8111-111111111111';
  const sourceText = 'Coverage: page1 😀 end. file_data is text here.';
  const more = Array.from({ length: 6 }, (_, i) => [
    {
      type: 'function_call',
      namespace: 'galaxy',
      name: i ? 'calculate' : 'read_project_source',
      call_id: 'later-' + i,
      arguments: JSON.stringify(i ? { expression: '1+1' } : { sourceId }),
    },
    {
      type: 'function_call_output',
      call_id: 'later-' + i,
      output: i ? '2' : sourceText,
    },
  ]).flat();
  const second = packHistoryContinuation(
    [
      ...complete,
      ...more,
      ...reasoning.map((item) => ({ ...item, id: 'next-' + item.id })),
      ...Array.from({ length: 35 }, (_, i) => ({
        role: 'assistant',
        content: 'Continuation ' + i,
      })),
    ],
    question,
  );
  expect(second.length).toBeLessThanOrEqual(64);
  expect(second.filter((item) => item === media)).toHaveLength(1);
  const secondBudget = historyBudget({
    ...input(),
    tools: ['calculate', 'read_project_source'],
    inputItems: second,
    question: question.content,
  });
  expect(secondBudget.ledger.sources).toContainEqual(
    expect.objectContaining({
      sourceId,
      textBytes: Buffer.byteLength(sourceText),
    }),
  );
  const secondParts = (second as { content?: unknown }[]).filter(
    (item) =>
      typeof item.content === 'string' && item.content.startsWith(prefix),
  );
  const secondRecords = JSON.parse(
    secondParts
      .map((item) => (item.content as string).slice(prefix.length))
      .join(''),
  );
  expect(
    secondRecords.filter(
      (item: { type: string }) => item.type === 'function_call_output',
    ),
  ).toHaveLength(39);
  const unrelated = second.filter(
    (item) => !secondParts.includes(item as { content?: unknown }),
  );
  for (const corrupt of [
    'broken JSON',
    JSON.stringify([...secondRecords, ...secondRecords.slice(0, 2)]),
    JSON.stringify([records[0]]),
    JSON.stringify([media]),
  ])
    expect(() =>
      historyBudget({
        ...input(),
        inputItems: [...unrelated, { role: 'user', content: prefix + corrupt }],
        question: question.content,
      }),
    ).toThrow('HISTORY_TOOL_LINK_MISSING');
});
