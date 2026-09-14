'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { type Actor, api } from '../../lib/api';
import { projectDomainLabel } from '../../../features/projects/project-domain-labels';
import { StageRequiredDocumentMatrix } from '../../../features/projects/stage-required-document-matrix';
import {
  ProjectPmsError,
  ProjectPmsLoading,
  ProjectPmsShell,
  ProjectPmsStatusPill,
  PROJECT_STAGE_ACCENTS,
  PROJECT_STAGE_LABELS,
  type ProjectPmsData,
  type ProjectStageKey,
} from '../../project-pms';

export type { ProjectStageKey } from '../../project-pms';

type DownstreamStageKey = 'STAGE_3' | 'STAGE_4' | 'STAGE_5';
type StageModuleAction = {
  label: string;
  permission: string;
  href: (projectId: string) => string;
};
type StageModuleTab = { label: string; actions: readonly StageModuleAction[] };

const downstreamStageTabs: Record<
  DownstreamStageKey,
  readonly StageModuleTab[]
> = {
  STAGE_3: [
    {
      label: 'BÁO GIÁ & HỢP ĐỒNG',
      actions: [
        {
          label: 'MỞ BÁO GIÁ DỰ ÁN',
          permission: 'quotation.read',
          href: (projectId) => `/projects/${projectId}/quotations`,
        },
        {
          label: 'MỞ HỢP ĐỒNG KHÁCH HÀNG',
          permission: 'contract.read',
          href: (projectId) => `/projects/${projectId}/contracts`,
        },
      ],
    },
    {
      label: 'NHÀ CUNG CẤP & MUA HÀNG',
      actions: [
        {
          label: 'MỞ YÊU CẦU MUA HÀNG',
          permission: 'purchase_request.read',
          href: (projectId) => `/procurement/requests?projectId=${projectId}`,
        },
        {
          label: 'MỞ RFQ',
          permission: 'procurement.rfq.read',
          href: (projectId) => `/procurement/rfqs?projectId=${projectId}`,
        },
        {
          label: 'MỞ BÁO GIÁ NHÀ CUNG CẤP',
          permission: 'procurement.supplier_quotation.read',
          href: (projectId) =>
            `/procurement/supplier-quotes?projectId=${projectId}`,
        },
        {
          label: 'MỞ SO SÁNH NHÀ CUNG CẤP',
          permission: 'procurement.supplier_selection.read',
          href: () => '/procurement/comparisons',
        },
      ],
    },
    {
      label: 'PO, PI & THANH TOÁN',
      actions: [
        {
          label: 'MỞ ĐƠN MUA HÀNG',
          permission: 'procurement.purchase_order.read',
          href: (projectId) =>
            `/procurement/purchase-orders?projectId=${projectId}`,
        },
        {
          label: 'MỞ HÓA ĐƠN CHIẾU LỆ',
          permission: 'procurement.proforma_invoice.read',
          href: (projectId) =>
            `/procurement/proforma-invoices?projectId=${projectId}`,
        },
        {
          label: 'MỞ CÔNG NỢ NHÀ CUNG CẤP',
          permission: 'supplier_payable.read',
          href: () => '/finance/payables',
        },
      ],
    },
  ],
  STAGE_4: [
    {
      label: 'SẢN XUẤT & QC',
      actions: [
        {
          label: 'MỞ SẢN XUẤT & QC',
          permission: 'production.read',
          href: (projectId) => `/production?projectId=${projectId}`,
        },
      ],
    },
    {
      label: 'LOGISTICS',
      actions: [
        {
          label: 'MỞ LÔ HÀNG',
          permission: 'logistics.shipment.read',
          href: (projectId) => `/logistics/shipments?projectId=${projectId}`,
        },
        {
          label: 'MỞ HẢI QUAN',
          permission: 'logistics.customs.read',
          href: () => '/logistics/customs',
        },
        {
          label: 'MỞ CHI PHÍ NHẬP HÀNG',
          permission: 'logistics.landed_cost.read',
          href: () => '/logistics/landed-costs',
        },
      ],
    },
    {
      label: 'KHO & GIAO HÀNG',
      actions: [
        {
          label: 'MỞ TỒN KHO',
          permission: 'inventory.read',
          href: (projectId) => `/inventory?projectId=${projectId}`,
        },
        {
          label: 'MỞ KHO',
          permission: 'warehouse.read',
          href: (projectId) => `/warehouses?projectId=${projectId}`,
        },
      ],
    },
    {
      label: 'LẮP ĐẶT & TIẾN ĐỘ',
      actions: [
        {
          label: 'MỞ LẮP ĐẶT',
          permission: 'installation.read',
          href: (projectId) => `/installations?projectId=${projectId}`,
        },
        {
          label: 'MỞ CÔNG VIỆC',
          permission: 'task.read',
          href: () => '/tasks',
        },
      ],
    },
  ],
  STAGE_5: [
    {
      label: 'NGHIỆM THU & BÀN GIAO',
      actions: [
        {
          label: 'MỞ NGHIỆM THU',
          permission: 'inspection.read',
          href: (projectId) => `/projects/${projectId}/inspections`,
        },
        {
          label: 'MỞ BÀN GIAO',
          permission: 'handover.read',
          href: (projectId) => `/projects/${projectId}/handover`,
        },
      ],
    },
    {
      label: 'QUYẾT TOÁN',
      actions: [
        {
          label: 'MỞ HỢP ĐỒNG & QUYẾT TOÁN',
          permission: 'contract.read',
          href: (projectId) => `/projects/${projectId}/contracts`,
        },
      ],
    },
    {
      label: 'BẢO HÀNH & HẬU MÃI',
      actions: [
        {
          label: 'MỞ BẢO HÀNH DỰ ÁN',
          permission: 'warranty.read',
          href: (projectId) => `/projects/${projectId}/warranty`,
        },
        {
          label: 'MỞ HẬU MÃI',
          permission: 'service_ticket.read',
          href: (projectId) => `/after-sales?projectId=${projectId}`,
        },
      ],
    },
  ],
};

