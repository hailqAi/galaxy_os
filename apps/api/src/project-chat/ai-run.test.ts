import { expect, it } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import {
  snapshotRunInput,
  runWorkflowSchema,
  runProofDigest,
  runProgressSchema,
  partialRunText,
  queuedRun,
  restoreActor,
  reusedSourceRead,
  canResumeDeadlineRun,
  recordToolProgress,
} from './ai-run';
import { packHistoryContinuation } from './ai-history';

it('retains recent execution receipts together with older media proofs', () => {
  const executions = Array.from({ length: 44 }, (_, i) => ({
    name: 'read_project_source' as const,
    callId: 'media-proof-' + i,
    status: 'OK' as const,
    durationMs: 1,
  }));
  expect(
    runProgressSchema.shape.toolExecutions.safeParse(executions).success,
  ).toBe(true);
});

it('accepts a durable workflow beyond the old total model ceiling and resumes a safely saved Galaxy-limit interruption', () => {
  const run = queuedRun(
    restoreActor({
      userId: randomUUID(),
      organizationId: randomUUID(),
      organizationMembershipId: randomUUID(),
      sessionId: randomUUID(),
    }),
    'NORMAL',
  );
  run.providerRounds = 100;
  run.checkpoint = {
    stage: 'READY',
    input: [{ role: 'user', content: 'Original question' }],
    pendingCalls: [],
    final: null,
    proofDigest: 'a'.repeat(64),
  };
  expect(runWorkflowSchema.safeParse(run).success).toBe(true);
  expect(canResumeDeadlineRun('FAILED', 'TOOL_ROUND_LIMIT', run)).toBe(true);
  expect(canResumeDeadlineRun('FAILED', 'PROVIDER_TIMEOUT', run)).toBe(false);
  expect(canResumeDeadlineRun('FAILED', 'TOOL_CALL_LIMIT', run)).toBe(true);
  expect(
    canResumeDeadlineRun('FAILED', 'TOOL_ROUND_LIMIT', {
      ...run,
      checkpoint: { ...run.checkpoint, stage: 'TOOLS' },
    }),
  ).toBe(false);
});

it('detects normalized repeated tool results across restart while allowing changed source versions and new data', () => {
  const run = queuedRun(
    restoreActor({
      userId: randomUUID(),
      organizationId: randomUUID(),
      organizationMembershipId: randomUUID(),
      sessionId: randomUUID(),
    }),
    'NORMAL',
  );
  const result = { value: '2', computedAt: 'first' };
  expect(
    recordToolProgress(run, 'calculate', '{"b":2,"a":1}', result, ['v1']),
  ).toBe(true);
  expect(
    recordToolProgress(
      run,
      'calculate',
      '{"a":1,"b":2}',
      { ...result, computedAt: 'later' },
      ['v1'],
    ),
  ).toBe(true);
  const resumed = runWorkflowSchema.parse(JSON.parse(JSON.stringify(run)));
  expect(
    recordToolProgress(resumed, 'calculate', '{"a":1,"b":2}', result, ['v1']),
  ).toBe(false);
  expect(
    recordToolProgress(resumed, 'calculate', '{"a":1,"b":2}', result, ['v2']),
  ).toBe(true);
  expect(
    recordToolProgress(resumed, 'calculate', '{"a":1,"b":2}', { value: '3' }, [
      'v1',
    ]),
  ).toBe(true);
});

