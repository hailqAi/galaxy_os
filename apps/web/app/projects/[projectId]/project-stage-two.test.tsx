import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api';
import {
  ProjectStageTwoView,
  StageTwoLoadState,
  attemptStageTwoPlanPreview,
  completeStageTwoStepOne,
  completeStageTwoStepOneWithDraftGuard,
  confirmStageTwoPlanReset,
  confirmStageTwoPlanImport,
  createStageTwoPlanDraft,
  fetchStageTwoPlanTemplate,
  loadStageTwo,
  previewStageTwoUploadedWorkbook,
  removeStageTwoPlanDraft,
  saveStageTwoDocumentDefinition,
  saveStageTwoPlan,
  stageTwoPlanPayload,
  stageTwoPlanRevision,
  stageTwoPlanTabTransition,
  stageTwoStepFromSearchParam,
  stageTwoStepUrl,
  updateStageTwoPlanDraft,
  validateStageTwoPlan,
  type StageTwoData,
  type StageTwoPlanDraft,
} from './project-stage-two';

const data = {
  project: {
    id: 'project-701',
    code: 'PRJ-701',
    name: 'Galaxy Tower',
    customer: { id: 'customer-1', displayName: 'Galaxy Centre' },
    location: 'Quận 1, TP.HCM',
    projectType: 'DESIGN_AND_BUILD',
    status: 'ACTIVE',
    phase: 'PLANNING',
  },
  selectedStep: 1,
  tabs: [
    { step: 1, label: 'KẾ HOẠCH & KHẢO SÁT' },
    { step: 2, label: 'THIẾT KẾ, SẢN PHẨM & BOQ' },
    { step: 3, label: 'PHÊ DUYỆT' },
  ],
  state: { status: 'IN_PROGRESS', stepOneStatus: 'TODO' },
  plan: [
    {
      id: 'plan-1',
      code: 'CV-01',
      description: 'Khảo sát hiện trạng',
      departmentId: 'department-1',
      department: {
        id: 'department-1',
        code: 'KT',
        name: 'Phòng Kỹ thuật',
      },
      startDate: '2026-08-14',
      finishDate: '2026-08-20',
      allocatedBudget: '1250000.50',
      version: 3,
    },
  ],
  documentDefinitions: [
    {
      id: 'definition-1',
      name: 'Kế hoạch tiến độ tổng thể',
      workstreamKey: 'PLAN',
      description: 'File tiến độ và nguồn lực',
      position: 0,
      initialMatrix: true,
      active: true,
      required: false,
      files: [],
    },
    {
      id: 'definition-archived',
      name: 'Hồ sơ đã ẩn',
      workstreamKey: 'PLAN',
      position: 1,
      initialMatrix: true,
      active: false,
      required: false,
      files: [],
    },
  ],
  documents: [
    {
      id: 'document-1',
      requiredDocumentId: 'definition-1',
      stageKey: 'STAGE_2',
      workstreamKey: 'PLAN',
      documentType: 'Kế hoạch tiến độ tổng thể',
      displayName: 'Tiến độ đợt 1',
      status: 'UPLOADED',
      currentVersion: 2,
      currentFileAssetId: 'file-1',
      createdAt: '2026-08-14T03:04:05.000Z',
      submittedOfficer: {
        id: 'actor-1',
        displayName: 'Nguyễn Minh',
        email: 'minh@example.com',
      },
      currentFileAsset: {
        id: 'file-1',
        originalFilename: 'tien-do-v2.xlsx',
        mimeType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        sizeBytes: '2048',
      },
    },
    {
      id: 'document-2',
      requiredDocumentId: 'definition-1',
      stageKey: 'STAGE_2',
      workstreamKey: 'PLAN',
      documentType: 'Kế hoạch tiến độ tổng thể',
      displayName: 'Biên bản họp kế hoạch',
      status: 'UPLOADED',
      currentVersion: 1,
      currentFileAssetId: 'file-2',
      createdAt: '2026-08-14T04:05:06.000Z',
      currentFileAsset: {
        id: 'file-2',
        originalFilename: 'bien-ban.pdf',
        mimeType: 'application/pdf',
        sizeBytes: '1024',
      },
    },
  ],
  options: {
    projects: [
      { id: 'project-701', code: 'PRJ-701', name: 'Galaxy Tower' },
      { id: 'project-702', code: 'PRJ-702', name: 'Galaxy Annex' },
    ],
    members: [
      {
        id: 'actor-1',
        displayName: 'Nguyễn Minh',
        email: 'minh@example.com',
        role: 'PROJECT_MANAGER',
      },
      {
        id: 'actor-2',
        displayName: 'Hà Linh',
        email: 'linh@example.com',
        role: 'MEMBER',
      },
    ],
    departments: [
      { id: 'department-1', code: 'KT', name: 'Phòng Kỹ thuật' },
      { id: 'department-2', code: 'KH', name: 'Phòng Kế hoạch' },
    ],
  },
  uploadConstraints: {
    maxBytes: 25 * 1024 * 1024,
    allowedExtensions: ['.pdf', '.docx', '.xlsx'],
  },
  permittedCommands: {
    viewPlan: true,
    addPlanRows: true,
    editPlanRows: true,
    deletePlanRows: true,
    downloadTemplate: true,
    previewImport: true,
    confirmImport: true,
    completeStep: true,
    manageDocumentDefinitions: true,
    uploadDocuments: true,
    viewAllocatedBudget: true,
    editAllocatedBudget: true,
  },
  capabilities: {
    canSwitchProject: true,
    canManageProjectAccess: true,
    canPreviewFiles: true,
    canDownloadFiles: true,
  },
} as StageTwoData & {
  capabilities: {
    canSwitchProject: boolean;
    canManageProjectAccess: boolean;
  };
  options: StageTwoData['options'] & {
    projects: readonly { id: string; code: string; name: string }[];
  };
};

