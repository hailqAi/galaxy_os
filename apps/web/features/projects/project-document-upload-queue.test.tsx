import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../app/lib/api';
import { mergeRecoveredProjectContextQueue } from './project-context-documents';
import {
  MAX_UPLOAD_ATTEMPTS,
  ProjectDocumentUploadQueue,
  clearProjectDocumentPendingBatchStorage,
  enqueueProjectDocumentFiles,
  limitProjectDocumentFiles,
  isProjectDocumentTargetStale,
  mergeProjectDocumentQueue,
  loadOrCreateProjectDocumentPendingBatch as createPendingBatch,
  projectDocumentPendingBatchItems,
  projectDocumentQueueBlocksClose,
  projectDocumentQueueKey,
  projectDocumentQueueShouldAutoStart,
  readProjectDocumentPendingBatch,
  reconcileProjectDocumentPendingBatch,
  recoverProjectDocumentQueues,
  recoverProjectDocumentQueuesOnce,
  removeProjectDocumentQueueItem,
  retryProjectDocumentPendingBatch,
  runProjectDocumentUploadQueue,
  submitProjectDocumentQueue,
  setProjectDocumentAborted,
  transferProjectDocumentQueueItem,
  type ProjectDocumentQueueItem,
} from './project-document-upload-queue';

const constraints = { maxBytes: 20, allowedExtensions: ['.pdf', '.docx'] };
const definition = { id: 'definition-1', name: 'Hồ sơ dự án' };
const stageTarget = {
  contextType: 'STAGE_WORKFLOW_STEP_DOCUMENT' as const,
  targetType: 'STAGE_DOCUMENT' as const,
};
const recoveryDefinition = {
  ...definition,
  workstreamKey: 'ASSIGNMENT',
  ...stageTarget,
};
const sessionIds = [
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003',
] as const;
const pendingPrincipal = {
  actorUserId: 'actor-1',
  organizationId: 'organization-1',
};
const queueActor = {
  id: 'actor-1',
  displayName: 'Nguyễn Minh',
  organizationId: 'organization-1',
};
const file = (name: string, size = 4) =>
  ({
    name,
    size,
    type: name.endsWith('.pdf')
      ? 'application/pdf'
      : 'application/octet-stream',
    slice: () => new Blob(['data']),
  }) as File;

function queue(keys = ['key-1', 'key-2']) {
  let index = 0;
  return enqueueProjectDocumentFiles(
    [file('one.pdf'), file('two.pdf')],
    {
      projectId: 'project-1',
      definition,
      stageKey: 'STAGE_1',
      workstreamKey: 'ASSIGNMENT',
      submittedOfficerId: 'actor-1',
      ...stageTarget,
    },
    constraints,
    () => keys[index++]!,
  );
}

const loadOrCreateProjectDocumentPendingBatch = (
  storage: Parameters<typeof createPendingBatch>[0],
  items: Parameters<typeof createPendingBatch>[1],
  create?: Parameters<typeof createPendingBatch>[3],
) => createPendingBatch(storage, items, pendingPrincipal, create);