it('reuses a delivered complete text page by exact source/version/range and never substitutes vision or missing fragments', () => {
  const id = randomUUID(),
    checksum = 'a'.repeat(64);
  const source = {
    handle: 'T_' + 'a'.repeat(24),
    label: 'Source.pdf',
    text: '1   ITEM-A   2   EUR 5.00',
    version: 'proof',
    provenance: 'AI_DRAFT',
    permissions: [],
    createdAt: new Date().toISOString(),
    file: {
      sourceIndexId: id,
      version: '1:' + checksum,
      checksum,
      page: 1,
      representation: 'PDF_TEXT_PAGE',
      textPageCoverage: { pagesTotal: 2, complete: true },
    },
  } as const;
  const args = { sourceId: id, representation: 'text', page: 1, startLine: 1 };
  const result = reusedSourceRead(args, [source as never]);
  expect(JSON.parse(result!)).toMatchObject({
    status: 'ALREADY_DELIVERED',
    sourceId: id,
    version: source.file.version,
    text: source.text,
  });
  expect(
    reusedSourceRead({ ...args, sourceId: randomUUID() }, [source as never]),
  ).toBeUndefined();
  expect(
    reusedSourceRead({ ...args, page: 2 }, [source as never]),
  ).toBeUndefined();
  expect(
    reusedSourceRead({ ...args, startLine: 2 }, [source as never]),
  ).toBeUndefined();
  expect(
    reusedSourceRead({ ...args, representation: 'image' }, [source as never]),
  ).toBeUndefined();
  expect(
    reusedSourceRead(args, [
      {
        ...source,
        file: {
          ...source.file,
          textPageCoverage: { pagesTotal: 2, complete: false },
        },
      } as never,
    ]),
  ).toBeUndefined();
});

it.each(['NORMAL', 'DEEP'] as const)(
  'queues %s without a total deadline',
  (mode) => {
    const run = queuedRun(
      restoreActor({
        userId: randomUUID(),
        organizationId: randomUUID(),
        organizationMembershipId: randomUUID(),
        sessionId: randomUUID(),
      }),
      mode,
    );
    expect(run.deadlineAt).toBeNull();
    expect(runWorkflowSchema.safeParse(run).success).toBe(true);
    expect(
      runWorkflowSchema.safeParse({ ...run, deadlineAt: 'unlimited' }).success,
    ).toBe(false);
  },
);

it('reports a no-file queued timeout separately from incomplete document reading', () => {
  const text = partialRunText(0, [], null, true);
  expect(text).toContain('hàng đợi');
  expect(text).toContain('chưa bắt đầu');
  expect(text).not.toContain('tài liệu');
  expect(text).not.toContain('đã tạo');
  expect(partialRunText(0)).not.toContain('tài liệu');
});

it('retains a saved final section at deadline and reports source extraction separately from tool counts', () => {
  const proof = {
    handle: 'T_' + 'a'.repeat(24),
    label: 'Report.pdf',
    text: 'page text',
    version: 'proof',
    provenance: 'AI_DRAFT' as const,
    permissions: [],
    createdAt: '2026-10-11T00:00:00.000Z',
    file: {
      sourceIndexId: randomUUID(),
      version: 'v1',
      checksum: 'b'.repeat(64),
      representation: 'PDF_TEXT_PAGE' as const,
      page: 1,
      selection: {
        parserVersion: 'pdf-page-v1' as const,
        checksum: 'c'.repeat(64),
        startLine: 1,
        startColumn: 1,
      },
      textPageCoverage: { pagesTotal: 3, complete: true },
    },
  };
  const saved = 'Useful completed section with [source] and `literal code`.';
  expect(partialRunText(19, [proof], saved)).toBe(saved);
  const summary = partialRunText(0, [proof], null);
  expect(summary).toContain('đã trích đủ chữ 1/3 trang');
  expect(summary).toContain('Phạm vi AI đã đọc chưa xác minh');
  expect(summary).not.toContain('0 lần gọi công cụ');
});

