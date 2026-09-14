import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProjectPage from './page';
import ContractsPage from './contracts/page';
import EstimatesPage, { estimateCreatePayload } from './estimates/page';
import QuotationsPage from './quotations/page';
import StageTwoPage from './stage-2/page';
import {
  ProjectStageAccessView,
  type ProjectStageAccessData,
  initializeProjectStage,
  legacyProjectDocumentDestination,
  projectRequiredDocumentLookupPath,
  recordProjectStageDecision,
} from './project-stage-access';
import { projectDocumentDetailDestination } from './documents/[requirementId]/page';
import { resolvedProjectDocumentDestination } from './documents/page';

const { redirect } = vi.hoisted(() => ({ redirect: vi.fn() }));

vi.mock('next/navigation', () => ({
  redirect,
  useParams: () => ({ projectId: 'project-701' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams('step=1'),
}));

describe('Project old-route compatibility', () => {
  beforeEach(() => {
    redirect.mockReset();
    vi.stubGlobal('React', React);
  });
  it('redirects the bare Project route to the canonical Stage 1 workspace', async () => {
    await Reflect.apply(ProjectPage, undefined, [
      { params: Promise.resolve({ projectId: 'project-701' }) },
    ]);

    expect(redirect).toHaveBeenCalledWith('/projects/project-701/stage-1');
  });

  it('returns contract, estimate, and quotation indexes to the canonical Stage 1 landing', () => {
    for (const Page of [ContractsPage, EstimatesPage, QuotationsPage]) {
      expect(renderToStaticMarkup(<Page />)).toContain(
        'href="/projects/project-701/stage-1"',
      );
    }
  });

  it('keeps a missing estimate price explicit instead of posting zero', () => {
    const payload = estimateCreatePayload({
      number: 'EST-01',
      title: 'Dự toán nháp',
      currency: 'VND',
      exchangeRateSnapshot: '1',
      section: 'Tầng 1',
      itemType: 'PRODUCT',
      description: 'Ghế',
      unit: 'cái',
      quantity: '10',
      purchaseQuantity: '11',
      netPurchasePrice: '80',
      sellingPrice: '100',
      priceStatus: 'MISSING',
      priceSourceType: '',
      priceQuotedAt: '',
      priceValidUntil: '',
      sourceDocument: '',
      freightEstimate: '',
      taxEstimate: '',
      installationCost: '',
    });

    expect(payload.lines[0]).toMatchObject({
      quantity: '10',
      purchaseQuantity: '11',
      priceStatus: 'MISSING',
    });
    expect(payload.lines[0]).not.toHaveProperty('netPurchasePrice');
  });

  it('keeps persistent labels on estimate financial inputs', () => {
    const markup = renderToStaticMarkup(<EstimatesPage />);

    expect(markup).toMatch(/<label[^>]*>Giá mua thuần<input/);
    expect(markup).toMatch(/<label[^>]*>Đơn giá bán<input/);
    expect(markup).toMatch(/<label[^>]*>Vận chuyển<input/);
  });

  it('cuts the Stage 2 route over to the query-state workspace', () => {
    const markup = renderToStaticMarkup(<StageTwoPage />);
    expect(markup).toContain('Đang tải Giai đoạn 2');
    expect(markup).not.toContain('Đang tải quyền truy cập giai đoạn');
    expect(markup).not.toContain('DỮ LIỆU KẾ THỪA');
  });

  it('maps legacy Stage 1 document links to the concise step workspace', () => {
    expect(legacyProjectDocumentDestination('project-701', 'STAGE_1')).toBe(
      '/projects/project-701/stage-1?step=1#step-documents',
    );
    expect(
      legacyProjectDocumentDestination(
        'project-701',
        'STAGE_1',
        'definition-1',
        'SURVEY',
      ),
    ).toBe('/projects/project-701/stage-1?step=2#document-definition-1');
    expect(
      legacyProjectDocumentDestination('project-701', 'STAGE_5', 'document-9'),
    ).toBe('/projects/project-701/stage-5#document-document-9');
    expect(
      legacyProjectDocumentDestination('project-701', 'NOT_A_STAGE'),
    ).toBeNull();

    expect(
      projectDocumentDetailDestination('project-701', 'document-9', 'STAGE_1'),
    ).toBe(
      '/projects/project-701/documents?requirementId=document-9&stageKey=STAGE_1',
    );
  });

  it('resolves bare document links by exact requirement instead of defaulting to Stage 1', () => {
    expect(
      projectDocumentDetailDestination(
        'project-701',
        '40000000-0000-4000-8000-000000000391',
      ),
    ).toBe(
      '/projects/project-701/documents?requirementId=40000000-0000-4000-8000-000000000391',
    );
    expect(
      projectRequiredDocumentLookupPath(
        'project-701',
        '40000000-0000-4000-8000-000000000391',
      ),
    ).toBe(
      '/projects/project-701/required-documents?pageSize=1&requirementId=40000000-0000-4000-8000-000000000391',
    );
  });

  it('keeps an explicit later-stage document link direct', () => {
    expect(
      projectDocumentDetailDestination(
        'project-701',
        '40000000-0000-4000-8000-000000000391',
        'STAGE_3',
      ),
    ).toBe(
      '/projects/project-701/stage-3#document-40000000-0000-4000-8000-000000000391',
    );
  });

  it('routes an exact bare-link lookup result to its actual stage', () => {
    expect(
      resolvedProjectDocumentDestination('project-701', {
        id: '40000000-0000-4000-8000-000000000391',
        stageKey: 'STAGE_3',
        workstreamKey: 'PROCUREMENT',
      }),
    ).toBe(
      '/projects/project-701/stage-3#document-40000000-0000-4000-8000-000000000391',
    );
  });
});

const stageAccess: ProjectStageAccessData = {
  project: {
    id: 'project-701',
    code: 'PRJ-701',
    name: 'Galaxy Tower Lobby',
    customer: { id: 'customer-1', displayName: 'Galaxy Centre' },
    location: 'Quận 1, TP.HCM',
    projectType: 'DESIGN_AND_BUILD',
    status: 'ACTIVE',
    healthStatus: 'AT_RISK',
    entryStage: 'STAGE_1',
    currentStage: 'STAGE_1',
    salesOwner: { displayName: 'Trần Anh' },
    projectManager: { displayName: 'Nguyễn Minh' },
    expectedCompletionDate: '2026-12-15T00:00:00.000Z',
  },
  state: {
    stageKey: 'STAGE_5',
    status: 'NOT_INITIALIZED',
    readOnly: false,
    decisionReason: null,
    decisionBy: null,
    decisionAt: null,
    decisionApprovalId: null,
  },
  templateApplicability: {
    projectType: 'DESIGN_AND_BUILD',
    applicable: true,
  },
  requiredDocuments: [],
  permittedCommands: { initialize: true, decide: true },
  options: {
    projects: [
      { id: 'project-701', code: 'PRJ-701', name: 'Galaxy Tower Lobby' },
      { id: 'project-702', code: 'PRJ-702', name: 'Galaxy Annex' },
    ],
  },
  capabilities: {
    canSwitchProject: true,
    canManageProjectAccess: true,
  },
} as ProjectStageAccessData & {
  options: {
    projects: readonly { id: string; code: string; name: string }[];
  };
  capabilities: {
    canSwitchProject: boolean;
    canManageProjectAccess: boolean;
  };
};

describe('Project stage access routes', () => {
  const renderStage = (
    stageKey: 'STAGE_3' | 'STAGE_4' | 'STAGE_5',
    selectedTab = 1,
    actorPermissions: string[] = [],
  ) =>
    renderToStaticMarkup(
      <ProjectStageAccessView
        access={{
          ...stageAccess,
          state: { ...stageAccess.state, stageKey },
        }}
        actorPermissions={actorPermissions}
        onDecide={async () => {}}
        onInitialize={async () => {}}
        selectedTab={selectedTab}
        workspace={{ project: stageAccess.project, stages: [] }}
      />,
    );

  it('defaults invalid downstream tab query values to the first tab', async () => {
    const stageAccessModule = await import('./project-stage-access');
    const parse = Reflect.get(
      stageAccessModule,
      'projectStageTabFromSearchParam',
    ) as (
      stageKey: 'STAGE_3' | 'STAGE_4' | 'STAGE_5',
      value: string | null,
    ) => number;

    expect(parse('STAGE_3', null)).toBe(1);
    expect(parse('STAGE_4', '4')).toBe(4);
    expect(parse('STAGE_4', '5')).toBe(1);
    expect(parse('STAGE_5', '0')).toBe(1);
    expect(parse('STAGE_5', 'invalid')).toBe(1);
  });

  it.each([
    [
      'STAGE_3',
      [
        'BÁO GIÁ &amp; HỢP ĐỒNG',
        'NHÀ CUNG CẤP &amp; MUA HÀNG',
        'PO, PI &amp; THANH TOÁN',
      ],
    ],
    [
      'STAGE_4',
      [
        'SẢN XUẤT &amp; QC',
        'LOGISTICS',
        'KHO &amp; GIAO HÀNG',
        'LẮP ĐẶT &amp; TIẾN ĐỘ',
      ],
    ],
    [
      'STAGE_5',
      ['NGHIỆM THU &amp; BÀN GIAO', 'QUYẾT TOÁN', 'BẢO HÀNH &amp; HẬU MÃI'],
    ],
  ] as const)(
    'renders the exact URL-stable %s module tabs',
    (stageKey, labels) => {
      const markup = renderStage(stageKey);

      for (const label of labels) expect(markup).toContain(label);
      expect(markup).not.toContain('HỢP ĐỒNG KHÁCH HÀNG');
      expect(markup).not.toContain('KẾ HOẠCH THANH TOÁN');
      expect(markup).not.toContain('LOGISTICS &amp; HẢI QUAN');
      expect(markup).not.toContain('QUYẾT TOÁN &amp; THANH LÝ');
      expect(markup.match(/\?tab=/g) ?? []).toHaveLength(labels.length);
      expect(markup).toContain('overflow-x-auto');
      expect(markup).not.toContain('disabled=""');
    },
  );

  it('uses only verified Stage 3 routes and exact read permissions', () => {
    const commercial = renderStage('STAGE_3', 1, [
      'quotation.read',
      'contract.read',
    ]);
    expect(commercial).toContain('/projects/project-701/quotations');
    expect(commercial).toContain('/projects/project-701/contracts');

    const procurement = renderStage('STAGE_3', 2, [
      'purchase_request.read',
      'procurement.rfq.read',
      'procurement.supplier_quotation.read',
      'procurement.supplier_selection.read',
    ]);
    expect(procurement).toContain(
      '/procurement/requests?projectId=project-701',
    );
    expect(procurement).toContain('/procurement/rfqs?projectId=project-701');
    expect(procurement).toContain(
      '/procurement/supplier-quotes?projectId=project-701',
    );
    expect(procurement).toContain('href="/procurement/comparisons"');

    const orders = renderStage('STAGE_3', 3, [
      'procurement.purchase_order.read',
      'procurement.proforma_invoice.read',
    ]);
    expect(orders).toContain(
      '/procurement/purchase-orders?projectId=project-701',
    );
    expect(orders).toContain(
      '/procurement/proforma-invoices?projectId=project-701',
    );
    expect(orders).not.toContain('/finance/payables');
    expect(renderStage('STAGE_3', 3, ['supplier_payable.read'])).toContain(
      'href="/finance/payables"',
    );
  });

  it('uses only verified Stage 4 and Stage 5 routes', () => {
    expect(renderStage('STAGE_4', 1, ['production.read'])).toContain(
      'href="/production?projectId=project-701"',
    );
    const logistics = renderStage('STAGE_4', 2, [
      'logistics.shipment.read',
      'logistics.customs.read',
      'logistics.landed_cost.read',
    ]);
    expect(logistics).toContain('/logistics/shipments?projectId=project-701');
    expect(logistics).toContain('href="/logistics/customs"');
    expect(logistics).toContain('href="/logistics/landed-costs"');
    const stock = renderStage('STAGE_4', 3, [
      'inventory.read',
      'warehouse.read',
    ]);
    expect(stock).toContain('/inventory?projectId=project-701');
    expect(stock).toContain('/warehouses?projectId=project-701');
    expect(stock).not.toContain('/deliveries');
    const install = renderStage('STAGE_4', 4, [
      'installation.read',
      'task.read',
    ]);
    expect(install).toContain('/installations?projectId=project-701');
    expect(install).toContain('href="/tasks"');

    const handover = renderStage('STAGE_5', 1, [
      'inspection.read',
      'handover.read',
    ]);
    expect(handover).toContain('/projects/project-701/inspections');
    expect(handover).toContain('/projects/project-701/handover');
    expect(renderStage('STAGE_5', 2, ['contract.read'])).toContain(
      '/projects/project-701/contracts',
    );
    const warranty = renderStage('STAGE_5', 3, [
      'warranty.read',
      'service_ticket.read',
    ]);
    expect(warranty).toContain('/projects/project-701/warranty');
    expect(warranty).toContain('/after-sales?projectId=project-701');
  });

  it('renders one honest module empty state without mock or inherited blockers', () => {
    const markup = renderStage('STAGE_4', 1);

    expect(markup).toContain(
      'Chưa có phân hệ được kết nối mà bạn có quyền truy cập',
    );
    for (const forbidden of [
      'DỮ LIỆU KẾ THỪA',
      'GPMB',
      'TSK-01',
      'sample.pdf',
      '>STAGE_4<',
    ])
      expect(markup).not.toContain(forbidden);
  });

  it.each([
    ['STAGE_3', 'THƯƠNG MẠI, HỢP ĐỒNG &amp; MUA HÀNG'],
    ['STAGE_4', 'SẢN XUẤT, LOGISTICS, KHO &amp; LẮP ĐẶT'],
    ['STAGE_5', 'NGHIỆM THU, BÀN GIAO &amp; BẢO HÀNH'],
  ] as const)(
    'uses one shared two-row Project header on %s',
    (stageKey, title) => {
      const markup = renderToStaticMarkup(
        <ProjectStageAccessView
          access={{
            ...stageAccess,
            state: { ...stageAccess.state, stageKey },
          }}
          onDecide={async () => {}}
          onInitialize={async () => {}}
          workspace={{ project: stageAccess.project, stages: [] }}
        />,
      );

      expect(markup.match(/data-project-stage-header=/g) ?? []).toHaveLength(1);
      expect(
        markup.match(/data-project-stage-header-row=/g) ?? [],
      ).toHaveLength(2);
      expect(markup).toContain(title);
      expect(markup.match(/data-stage-control=/g) ?? []).toHaveLength(5);
      expect(markup).toMatch(
        /^<div class="[^"]*mx-auto[^"]*w-full[^"]*max-w-\[1280px\]/,
      );
      expect(markup).toContain('PRJ-702 · Galaxy Annex');
      expect(markup).toContain('PHÂN QUYỀN DỰ ÁN');
    },
  );

  it('shows the inline initialization action, all stage links, and truthful current stage', () => {
    const markup = renderToStaticMarkup(
      <ProjectStageAccessView
        access={stageAccess}
        onDecide={async () => {}}
        onInitialize={async () => {}}
        workspace={{
          project: stageAccess.project,
          stages: ['STAGE_1', 'STAGE_2', 'STAGE_3', 'STAGE_4', 'STAGE_5'].map(
            (stageKey) => ({
              stageKey,
              title: stageKey,
              objective: `Mục tiêu ${stageKey}`,
              status:
                stageKey === 'STAGE_5' ? 'NOT_INITIALIZED' : 'IN_PROGRESS',
              completedSteps: null,
              totalSteps: null,
              progressPercent: 0,
              updatedAt: null,
              nextAction: 'Tiếp tục giai đoạn',
            }),
          ),
        }}
      />,
    );

    expect(markup).toContain('KHỞI TẠO GIAI ĐOẠN');
    expect(markup).toContain('GIAI ĐOẠN 5');
    expect(markup.match(/data-stage-control=/g) ?? []).toHaveLength(5);
    expect(markup).not.toContain('disabled=""');
    expect(markup).not.toContain('Coming Soon');
  });

  it.each([
    ['STAGE_2', ['STAGE_1']],
    ['STAGE_3', ['STAGE_1', 'STAGE_2']],
    ['STAGE_4', ['STAGE_1', 'STAGE_2', 'STAGE_3']],
    ['STAGE_5', ['STAGE_1', 'STAGE_2', 'STAGE_3', 'STAGE_4']],
  ] as const)(
    'renders %s with incomplete earlier stages without inherited warnings',
    (stageKey, incompleteStages) => {
      const markup = renderToStaticMarkup(
        <ProjectStageAccessView
          access={{
            ...stageAccess,
            state: { ...stageAccess.state, stageKey },
          }}
          onDecide={async () => {}}
          onInitialize={async () => {}}
          workspace={{
            project: stageAccess.project,
            stages: incompleteStages.map((upstreamStage) => ({
              stageKey: upstreamStage,
              title: upstreamStage,
              objective: `Mục tiêu ${upstreamStage}`,
              status: 'NOT_INITIALIZED',
              completedSteps: null,
              totalSteps: null,
              progressPercent: 0,
              updatedAt: null,
              nextAction: 'Bắt đầu giai đoạn',
            })),
          }}
        />,
      );

      expect(markup).toContain(`GIAI ĐOẠN ${stageKey.slice(-1)}`);
      expect(markup).not.toContain('DỮ LIỆU KẾ THỪA');
      expect(markup).not.toContain('Dữ liệu STAGE');
    },
  );

  it('places the shared stage-filtered document matrix inline and initializes it in place', () => {
    const markup = renderToStaticMarkup(
      <ProjectStageAccessView
        access={stageAccess}
        onDecide={async () => {}}
        onInitialize={async () => {}}
        workspace={{ project: stageAccess.project, stages: [] }}
      />,
    );

    expect(markup).toContain('id="required-documents"');
    expect(markup).toContain('HỒ SƠ GIAI ĐOẠN');
    expect(markup).toContain('CHƯA KHỞI TẠO GIAI ĐOẠN');
    expect(markup).toContain('KHỞI TẠO GIAI ĐOẠN');
  });

  it('shows a truthful empty catalog after initialization without a dead initialize action or raw Project type', () => {
    const markup = renderToStaticMarkup(
      <ProjectStageAccessView
        access={{
          ...stageAccess,
          state: { ...stageAccess.state, status: 'IN_PROGRESS' },
        }}
        onDecide={async () => {}}
        onInitialize={async () => {}}
        workspace={{ project: stageAccess.project, stages: [] }}
      />,
    );

    expect(markup).toContain('KHÔNG CÓ HỒ SƠ ÁP DỤNG');
    expect(markup).not.toMatch(/<button[^>]*>KHỞI TẠO GIAI ĐOẠN<\/button>/);
    expect(markup).toContain('Thiết kế &amp; thi công trọn gói');
    expect(markup).not.toContain('DESIGN_AND_BUILD');
  });

  it('mounts the shared matrix in an initialized downstream stage instead of the archive route', () => {
    const markup = renderToStaticMarkup(
      <ProjectStageAccessView
        access={{ ...stageAccess, requiredDocuments: [{ id: 'document-9' }] }}
        onDecide={async () => {}}
        onInitialize={async () => {}}
        workspace={{ project: stageAccess.project, stages: [] }}
      />,
    );

    expect(markup).toContain('aria-label="Hồ sơ giai đoạn"');
    expect(markup).not.toContain('/projects/project-701/documents');
  });

  it('keeps not-applicable and bypassed stages visible and read-only', () => {
    for (const status of ['NOT_APPLICABLE', 'BYPASSED_WITH_APPROVAL']) {
      const markup = renderToStaticMarkup(
        <ProjectStageAccessView
          access={{
            ...stageAccess,
            state: {
              ...stageAccess.state,
              status,
              readOnly: true,
              decisionReason: 'Quyết định đã được ghi nhận.',
            },
            permittedCommands: { initialize: false, decide: false },
          }}
          onDecide={async () => {}}
          onInitialize={async () => {}}
          workspace={{ project: stageAccess.project, stages: [] }}
        />,
      );
      expect(markup).toContain('Chỉ đọc');
      expect(markup).toContain('Quyết định đã được ghi nhận.');
      expect(markup).not.toContain('<form');
      expect(markup).not.toContain('KHỞI TẠO GIAI ĐOẠN');
    }
  });

  it('hides decision actions without permission', () => {
    const markup = renderToStaticMarkup(
      <ProjectStageAccessView
        access={{
          ...stageAccess,
          permittedCommands: { initialize: false, decide: false },
        }}
        onDecide={async () => {}}
        onInitialize={async () => {}}
        workspace={{ project: stageAccess.project, stages: [] }}
      />,
    );
    expect(markup).not.toContain('<form');
    expect(markup).not.toContain('Ghi nhận quyết định');
    expect(markup).not.toMatch(/<button[^>]*>KHỞI TẠO GIAI ĐOẠN<\/button>/);
  });

  it('posts only real initialize and nonblank decision commands', async () => {
    const fetch = vi.fn(async () => Response.json({}));
    vi.stubGlobal('fetch', fetch);

    await initializeProjectStage('project-701', 'STAGE_5');
    await expect(
      recordProjectStageDecision('project-701', 'STAGE_5', {
        decision: 'NOT_APPLICABLE',
        reason: '   ',
      }),
    ).rejects.toThrow('Vui lòng nhập lý do.');
    await recordProjectStageDecision('project-701', 'STAGE_5', {
      decision: 'BYPASSED_WITH_APPROVAL',
      reason: 'Đã có phê duyệt ngoại lệ.',
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls).toEqual([
      [
        '/api/v1/projects/project-701/stages/STAGE_5/initialize',
        expect.objectContaining({ method: 'POST' }),
      ],
      [
        '/api/v1/projects/project-701/stages/STAGE_5/decision',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            decision: 'BYPASSED_WITH_APPROVAL',
            reason: 'Đã có phê duyệt ngoại lệ.',
          }),
        }),
      ],
    ]);
  });
});