const actor = {
  userId: 'actor-1',
  displayName: 'Nguyễn Minh',
  organization: { id: 'organization-1', name: 'Galaxy' },
  permissions: [
    'project.document.manage',
    'file.upload',
    'file.read',
    'file.download',
    'project.manage_members',
  ],
};

const view = (
  overrides: Partial<React.ComponentProps<typeof ProjectStageTwoView>> = {},
) =>
  renderToStaticMarkup(
    <ProjectStageTwoView
      actor={actor}
      data={data}
      onData={() => undefined}
      onReload={async () => undefined}
      revision={1}
      selectedStep={1}
      {...overrides}
    />,
  );

afterEach(() => vi.unstubAllGlobals());

describe('Stage 2 three-step workspace', () => {
  it('uses the invariant shared Project header and exact Galaxy Stage 2 title', () => {
    const markup = view();

    expect(markup.match(/data-project-stage-header=/g) ?? []).toHaveLength(1);
    expect(markup.match(/data-project-stage-header-row=/g) ?? []).toHaveLength(
      2,
    );
    expect(markup).toContain('GIAI ĐOẠN 2');
    expect(markup).toContain('THIẾT KẾ, SẢN PHẨM &amp; DỰ TOÁN');
    expect(markup.match(/data-stage-control=/g) ?? []).toHaveLength(5);
    expect(markup).toMatch(
      /^<main class="[^"]*mx-auto[^"]*w-full[^"]*max-w-\[1280px\]/,
    );
    expect(markup).toContain('PRJ-702 · Galaxy Annex');
    expect(markup).toContain('PHÂN QUYỀN DỰ ÁN');
  });

  it('uses exactly three approved tabs and the URL query as selection state', () => {
    expect(stageTwoStepFromSearchParam('2')).toBe(2);
    expect(stageTwoStepFromSearchParam('3')).toBe(3);
    expect(stageTwoStepFromSearchParam('0')).toBe(1);
    expect(stageTwoStepFromSearchParam('4')).toBe(1);
    expect(stageTwoStepFromSearchParam(null)).toBe(1);
    expect(stageTwoStepUrl('project-701', 3)).toBe(
      '/projects/project-701/stage-2?step=3',
    );

    const markup = view();
    const labels = [
      'KẾ HOẠCH &amp; KHẢO SÁT',
      'THIẾT KẾ, SẢN PHẨM &amp; BOQ',
      'PHÊ DUYỆT',
    ];
    expect(markup).not.toContain('role="tab"');
    expect(markup).not.toContain('role="tabpanel"');
    for (const label of labels) expect(markup).toContain(label);
    expect(
      markup.match(/href="\/projects\/project-701\/stage-2\?step=/g),
    ).toHaveLength(3);
    expect(markup).toContain('href="/projects/project-701/stage-2?step=1"');
    expect(markup).toContain('aria-current="page"');
  });

  it('keeps Steps 2 and 3 selectable without sample business rows or completion claims', () => {
    const estimates = [
      {
        id: 'estimate-1',
        number: 'EST-001',
        title: 'Dự toán nội thất tầng 1',
        currentVersion: 2,
        status: 'PENDING',
        updatedAt: '2026-09-10T00:00:00.000Z',
      },
    ];
    const risks = [
      {
        id: 'risk-1',
        code: 'R-01',
        title: 'NCC giao hàng trễ',
        stage: 'STAGE_TWO',
        priorityScore: 12,
        status: 'OPEN',
        emv: '30000000',
        allocations: [],
      },
    ];
    const stepTwo = view({
      actor: {
        ...actor,
        permissions: [
          ...actor.permissions,
          'project.product.view',
          'estimate.read',
          'financial_margin.read',
        ],
      },
      estimates,
      risks,
      selectedStep: 2,
    });
    expect(stepTwo).toContain('/projects/project-701/products');
    expect(stepTwo).toContain('/projects/project-701/estimates');
    expect(stepTwo).toContain('Dự toán nội thất tầng 1');
    expect(stepTwo).toContain('NCC giao hàng trễ');
    expect(stepTwo).toContain('30.000.000');
    expect(stepTwo).not.toContain('HOÀN TẤT BƯỚC 2');
    expect(stepTwo).not.toContain('TSK-01');
    expect(stepTwo).not.toContain('SmartCA');

    const stepThree = view({
      actor: {
        ...actor,
        permissions: [...actor.permissions, 'estimate.read'],
      },
      estimates,
      selectedStep: 3,
    });
    expect(stepThree).toContain('aria-current="page"');
    expect(stepThree).toContain('EST-001');
    expect(stepThree).toContain('Chờ duyệt');
    expect(stepThree).toContain('/projects/project-701/estimates/estimate-1');
    expect(stepThree).not.toContain('HOÀN TẤT BƯỚC 3');
    expect(stepThree).not.toContain('Phê duyệt thành công');
  });

  it('hides Stage 2 Product Register and BOQ routes without their exact read permissions', () => {
    const markup = view({ selectedStep: 2 });

    expect(markup).not.toContain('/projects/project-701/products');
    expect(markup).not.toContain('/projects/project-701/estimates');
    expect(markup).toContain(
      'Chưa có phân hệ được kết nối mà bạn có quyền truy cập',
    );
  });

  it('separates each document type name from its ordering metadata', () => {
    expect(view()).toMatch(
      /<strong class="block">Kế hoạch tiến độ tổng thể<\/strong>[\s\S]*?<span class="mt-1 block text-xs text-slate-500">Thứ tự 0<\/span>/,
    );
  });

  it('renders honest loading, error, and empty plan/file states', () => {
    expect(renderToStaticMarkup(<StageTwoLoadState />)).toContain(
      'role="status"',
    );
    expect(
      renderToStaticMarkup(
        <StageTwoLoadState
          error="Không thể tải Giai đoạn 2."
          onRetry={() => undefined}
        />,
      ),
    ).toContain('role="alert"');
    expect(
      renderToStaticMarkup(
        <StageTwoLoadState
          error="Không thể tải Giai đoạn 2."
          onRetry={() => undefined}
        />,
      ),
    ).toContain('THỬ TẢI LẠI');
    const markup = view({
      data: { ...data, plan: [], documents: [], documentDefinitions: [] },
    });
    expect(markup).toContain('Chưa có công việc tiến độ nào.');
    expect(markup).toContain('Chưa có tài liệu nào được tải lên cho Bước 1.');
    expect(markup).toContain('HOÀN TẤT BƯỚC 1');
    expect(markup).not.toContain('Cần bổ sung');
  });

  it('renders the exact editable baseline columns and real row without samples', () => {
    const markup = view();
    expect(markup).toContain(
      'KẾ HOẠCH TIẾN ĐỘ BASELINE &amp; PHÂN BỔ NGUỒN LỰC',
    );
    expect(markup).not.toContain('GANTT');
    expect(markup).toContain(
      'Cho phép chỉnh sửa trực tiếp hoặc thêm/xóa dòng tiến độ.',
    );
    expect(markup).toContain('NHẬP DỮ LIỆU TỪ FILE EXCEL');
    expect(markup).toMatch(
      /MÃ CV[\s\S]*NỘI DUNG CÔNG VIỆC CHI TIẾT[\s\S]*ĐƠN VỊ CHỦ TRÌ[\s\S]*NGÀY BẮT ĐẦU[\s\S]*NGÀY HOÀN THÀNH[\s\S]*NGÂN SÁCH PHÂN BỔ \(VND\)[\s\S]*THAO TÁC/,
    );
    expect(markup).toContain('value="CV-01"');
    expect(markup).toContain('type="date"');
    expect(markup).toContain('type="number"');
    expect(
      markup.match(/<(?:input|select)[^>]*class="w-full(?:\s|\")/g) ?? [],
    ).toHaveLength(7);
    expect(markup).toContain('+ THÊM CÔNG VIỆC TIẾN ĐỘ MỚI');
    expect(markup).toContain('LƯU KẾ HOẠCH');
    expect(markup).toContain('TẢI LẠI DỮ LIỆU');
    expect(markup).not.toContain('TSK-01');
    expect(markup).not.toContain('Khảo sát địa chất');
  });

  it('renders the exact optional-document and actual-file copy', () => {
    const markup = view({ data: { ...data, documents: [] } });
    expect(markup).toContain(
      'HỒ SƠ TÀI LIỆU GIAI ĐOẠN 2 — KẾ HOẠCH &amp; KHẢO SÁT',
    );
    expect(markup).toContain(
      'Có thể tải hoặc không tải tài liệu. Hồ sơ không ảnh hưởng quyền hoàn thành bước hoặc giai đoạn.',
    );
    expect(markup).toContain('DANH MỤC TÀI LIỆU GĐ 2 ĐÃ TẢI LÊN — BƯỚC 1');
    expect(markup).toContain('Chưa có tài liệu nào được tải lên cho Bước 1.');
  });

  it('renders the exact Stage 2 actual-file columns and compact actions', () => {
    const markup = view();
    expect(markup).toMatch(
      /<th[^>]*>Tên hồ sơ<\/th><th[^>]*>Tệp<\/th><th[^>]*>Người tải lên<\/th><th[^>]*>Ngày tải<\/th><th[^>]*>Trạng thái<\/th><th[^>]*>Thao tác<\/th>/,
    );
    expect(markup).toContain('>Xem<');
    expect(markup).toContain('Tải xuống');
    expect(markup).not.toContain('Thao tác khác');
    expect(markup).not.toContain('Tải phiên bản mới');
    expect(markup).toContain('14/8/2026');
    expect(markup).not.toContain('Phòng ban thẩm định');
    expect(markup).not.toContain('Người nộp');
    expect(markup).not.toContain('Phiên bản 2');
  });

  it('keeps Stage 2 readable without task.read and hides only the plan panel', () => {
    const markup = view({
      data: {
        ...data,
        plan: [],
        permittedCommands: {
          ...data.permittedCommands,
          viewPlan: false,
          addPlanRows: false,
          editPlanRows: false,
          deletePlanRows: false,
          downloadTemplate: false,
          previewImport: false,
          confirmImport: false,
          completeStep: false,
        },
      },
    });

    expect(markup).toContain('Bạn không có quyền xem kế hoạch tiến độ.');
    expect(markup).not.toContain('KẾ HOẠCH TIẾN ĐỘ BASELINE');
    expect(markup).toContain('HỒ SƠ TÀI LIỆU GIAI ĐOẠN 2');
  });

  it('gates preview and download with backend file capabilities', () => {
    const markup = view({
      data: {
        ...data,
        capabilities: {
          ...data.capabilities,
          canPreviewFiles: false,
          canDownloadFiles: false,
        },
      },
    });

    expect(markup).not.toContain('/preview');
    expect(markup).not.toContain('/download');
  });

  it('omits the complete budget column and value for a no-read actor', () => {
    const limited: StageTwoData = {
      ...data,
      plan: data.plan.map((item) => {
        const row = { ...item };
        delete row.allocatedBudget;
        return row;
      }),
      permittedCommands: {
        ...data.permittedCommands,
        downloadTemplate: false,
        viewAllocatedBudget: false,
        editAllocatedBudget: false,
      },
    };
    const markup = view({ data: limited });
    expect(markup).not.toContain('NGÂN SÁCH');
    expect(markup).not.toContain('1250000');
    expect(markup).not.toContain('name="allocatedBudget"');
    expect(markup).not.toContain('TẢI TEMPLATE KẾ HOẠCH');
  });
});

describe('Stage 2 plan TDD boundary', () => {
  const persisted = createStageTwoPlanDraft(data.plan[0]!, () => 'draft-1');

  it('adds and edits local rows, then sends only dirty rows and explicit removals', () => {
    const created = createStageTwoPlanDraft(
      {
        code: '',
        description: '',
        departmentId: 'department-1',
        startDate: '',
        finishDate: '',
        allocatedBudget: '',
      },
      () => 'draft-new',
    );
    const edited = updateStageTwoPlanDraft(created, 'code', 'CV-02');
    expect(edited).toMatchObject({ key: 'draft-new', code: 'CV-02' });

    expect(
      stageTwoPlanPayload(
        [persisted, edited],
        [{ id: 'plan-removed', version: 2 }],
        new Set(['draft-new']),
        true,
      ),
    ).toEqual({
      rows: [
        {
          code: 'CV-02',
          description: '',
          departmentId: 'department-1',
          startDate: '',
          finishDate: '',
          allocatedBudget: '',
        },
      ],
      removedRows: [{ id: 'plan-removed', version: 2 }],
    });
  });

  it('requires confirmation before removing a persisted row and tracks its version', () => {
    const denied = removeStageTwoPlanDraft(
      [persisted],
      'draft-1',
      [],
      () => false,
    );
    expect(denied.rows).toHaveLength(1);
    expect(denied.removedRows).toEqual([]);

    const accepted = removeStageTwoPlanDraft(
      [persisted],
      'draft-1',
      [],
      () => true,
    );
    expect(accepted.rows).toEqual([]);
    expect(accepted.removedRows).toEqual([{ id: 'plan-1', version: 3 }]);
  });

  it('validates real calendar dates, ordering, duplicate codes, and Decimal(20,2)', () => {
    const valid: StageTwoPlanDraft = {
      ...persisted,
      allocatedBudget: '999999999999999999.99',
    };
    expect(
      validateStageTwoPlan([valid], data.options.departments, true),
    ).toEqual({});

    const invalid = [
      {
        ...valid,
        key: 'bad-date',
        startDate: '2026-02-30',
        finishDate: '2026-02-01',
      },
      {
        ...valid,
        key: 'bad-money',
        code: 'CV-01',
        allocatedBudget: '1000.999',
      },
    ];
    const errors = validateStageTwoPlan(
      invalid,
      data.options.departments,
      true,
    );
    expect(errors['bad-date']?.join(' ')).toMatch(/ngày/i);
    expect(errors['bad-money']?.join(' ')).toMatch(/ngân sách|trùng/i);
  });

  it('never resubmits a protected budget for a view-only editor', () => {
    const payload = stageTwoPlanPayload(
      [persisted],
      [],
      new Set(['draft-1']),
      false,
    );
    expect(payload.rows[0]).not.toHaveProperty('allocatedBudget');
  });

  it('loads, saves, reloads, and completes through the exact Task 7 endpoints', async () => {
    const request = vi.fn().mockResolvedValue(data);
    await loadStageTwo('project-701', request);
    await saveStageTwoPlan(
      'project-701',
      { rows: [], removedRows: [] },
      request,
    );
    await completeStageTwoStepOne('project-701', request);
    expect(request.mock.calls).toEqual([
      ['/projects/project-701/stage-2?step=1'],
      [
        '/projects/project-701/stage-2/plan',
        { method: 'PUT', body: JSON.stringify({ rows: [], removedRows: [] }) },
      ],
      [
        '/projects/project-701/stage-2/steps/1/complete',
        { method: 'POST', body: '{}' },
      ],
    ]);
  });

  it('preserves dirty plan drafts across sibling refreshes and guards destructive resets', () => {
    expect(stageTwoPlanRevision(4, false)).toBe(4);
    expect(stageTwoPlanRevision(4, true)).toBe(5);

    const ask = vi.fn().mockReturnValue(false);
    expect(confirmStageTwoPlanReset(false, ask)).toBe(true);
    expect(ask).not.toHaveBeenCalled();
    expect(confirmStageTwoPlanReset(true, ask)).toBe(false);
    expect(ask).toHaveBeenCalledOnce();
  });

  it('blocks tab navigation when discarding dirty plan drafts is denied', () => {
    const preventDefault = vi.fn();
    const discard = vi.fn();
    const deny = vi.fn().mockReturnValue(false);

    expect(stageTwoPlanTabTransition(true, preventDefault, discard, deny)).toBe(
      false,
    );
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(discard).not.toHaveBeenCalled();

    const allow = vi.fn().mockReturnValue(true);
    expect(
      stageTwoPlanTabTransition(true, preventDefault, discard, allow),
    ).toBe(true);
    expect(discard).toHaveBeenCalledOnce();
  });

  it('does not complete stale persisted data without confirming dirty-draft discard', async () => {
    const request = vi.fn().mockResolvedValue({ status: 'COMPLETED' });
    const reload = vi.fn().mockResolvedValue(undefined);
    const discard = vi.fn();

    await expect(
      completeStageTwoStepOneWithDraftGuard(
        'project-701',
        true,
        reload,
        discard,
        request,
        () => false,
      ),
    ).resolves.toBe(false);
    expect(request).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();

    await expect(
      completeStageTwoStepOneWithDraftGuard(
        'project-701',
        true,
        reload,
        discard,
        request,
        () => true,
      ),
    ).resolves.toBe(true);
    expect(request).toHaveBeenCalledWith(
      '/projects/project-701/stage-2/steps/1/complete',
      { method: 'POST', body: '{}' },
    );
    expect(reload).toHaveBeenCalledWith(true);
    expect(discard).toHaveBeenCalledOnce();
  });
});

describe('Stage 2 template, import, and optional documents', () => {
  it('consumes the authorized binary XLSX response instead of generating a fake template', async () => {
    const request = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([80, 75, 3, 4]), {
        headers: {
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition':
            "attachment; filename*=UTF-8''ke-hoach-giai-doan-2.xlsx",
        },
      }),
    );
    const result = await fetchStageTwoPlanTemplate('project-701', request);
    expect(result.filename).toBe('ke-hoach-giai-doan-2.xlsx');
    expect(result.blob.size).toBe(4);
    expect(request).toHaveBeenCalledWith(
      '/api/v1/projects/project-701/stage-2/plan-template',
      expect.objectContaining({ cache: 'no-store', credentials: 'include' }),
    );
  });

  it('rejects a non-XLSX template response without exposing the response body', async () => {
    const request = vi
      .fn()
      .mockResolvedValue(Response.json({ allocatedBudget: 'secret' }));
    await expect(
      fetchStageTwoPlanTemplate('project-701', request),
    ).rejects.toThrow('Không thể tải template kế hoạch.');
  });

  it('passes the shared upload result into preview, then confirms the exact job', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        jobId: 'job-1',
        status: 'VALIDATED',
        summary: { totalRows: 2, validRows: 1, invalidRows: 1 },
        rows: [],
      })
      .mockResolvedValueOnce({
        jobId: 'job-1',
        status: 'COMPLETED',
        importedRows: 1,
        skippedRows: 1,
      });
    await previewStageTwoUploadedWorkbook(
      'project-701',
      { id: 'document-import', currentFileAssetId: 'file-xlsx' },
      request,
    );
    await confirmStageTwoPlanImport('project-701', 'job-1', request);
    expect(request.mock.calls).toEqual([
      [
        '/projects/project-701/stage-2/plan-import/preview',
        {
          method: 'POST',
          body: JSON.stringify({ fileAssetId: 'file-xlsx' }),
        },
      ],
      [
        '/projects/project-701/stage-2/plan-import/job-1/confirm',
        { method: 'POST', body: '{}' },
      ],
    ]);
  });

  it('keeps a completed workbook retryable when preview fails without retransferring it', async () => {
    const request = vi
      .fn()
      .mockRejectedValue(
        new ApiError('Workbook must be no larger than 5 MB', 413),
      );
    await expect(
      attemptStageTwoPlanPreview('project-701', 'file-xlsx', request),
    ).resolves.toEqual({
      fileAssetId: 'file-xlsx',
      preview: undefined,
      error: 'Tệp vượt quá giới hạn cho phép.',
    });
    expect(request).toHaveBeenCalledOnce();
  });

  it('renders a preview-specific retry action for the already uploaded workbook', () => {
    const markup = view({
      initialImportOpen: true,
      initialPreviewFailure: {
        fileAssetId: 'file-xlsx',
        error: 'File Excel không hợp lệ.',
      },
    });
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('File Excel không hợp lệ.');
    expect(markup).toContain('THỬ LẠI XEM TRƯỚC');
  });

  it('shows shared XLSX upload, preview counts, row errors, duplicate handling and confirm', () => {
    const markup = view({
      initialImportOpen: true,
      initialPreview: {
        jobId: 'job-1',
        status: 'VALIDATED',
        summary: { totalRows: 2, validRows: 1, invalidRows: 1 },
        rows: [
          {
            rowNumber: 2,
            status: 'VALID',
            data: {
              code: 'IM-01',
              description: 'Dòng hợp lệ',
              departmentId: 'department-1',
              startDate: '2026-08-21',
              finishDate: '2026-08-22',
              allocatedBudget: '25.50',
            },
            errors: [],
          },
          {
            rowNumber: 3,
            status: 'INVALID',
            data: {
              code: 'CV-01',
              description: 'Dòng trùng',
              departmentId: 'department-1',
              startDate: '2026-08-21',
              finishDate: '2026-08-22',
            },
            errors: ['duplicate code in active plan'],
          },
        ],
      },
    });
    expect(markup).toContain('tien-do-v2.xlsx');
    expect(markup).toContain('XEM TRƯỚC FILE XLSX');
    expect(markup).toContain('Tổng số dòng: 2');
    expect(markup).toContain('Hợp lệ: 1');
    expect(markup).toContain('Không hợp lệ: 1');
    expect(markup).toContain('Mã công việc bị trùng.');
    expect(markup).toContain('XÁC NHẬN NHẬP 1 DÒNG');
  });

  it('uses one shared Matrix uploader for Stage 2 documents and imports', () => {
    const markup = view({ initialImportOpen: true });

    expect(
      markup.match(
        /data-upload-scope="project-701:STAGE_2:PLAN:definition-1:STAGE_MATRIX_DOCUMENT:STAGE_DOCUMENT"/g,
      ) ?? [],
    ).toHaveLength(1);
    expect(markup).not.toContain('accept=".xlsx"');
  });

  it('posts create/edit/hide/restore/reorder definition commands to Stage 2', async () => {
    const request = vi.fn().mockResolvedValue({ id: 'definition-2' });
    const input = {
      name: 'Kế hoạch nguồn lực',
      workstreamKey: 'PLAN' as const,
      description: 'Nguồn lực',
      position: 2,
      initialMatrix: true,
      active: true,
    };
    await saveStageTwoDocumentDefinition(
      'project-701',
      undefined,
      input,
      request,
    );
    await saveStageTwoDocumentDefinition(
      'project-701',
      'definition-1',
      { ...input, position: 1, active: false },
      request,
    );
    expect(request.mock.calls).toEqual([
      [
        '/projects/project-701/stage-2/document-definitions',
        { method: 'POST', body: JSON.stringify(input) },
      ],
      [
        '/projects/project-701/stage-2/document-definitions/definition-1',
        {
          method: 'PATCH',
          body: JSON.stringify({ ...input, position: 1, active: false }),
        },
      ],
    ]);
  });

  it('renders editable optional types, actual multi-file records and direct downloads', () => {
    const markup = view();
    expect(markup).toContain(
      'HỒ SƠ TÀI LIỆU GIAI ĐOẠN 2 — KẾ HOẠCH &amp; KHẢO SÁT',
    );
    expect(markup).toContain('THÊM LOẠI HỒ SƠ');
    expect(markup).toContain('Kế hoạch tiến độ tổng thể');
    expect(markup).toContain('HỒ SƠ ĐÃ ẨN');
    expect(markup).toContain('Khôi phục');
    expect(markup).toContain('tien-do-v2.xlsx');
    expect(markup).toContain('bien-ban.pdf');
    expect(markup).toContain('/api/v1/files/file-1/download');
    expect(markup).not.toContain('Thao tác khác');
    expect(markup).not.toContain('Tải phiên bản mới');
    expect(markup).not.toContain('PMS_Storage');
    expect(markup).not.toContain('MAX 100MB');
    expect(markup).not.toContain('Bắt buộc nộp');
  });

  it('maps duplicate definition errors to a safe actionable message', async () => {
    const request = vi
      .fn()
      .mockRejectedValue(
        new ApiError('Document definition already exists', 409),
      );
    await expect(
      saveStageTwoDocumentDefinition(
        'project-701',
        undefined,
        {
          name: 'Trùng',
          workstreamKey: 'PLAN',
          position: 0,
          initialMatrix: true,
          active: true,
        },
        request,
      ),
    ).rejects.toThrow(ApiError);
  });
});
