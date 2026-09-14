'use client';

import React, { FormEvent, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, type Actor } from '../../lib/api';
import { ProjectStageHeader, type ProjectStageKey } from '../../project-pms';
import { formatVietnameseMoney } from './stage-1/money';

type Request = (path: string, init?: RequestInit) => Promise<unknown>;

export type ProjectRisk = {
  id: string;
  code: string;
  title: string;
  cause: string;
  event: string;
  impact: string;
  category: string;
  stage: string;
  ownerId: string;
  likelihood: number;
  impactScore: number;
  priorityScore: number;
  probability?: string | null;
  financialImpact?: string | null;
  emv?: string | null;
  trigger?: string | null;
  treatment?: string | null;
  response?: string | null;
  dueDate?: string | null;
  status: string;
  allocations?: readonly {
    id: string;
    estimateVersionId: string;
    approvedAmount: string;
    basis: string;
    status: string;
  }[];
};

export type CreateProjectRiskInput = {
  code: string;
  title: string;
  cause: string;
  event: string;
  impact: string;
  category: string;
  stage: string;
  ownerId: string;
  likelihood: number;
  impactScore: number;
  probability?: string;
  financialImpact?: string;
  trigger?: string;
  treatment?: string;
  response?: string;
  dueDate?: string;
};

export const createProjectRisk = (
  projectId: string,
  input: CreateProjectRiskInput,
  request: Request = api,
) =>
  request(`/projects/${projectId}/risks`, {
    method: 'POST',
    body: JSON.stringify(input),
  });

export const allocateProjectRisk = (
  projectId: string,
  riskId: string,
  input: { estimateVersionId: string; approvedAmount: string; basis: string },
  request: Request = api,
) =>
  request(`/projects/${projectId}/risks/${riskId}/estimate-allocation`, {
    method: 'POST',
    body: JSON.stringify(input),
  });

type RiskAccess = {
  project: {
    id: string;
    code: string;
    name: string;
    currentStage: string;
  };
  options: {
    projects: readonly { id: string; code: string; name: string }[];
  };
  capabilities: {
    canSwitchProject: boolean;
    canManageProjectAccess: boolean;
  };
};

type Member = {
  userId: string;
  user: { displayName: string };
};

const categories = [
  ['DESIGN', 'Thiết kế'],
  ['CUSTOMER', 'Khách hàng'],
  ['SUPPLIER', 'Nhà cung cấp'],
  ['PRODUCTION', 'Sản xuất'],
  ['QUALITY_SAFETY', 'Chất lượng / an toàn'],
  ['LOGISTICS', 'Vận chuyển'],
  ['SITE', 'Mặt bằng'],
  ['INSTALLATION', 'Lắp đặt'],
  ['FINANCIAL', 'Tài chính'],
  ['CONTRACT', 'Hợp đồng'],
  ['WARRANTY', 'Bảo hành'],
  ['SCHEDULE', 'Tiến độ'],
] as const;

const stages = [
  ['STAGE_ONE', 'GĐ1'],
  ['STAGE_TWO', 'GĐ2'],
  ['STAGE_THREE', 'GĐ3'],
  ['STAGE_FOUR', 'GĐ4'],
  ['STAGE_FIVE', 'GĐ5'],
] as const;

const categoryLabel = (value: string) =>
  categories.find(([key]) => key === value)?.[1] ?? value;
const stageLabel = (value: string) =>
  stages.find(([key]) => key === value)?.[1] ?? value;
const statusLabels: Record<string, string> = {
  OPEN: 'Đang theo dõi',
  TREATING: 'Đang xử lý',
  ACCEPTED: 'Đã chấp nhận',
  OCCURRED: 'Đã xảy ra',
  CLOSED: 'Đã đóng',
};
const activeStage = (value: string): ProjectStageKey =>
  ['STAGE_1', 'STAGE_2', 'STAGE_3', 'STAGE_4', 'STAGE_5'].includes(value)
    ? (value as ProjectStageKey)
    : 'STAGE_1';