const isDownstreamStage = (
  stageKey: ProjectStageKey,
): stageKey is DownstreamStageKey => stageKey in downstreamStageTabs;

export function projectStageTabFromSearchParam(
  stageKey: DownstreamStageKey,
  value: string | null,
) {
  const tab = Number(value);
  return Number.isInteger(tab) &&
    tab >= 1 &&
    tab <= downstreamStageTabs[stageKey].length
    ? tab
    : 1;
}

const projectStageTabUrl = (
  projectId: string,
  stageKey: DownstreamStageKey,
  tab: number,
) => `/projects/${projectId}/stage-${stageKey.slice(-1)}?tab=${tab}`;

export type ProjectStageAccessData = {
  project: ProjectPmsData['project'] & { entryStage?: string };
  state: {
    stageKey: ProjectStageKey;
    status: string;
    readOnly: boolean;
    decisionReason: string | null;
    decisionBy: string | null;
    decisionAt: string | null;
    decisionApprovalId: string | null;
  };
  templateApplicability: { projectType: string | null; applicable: boolean };
  requiredDocuments: unknown[];
  permittedCommands: { initialize: boolean; decide: boolean };
  options: {
    projects: readonly { id: string; code: string; name: string }[];
  };
  capabilities: {
    canSwitchProject: boolean;
    canManageProjectAccess: boolean;
  };
};

export function legacyProjectDocumentDestination(
  projectId: string,
  stageKey: string | null,
  requirementId?: string | null,
  workstreamKey?: string | null,
) {
  if (!stageKey || !Object.hasOwn(PROJECT_STAGE_LABELS, stageKey)) return null;
  if (stageKey === 'STAGE_1') {
    const steps: Record<string, number> = {
      ASSIGNMENT: 1,
      SURVEY: 2,
      PROPOSAL: 3,
      FINANCIAL_PLANNING: 4,
      KICKOFF_APPROVAL: 5,
    };
    const step = steps[workstreamKey ?? ''] ?? 1;
    const anchor = requirementId
      ? `document-${encodeURIComponent(requirementId)}`
      : 'step-documents';
    return `/projects/${projectId}/stage-1?step=${step}#${anchor}`;
  }
  const stageRoute = stageKey.toLowerCase().replace('_', '-');
  const anchor = requirementId
    ? `document-${encodeURIComponent(requirementId)}`
    : 'documents';
  return `/projects/${projectId}/${stageRoute}#${anchor}`;
}

export function projectRequiredDocumentLookupPath(
  projectId: string,
  requirementId: string,
  stageKey?: string | null,
) {
  const query = new URLSearchParams({ pageSize: '1', requirementId });
  if (stageKey) query.set('stageKey', stageKey);
  return `/projects/${projectId}/required-documents?${query}`;
}

export function initializeProjectStage(
  projectId: string,
  stageKey: ProjectStageKey,
) {
  return api(`/projects/${projectId}/stages/${stageKey}/initialize`, {
    method: 'POST',
  });
}

export function recordProjectStageDecision(
  projectId: string,
  stageKey: ProjectStageKey,
  decision: {
    decision: 'NOT_APPLICABLE' | 'BYPASSED_WITH_APPROVAL';
    reason: string;
  },
) {
  const reason = decision.reason.trim();
  if (!reason) return Promise.reject(new Error('Vui lòng nhập lý do.'));
  return api(`/projects/${projectId}/stages/${stageKey}/decision`, {
    method: 'POST',
    body: JSON.stringify({ ...decision, reason }),
  });
}