it('retains bounded local artifact image provenance in durable checkpoints without provider media receipts', () => {
  const sourceId = randomUUID();
  const artifact = {
    toolKey: 'local-create',
    sourceId: randomUUID(),
    fileAssetId: randomUUID(),
    version: '1:generated',
    filename: 'Quote.xlsx',
    sizeBytes: 1000,
    format: 'xlsx',
    provenance: 'AI_DRAFT',
    downloadUrl:
      '/api/v1/project-chat/projects/' +
      randomUUID() +
      '/ai/files/' +
      randomUUID() +
      '/download',
    predecessor: null,
    diff: null,
  };
  const progress = {
    toolSources: [],
    toolPermissions: [],
    memoryCitations: [],
    sourceCitations: [],
    toolExecutions: [],
    siwcRequests: [],
    artifacts: [artifact],
  };
  expect(runProgressSchema.parse(progress).artifacts).toEqual([artifact]);
  const imageSources = [1, 2].map((page) => ({
    sourceId,
    version: '1:original',
    checksum: 'a'.repeat(64),
    page,
    imageChecksum: String(page).repeat(64),
  }));
  const saved = runProgressSchema.parse({
    ...progress,
    artifacts: [{ ...artifact, imageSources }],
  });
  expect(saved.artifacts![0]).toMatchObject({ imageSources });
  expect(saved.siwcMedia).toBeUndefined();
  const withoutImages = runProofDigest([], progress);
  expect(runProofDigest([], { ...progress, documentReadIssues: [] })).toBe(
    withoutImages,
  );
  const issue = {
    sourceId,
    version: 'v1',
    checksum: 'b'.repeat(64),
    page: 2,
    code: 'SOURCE_TEXT_UNAVAILABLE',
  };
  const withIssue = runProofDigest([], {
    ...progress,
    documentReadIssues: [issue],
  });
  expect(withIssue).not.toBe(withoutImages);
  expect(
    runProofDigest([], {
      ...progress,
      documentReadIssues: [{ ...issue, page: 3 }],
    }),
  ).not.toBe(withIssue);
  expect(runProofDigest([], { ...progress, artifacts: [] })).toBe(
    withoutImages,
  );
  const withImages = runProofDigest([], saved);
  expect(withImages).not.toBe(withoutImages);
  expect(
    runProofDigest([], {
      ...saved,
      artifacts: [
        {
          ...artifact,
          imageSources: [{ ...imageSources[0], imageChecksum: 'b'.repeat(64) }],
        },
      ],
    }),
  ).not.toBe(withImages);
  for (const invalid of [
    [...imageSources, ...imageSources],
    [{ ...imageSources[0], page: 0 }],
    [{ ...imageSources[0], checksum: 'not-a-checksum' }],
    [{ ...imageSources[0], imageChecksum: 'not-a-checksum' }],
    [{ ...imageSources[0], version: '' }],
    [{ ...imageSources[0], file_data: 'private-binary' }],
  ])
    expect(
      runProgressSchema.safeParse({
        ...progress,
        artifacts: [{ ...artifact, imageSources: invalid }],
      }).success,
    ).toBe(false);
});

it('preserves distinct source references for identical binary media and rejects extra receipts', () => {
  const bytes = Buffer.from('%PDF-1.4\nsynthetic\n%%EOF');
  const sha = createHash('sha256').update(bytes).digest('hex');
  const refs = [1, 2].map((version) => ({
    sourceId: randomUUID(),
    version: String(version),
    checksum: sha,
    mime: 'application/pdf' as const,
    sentHash: sha,
    representation: 'original' as const,
    page: null,
  }));
  const input = [
    {
      role: 'user',
      content: refs.map(() => ({
        type: 'input_file',
        filename: 'Source.pdf',
        file_data: 'data:application/pdf;base64,' + bytes.toString('base64'),
      })),
    },
  ];
  const saved = snapshotRunInput(input, refs);
  expect(saved).toMatchObject([
    { content: refs.map((ref) => ({ type: 'source_media', ...ref })) },
  ]);
  expect(() => snapshotRunInput([input[0]!], [...refs, refs[0]!])).toThrow();
  expect(() =>
    snapshotRunInput(
      input,
      [...refs].reverse().map((ref) => ({ ...ref, sentHash: 'b'.repeat(64) })),
    ),
  ).toThrow();
});