describe('ProjectDocumentUploadQueue', () => {
  it('renders one accessible multiple picker with drag/drop and configured limits', () => {
    const markup = renderToStaticMarkup(
      <ProjectDocumentUploadQueue
        actor={queueActor}
        constraints={constraints}
        contextType="STAGE_WORKFLOW_STEP_DOCUMENT"
        targetType="STAGE_DOCUMENT"
        definition={definition}
        officerOptions={[
          { id: 'actor-1', displayName: 'Nguyễn Minh' },
          { id: 'actor-2', displayName: 'Hà Linh' },
        ]}
        onQueueChange={() => undefined}
        onUploaded={() => undefined}
        projectId="project-1"
        queue={[]}
        stageKey="STAGE_1"
        workstreamKey="ASSIGNMENT"
      />,
    );

    expect(markup).toMatch(/<input[^>]+multiple=""[^>]+type="file"/);
    expect(markup).toContain('Bấm để chọn tệp hoặc kéo-thả nhiều tệp');
    expect(markup).toContain('DUNG LƯỢNG TỐI ĐA MỖI TỆP: 20 B · .pdf, .docx');
    expect(markup).toContain('Nguyễn Minh');
    expect(markup).toContain('Hà Linh');
  });

  it('keys retained queue state by exact Project, stage, workstream, definition, context and target', () => {
    expect(
      projectDocumentQueueKey(
        'project-1',
        'STAGE_1',
        'ASSIGNMENT',
        'definition-1',
        'STAGE_MATRIX_DOCUMENT',
        'STAGE_DOCUMENT',
      ),
    ).toBe(
      'project-1:STAGE_1:ASSIGNMENT:definition-1:STAGE_MATRIX_DOCUMENT:STAGE_DOCUMENT',
    );
    expect(
      projectDocumentQueueKey(
        'project-1',
        'STAGE_1',
        'ASSIGNMENT',
        'definition-2',
        'STAGE_MATRIX_DOCUMENT',
        'STAGE_DOCUMENT',
      ),
    ).not.toBe(
      projectDocumentQueueKey(
        'project-1',
        'STAGE_1',
        'ASSIGNMENT',
        'definition-1',
        'STAGE_MATRIX_DOCUMENT',
        'STAGE_DOCUMENT',
      ),
    );
    expect(
      projectDocumentQueueKey(
        'project-1',
        'STAGE_1',
        'ASSIGNMENT',
        'definition-1',
        'STAGE_MATRIX_DOCUMENT',
        'STAGE_DOCUMENT',
      ),
    ).not.toBe(
      projectDocumentQueueKey(
        'project-1',
        'STAGE_1',
        'ASSIGNMENT',
        'definition-1',
        'STAGE_WORKFLOW_STEP_DOCUMENT',
        'STAGE_DOCUMENT',
      ),
    );
    expect(
      projectDocumentQueueKey(
        'project-1',
        'STAGE_1',
        'ASSIGNMENT',
        'definition-1',
        'STAGE_MATRIX_DOCUMENT',
        'STAGE_DOCUMENT',
      ),
    ).not.toBe(
      projectDocumentQueueKey(
        'project-1',
        'STAGE_1',
        'ASSIGNMENT',
        'definition-1',
        'STAGE_MATRIX_DOCUMENT',
        'REQUIRED_DOCUMENT',
      ),
    );
  });

  it('formats the canonical server limit as 20 GB without a client limit constant', () => {
    const markup = renderToStaticMarkup(
      <ProjectDocumentUploadQueue
        actor={queueActor}
        constraints={{
          maxBytes: 21_474_836_480,
          allowedExtensions: ['.pdf'],
        }}
        contextType="STAGE_WORKFLOW_STEP_DOCUMENT"
        targetType="STAGE_DOCUMENT"
        definition={definition}
        officerOptions={[{ id: 'actor-1', displayName: 'Nguyễn Minh' }]}
        onQueueChange={() => undefined}
        onUploaded={() => undefined}
        projectId="project-1"
        queue={[]}
        stageKey="STAGE_1"
        workstreamKey="ASSIGNMENT"
      />,
    );

    expect(markup).toContain('DUNG LƯỢNG TỐI ĐA MỖI TỆP: 20 GB');
  });

  it('queues picker/drop files independently and rejects configured size or extension violations', () => {
    let index = 0;
    const items = enqueueProjectDocumentFiles(
      [file('valid.pdf'), file('bad.exe'), file('large.pdf', 21)],
      {
        projectId: 'project-1',
        definition,
        stageKey: 'STAGE_1',
        workstreamKey: 'ASSIGNMENT',
        submittedOfficerId: 'actor-1',
        ...stageTarget,
      },
      constraints,
      () => `key-${++index}`,
    );

    expect(items.map(({ filename, status }) => [filename, status])).toEqual([
      ['valid.pdf', 'QUEUED'],
      ['bad.exe', 'FAILED'],
      ['large.pdf', 'FAILED'],
    ]);
    expect(items[0]).toMatchObject({
      definitionId: 'definition-1',
      stageKey: 'STAGE_1',
      workstreamKey: 'ASSIGNMENT',
      submittedOfficerId: 'actor-1',
      confirmedBytes: 0,
      attempts: 0,
    });
    expect(projectDocumentQueueShouldAutoStart(items)).toBe(true);
  });

  it('limits one pending submission to the backend batch maximum', () => {
    const files = Array.from({ length: 5 }, (_, index) =>
      file(`file-${index + 1}.pdf`),
    );

    expect(
      limitProjectDocumentFiles(files, 18).map(({ name }) => name),
    ).toEqual(['file-1.pdf', 'file-2.pdf']);
    expect(limitProjectDocumentFiles(files, 20)).toEqual([]);
  });

  it('keeps a live selection that arrives before Project context recovery', () => {
    const [live, recovered] = queue(['live-key', 'recovered-key']);

    expect(
      mergeRecoveredProjectContextQueue([live!], [recovered!]).map(
        ({ idempotencyKey }) => idempotencyKey,
      ),
    ).toEqual(['live-key', 'recovered-key']);
  });

  it('recovers a reloaded Project once and groups drafts by logical document row', async () => {
    const request = vi.fn().mockResolvedValue({
      items: [
        {
          id: 'session-reloaded',
          projectId: 'project-1',
          requiredDocumentId: null,
          stageOneDocumentId: 'document-draft',
          originalFilename: 'reloaded.pdf',
          declaredSize: '48',
          uploadedBytes: '48',
          mimeType: 'application/pdf',
          status: 'AVAILABLE',
          submittingOfficerId: 'actor-3',
          stageOneDocument: {
            requiredDocumentId: 'definition-1',
            stageKey: 'STAGE_1',
            workstreamKey: 'ASSIGNMENT',
            submittedOfficerId: 'actor-2',
          },
        },
      ],
    });

    const recovered = await recoverProjectDocumentQueues(
      {
        projectId: 'project-1',
        definitions: [recoveryDefinition],
      },
      request,
    );

    expect(request).toHaveBeenCalledWith(
      '/uploads/recovery?projectId=project-1&contextType=STAGE_WORKFLOW_STEP_DOCUMENT',
    );
    expect(
      recovered[
        'project-1:STAGE_1:ASSIGNMENT:definition-1:STAGE_WORKFLOW_STEP_DOCUMENT:STAGE_DOCUMENT'
      ],
    ).toEqual([
      expect.objectContaining({
        sessionId: 'session-reloaded',
        documentId: 'document-draft',
        definitionId: 'definition-1',
        submittedOfficerId: 'actor-3',
        status: 'READY_TO_SUBMIT',
        progress: 100,
      }),
    ]);
    expect(
      recovered[
        'project-1:STAGE_1:ASSIGNMENT:definition-1:STAGE_WORKFLOW_STEP_DOCUMENT:STAGE_DOCUMENT'
      ]?.[0]?.file,
    ).toBeUndefined();
  });

  it.each(['STAGE_3', 'STAGE_4', 'STAGE_5'] as const)(
    'recovers only the requested REQUIRED_DOCUMENT definition with exact %s identity',
    async (stageKey) => {
      const requiredDefinition = {
        ...definition,
        stageKey,
        workstreamKey: 'DELIVERY',
        submittedOfficerId: 'actor-1',
        contextType: 'STAGE_MATRIX_DOCUMENT' as const,
        targetType: 'REQUIRED_DOCUMENT' as const,
      };
      const request = vi.fn().mockResolvedValue({
        items: [
          {
            id: `session-${stageKey}`,
            projectId: 'project-1',
            requiredDocumentId: 'definition-1',
            stageOneDocumentId: null,
            originalFilename: 'recovered.pdf',
            declaredSize: '4',
            uploadedBytes: '4',
            mimeType: 'application/pdf',
            status: 'AVAILABLE',
          },
          {
            id: 'wrong-stage-document-session',
            projectId: 'project-1',
            requiredDocumentId: null,
            stageOneDocumentId: 'stage-document-1',
            originalFilename: 'wrong.pdf',
            declaredSize: '4',
            uploadedBytes: '4',
            mimeType: 'application/pdf',
            status: 'AVAILABLE',
            stageOneDocument: {
              requiredDocumentId: 'definition-1',
              stageKey: 'STAGE_1',
              workstreamKey: 'DELIVERY',
              submittedOfficerId: 'actor-2',
            },
          },
        ],
      });

      const recovered = await recoverProjectDocumentQueues(
        { projectId: 'project-1', definitions: [requiredDefinition] },
        request,
      );
      const key = `project-1:${stageKey}:DELIVERY:definition-1:STAGE_MATRIX_DOCUMENT:REQUIRED_DOCUMENT`;

      expect(request).toHaveBeenCalledWith(
        '/uploads/recovery?projectId=project-1&requiredDocumentId=definition-1',
      );
      expect(recovered[key]).toEqual([
        expect.objectContaining({
          definitionId: 'definition-1',
          stageKey,
          submittedOfficerId: 'actor-1',
          targetType: 'REQUIRED_DOCUMENT',
          status: 'READY_TO_SUBMIT',
        }),
      ]);
      expect(recovered[key]?.[0]).not.toHaveProperty('documentId');
    },
  );

  it('recovers a Stage 2 logical document with its exact persisted stage', async () => {
    const stageTwoDefinition = {
      ...definition,
      stageKey: 'STAGE_2' as const,
      workstreamKey: 'PLAN',
      submittedOfficerId: 'actor-1',
      contextType: 'STAGE_MATRIX_DOCUMENT' as const,
      targetType: 'STAGE_DOCUMENT' as const,
    };
    const request = vi.fn().mockResolvedValue({
      items: [
        {
          id: 'stage-two-session',
          projectId: 'project-1',
          requiredDocumentId: null,
          stageOneDocumentId: 'stage-two-document',
          originalFilename: 'plan.xlsx',
          declaredSize: '4',
          uploadedBytes: '4',
          mimeType:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          status: 'AVAILABLE',
          stageOneDocument: {
            requiredDocumentId: 'definition-1',
            stageKey: 'STAGE_2',
            workstreamKey: 'PLAN',
            submittedOfficerId: 'actor-1',
          },
        },
      ],
    });

    const recovered = await recoverProjectDocumentQueues(
      { projectId: 'project-1', definitions: [stageTwoDefinition] },
      request,
    );

    expect(
      recovered[
        'project-1:STAGE_2:PLAN:definition-1:STAGE_MATRIX_DOCUMENT:STAGE_DOCUMENT'
      ],
    ).toEqual([
      expect.objectContaining({
        sessionId: 'stage-two-session',
        stageKey: 'STAGE_2',
        documentId: 'stage-two-document',
      }),
    ]);
  });

  it('releases a failed Project recovery guard so a later data load retries', async () => {
    const guard = { current: '' };
    const request = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce({ items: [] });
    const target = {
      projectId: 'project-1',
      definitions: [recoveryDefinition],
    };

    await expect(
      recoverProjectDocumentQueuesOnce(guard, target, request),
    ).rejects.toThrow('temporary failure');
    expect(guard.current).toBe('');
    await expect(
      recoverProjectDocumentQueuesOnce(guard, target, request),
    ).resolves.toEqual({});
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('retains the selected File object when queue state is published across rerenders', () => {
    const [item] = queue(['key-1', 'unused']);
    const [rerendered] = mergeProjectDocumentQueue(
      [item!],
      [{ ...item!, status: 'INITIALIZING' }],
    );

    expect(rerendered?.file).toBe(item?.file);
  });

  it('does not reconcile the same recovered session across different logical document identities', () => {
    const [current] = queue(['key-1', 'unused']);
    const changed = {
      ...current!,
      idempotencyKey: 'recovered:session-1',
      sessionId: 'session-1',
      documentId: 'document-version',
      file: undefined,
      status: 'READY_TO_SUBMIT' as const,
    };

    expect(
      mergeProjectDocumentQueue(
        [{ ...current!, sessionId: 'session-1', documentId: undefined }],
        [changed],
      ).map(({ documentId }) => documentId),
    ).toEqual([undefined, 'document-version']);
  });

  it('keeps a pending custom name when recovery confirms the same logical item', () => {
    const [current] = queue(['key-1', 'unused']);
    const pending = {
      ...current!,
      displayName: 'Biên bản bổ sung',
      sessionId: 'session-1',
      documentId: 'document-1',
      file: undefined,
      status: 'READY_TO_SUBMIT' as const,
    };
    const recovered: ProjectDocumentQueueItem = {
      ...pending,
      idempotencyKey: 'recovered:session-1',
    };
    delete recovered.displayName;

    expect(mergeProjectDocumentQueue([pending], [recovered])).toEqual([
      expect.objectContaining({ displayName: 'Biên bản bổ sung' }),
    ]);
  });

  it('leaves QUEUED for INITIALIZING immediately when upload starts', async () => {
    const snapshots: ProjectDocumentQueueItem[][] = [];
    let release: () => void = () => undefined;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const running = runProjectDocumentUploadQueue(
      queue(['key-1', 'unused']).slice(0, 1),
      async () => waiting,
      1,
      (changed) => snapshots.push(changed),
    );

    expect(snapshots[0]?.[0]).toMatchObject({
      status: 'INITIALIZING',
      attempts: 1,
    });
    release();
    await running;
  });

  it('marks a retry explicitly and stops after the bounded attempt count', async () => {
    const upload = vi.fn(async () => {
      throw new Error('network');
    });
    let [item] = queue(['key-1', 'unused']);
    const states: ProjectDocumentQueueItem['status'][] = [];

    for (let attempt = 0; attempt < MAX_UPLOAD_ATTEMPTS; attempt++) {
      [item] = await runProjectDocumentUploadQueue(
        [item!],
        upload,
        2,
        (changed) => states.push(changed[0]!.status),
      );
    }
    const snapshots: ProjectDocumentQueueItem[][] = [];
    const [unchanged] = await runProjectDocumentUploadQueue(
      [item!],
      upload,
      1,
      (changed) => snapshots.push(changed),
    );

    expect(upload).toHaveBeenCalledTimes(MAX_UPLOAD_ATTEMPTS);
    expect(states).toContain('RETRYING');
    expect(snapshots).toEqual([]);
    expect(unchanged).toMatchObject({
      status: 'FAILED',
      attempts: MAX_UPLOAD_ATTEMPTS,
    });
  });

  it('removes waiting files but preserves in-flight files', () => {
    const items = queue();
    expect(removeProjectDocumentQueueItem(items, 'key-1')).toHaveLength(1);
    expect(
      removeProjectDocumentQueueItem(
        [{ ...items[0]!, status: 'UPLOADING' }],
        'key-1',
      ),
    ).toHaveLength(1);
  });

  it('retains sessions for resume, isolates partial failure, retries it, and dedupes completed items', async () => {
    const attempts = new Map<string, number>();
    const upload = vi.fn(
      async (
        item: ProjectDocumentQueueItem,
        update: (change: Partial<ProjectDocumentQueueItem>) => void,
      ) => {
        update({ sessionId: `session-${item.idempotencyKey}`, progress: 50 });
        const count = (attempts.get(item.idempotencyKey) ?? 0) + 1;
        attempts.set(item.idempotencyKey, count);
        if (item.idempotencyKey === 'key-2' && count === 1)
          throw new Error('network');
        return { id: `document-${item.idempotencyKey}` };
      },
    );

    const first = await runProjectDocumentUploadQueue(queue(), upload, 2);
    expect(first.map(({ status }) => status)).toEqual([
      'READY_TO_SUBMIT',
      'FAILED',
    ]);
    expect(first[0]).toMatchObject({
      sessionId: 'session-key-1',
      progress: 100,
    });
    const retried = await runProjectDocumentUploadQueue(first, upload, 2);
    expect(retried.map(({ status }) => status)).toEqual([
      'READY_TO_SUBMIT',
      'READY_TO_SUBMIT',
    ]);
    expect(attempts.get('key-1')).toBe(1);
    expect(attempts.get('key-2')).toBe(2);
    expect(mergeProjectDocumentQueue(first, retried)).toHaveLength(2);
    expect(
      mergeProjectDocumentQueue(
        [
          ...first,
          {
            ...queue(['key-3', 'unused'])[0]!,
            file: file('late.pdf'),
            filename: 'late.pdf',
          },
        ],
        retried,
      ).map(({ filename }) => filename),
    ).toEqual(['one.pdf', 'two.pdf', 'late.pdf']);
  });

  it('preserves explicit abort after the in-flight request rejects', async () => {
    const [item] = queue(['key-1', 'unused']);
    const aborted = new Set(['key-1']);
    const result = await runProjectDocumentUploadQueue(
      [item!],
      async () => {
        throw new Error('server aborted');
      },
      1,
      undefined,
      (current) => aborted.has(current.idempotencyKey),
    );
    expect(result[0]).toMatchObject({ status: 'ABORTED', error: '' });
  });

  it('clears a failed server abort so a later retry can complete', async () => {
    const [item] = queue(['key-1', 'unused']);
    const aborted = new Set<string>();
    setProjectDocumentAborted(aborted, 'key-1', true);
    setProjectDocumentAborted(aborted, 'key-1', false);

    const [retried] = await runProjectDocumentUploadQueue(
      [{ ...item!, status: 'FAILED' }],
      async () => undefined,
      1,
      undefined,
      (current) => aborted.has(current.idempotencyKey),
    );

    expect(retried).toMatchObject({ status: 'READY_TO_SUBMIT', error: '' });
  });

  it('does not upload a waiting item removed while earlier files are in flight', async () => {
    let index = 0;
    const items = enqueueProjectDocumentFiles(
      [file('one.pdf'), file('two.pdf'), file('three.pdf')],
      {
        projectId: 'project-1',
        definition,
        stageKey: 'STAGE_1',
        workstreamKey: 'ASSIGNMENT',
        submittedOfficerId: 'actor-1',
        ...stageTarget,
      },
      constraints,
      () => `key-${++index}`,
    );
    const removed = new Set<string>();
    let release: () => void = () => undefined;
    const firstPair = new Promise<void>((resolve) => {
      release = resolve;
    });
    const upload = vi.fn(async () => firstPair);

    const running = runProjectDocumentUploadQueue(
      items,
      upload,
      2,
      undefined,
      undefined,
      (item) => removed.has(item.idempotencyKey),
    );
    await vi.waitFor(() => expect(upload).toHaveBeenCalledTimes(2));
    removed.add('key-3');
    release();

    const result = await running;
    expect(upload).toHaveBeenCalledTimes(2);
    expect(result.map(({ idempotencyKey }) => idempotencyKey)).toEqual([
      'key-1',
      'key-2',
    ]);
  });

  it('does not start or complete a transfer after cancellation', async () => {
    const [item] = queue(['key-1', 'unused']);
    const request = vi.fn();
    const controller = new AbortController();
    controller.abort();

    await expect(
      transferProjectDocumentQueueItem(
        item!,
        { projectId: 'project-1' },
        request,
        async () => 'digest',
        undefined,
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(request).not.toHaveBeenCalled();
  });

  it('sends authoritative Workflow context and a trimmed bounded custom name through the canonical protocol', async () => {
    const calls: [string, RequestInit | undefined][] = [];
    const request = vi.fn(async (path: string, init?: RequestInit) => {
      calls.push([path, init]);
      if (path === '/uploads/initiate')
        return {
          id: 'session-1',
          partSize: 4,
          totalParts: 1,
          uploadedBytes: '0',
          uploadedParts: [],
          originalFilename: 'one.pdf',
          declaredSize: '4',
          mimeType: 'application/pdf',
          constraints,
        };
      if (path.includes('/parts'))
        return {
          id: 'session-1',
          partSize: 4,
          totalParts: 1,
          uploadedBytes: '4',
          uploadedParts: [{ partNumber: 1, size: 4, checksum: 'digest' }],
          originalFilename: 'one.pdf',
          declaredSize: '4',
          mimeType: 'application/pdf',
          constraints,
        };
      return {
        status: 'AVAILABLE',
        fileAssetId: 'file-1',
        uploadedBytes: '4',
      };
    });
    const [queued] = queue(['key-1', 'unused']);
    const item = {
      ...queued!,
      displayName: `  ${'Đ'.repeat(220)}  `,
    };

    await transferProjectDocumentQueueItem(
      item,
      { projectId: 'project-1' },
      request,
      async () => 'digest',
    );

    expect(calls.map(([path]) => path)).toEqual([
      '/uploads/initiate',
      '/uploads/session-1/parts?partNumber=1&checksum=digest',
      '/uploads/session-1/complete',
    ]);
    expect(JSON.parse(String(calls[0]?.[1]?.body))).toMatchObject({
      projectId: 'project-1',
      idempotencyKey: 'key-1',
      stageOneDocument: {
        definitionId: 'definition-1',
        stageKey: 'STAGE_1',
        workstreamKey: 'ASSIGNMENT',
        contextType: 'STAGE_WORKFLOW_STEP_DOCUMENT',
        displayName: 'Đ'.repeat(200),
        submittedOfficerId: 'actor-1',
        idempotencyKey: 'key-1',
      },
    });
    expect(String(calls[0]?.[1]?.body)).not.toContain('documentType');
  });

  it('sends Matrix context for a stage target', async () => {
    const [queued] = queue(['key-1', 'unused']);
    const item = {
      ...queued!,
      contextType: 'STAGE_MATRIX_DOCUMENT' as const,
    };
    const request = vi.fn(async (path: string, _init?: RequestInit) => {
      void _init;
      if (path === '/uploads/initiate')
        return {
          id: 'session-1',
          partSize: 4,
          totalParts: 1,
          uploadedBytes: '4',
          uploadedParts: [{ partNumber: 1, size: 4, checksum: 'digest' }],
          originalFilename: 'one.pdf',
          declaredSize: '4',
          mimeType: 'application/pdf',
          constraints,
        };
      return { status: 'AVAILABLE', uploadedBytes: '4' };
    });

    await transferProjectDocumentQueueItem(
      item,
      { projectId: 'project-1' },
      request,
      async () => 'digest',
    );

    const body = JSON.parse(String(request.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({
      stageOneDocument: { contextType: 'STAGE_MATRIX_DOCUMENT' },
    });
    expect(body.stageOneDocument).not.toHaveProperty('workstreamKey');
  });

  it('sends only the legacy required-document target without a stage target', async () => {
    const [queued] = queue(['key-1', 'unused']);
    const item = {
      ...queued!,
      contextType: 'STAGE_MATRIX_DOCUMENT' as const,
      targetType: 'REQUIRED_DOCUMENT' as const,
    };
    const request = vi.fn(async (path: string, _init?: RequestInit) => {
      void _init;
      if (path === '/uploads/initiate')
        return {
          id: 'session-1',
          partSize: 4,
          totalParts: 1,
          uploadedBytes: '4',
          uploadedParts: [{ partNumber: 1, size: 4, checksum: 'digest' }],
          originalFilename: 'one.pdf',
          declaredSize: '4',
          mimeType: 'application/pdf',
          constraints,
        };
      return { status: 'AVAILABLE', uploadedBytes: '4' };
    });

    await transferProjectDocumentQueueItem(
      item,
      { projectId: 'project-1' },
      request,
      async () => 'digest',
    );

    const body = JSON.parse(String(request.mock.calls[0]?.[1]?.body));
    expect(body.requiredDocumentId).toBe('definition-1');
    expect(body.idempotencyKey).toBe('key-1');
    expect(body).not.toHaveProperty('stageOneDocument');
  });

  it('resumes from server-confirmed bytes and publishes upload then finalization states', async () => {
    const updates: Partial<ProjectDocumentQueueItem>[] = [];
    const request = vi.fn(async (path: string) => {
      if (path === '/uploads/initiate')
        return {
          id: 'session-1',
          partSize: 2,
          totalParts: 2,
          uploadedBytes: '2',
          uploadedParts: [{ partNumber: 1, size: 2, checksum: 'digest' }],
          originalFilename: 'one.pdf',
          declaredSize: '4',
          mimeType: 'application/pdf',
          constraints,
        };
      if (path.includes('/parts'))
        return {
          id: 'session-1',
          partSize: 2,
          totalParts: 2,
          uploadedBytes: '4',
          uploadedParts: [
            { partNumber: 1, size: 2, checksum: 'digest' },
            { partNumber: 2, size: 2, checksum: 'digest' },
          ],
          originalFilename: 'one.pdf',
          declaredSize: '4',
          mimeType: 'application/pdf',
          constraints,
        };
      return {
        status: 'AVAILABLE',
        fileAssetId: 'file-1',
        uploadedBytes: '4',
      };
    });
    const [item] = queue(['key-1', 'unused']);

    await transferProjectDocumentQueueItem(
      item!,
      { projectId: 'project-1' },
      request,
      async () => 'digest',
      (change) => updates.push(change),
    );

    expect(request.mock.calls.map(([path]) => path)).toEqual([
      '/uploads/initiate',
      '/uploads/session-1/parts?partNumber=2&checksum=digest',
      '/uploads/session-1/complete',
    ]);
    expect(updates).toEqual([
      {
        sessionId: 'session-1',
        status: 'UPLOADING',
        confirmedBytes: 2,
        progress: 50,
      },
      { sessionId: 'session-1', confirmedBytes: 4, progress: 100 },
      { status: 'FINALIZING_TEMP' },
      { confirmedBytes: 4, progress: 100 },
    ]);
  });

  it('turns initiation failure into an actionable Vietnamese reason', async () => {
    const [item] = queue(['key-1', 'unused']);
    const [failed] = await runProjectDocumentUploadQueue(
      [item!],
      (current, update) =>
        transferProjectDocumentQueueItem(
          current,
          { projectId: 'project-1' },
          async () => {
            throw new Error('network');
          },
          async () => 'digest',
          update,
        ),
    );

    expect(failed).toMatchObject({
      status: 'FAILED',
      error:
        'Không thể khởi tạo phiên tải. Vui lòng kiểm tra quyền truy cập và thử lại.',
    });
  });

  it('keeps a classified initiation error instead of adding the generic permission message', async () => {
    const [item] = queue(['key-1', 'unused']);
    const [failed] = await runProjectDocumentUploadQueue(
      [item!],
      (current, update) =>
        transferProjectDocumentQueueItem(
          current,
          { projectId: 'project-1' },
          async () => {
            throw new ApiError('target missing', 404, {
              category: 'PROJECT_DOCUMENT_TARGET_NOT_FOUND',
            });
          },
          async () => 'digest',
          update,
        ),
    );

    expect(failed?.error).toBe(
      'Không tìm thấy loại hồ sơ. Danh sách có thể đã thay đổi; vui lòng mở lại và thử lại.',
    );
  });

  it.each(['parts', 'complete'] as const)(
    'keeps the stale-target category when %s revalidates the target',
    async (phase) => {
      const [item] = queue(['key-1', 'unused']);
      const session = {
        id: 'session-1',
        status: 'INITIATED',
        partSize: 4,
        totalParts: 1,
        uploadedBytes: '0',
        uploadedParts: [],
        originalFilename: 'one.pdf',
        declaredSize: '4',
        mimeType: 'application/pdf',
        constraints,
      };
      const request = async (path: string) => {
        if (path === '/uploads/initiate') return session;
        if (path.includes(`/${phase}`))
          throw new ApiError('target missing', 404, {
            category: 'PROJECT_DOCUMENT_TARGET_NOT_FOUND',
          });
        return {
          ...session,
          status: 'UPLOADING',
          uploadedBytes: '4',
          uploadedParts: [{ partNumber: 1, size: 4, checksum: 'digest' }],
        };
      };
      let failure: unknown;

      try {
        await transferProjectDocumentQueueItem(
          item!,
          { projectId: 'project-1' },
          request,
          async () => 'digest',
        );
      } catch (error) {
        failure = error;
      }

      expect(isProjectDocumentTargetStale(failure)).toBe(true);
      expect(failure).toMatchObject({
        category: 'PROJECT_DOCUMENT_TARGET_NOT_FOUND',
      });
    },
  );

  it.each([
    [
      'chunk',
      (path: string) => path.includes('/parts'),
      'Tải dữ liệu bị gián đoạn. Phần đã tải được giữ lại; vui lòng thử lại để tiếp tục.',
    ],
    [
      'finalization',
      (path: string) => path.endsWith('/complete'),
      'Đã tải đủ dữ liệu nhưng không thể hoàn tất tệp tạm. Vui lòng thử lại.',
    ],
  ])(
    'maps a %s failure without exposing server details',
    async (_, fail, message) => {
      const [item] = queue(['key-1', 'unused']);
      const request = async (path: string) => {
        if (fail(path)) throw new Error('/private/storage/path');
        if (path === '/uploads/initiate')
          return {
            id: 'session-1',
            partSize: 4,
            totalParts: 1,
            uploadedBytes: '0',
            uploadedParts: [],
            originalFilename: 'one.pdf',
            declaredSize: '4',
            mimeType: 'application/pdf',
            constraints,
          };
        return {
          id: 'session-1',
          partSize: 4,
          totalParts: 1,
          uploadedBytes: '4',
          uploadedParts: [{ partNumber: 1, size: 4, checksum: 'digest' }],
          originalFilename: 'one.pdf',
          declaredSize: '4',
          mimeType: 'application/pdf',
          constraints,
        };
      };

      await expect(
        transferProjectDocumentQueueItem(
          item!,
          { projectId: 'project-1' },
          request,
          async () => 'digest',
        ),
      ).rejects.toThrow(message);
    },
  );

  it('stops at temporary-ready without refreshing permanent documents', async () => {
    const [item] = queue(['key-1', 'unused']);
    const request = vi.fn(async (path: string) => {
      if (path === '/uploads/initiate')
        return {
          id: 'session-1',
          partSize: 4,
          totalParts: 1,
          uploadedBytes: '4',
          uploadedParts: [{ partNumber: 1, size: 4, checksum: 'digest' }],
          originalFilename: 'one.pdf',
          declaredSize: '4',
          mimeType: 'application/pdf',
          constraints,
        };
      return {
        status: 'AVAILABLE',
        fileAssetId: 'file-1',
        uploadedBytes: '4',
      };
    });
    const refresh = vi.fn();
    const upload = (
      current: ProjectDocumentQueueItem,
      update: (change: Partial<ProjectDocumentQueueItem>) => void,
    ) =>
      transferProjectDocumentQueueItem(
        current,
        { projectId: 'project-1' },
        request,
        async () => 'digest',
        update,
        undefined,
      );

    const [ready] = await runProjectDocumentUploadQueue([item!], upload);
    expect(ready).toMatchObject({
      status: 'READY_TO_SUBMIT',
      sessionId: 'session-1',
      confirmedBytes: 4,
    });
    expect(refresh).not.toHaveBeenCalled();
    expect(
      request.mock.calls.filter(([path]) => path.includes('/parts')),
    ).toEqual([]);
  });

  it('submits only ready session ids with one stable key and no bytes', async () => {
    const items = queue().map((item, index) => ({
      ...item,
      sessionId: `session-${index + 1}`,
      status: 'READY_TO_SUBMIT' as const,
      progress: 100,
      confirmedBytes: item.size,
    }));
    const request = vi.fn().mockResolvedValue({
      items: items.map((item, index) => ({
        sessionId: item.sessionId,
        fileAssetId: `file-${index + 1}`,
        document: { id: `document-${index + 1}` },
      })),
    });

    const result = await submitProjectDocumentQueue(
      items,
      'stable-batch-key',
      request,
    );

    expect(request).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith('/uploads/submit', {
      method: 'POST',
      body: JSON.stringify({
        projectId: 'project-1',
        sessionIds: ['session-1', 'session-2'],
        idempotencyKey: 'stable-batch-key',
      }),
    });
    expect(JSON.stringify(request.mock.calls)).not.toContain('Blob');
    expect(result.map(({ status }) => status)).toEqual([
      'SUBMITTED',
      'SUBMITTED',
    ]);
  });

  it('keeps every named file ready when batch linkage fails', async () => {
    const items = queue().map((item, index) => ({
      ...item,
      sessionId: `session-${index + 1}`,
      status: 'READY_TO_SUBMIT' as const,
    }));

    await expect(
      submitProjectDocumentQueue(items, 'stable-batch-key', async () => {
        throw new Error('link failed');
      }),
    ).rejects.toThrow('one.pdf, two.pdf');
    expect(items.map(({ status }) => status)).toEqual([
      'READY_TO_SUBMIT',
      'READY_TO_SUBMIT',
    ]);
  });

  it('keeps the stale-target category when batch submission revalidates the target', async () => {
    const items = queue().map((item, index) => ({
      ...item,
      sessionId: `session-${index + 1}`,
      status: 'READY_TO_SUBMIT' as const,
    }));
    let failure: unknown;

    try {
      await submitProjectDocumentQueue(items, 'stable-batch-key', async () => {
        throw new ApiError('target missing', 404, {
          category: 'PROJECT_DOCUMENT_TARGET_NOT_FOUND',
        });
      });
    } catch (error) {
      failure = error;
    }

    expect(isProjectDocumentTargetStale(failure)).toBe(true);
    expect(failure).toMatchObject({
      category: 'PROJECT_DOCUMENT_TARGET_NOT_FOUND',
    });
  });

  it.each(['PROJECT_NOT_FOUND_OR_NOT_VISIBLE', 'KEY_DOSSIER_ITEM_DELETED'])(
    'closes only the stale upload context for %s',
    (category) => {
      expect(
        isProjectDocumentTargetStale(
          new ApiError('stale target', 404, { category }),
        ),
      ).toBe(true);
    },
  );

  it('keeps the original pending batch when authoritative recovery returns only a subset', async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };
    const ready = queue().map((item, index) => ({
      ...item,
      file: undefined,
      sessionId: sessionIds[index]!.toUpperCase(),
      documentId: `document-${index + 1}`,
      status: 'READY_TO_SUBMIT' as const,
    }));

    const batch = loadOrCreateProjectDocumentPendingBatch(
      storage,
      ready,
      () => 'stable-batch-key',
    );
    const recovered = await recoverProjectDocumentQueues(
      {
        projectId: 'project-1',
        definitions: [recoveryDefinition],
      },
      vi.fn().mockResolvedValue({
        items: [
          {
            id: sessionIds[1],
            stageOneDocumentId: 'document-2',
            originalFilename: 'two.pdf',
            declaredSize: '4',
            uploadedBytes: '4',
            mimeType: 'application/pdf',
            status: 'AVAILABLE',
            stageOneDocument: {
              requiredDocumentId: 'definition-1',
              stageKey: 'STAGE_1',
              workstreamKey: 'ASSIGNMENT',
              submittedOfficerId: 'actor-1',
            },
          },
        ],
      }),
    );
    const current = projectDocumentPendingBatchItems(batch);
    const merged = mergeProjectDocumentQueue(
      current,
      recovered[
        'project-1:STAGE_1:ASSIGNMENT:definition-1:STAGE_WORKFLOW_STEP_DOCUMENT:STAGE_DOCUMENT'
      ] ?? [],
    );

    expect(batch).toMatchObject({
      batchKey: 'stable-batch-key',
      sessionIds: sessionIds.slice(0, 2),
    });
    expect(Object.keys(batch).sort()).toEqual([
      'actorUserId',
      'batchKey',
      'contextType',
      'definitionId',
      'items',
      'organizationId',
      'projectId',
      'sessionIds',
      'stageKey',
      'targetType',
      'version',
      'workstreamKey',
    ]);
    expect(merged.map(({ sessionId }) => sessionId)).toEqual([
      sessionIds[0],
      sessionIds[1],
    ]);
    expect(readProjectDocumentPendingBatch(storage, batch)).toEqual(batch);
  });

  it('never hydrates pending filenames across organization or actor boundaries', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };
    const ready = queue()
      .slice(0, 1)
      .map((item) => ({
        ...item,
        sessionId: sessionIds[0],
        status: 'READY_TO_SUBMIT' as const,
      }));

    const batch = loadOrCreateProjectDocumentPendingBatch(storage, ready);

    expect(batch).toMatchObject(pendingPrincipal);
    expect(
      readProjectDocumentPendingBatch(storage, {
        ...batch,
        actorUserId: 'actor-2',
      }),
    ).toBeNull();
    expect(
      readProjectDocumentPendingBatch(storage, {
        ...batch,
        organizationId: 'organization-2',
      }),
    ).toBeNull();
    expect(readProjectDocumentPendingBatch(storage, batch)).toEqual(batch);
  });

  it('clears every pending-upload identity and nothing else on logout', () => {
    const values = new Map([
      ['project-document-submit:first', 'one.pdf'],
      ['unrelated', 'keep'],
      ['project-document-submit:second', 'two.pdf'],
    ]);
    const storage = {
      get length() {
        return values.size;
      },
      key: (index: number) => [...values.keys()][index] ?? null,
      removeItem: (key: string) => values.delete(key),
    };

    clearProjectDocumentPendingBatchStorage(storage);

    expect([...values.entries()]).toEqual([['unrelated', 'keep']]);
  });

  it.each([
    ['projectId', 'project-2'],
    ['stageKey', 'STAGE_2'],
    ['workstreamKey', 'SURVEY'],
    ['definitionId', 'definition-2'],
    ['contextType', 'STAGE_MATRIX_DOCUMENT'],
    ['targetType', 'REQUIRED_DOCUMENT'],
  ] as const)(
    'rejects and clears a pending batch whose exact %s identity is stale',
    (field, value) => {
      const values = new Map<string, string>();
      const storage = {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, stored: string) => values.set(key, stored),
        removeItem: (key: string) => values.delete(key),
      };
      const ready = queue()
        .slice(0, 1)
        .map((item) => ({
          ...item,
          sessionId: sessionIds[0],
          status: 'READY_TO_SUBMIT' as const,
        }));
      const batch = loadOrCreateProjectDocumentPendingBatch(storage, ready);
      const [storageKey] = [...values.keys()];
      values.set(storageKey!, JSON.stringify({ ...batch, [field]: value }));

      expect(readProjectDocumentPendingBatch(storage, batch)).toBeNull();
      expect(values.size).toBe(0);
    },
  );

  it('persists and reconstructs custom names and exact target identity', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };
    const ready = queue()
      .slice(0, 1)
      .map((item) => ({
        ...item,
        displayName: 'Biên bản bổ sung',
        sessionId: sessionIds[0],
        status: 'READY_TO_SUBMIT' as const,
      }));

    const batch = loadOrCreateProjectDocumentPendingBatch(storage, ready);
    const [reconstructed] = projectDocumentPendingBatchItems(batch);

    expect(batch).toMatchObject({
      contextType: 'STAGE_WORKFLOW_STEP_DOCUMENT',
      targetType: 'STAGE_DOCUMENT',
      items: [
        {
          contextType: 'STAGE_WORKFLOW_STEP_DOCUMENT',
          targetType: 'STAGE_DOCUMENT',
          displayName: 'Biên bản bổ sung',
        },
      ],
    });
    expect(reconstructed).toMatchObject({
      contextType: 'STAGE_WORKFLOW_STEP_DOCUMENT',
      targetType: 'STAGE_DOCUMENT',
      displayName: 'Biên bản bổ sung',
    });
  });

  it('rejects a definition-scoped pending batch when logical version identity changes', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };
    const ready = queue()
      .slice(0, 1)
      .map((item) => ({
        ...item,
        sessionId: sessionIds[0],
        status: 'READY_TO_SUBMIT' as const,
      }));
    loadOrCreateProjectDocumentPendingBatch(storage, ready);

    expect(() =>
      loadOrCreateProjectDocumentPendingBatch(storage, [
        { ...ready[0]!, documentId: 'document-existing' },
      ]),
    ).toThrow('không khớp với hàng hồ sơ hiện tại');
    expect(values.size).toBe(0);
  });

  it('rejects and clears reuse when a later live item drifts from any stored identity field', () => {
    const changes: Partial<ProjectDocumentQueueItem>[] = [
      { projectId: 'project-2' },
      { stageKey: 'STAGE_2' },
      { workstreamKey: 'SURVEY' },
      { definitionId: 'definition-2' },
      { contextType: 'STAGE_MATRIX_DOCUMENT' },
      { targetType: 'REQUIRED_DOCUMENT' },
      { sessionId: sessionIds[2] },
      { idempotencyKey: 'changed-key' },
      { definitionName: 'Changed definition' },
      { displayName: 'Changed display name' },
      { submittedOfficerId: 'actor-2' },
      { documentId: 'document-2' },
      { filename: 'changed.pdf' },
      { size: 5 },
      { mimeType: 'image/png' },
    ];

    for (const change of changes) {
      const values = new Map<string, string>();
      const storage = {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      };
      const ready = queue().map((item, index) => ({
        ...item,
        displayName: 'Original display name',
        documentId: 'document-1',
        sessionId: sessionIds[index],
        status: 'READY_TO_SUBMIT' as const,
      }));
      loadOrCreateProjectDocumentPendingBatch(storage, ready);

      expect(() =>
        loadOrCreateProjectDocumentPendingBatch(storage, [
          ready[0]!,
          { ...ready[1]!, ...change },
        ]),
      ).toThrow('không khớp với hàng hồ sơ hiện tại');
      expect(values.size).toBe(0);
    }
  });

  it('removes empty, duplicate, or extra pending storage data instead of hydrating it', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };
    const ready = queue()
      .slice(0, 1)
      .map((item) => ({
        ...item,
        sessionId: sessionIds[0],
        status: 'READY_TO_SUBMIT' as const,
      }));
    const batch = loadOrCreateProjectDocumentPendingBatch(storage, ready);
    const [storageKey, serialized] = [...values.entries()][0]!;
    const valid = JSON.parse(serialized) as Record<string, unknown>;
    const invalid = [
      { ...valid, sessionIds: [], items: [] },
      {
        ...valid,
        sessionIds: [sessionIds[0], sessionIds[0]],
        items: [batch.items[0], batch.items[0]],
      },
      { ...valid, unexpected: 'unsafe' },
      {
        ...valid,
        items: [{ ...batch.items[0], file: 'forged' }],
      },
    ];

    for (const value of invalid) {
      values.set(storageKey, JSON.stringify(value));
      expect(readProjectDocumentPendingBatch(storage, batch)).toBeNull();
      expect(values.has(storageKey)).toBe(false);
    }
  });

  it('reconstructs allowlisted queue items and can lock hydration as SUBMITTING', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };
    const batch = loadOrCreateProjectDocumentPendingBatch(
      storage,
      queue()
        .slice(0, 1)
        .map((item) => ({
          ...item,
          sessionId: sessionIds[0],
          status: 'READY_TO_SUBMIT' as const,
        })),
    );
    const [item] = projectDocumentPendingBatchItems(
      {
        ...batch,
        items: [{ ...batch.items[0]!, file: 'forged' } as never],
      },
      'SUBMITTING',
    );

    expect(item).toEqual(
      expect.objectContaining({
        sessionId: sessionIds[0],
        status: 'SUBMITTING',
      }),
    );
    expect(item).not.toHaveProperty('file');
    const markup = renderToStaticMarkup(
      <ProjectDocumentUploadQueue
        actor={queueActor}
        constraints={constraints}
        contextType="STAGE_WORKFLOW_STEP_DOCUMENT"
        targetType="STAGE_DOCUMENT"
        definition={definition}
        officerOptions={[{ id: 'actor-1', displayName: 'Nguyễn Minh' }]}
        onQueueChange={() => undefined}
        onUploaded={() => undefined}
        projectId="project-1"
        queue={[item!]}
        stageKey="STAGE_1"
        workstreamKey="ASSIGNMENT"
      />,
    );
    expect(markup).toContain('Đang nộp hồ sơ');
    expect(markup).toMatch(/<button[^>]+disabled=""[^>]*>NỘP HỒ SƠ/);
  });

  it('removes expired and missing sessions, clearing only when no retryable session remains', async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };
    const ready = queue().map((item, index) => ({
      ...item,
      sessionId: sessionIds[index],
      status: 'READY_TO_SUBMIT' as const,
    }));
    const batch = loadOrCreateProjectDocumentPendingBatch(storage, ready);
    const request = vi.fn(async (path: string) => {
      if (path.endsWith(sessionIds[1])) return { status: 'EXPIRED' };
      throw new ApiError('missing', 404);
    });

    const remaining = await reconcileProjectDocumentPendingBatch(
      storage,
      batch,
      [sessionIds[0]],
      request,
    );
    expect(remaining.batch?.sessionIds).toEqual([sessionIds[0]]);
    expect(remaining.error).toBe('');

    const cleared = await reconcileProjectDocumentPendingBatch(
      storage,
      remaining.batch!,
      [],
      vi.fn().mockRejectedValue(new ApiError('missing', 404)),
    );
    expect(cleared).toEqual({ batch: null, error: '' });
    expect(readProjectDocumentPendingBatch(storage, batch)).toBeNull();
  });

  it('retains locked sessions when omitted-status authorization or network checks are transient', async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };
    const ready = queue().map((item, index) => ({
      ...item,
      sessionId: sessionIds[index],
      status: 'READY_TO_SUBMIT' as const,
    }));
    const batch = loadOrCreateProjectDocumentPendingBatch(storage, ready);
    const request = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('forbidden details', 403))
      .mockRejectedValueOnce(new Error('network details'));

    const result = await reconcileProjectDocumentPendingBatch(
      storage,
      batch,
      [],
      request,
    );
    expect(result.batch?.sessionIds).toEqual(sessionIds.slice(0, 2));
    expect(result.error).toBe(
      'Không thể xác minh trạng thái tệp tạm. Vui lòng thử lại.',
    );
    expect(readProjectDocumentPendingBatch(storage, batch)).toEqual(batch);
  });

  it('retains one pending key across refresh failure and clears only after a successful reload retry', async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };
    const ready = queue().map((item, index) => ({
      ...item,
      file: undefined,
      sessionId: sessionIds[index],
      status: 'READY_TO_SUBMIT' as const,
    }));
    const batch = loadOrCreateProjectDocumentPendingBatch(
      storage,
      ready,
      () => 'stable-batch-key',
    );
    const request = vi.fn().mockResolvedValue({
      items: ready.map((item, index) => ({
        sessionId: item.sessionId,
        fileAssetId: `asset-${index + 1}`,
        document: { id: `document-${index + 1}` },
      })),
    });

    await expect(
      retryProjectDocumentPendingBatch(
        storage,
        batch,
        request,
        vi.fn().mockRejectedValue(new Error('refresh failed')),
      ),
    ).rejects.toThrow('không thể làm mới dữ liệu');
    expect(readProjectDocumentPendingBatch(storage, batch)).toEqual(batch);

    await retryProjectDocumentPendingBatch(
      storage,
      batch,
      request,
      vi.fn().mockResolvedValue(undefined),
    );
    expect(readProjectDocumentPendingBatch(storage, batch)).toBeNull();
    expect(request.mock.calls.map(([, init]) => JSON.parse(init.body))).toEqual(
      [
        {
          projectId: 'project-1',
          sessionIds: sessionIds.slice(0, 2),
          idempotencyKey: 'stable-batch-key',
        },
        {
          projectId: 'project-1',
          sessionIds: sessionIds.slice(0, 2),
          idempotencyKey: 'stable-batch-key',
        },
      ],
    );
  });

  it('does not return SUBMITTED items until document refresh succeeds', async () => {
    const items = queue().map((item, index) => ({
      ...item,
      sessionId: `session-${index + 1}`,
      status: 'READY_TO_SUBMIT' as const,
    }));
    const request = vi.fn().mockResolvedValue({
      items: items.map((item, index) => ({
        sessionId: item.sessionId,
        fileAssetId: `asset-${index + 1}`,
        document: { id: `document-${index + 1}` },
      })),
    });
    const refresh = vi.fn().mockRejectedValue(new Error('refresh failed'));

    await expect(
      submitProjectDocumentQueue(items, 'stable-batch-key', request, refresh),
    ).rejects.toThrow(
      'Đã liên kết hồ sơ nhưng không thể làm mới dữ liệu. Vui lòng thử nộp lại.',
    );
    expect(refresh).toHaveBeenCalledWith({ id: 'document-1' });
    expect(items.map(({ status }) => status)).toEqual([
      'READY_TO_SUBMIT',
      'READY_TO_SUBMIT',
    ]);
  });

  it('renders explicit state and confirmed transferred/total bytes', () => {
    const [item] = queue(['key-1', 'unused']);
    const markup = renderToStaticMarkup(
      <ProjectDocumentUploadQueue
        actor={queueActor}
        constraints={constraints}
        contextType="STAGE_WORKFLOW_STEP_DOCUMENT"
        targetType="STAGE_DOCUMENT"
        definition={definition}
        officerOptions={[{ id: 'actor-1', displayName: 'Nguyễn Minh' }]}
        onQueueChange={() => undefined}
        onClose={() => undefined}
        onUploaded={() => undefined}
        projectId="project-1"
        queue={[
          {
            ...item!,
            status: 'READY_TO_SUBMIT',
            confirmedBytes: 4,
            progress: 100,
          },
        ]}
        stageKey="STAGE_1"
        workstreamKey="ASSIGNMENT"
      />,
    );

    expect(markup).toContain('Đã tải tạm — Chờ nộp');
    expect(markup).toContain('4 B / 4 B');
    expect(markup).not.toContain('>Tiếp tục</button>');
    expect(markup).toContain('Giữ bản tải tạm và đóng');
    expect(markup).toContain('Hủy bản tải tạm');
    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain('role="group"');
  });

  it('offers no close path while a ready draft has an active sibling', () => {
    const [ready, uploading] = queue();
    const markup = renderToStaticMarkup(
      <ProjectDocumentUploadQueue
        actor={queueActor}
        constraints={constraints}
        contextType="STAGE_WORKFLOW_STEP_DOCUMENT"
        targetType="STAGE_DOCUMENT"
        definition={definition}
        officerOptions={[{ id: 'actor-1', displayName: 'Nguyễn Minh' }]}
        onQueueChange={() => undefined}
        onClose={() => undefined}
        onUploaded={() => undefined}
        projectId="project-1"
        queue={[
          { ...ready!, status: 'READY_TO_SUBMIT', sessionId: 'session-1' },
          { ...uploading!, status: 'UPLOADING', sessionId: 'session-2' },
        ]}
        stageKey="STAGE_1"
        workstreamKey="ASSIGNMENT"
      />,
    );

    expect(markup).not.toContain('Đóng bản tải tạm');
    expect(markup).not.toContain('Giữ bản tải tạm và đóng');
  });

  it('keeps close locked while the final server abort promise is pending', () => {
    expect(
      projectDocumentQueueBlocksClose(
        [{ ...queue()[0]!, status: 'ABORTED' }],
        true,
      ),
    ).toBe(true);
    expect(
      projectDocumentQueueBlocksClose(
        [{ ...queue()[0]!, status: 'ABORTED' }],
        false,
      ),
    ).toBe(false);
  });

  it('restores the recovered officer and locks additions before any submit key exists', () => {
    const recovered = {
      ...queue()[0]!,
      file: undefined,
      sessionId: 'session-recovered',
      submittedOfficerId: 'actor-2',
      status: 'READY_TO_SUBMIT' as const,
    };
    const markup = renderToStaticMarkup(
      <ProjectDocumentUploadQueue
        actor={queueActor}
        constraints={constraints}
        contextType="STAGE_WORKFLOW_STEP_DOCUMENT"
        targetType="STAGE_DOCUMENT"
        definition={definition}
        officerOptions={[{ id: 'actor-1', displayName: 'Nguyễn Minh' }]}
        onQueueChange={() => undefined}
        onUploaded={() => undefined}
        projectId="project-1"
        queue={[recovered]}
        stageKey="STAGE_1"
        workstreamKey="ASSIGNMENT"
      />,
    );

    expect(markup).toMatch(
      /<option value="actor-2" selected="">Cán bộ đã lưu<\/option>/,
    );
    expect(markup).toMatch(/<input[^>]+disabled=""[^>]+type="file"/);
  });
});