export function ProjectStageAccessView({
  access,
  busy = false,
  error,
  feedback,
  onDecide,
  onInitialize,
  onMatrixMutate,
  onNavigate,
  actorPermissions = [],
  selectedTab = 1,
  workspace,
}: {
  access: ProjectStageAccessData;
  busy?: boolean;
  error?: string;
  feedback?: string;
  onDecide: (decision: {
    decision: 'NOT_APPLICABLE' | 'BYPASSED_WITH_APPROVAL';
    reason: string;
  }) => Promise<void>;
  onInitialize: () => Promise<void>;
  onMatrixMutate?: () => void | Promise<void>;
  onNavigate?: (path: string) => void;
  actorPermissions?: Actor['permissions'];
  selectedTab?: number;
  workspace: ProjectPmsData['workspace'];
}) {
  const [decision, setDecision] = useState<
    'NOT_APPLICABLE' | 'BYPASSED_WITH_APPROVAL'
  >('NOT_APPLICABLE');
  const [reason, setReason] = useState('');
  const decided = ['NOT_APPLICABLE', 'BYPASSED_WITH_APPROVAL'].includes(
    access.state.status,
  );
  const visibleWorkspace = {
    ...workspace,
    project: access.project,
    stages: workspace.stages.map((stage) =>
      stage.stageKey === access.state.stageKey
        ? { ...stage, status: access.state.status }
        : stage,
    ),
  };
  const stageTabs = isDownstreamStage(access.state.stageKey)
    ? downstreamStageTabs[access.state.stageKey]
    : [];
  const selectedModule = stageTabs[selectedTab - 1] ?? stageTabs[0];
  const visibleActions =
    selectedModule?.actions.filter(({ permission }) =>
      actorPermissions.includes(permission),
    ) ?? [];

  return (
    <ProjectPmsShell
      activeStage={access.state.stageKey}
      canManageProjectAccess={access.capabilities.canManageProjectAccess}
      canSwitchProject={access.capabilities.canSwitchProject}
      onNavigate={onNavigate}
      project={access.project}
      projects={access.options.projects}
      showDocuments={false}
      tabs={[]}
      workspace={visibleWorkspace}
    >
      {!!stageTabs.length && (
        <>
          <nav
            aria-label={`Phân hệ Giai đoạn ${access.state.stageKey.slice(-1)}`}
            className="flex gap-2 overflow-x-auto rounded-xl border bg-white p-2"
          >
            {stageTabs.map((tab, index) => {
              const number = index + 1;
              return (
                <Link
                  aria-current={number === selectedTab ? 'page' : undefined}
                  className={`shrink-0 rounded-lg px-3 py-3 text-sm font-bold ${
                    number === selectedTab
                      ? PROJECT_STAGE_ACCENTS[access.state.stageKey].solid
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                  href={projectStageTabUrl(
                    access.project.id,
                    access.state.stageKey as DownstreamStageKey,
                    number,
                  )}
                  key={tab.label}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
          <section
            className="panel grid gap-3"
            aria-label={selectedModule?.label}
          >
            <h2 className="font-semibold">{selectedModule?.label}</h2>
            {visibleActions.length ? (
              <div className="flex flex-wrap gap-3">
                {visibleActions.map((action) => (
                  <Link
                    className="font-semibold text-blue-700"
                    href={action.href(access.project.id)}
                    key={action.label}
                  >
                    {action.label}
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-600">
                Chưa có phân hệ được kết nối mà bạn có quyền truy cập.
              </p>
            )}
          </section>
        </>
      )}
      <section className="grid gap-5">
        <div className="panel">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">TRẠNG THÁI GIAI ĐOẠN</h2>
            <div className="flex items-center gap-2">
              {access.state.readOnly && (
                <span className="text-sm text-black/55">Chỉ đọc</span>
              )}
              <ProjectPmsStatusPill status={access.state.status} />
            </div>
          </div>
          <p className="mt-3 text-sm text-black/65">
            Mẫu dự án{' '}
            {access.templateApplicability.projectType
              ? projectDomainLabel(
                  'projectType',
                  access.templateApplicability.projectType,
                )
              : 'chưa xác định'}{' '}
            ·{' '}
            {access.templateApplicability.applicable
              ? 'Giai đoạn áp dụng'
              : 'Giai đoạn không áp dụng theo mẫu'}
          </p>
          {access.state.decisionReason && (
            <p className="mt-3 text-sm">Lý do: {access.state.decisionReason}</p>
          )}
        </div>
      </section>

      <div className="scroll-mt-4" id="documents">
        <div className="scroll-mt-4" id="required-documents">
          {access.requiredDocuments.length ? (
            <StageRequiredDocumentMatrix
              actorPermissions={actorPermissions}
              onMutate={onMatrixMutate}
              projectId={access.project.id}
              stageKey={access.state.stageKey}
            />
          ) : (
            <section className="panel grid gap-3">
              <div>
                <h2 className="font-semibold">HỒ SƠ GIAI ĐOẠN</h2>
                <p className="mt-1 text-sm text-black/65">
                  Danh mục hồ sơ được tạo tự động theo loại dự án và các bước áp
                  dụng.
                </p>
              </div>
              <div className="grid gap-3 rounded border border-dashed p-4">
                <p className="font-medium">
                  {access.state.status === 'NOT_INITIALIZED'
                    ? 'CHƯA KHỞI TẠO GIAI ĐOẠN'
                    : 'KHÔNG CÓ HỒ SƠ ÁP DỤNG'}
                </p>
                {access.state.status === 'NOT_INITIALIZED' &&
                  access.permittedCommands.initialize && (
                    <button
                      aria-busy={busy}
                      className="w-fit rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white"
                      disabled={busy}
                      onClick={() => void onInitialize()}
                      type="button"
                    >
                      KHỞI TẠO GIAI ĐOẠN
                    </button>
                  )}
              </div>
            </section>
          )}
        </div>
      </div>

      {access.permittedCommands.decide && !decided && (
        <form
          className="panel grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void onDecide({ decision, reason });
          }}
        >
          <h2 className="font-semibold">QUYẾT ĐỊNH ÁP DỤNG</h2>
          <p className="text-sm text-black/65">
            Ghi nhận lý do để giai đoạn không áp dụng hoặc được bỏ qua có phê
            duyệt. Quyết định được lưu vào lịch sử kiểm toán.
          </p>
          <label className="grid gap-1 text-sm">
            Quyết định
            <select
              onChange={(event) =>
                setDecision(event.target.value as typeof decision)
              }
              value={decision}
            >
              <option value="NOT_APPLICABLE">Không áp dụng</option>
              <option value="BYPASSED_WITH_APPROVAL">
                Bỏ qua có phê duyệt
              </option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            Lý do
            <textarea
              onChange={(event) => setReason(event.target.value)}
              required
              value={reason}
            />
          </label>
          <button
            aria-busy={busy}
            className="w-fit rounded border px-4 py-2 text-sm font-medium"
            disabled={busy}
            type="submit"
          >
            Ghi nhận quyết định
          </button>
        </form>
      )}

      {feedback && <p role="status">{feedback}</p>}
      {error && <p role="alert">{error}</p>}
    </ProjectPmsShell>
  );
}

export function ProjectStageAccess({
  projectId,
  stageKey,
}: {
  projectId: string;
  stageKey: ProjectStageKey;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<{
    access: ProjectStageAccessData;
    actorPermissions: Actor['permissions'];
    workspace: ProjectPmsData['workspace'];
  }>();
  const [loadError, setLoadError] = useState('');
  const [commandError, setCommandError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const [access, workspace, actor] = await Promise.all([
        api<ProjectStageAccessData>(
          `/projects/${projectId}/stages/${stageKey}`,
        ),
        api<ProjectPmsData['workspace']>(
          `/projects/${projectId}/workspace-summary`,
        ),
        api<Actor>('/me'),
      ]);
      setData({ access, actorPermissions: actor.permissions, workspace });
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : 'Không thể tải giai đoạn.',
      );
    }
  }, [projectId, stageKey]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  if (loadError && !data)
    return <ProjectPmsError message={loadError} onRetry={() => void load()} />;
  if (!data) return <ProjectPmsLoading />;

  const command = async (action: () => Promise<unknown>, message: string) => {
    if (busy) return;
    setBusy(true);
    setCommandError('');
    setFeedback('');
    try {
      await action();
      await load();
      setFeedback(message);
    } catch (error) {
      setCommandError(
        error instanceof Error ? error.message : 'Không thể thực hiện lệnh.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <ProjectStageAccessView
      access={data.access}
      busy={busy}
      error={commandError}
      feedback={feedback}
      onDecide={(decision) =>
        command(
          () => recordProjectStageDecision(projectId, stageKey, decision),
          'Đã ghi nhận quyết định giai đoạn.',
        )
      }
      onInitialize={() =>
        command(
          () => initializeProjectStage(projectId, stageKey),
          'Đã khởi tạo giai đoạn.',
        )
      }
      onMatrixMutate={load}
      onNavigate={(path) => router.push(path)}
      actorPermissions={data.actorPermissions}
      selectedTab={
        isDownstreamStage(stageKey)
          ? projectStageTabFromSearchParam(stageKey, searchParams.get('tab'))
          : 1
      }
      workspace={data.workspace}
    />
  );
}