it('binds media receipts to checkpoint parts and current file proofs before recovery', () => {
  const sourceId = randomUUID(),
    checksum = 'a'.repeat(64),
    handle = 'T_' + 'a'.repeat(24);
  const part = {
    type: 'source_media' as const,
    sourceId,
    version: '1',
    checksum,
    mime: 'application/pdf' as const,
    sentHash: checksum,
    representation: 'original' as const,
    page: null,
  };
  const call = {
    type: 'function_call' as const,
    namespace: 'galaxy' as const,
    name: 'read_project_source' as const,
    call_id: 'original',
    arguments: JSON.stringify({
      sourceId,
      representation: 'original',
      page: null,
      startLine: 1,
    }),
  };
  const input = [
    call,
    {
      type: 'function_call_output' as const,
      call_id: call.call_id,
      output: 'Original proof',
    },
    { role: 'user' as const, content: [part] },
  ];
  const progress = {
    toolSources: [
      {
        handle,
        label: 'Synthetic.pdf',
        text: 'Original proof',
        version: '1',
        provenance: 'AI_DRAFT',
        permissions: [],
        createdAt: new Date().toISOString(),
        file: {
          sourceIndexId: sourceId,
          version: '1',
          checksum,
          representation: 'PDF_ORIGINAL',
        },
      },
    ],
    toolPermissions: [],
    memoryCitations: [],
    sourceCitations: [],
    toolExecutions: [
      {
        name: 'read_project_source',
        callId: call.call_id,
        status: 'OK',
        durationMs: 1,
      },
    ],
    siwcRequests: [],
    siwcMedia: [
      {
        callId: 'original',
        sourceIndexId: sourceId,
        handle,
        mime: 'application/pdf',
        bytes: 100,
        sentHash: checksum,
        representation: 'original',
        page: null,
        status: 'PREPARED',
      },
    ],
  };
  const digest = runProofDigest(input, progress);
  const question = { role: 'user', content: 'Keep this exact PDF request.' };
  const calculations = Array.from({ length: 32 }, (_, i) => [
    {
      type: 'function_call',
      namespace: 'galaxy',
      name: 'calculate',
      call_id: 'math-' + i,
      arguments: '{"expression":"1+1"}',
    },
    { type: 'function_call_output', call_id: 'math-' + i, output: '2' },
  ]).flat();
  const packed = packHistoryContinuation(
    [
      { role: 'developer', content: 'Verified Project' },
      question,
      ...input,
      ...calculations,
    ],
    question,
    [call.call_id],
  );
  expect(packed.length).toBeLessThanOrEqual(64);
  const snapshot = snapshotRunInput(packed, []);
  const packedDigest = runProofDigest(snapshot, progress);
  expect(runProofDigest(JSON.parse(JSON.stringify(snapshot)), progress)).toBe(
    packedDigest,
  );
  expect(
    snapshot.filter((item) => 'role' in item && Array.isArray(item.content)),
  ).toHaveLength(1);
  expect(() =>
    runProofDigest(input, {
      ...progress,
      siwcMedia: [{ ...progress.siwcMedia[0], callId: 'forged' }],
    }),
  ).toThrow();
  expect(() =>
    runProofDigest(input, {
      ...progress,
      toolExecutions: [{ ...progress.toolExecutions[0], status: 'ERROR' }],
    }),
  ).toThrow();
  expect(() =>
    runProofDigest(
      [
        {
          ...call,
          arguments: JSON.stringify({
            ...JSON.parse(call.arguments),
            sourceId: randomUUID(),
          }),
        },
        ...input.slice(1),
      ],
      progress,
    ),
  ).toThrow();
  expect(
    runProofDigest(input, {
      ...progress,
      siwcMedia: [{ ...progress.siwcMedia[0], status: 'ACCEPTED' }],
    }),
  ).not.toBe(digest);
  expect(() =>
    runProofDigest([{ role: 'user', content: 'No media was sent.' }], progress),
  ).toThrow();
  expect(() => runProofDigest(input, { ...progress, siwcMedia: [] })).toThrow();
  expect(() =>
    runProofDigest(input, {
      ...progress,
      siwcMedia: [{ ...progress.siwcMedia[0], sourceIndexId: randomUUID() }],
    }),
  ).toThrow();
  expect(() =>
    runProofDigest(input, {
      ...progress,
      toolSources: [
        {
          ...progress.toolSources[0],
          file: { ...progress.toolSources[0]!.file, version: '2' },
        },
      ],
    }),
  ).toThrow();
});

