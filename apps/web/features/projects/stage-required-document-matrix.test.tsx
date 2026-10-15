import {
  Children,
  createElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  executeRequiredDocumentAction,
  finishMatrixUpload,
  loadRequiredDocumentHistory,
  loadRequiredDocumentHistoryForInspection,
  loadRequiredDocumentPage,
  matrixDataForContext,
  revealRequiredDocumentAnchor,
  StageRequiredDocumentAssignmentDialog,
  StageRequiredDocumentGroups,
  StageRequiredDocumentMatrix,
  StageRequiredDocumentMatrixActions,
  StageRequiredDocumentMatrixDialog,
  StageRequiredDocumentHistoryDialog,
  StageRequiredDocumentNotApplicableDialog,
  stageRequiredDocumentMatrixDialogReducer,
  type RequiredDocumentPage,
} from './stage-required-document-matrix';

const page: RequiredDocumentPage = {
  items: [
    {
      id: 'document-1',
      documentName: 'Project proposal',
      documentType: 'PROPOSAL',
      stageKey: 'STAGE_1',
      workstreamKey: 'PROPOSAL',
      required: true,
      status: 'DRAFT',
      currentVersion: 1,
      dueDate: '2026-08-15T00:00:00.000Z',
      updatedAt: '2026-08-11T00:00:00.000Z',
      owner: { displayName: 'Nguyễn An' },
      currentFile: { id: 'file-1', originalFilename: 'proposal.pdf' },
      completionPolicy: 'APPROVED',
    },
    {
      id: 'document-2',
      documentName: 'Kickoff decision',
      documentType: 'KICKOFF_APPROVAL',
      stageKey: 'STAGE_1',
      workstreamKey: 'KICKOFF_APPROVAL',
      required: true,
      status: 'APPROVED',
      currentVersion: 1,
      dueDate: null,
      updatedAt: '2026-08-11T00:00:00.000Z',
      owner: null,
      currentFile: { id: 'file-2', originalFilename: 'decision.pdf' },
      completionPolicy: 'APPROVED',
    },
    {
      id: 'document-3',
      documentName: 'Review document',
      documentType: 'SURVEY_REPORT',
      stageKey: 'STAGE_1',
      workstreamKey: 'SURVEY',
      required: true,
      status: 'PENDING_REVIEW',
      currentVersion: 1,
      dueDate: null,
      updatedAt: '2026-08-11T00:00:00.000Z',
      owner: null,
      currentFile: { id: 'file-3', originalFilename: 'survey.pdf' },
      completionPolicy: 'FILE_PRESENT',
    },
    {
      id: 'document-4',
      documentName: 'Later document',
      documentType: 'PROPOSAL',
      stageKey: 'STAGE_2',
      workstreamKey: 'PROPOSAL',
      required: true,
      status: 'DRAFT',
      currentVersion: 1,
      dueDate: null,
      updatedAt: '2026-08-11T00:00:00.000Z',
      owner: null,
      currentFile: null,
      completionPolicy: 'FILE_PRESENT',
    },
    {
      id: 'document-5',
      documentName: 'Project dossier',
      documentType: 'PROJECT_DOSSIER',
      stageKey: 'STAGE_1',
      workstreamKey: 'ASSIGNMENT',
      required: true,
      status: 'MISSING',
      currentVersion: 0,
      dueDate: null,
      updatedAt: '2026-08-11T00:00:00.000Z',
      owner: null,
      currentFile: null,
      completionPolicy: 'FILE_PRESENT',
    },
    {
      id: 'document-6',
      documentName: 'Preliminary finance',
      documentType: 'PRELIMINARY_FINANCIAL_PLAN',
      stageKey: 'STAGE_1',
      workstreamKey: 'FINANCIAL_PLANNING',
      required: true,
      status: 'MISSING',
      currentVersion: 0,
      dueDate: null,
      updatedAt: '2026-08-11T00:00:00.000Z',
      owner: null,
      currentFile: null,
      completionPolicy: 'FILE_PRESENT',
    },
  ],
  page: 1,
  totalPages: 1,
  total: 4,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

afterEach(() => vi.unstubAllGlobals());

describe('StageRequiredDocumentMatrix', () => {
  it('opens a completed group before revealing canonical or legacy document anchors', () => {
    for (const targetId of [
      'document-document-1',
      'required-document-document-1',
    ]) {
      const group = { open: false };
      const target = {
        closest: vi.fn().mockReturnValue(group),
        scrollIntoView: vi.fn(),
      };
      const root = { getElementById: vi.fn().mockReturnValue(target) };

      expect(
        revealRequiredDocumentAnchor(
          targetId,
          root as unknown as Pick<Document, 'getElementById'>,
        ),
      ).toBe(true);
      expect(root.getElementById).toHaveBeenCalledWith(targetId);
      expect(group.open).toBe(true);
      expect(target.scrollIntoView).toHaveBeenCalledWith({ block: 'center' });
    }
  });

  it('renders each applicable requirement once in the five business groups', () => {
    const markup = renderToStaticMarkup(
      createElement(StageRequiredDocumentGroups, {
        projectId: 'project-1',
        stageKey: 'STAGE_1',
        initialData: page,
        actorPermissions: [
          'project.document.manage',
          'project.document.review',
        ],
      }),
    );

    expect(markup).toContain('HỒ SƠ GIAI ĐOẠN');
    expect(markup).toContain('Khởi tạo dự án');
    expect(markup).toContain('Khảo sát');
    expect(markup).toContain('Phạm vi &amp; kế hoạch');
    expect(markup).toContain('Tài chính');
    expect(markup).toContain('Phê duyệt khởi động');
    expect(markup).not.toContain('hồ sơ hoàn thành');
    expect(markup.match(/Đề xuất dự án/g)).toHaveLength(1);
    expect(markup).toContain('id="required-document-document-1"');
    expect(markup).toContain('id="document-document-1"');
    expect(markup.match(/id="required-document-document-1"/g)).toHaveLength(1);
    expect(markup).toMatch(
      /<details[^>]*open=""[^>]*><summary[^>]*>Khởi tạo dự án/,
    );
    expect(markup).toMatch(
      /<details(?![^>]*open)[^>]*><summary[^>]*>Phê duyệt khởi động/,
    );
    expect(markup).not.toContain('Later document');
    expect(markup).not.toContain('PROPOSAL');
    expect(markup).not.toContain('DRAFT');
    expect(markup).not.toContain('STAGE_1');
    expect(markup).not.toContain('FILE_PRESENT');
    expect(markup).not.toContain('checksum');
    expect(markup).not.toContain('Điều kiện hoàn thành');
    expect(markup).toMatch(
      />Thao tác<\/span><div[^>]*><button[^>]*>[^<]+<\/button><details><summary>Thao tác khác/,
    );
  });

  it('includes same-stage optional documents in a neutral group', () => {
    const markup = renderToStaticMarkup(
      createElement(StageRequiredDocumentGroups, {
        projectId: 'project-1',
        stageKey: 'STAGE_1',
        initialData: {
          ...page,
          items: [
            page.items[4]!,
            {
              ...page.items[0]!,
              id: 'optional-document',
              documentName: 'Hồ sơ hỗ trợ',
              documentType: 'Hồ sơ hỗ trợ',
              workstreamKey: 'OTHER',
              required: false,
            },
          ],
        },
      }),
    );

    expect(markup).toContain('Hồ sơ khởi tạo dự án');
    expect(markup).toContain('Hồ sơ hỗ trợ');
    expect(markup).toContain('Hồ sơ khác');
  });

  it('omits empty groups and exposes only five desktop fields on one responsive row', () => {
    const markup = renderToStaticMarkup(
      createElement(StageRequiredDocumentGroups, {
        projectId: 'project-1',
        stageKey: 'STAGE_1',
        initialData: {
          ...page,
          items: [page.items[0]!],
        },
        actorPermissions: ['project.document.manage'],
      }),
    );

    expect(markup.match(/<th(?:\s|>)/g)).toHaveLength(5);
    expect(markup).toMatch(
      /<th[^>]*>Hồ sơ<\/th><th[^>]*>Trạng thái<\/th><th[^>]*>Phụ trách<\/th><th[^>]*>Hạn<\/th><th[^>]*>Thao tác<\/th>/,
    );
    expect(markup).toContain('grid');
    expect(markup).toContain('md:table-row');
    expect(markup).not.toContain('overflow-x-auto');
    expect(markup).not.toContain('Khởi tạo dự án');
    expect(markup).not.toContain('Khảo sát');
    expect(markup).not.toContain('Tài chính');
    expect(markup).not.toContain('Phê duyệt khởi động');
    expect(markup.match(/Đã tải lên/g)).toHaveLength(1);
  });

  it('keeps the compatibility export on the grouped renderer', () => {
    const markup = renderToStaticMarkup(
      createElement(StageRequiredDocumentMatrix, {
        projectId: 'project-1',
        stageKey: 'STAGE_1',
        stepKey: 'PROPOSAL',
        compact: true,
        initialData: page,
      }),
    );

    expect(markup).toContain('aria-label="Hồ sơ của bước đang chọn"');
    expect(markup).not.toContain('HỒ SƠ GIAI ĐOẠN');
    expect(markup.match(/<th(?:\s|>)/g)).toHaveLength(5);
    expect(markup).toContain('Đề xuất dự án');
    expect(markup).not.toContain('Báo cáo khảo sát');
    expect(markup).not.toContain('id="required-document-document-1"');
  });

  it('uses labelled native dialogs for N/A reason and owner/due assignment', () => {
    const notApplicable = renderToStaticMarkup(
      createElement(StageRequiredDocumentNotApplicableDialog, {
        document: page.items[0],
        pending: false,
        onClose: () => undefined,
        onSubmit: () => undefined,
      }),
    );
    const assignment = renderToStaticMarkup(
      createElement(StageRequiredDocumentAssignmentDialog, {
        document: page.items[0],
        members: [{ userId: 'user-1', user: { displayName: 'Nguyễn An' } }],
        pending: false,
        onClose: () => undefined,
        onSubmit: () => undefined,
      }),
    );

    expect(notApplicable).toContain('<dialog');
    expect(notApplicable).toContain('aria-label="Lý do không áp dụng"');
    expect(notApplicable).toContain('<textarea');
    expect(notApplicable).toContain('required=""');
    expect(assignment).toContain('<dialog');
    expect(assignment).toContain('aria-label="Phân công hồ sơ"');
    expect(assignment).toContain('Người phụ trách');
    expect(assignment).toContain('type="date"');
  });

  it('opens and closes the visible upload dialog with the exact prompt copy', () => {
    const open = stageRequiredDocumentMatrixDialogReducer(undefined, {
      type: 'open',
      document: page.items[0]!,
    });
    const markup = renderToStaticMarkup(
      createElement(StageRequiredDocumentMatrixDialog, {
        actorPermissions: ['file.upload', 'project.document.manage'],
        projectId: 'project-1',
        uploading: open,
        onClose: () => undefined,
        onComplete: async () => undefined,
        onMessage: () => undefined,
      }),
    );

    expect(markup).toContain('TẢI LÊN HỒ SƠ');
    expect(markup).toContain('aria-label="TẢI LÊN HỒ SƠ"');
    expect(markup).toContain('Đề xuất dự án');
    expect(markup).toContain('Phạm vi &amp; kế hoạch');
    expect(markup).toContain('Cần phê duyệt');
    expect(markup).toContain('Nguyễn An');
    expect(markup).toContain('15/8/2026');
    expect(markup).toContain(
      'data-project-context-documents="project-1:STAGE_1:PROPOSAL:document-1:STAGE_MATRIX_DOCUMENT:REQUIRED_DOCUMENT"',
    );
    expect(markup).not.toContain('Tải tệp hồ sơ');
    expect(
      stageRequiredDocumentMatrixDialogReducer(open, { type: 'close' }),
    ).toBeUndefined();
  });

  it('blocks the dialog close controls while the shared queue owns unfinished work', async () => {
    const close = vi.fn();
    const markup = renderToStaticMarkup(
      createElement(StageRequiredDocumentMatrixDialog, {
        actorPermissions: ['file.upload', 'project.document.manage'],
        closeBlocked: true,
        projectId: 'project-1',
        uploading: page.items[0],
        onClose: close,
        onComplete: async () => undefined,
        onMessage: () => undefined,
      }),
    );
    const matrixModule = await import('./stage-required-document-matrix');
    const canClose = Reflect.get(
      matrixModule,
      'canCloseRequiredDocumentUploadDialog',
    ) as (blocked: boolean) => boolean;

    expect(markup).toMatch(/<button[^>]+disabled=""[^>]*>Đóng<\/button>/);
    expect(canClose(true)).toBe(false);
    expect(canClose(false)).toBe(true);
    expect(close).not.toHaveBeenCalled();
  });

  it('uses the canonical list endpoint when no initial data is supplied', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => page,
    });
    vi.stubGlobal('fetch', fetch);

    await expect(
      loadRequiredDocumentPage('project-1', 'STAGE_1', 'PROPOSAL'),
    ).resolves.toEqual(page);
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/projects/project-1/required-documents?pageSize=100&stageKey=STAGE_1&workstreamKey=PROPOSAL',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('loads every page and renders duplicate requirement ids only once', async () => {
    const firstItems = Array.from({ length: 100 }, (_, index) => ({
      ...page.items[0]!,
      id: `document-${index}`,
    }));
    const last = { ...page.items[0]!, id: 'document-100' };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ...page,
          items: firstItems,
          total: 101,
          totalPages: 2,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ...page,
          items: [firstItems[0], last],
          page: 2,
          total: 101,
          totalPages: 2,
        }),
      });
    vi.stubGlobal('fetch', fetch);

    const result = await loadRequiredDocumentPage('project-1', 'STAGE_1');

    expect(result.items).toHaveLength(101);
    expect(new Set(result.items.map(({ id }) => id)).size).toBe(101);
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      '/api/v1/projects/project-1/required-documents?pageSize=100&stageKey=STAGE_1&page=2',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('keeps rejected and superseded file-present work visible', () => {
    const markup = renderToStaticMarkup(
      createElement(StageRequiredDocumentGroups, {
        projectId: 'project-1',
        stageKey: 'STAGE_1',
        initialData: {
          ...page,
          items: ['REJECTED', 'SUPERSEDED'].map((status, index) => ({
            ...page.items[2]!,
            id: `terminal-${index}`,
            status,
          })),
        },
      }),
    );

    expect(markup.match(/Bị từ chối|Đã được thay thế/g)).toHaveLength(2);
    expect(markup).not.toContain('hồ sơ hoàn thành');
  });

  it('shows real desktop headers and mutually exclusive mobile labels', () => {
    const markup = renderToStaticMarkup(
      createElement(StageRequiredDocumentGroups, {
        projectId: 'project-1',
        stageKey: 'STAGE_1',
        initialData: { ...page, items: [page.items[0]!] },
      }),
    );

    expect(markup).toContain('class="hidden md:table-header-group"');
    expect(markup.match(/class="font-medium md:hidden"/g)).toHaveLength(5);
    expect(markup).not.toContain('sr-only md:table-header-group');
    expect(markup).not.toContain('before:content-[attr(data-label)]');
    expect(markup).not.toContain('data-label=');
  });

  it('loads authorized document history for the in-page inspector', async () => {
    const history = {
      current: {
        documentName: 'Project proposal',
        documentType: 'PROPOSAL',
        status: 'DRAFT',
        currentVersion: 1,
        notes: 'First draft',
      },
      versions: [],
    };
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => history,
    });
    vi.stubGlobal('fetch', fetch);

    await expect(
      loadRequiredDocumentHistory('project-1', 'document-1'),
    ).resolves.toEqual(history);
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/projects/project-1/required-documents/document-1/history',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('does not let a deferred history request replace a newer inspection', async () => {
    const first = deferred<Response>();
    const second = deferred<Response>();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise),
    );
    let request = 1;
    let visibleDocument = '';
    const oldLoad = loadRequiredDocumentHistoryForInspection({
      projectId: 'project-1',
      documentId: 'document-1',
      isCurrent: () => request === 1,
      onData: () => {
        visibleDocument = 'document-1';
      },
      onError: () => {
        visibleDocument = 'error-1';
      },
    });

    request = 2;
    const newLoad = loadRequiredDocumentHistoryForInspection({
      projectId: 'project-2',
      documentId: 'document-2',
      isCurrent: () => request === 2,
      onData: () => {
        visibleDocument = 'document-2';
      },
      onError: () => {
        visibleDocument = 'error-2';
      },
    });
    second.resolve(
      Response.json({
        current: {
          documentName: 'New',
          documentType: 'PROPOSAL',
          status: 'DRAFT',
          currentVersion: 1,
        },
        versions: [],
      }),
    );
    await newLoad;
    first.resolve(
      Response.json({
        current: {
          documentName: 'Old',
          documentType: 'PROPOSAL',
          status: 'DRAFT',
          currentVersion: 1,
        },
        versions: [],
      }),
    );
    await oldLoad;

    expect(visibleDocument).toBe('document-2');
  });

  it('renders read-only detail and history in one native in-page dialog', () => {
    const markup = renderToStaticMarkup(
      createElement(StageRequiredDocumentHistoryDialog, {
        view: 'history',
        document: page.items[0],
        history: {
          current: {
            downloadId: 'file-current',
            filename: 'proposal-v2.pdf',
            version: 2,
            status: 'DRAFT',
            note: 'Current notes',
            uploader: { displayName: 'Nguyễn An' },
            timestamp: '2026-08-11T00:00:00.000Z',
            approval: null,
          },
          versions: [
            {
              id: 'version-1',
              downloadId: 'file-old',
              filename: 'proposal-v1.pdf',
              version: 1,
              actor: { displayName: 'Nguyễn An' },
              timestamp: '2026-08-10T00:00:00.000Z',
              status: 'SUPERSEDED',
            },
          ],
        },
        canDownload: true,
        onClose: () => undefined,
      }),
    );

    expect(markup).toContain('<dialog');
    expect(markup).toContain('aria-label="Lịch sử hồ sơ"');
    expect(markup).toContain('LỊCH SỬ HỒ SƠ');
    expect(markup).toContain('Đề xuất dự án');
    expect(markup).toContain('Bản nháp');
    expect(markup).toContain('v1');
    expect(markup).toContain('proposal-v1.pdf');
    expect(markup).toContain('/files/file-current/download');
    expect(markup).not.toContain('/projects/project-1/documents/document-1');
  });

  it('does not render file download links without file.download', () => {
    const actions = renderToStaticMarkup(
      StageRequiredDocumentMatrixActions({
        document: page.items[0]!,
        actorPermissions: ['project.read'],
        pending: false,
        onCommand: () => undefined,
        onInspect: () => undefined,
        onUpload: () => undefined,
      }),
    );
    const history = renderToStaticMarkup(
      createElement(StageRequiredDocumentHistoryDialog, {
        document: page.items[0],
        history: {
          current: {
            downloadId: 'file-current',
            filename: 'proposal.pdf',
            version: 1,
            status: 'DRAFT',
            note: null,
            uploader: null,
            timestamp: null,
            approval: null,
          },
          versions: [],
        },
        onClose: () => undefined,
      }),
    );

    expect(actions).not.toContain('/download');
    expect(history).not.toContain('/download');
  });

  it('discards stale list responses when the matrix context changes', () => {
    expect(
      matrixDataForContext(
        undefined,
        { key: 'project-1:STAGE_1', data: page },
        'project-1:STAGE_2',
      ),
    ).toBeUndefined();
    expect(matrixDataForContext(page, undefined, 'project-1:STAGE_2')).toBe(
      page,
    );
    const refreshed = { ...page, total: 99 };
    expect(
      matrixDataForContext(
        page,
        { key: 'project-1:STAGE_1', data: refreshed },
        'project-1:STAGE_1',
      ),
    ).toBe(refreshed);
  });

  it('closes the upload path and notifies its owner even when refetching fails', async () => {
    const refresh = vi.fn().mockRejectedValue(new Error('offline'));
    const onMutate = vi.fn().mockResolvedValue(undefined);

    await expect(finishMatrixUpload(refresh, onMutate)).resolves.toEqual({
      refreshFailed: true,
      mutateFailed: false,
    });
    expect(onMutate).toHaveBeenCalledOnce();
  });

  it('refreshes and notifies its owner after upload completion', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const onMutate = vi.fn().mockResolvedValue(undefined);

    await expect(finishMatrixUpload(refresh, onMutate)).resolves.toEqual({
      refreshFailed: false,
      mutateFailed: false,
    });
    expect(refresh).toHaveBeenCalledOnce();
    expect(onMutate).toHaveBeenCalledOnce();
  });

  it('contains a synchronous owner callback failure during upload completion', async () => {
    await expect(
      finishMatrixUpload(
        async () => undefined,
        () => {
          throw new Error('owner refresh failed');
        },
      ),
    ).resolves.toEqual({ refreshFailed: false, mutateFailed: true });
  });

  it('wires rendered submit and approval controls to their existing commands', () => {
    const onCommand = vi.fn();
    const onInspect = vi.fn();
    const submitCell = StageRequiredDocumentMatrixActions({
      document: page.items[0]!,
      actorPermissions: ['project.document.manage', 'project.document.review'],
      pending: false,
      onCommand,
      onInspect,
      onUpload: () => undefined,
    });
    expect(actionButton(submitCell, 'Xem').props.children).toBe('Xem');
    actionButton(submitCell, 'Gửi duyệt').props.onClick();
    actionButton(submitCell, 'Xem').props.onClick();
    expect(onCommand).toHaveBeenCalledWith('submit');
    expect(onInspect).toHaveBeenCalledWith('detail');

    const reviewCell = StageRequiredDocumentMatrixActions({
      document: page.items[2]!,
      actorPermissions: ['project.document.review'],
      pending: false,
      onCommand,
      onInspect,
      onUpload: () => undefined,
    });
    actionButton(reviewCell, 'Phê duyệt').props.onClick();
    actionButton(reviewCell, 'Xem lịch sử').props.onClick();
    expect(onCommand).toHaveBeenLastCalledWith('decision', {
      decision: 'APPROVED',
    });
    expect(onInspect).toHaveBeenLastCalledWith('history');
  });

  it('keeps view actions primary and mutations secondary for current and not-applicable files', () => {
    const inspect = vi.fn();
    const current = renderToStaticMarkup(
      StageRequiredDocumentMatrixActions({
        document: page.items[0]!,
        actorPermissions: ['project.document.manage'],
        pending: false,
        onCommand: () => undefined,
        onInspect: inspect,
        onUpload: () => undefined,
      }),
    );
    expect(current).toMatch(/<div[^>]*><button[^>]*>Xem<\/button><details>/);
    expect(current).toContain('Gửi duyệt');

    const notApplicable = renderToStaticMarkup(
      StageRequiredDocumentMatrixActions({
        document: {
          ...page.items[1]!,
          status: 'NOT_APPLICABLE',
          currentFile: null,
        },
        actorPermissions: ['project.document.review'],
        pending: false,
        onCommand: () => undefined,
        onInspect: inspect,
        onUpload: () => undefined,
      }),
    );
    expect(notApplicable).toMatch(
      /<div[^>]*><button[^>]*>Xem lý do<\/button><details>/,
    );
    expect(notApplicable).toContain('Khôi phục áp dụng');

    const missing = renderToStaticMarkup(
      StageRequiredDocumentMatrixActions({
        document: page.items[4]!,
        actorPermissions: ['project.document.manage', 'file.upload'],
        pending: false,
        onCommand: () => undefined,
        onInspect: inspect,
        onUpload: () => undefined,
      }),
    );
    expect(missing).toMatch(
      /<div[^>]*><button[^>]*>Tải hồ sơ<\/button><details>/,
    );
  });

  it('calls the canonical decision endpoint with the rendered approval body', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetch);

    await executeRequiredDocumentAction(
      'project-1',
      page.items[2]!,
      'decision',
      { decision: 'APPROVED' },
    );

    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/projects/project-1/required-documents/document-3/decision',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ decision: 'APPROVED' }),
      }),
    );
  });
});

type MatrixActionButton = ReactElement<{
  children?: ReactNode;
  onClick?: () => void;
}>;

function actionButtons(node: ReactNode): MatrixActionButton[] {
  return Children.toArray(node).flatMap((child) => {
    if (!isValidElement<MatrixActionButton['props']>(child)) return [];
    return [
      ...(child.type === 'button' ? [child] : []),
      ...actionButtons(child.props.children),
    ];
  });
}

function actionButton(
  node: ReactNode,
  label: string,
): MatrixActionButton & { props: Required<MatrixActionButton['props']> } {
  const button = actionButtons(node).find(
    ({ props }) => props.children === label,
  );
  if (!button?.props.onClick) throw new Error(`Missing ${label} action`);
  return button as MatrixActionButton & {
    props: Required<MatrixActionButton['props']>;
  };
}