const optional = (value: FormDataEntryValue | null) =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

export function ProjectRisksView({
  access,
  actorPermissions,
  estimateVersions,
  members,
  onAllocate,
  onCreate,
  onNavigate,
  risks,
}: {
  access: RiskAccess;
  actorPermissions: readonly string[];
  estimateVersions: readonly { id: string; label: string }[];
  members: readonly Member[];
  onAllocate: (
    riskId: string,
    input: { estimateVersionId: string; approvedAmount: string; basis: string },
  ) => Promise<boolean>;
  onCreate: (input: CreateProjectRiskInput) => Promise<boolean>;
  onNavigate?: (path: string) => void;
  risks: readonly ProjectRisk[];
}) {
  const canCreate = actorPermissions.includes('project.update');
  const canReadFinance = actorPermissions.includes('financial_margin.read');
  const canAllocate =
    canReadFinance && actorPermissions.includes('estimate.update');

  const submitRisk = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const value = new FormData(form);
    const probability = optional(value.get('probability'));
    const financialImpact = optional(value.get('financialImpact'));
    const saved = await onCreate({
      code: String(value.get('code')),
      title: String(value.get('title')),
      cause: String(value.get('cause')),
      event: String(value.get('event')),
      impact: String(value.get('impact')),
      category: String(value.get('category')),
      stage: String(value.get('stage')),
      ownerId: String(value.get('ownerId')),
      likelihood: Number(value.get('likelihood')),
      impactScore: Number(value.get('impactScore')),
      ...(probability ? { probability } : {}),
      ...(financialImpact ? { financialImpact } : {}),
      trigger: optional(value.get('trigger')),
      treatment: optional(value.get('treatment')),
      response: optional(value.get('response')),
      dueDate: optional(value.get('dueDate')),
    });
    if (saved) form.reset();
  };

  return (
    <div
      className="mx-auto grid w-full max-w-[1280px] min-w-0 gap-5 p-3 sm:p-5"
      data-project-risk-workspace
    >
      <ProjectStageHeader
        activeStage={activeStage(access.project.currentStage)}
        canManageProjectAccess={access.capabilities.canManageProjectAccess}
        canSwitchProject={access.capabilities.canSwitchProject}
        onNavigate={onNavigate}
        project={access.project}
        projects={access.options.projects}
      />
      <header>
        <h2 className="text-xl font-bold">SỔ RỦI RO DỰ ÁN</h2>
        <p className="text-sm text-slate-600">
          Một sổ dùng chung cho dự án; ma trận 5×5 là cấu hình nội bộ Galaxy.
        </p>
      </header>

      {canCreate && (
        <details className="rounded-xl border bg-white p-4 shadow-sm">
          <summary className="cursor-pointer font-bold">THÊM RỦI RO</summary>
          <form
            className="mt-4 grid gap-3 md:grid-cols-3"
            onSubmit={(event) => void submitRisk(event)}
          >
            <label className="grid gap-1 text-sm">
              Mã
              <input name="code" maxLength={50} required />
            </label>
            <label className="grid gap-1 text-sm md:col-span-2">
              Tên rủi ro
              <input name="title" maxLength={300} required />
            </label>
            <label className="grid gap-1 text-sm">
              Nguyên nhân
              <textarea name="cause" maxLength={2000} required />
            </label>
            <label className="grid gap-1 text-sm">
              Sự kiện có thể xảy ra
              <textarea name="event" maxLength={2000} required />
            </label>
            <label className="grid gap-1 text-sm">
              Ảnh hưởng
              <textarea name="impact" maxLength={2000} required />
            </label>
            <label className="grid gap-1 text-sm">
              Nhóm
              <select name="category">
                {categories
                  .filter(([value]) => canReadFinance || value !== 'FINANCIAL')
                  .map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              Giai đoạn
              <select name="stage" defaultValue="STAGE_TWO">
                {stages.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              Người phụ trách
              <select name="ownerId" required>
                <option value="">Chọn thành viên</option>
                {members.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.user.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              Khả năng (1–5)
              <input
                name="likelihood"
                type="number"
                min="1"
                max="5"
                defaultValue="1"
                required
              />
            </label>
            <label className="grid gap-1 text-sm">
              Tác động (1–5)
              <input
                name="impactScore"
                type="number"
                min="1"
                max="5"
                defaultValue="1"
                required
              />
            </label>
            {canReadFinance && (
              <>
                <label className="grid gap-1 text-sm">
                  Xác suất định lượng (0–1)
                  <input
                    name="probability"
                    inputMode="decimal"
                    pattern="(?:0(?:\.\d{1,6})?|1(?:\.0{1,6})?)"
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  Tổn thất tài chính nếu xảy ra
                  <input
                    name="financialImpact"
                    inputMode="decimal"
                    pattern="\d{1,18}(?:\.\d{1,2})?"
                  />
                </label>
              </>
            )}
            <label className="grid gap-1 text-sm">
              Dấu hiệu kích hoạt
              <textarea name="trigger" maxLength={1000} />
            </label>
            <label className="grid gap-1 text-sm">
              Biện pháp phòng ngừa
              <textarea name="treatment" maxLength={4000} />
            </label>
            <label className="grid gap-1 text-sm">
              Phương án ứng phó
              <textarea name="response" maxLength={4000} />
            </label>
            <label className="grid gap-1 text-sm">
              Hạn xử lý
              <input name="dueDate" type="date" />
            </label>
            <button className="rounded bg-blue-700 px-4 py-2 font-bold text-white md:justify-self-start">
              LƯU RỦI RO
            </button>
          </form>
        </details>
      )}

      <section className="grid gap-3" aria-label="Danh sách rủi ro dự án">
        {!risks.length && (
          <p className="rounded-xl border bg-white p-4">
            Chưa có rủi ro được ghi nhận.
          </p>
        )}
        {risks.map((risk) => (
          <article
            className="grid gap-3 rounded-xl border bg-white p-4 shadow-sm"
            key={risk.id}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-bold">
                  {risk.code} · {risk.title}
                </h3>
                <p className="text-sm text-slate-600">
                  {stageLabel(risk.stage)} · {categoryLabel(risk.category)} ·{' '}
                  {statusLabels[risk.status] ?? risk.status} · Phụ trách:{' '}
                  {members.find(({ userId }) => userId === risk.ownerId)?.user
                    .displayName ?? 'Chưa xác định'}
                </p>
              </div>
              <strong className="rounded bg-amber-50 px-3 py-1 text-amber-900">
                {risk.priorityScore} / 25
              </strong>
            </div>
            <div>
              <strong className="text-sm">
                Nguyên nhân → sự kiện → ảnh hưởng
              </strong>
              <p>
                {risk.cause} → {risk.event} → {risk.impact}
              </p>
            </div>
            {canReadFinance && (
              <div className="grid gap-1 text-sm sm:grid-cols-3">
                <span>Xác suất: {risk.probability ?? 'Chưa định lượng'}</span>
                <span>
                  Tác động tiền:{' '}
                  {risk.financialImpact
                    ? formatVietnameseMoney(risk.financialImpact)
                    : 'Chưa định lượng'}
                </span>
                <span>
                  EMV:{' '}
                  {risk.emv
                    ? formatVietnameseMoney(risk.emv)
                    : 'Chưa định lượng'}
                </span>
              </div>
            )}
            {risk.trigger && (
              <p className="text-sm">
                <strong>Kích hoạt:</strong> {risk.trigger}
              </p>
            )}
            {risk.treatment && (
              <p className="text-sm">
                <strong>Phòng ngừa:</strong> {risk.treatment}
              </p>
            )}
            {risk.response && (
              <p className="text-sm">
                <strong>Ứng phó:</strong> {risk.response}
              </p>
            )}
            {canAllocate && estimateVersions.length > 0 && (
              <details>
                <summary className="cursor-pointer font-semibold text-blue-700">
                  PHÂN BỔ DỰ PHÒNG
                </summary>
                <form
                  className="mt-3 grid gap-2 sm:grid-cols-3"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const form = event.currentTarget;
                    const value = new FormData(form);
                    if (
                      await onAllocate(risk.id, {
                        estimateVersionId: String(
                          value.get('estimateVersionId'),
                        ),
                        approvedAmount: String(value.get('approvedAmount')),
                        basis: String(value.get('basis')),
                      })
                    )
                      form.reset();
                  }}
                >
                  <label className="grid gap-1 text-sm">
                    Dự toán nháp
                    <select name="estimateVersionId" required>
                      {estimateVersions.map((version) => (
                        <option key={version.id} value={version.id}>
                          {version.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm">
                    Số tiền được duyệt
                    <input
                      name="approvedAmount"
                      inputMode="decimal"
                      pattern="\d{1,18}(?:\.\d{1,2})?"
                      required
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    Căn cứ
                    <input name="basis" maxLength={2000} required />
                  </label>
                  <button className="rounded border border-blue-300 px-3 py-2 font-semibold text-blue-700 sm:justify-self-start">
                    LƯU PHÂN BỔ
                  </button>
                </form>
              </details>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}

type ProjectMembers = { members: Member[] };
type EstimateSummary = {
  id: string;
  number: string;
  versions: { id: string; version: number; status: string }[];
};

export function ProjectRisks({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [data, setData] = useState<{
    access: RiskAccess;
    actor: Actor;
    members: Member[];
    risks: ProjectRisk[];
    estimateVersions: { id: string; label: string }[];
  }>();
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    try {
      const [access, actor, project, risks] = await Promise.all([
        api<RiskAccess>(`/projects/${projectId}/stages/STAGE_1`),
        api<Actor>('/me'),
        api<ProjectMembers>(`/projects/${projectId}`),
        api<ProjectRisk[]>(`/projects/${projectId}/risks`),
      ]);
      let estimateVersions: { id: string; label: string }[] = [];
      if (
        actor.permissions.includes('estimate.read') &&
        actor.permissions.includes('estimate.update') &&
        actor.permissions.includes('financial_margin.read')
      ) {
        const estimates = await api<EstimateSummary[]>(
          `/projects/${projectId}/estimates`,
        );
        estimateVersions = estimates.flatMap((estimate) =>
          estimate.versions
            .filter(({ status }) => status === 'DRAFT')
            .map((version) => ({
              id: version.id,
              label: `${estimate.number} · V${version.version}`,
            })),
        );
      }
      setData({
        access,
        actor,
        members: project.members,
        risks,
        estimateVersions,
      });
      setMessage('');
      setFailed(false);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Không thể tải sổ rủi ro.',
      );
      setFailed(true);
    }
  }, [projectId]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);
  if (!data)
    return (
      <p role={message ? 'alert' : 'status'}>
        {message || 'Đang tải sổ rủi ro…'}
      </p>
    );
  const mutate = async (action: () => Promise<unknown>) => {
    try {
      await action();
      await load();
      setMessage('Đã lưu và cập nhật sổ rủi ro.');
      setFailed(false);
      return true;
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Không thể lưu rủi ro.',
      );
      setFailed(true);
      return false;
    }
  };
  return (
    <>
      <ProjectRisksView
        access={data.access}
        actorPermissions={data.actor.permissions}
        estimateVersions={data.estimateVersions}
        members={data.members}
        onAllocate={(riskId, input) =>
          mutate(() => allocateProjectRisk(projectId, riskId, input))
        }
        onCreate={(input) => mutate(() => createProjectRisk(projectId, input))}
        onNavigate={(path) => router.push(path)}
        risks={data.risks}
      />
      {message && (
        <p
          className="mx-auto max-w-[1280px] px-5 pb-5"
          role={failed ? 'alert' : 'status'}
        >
          {message}
        </p>
      )}
    </>
  );
}