it('checkpoints media as immutable source references and excludes reasoning content', () => {
  const bytes = Buffer.from('%PDF-1.4\nsynthetic\n%%EOF');
  const sourceId = randomUUID();
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const input = [
    { role: 'user', content: 'Keep the exact question and conditions.' },
    {
      type: 'reasoning',
      id: 'r',
      summary: [{ type: 'summary_text', text: 'PRIVATE_REASONING' }],
    },
    {
      role: 'user',
      content: [
        { type: 'input_text', text: 'Authorized original' },
        {
          type: 'input_file',
          filename: 'Source.pdf',
          file_data: 'data:application/pdf;base64,' + bytes.toString('base64'),
        },
      ],
    },
  ];
  const saved = snapshotRunInput(input, [
    {
      sourceId,
      version: '1:' + sha256,
      checksum: sha256,
      mime: 'application/pdf',
      sentHash: sha256,
      representation: 'original',
      page: null,
    },
  ]);
  expect(saved).toHaveLength(2);
  expect(saved[0]).toEqual(input[0]);
  expect(saved[1]).toMatchObject({
    content: [
      { type: 'input_text', text: 'Authorized original' },
      {
        type: 'source_media',
        sourceId,
        version: '1:' + sha256,
        sentHash: sha256,
      },
    ],
  });
  expect(JSON.stringify(saved)).not.toContain(bytes.toString('base64'));
  expect(JSON.stringify(saved)).not.toContain('PRIVATE_REASONING');
  expect(() => snapshotRunInput(input, [])).toThrow();
});

it('rejects persisted binary or reasoning while preserving text that mentions JSON field names', () => {
  const question = {
    role: 'user',
    content: 'Explain {"file_data":"example"} without changing it.',
  };
  expect(snapshotRunInput([question], [])).toEqual([question]);
  const run = {
    version: 1,
    mode: 'NORMAL',
    actor: {
      userId: randomUUID(),
      organizationId: randomUUID(),
      organizationMembershipId: randomUUID(),
      sessionId: randomUUID(),
    },
    queuedAt: '2026-10-11T00:00:00Z',
    deadlineAt: '2026-10-11T00:05:00Z',
    heartbeatAt: null,
    phase: 'TOOLS',
    attempts: 1,
    providerRounds: 1,
    dispatchState: 'SAFE',
    checkpoint: {
      proofDigest: 'a'.repeat(64),
      stage: 'READY',
      input: [question],
      pendingCalls: [],
      final: null,
    },
  };
  expect(runWorkflowSchema.safeParse(run).success).toBe(true);
  expect(
    runWorkflowSchema.safeParse({
      ...run,
      checkpoint: {
        ...run.checkpoint,
        input: [{ type: 'reasoning', id: 'r', summary: [] }],
      },
    }).success,
  ).toBe(false);
  expect(
    runWorkflowSchema.safeParse({
      ...run,
      checkpoint: {
        ...run.checkpoint,
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_file',
                filename: 'A.pdf',
                file_data: 'data:application/pdf;base64,JVBERg==',
              },
            ],
          },
        ],
      },
    }).success,
  ).toBe(false);
});
