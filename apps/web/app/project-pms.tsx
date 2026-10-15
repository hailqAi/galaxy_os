import Link from 'next/link';
import React from 'react';
import { projectDomainLabel } from '../features/projects/project-domain-labels';
import { ProjectDeleteAction } from './projects/project-delete-action';

type Project = {
  id: string;
  code: string;
  name: string;
  customer: { id: string; displayName: string } | null;
  location: string | null;
  projectType: string | null;
  status: string;
  healthStatus: string;
  currentStage?: string;
  salesOwner?: { displayName: string } | null;
  projectManager: { displayName: string } | null;
  expectedCompletionDate: string | null;
};

export type StageOverviewCard = {
  stageKey: string;
  title: string;
  objective: string;
  status: string;
  completedSteps: number | null;
  totalSteps: number | null;
  progressPercent: number | null;
  updatedAt: string | null;
  nextAction: string;
};

type Workspace = {
  project: Project;
  stages: StageOverviewCard[];
};

type StageOne = {
  allowedCommands?: { submitApproval: boolean };
  steps: {
    id: string;
    step: string;
    status: string;
    ownerUserId: string | null;
    dueDate: string | null;
  }[];
  requiredDocuments: {
    required: number;
    approved: number;
    rejected: number;
    overdue: number;
  };
  routing: {
    projectType: string;
    workstreams: string[];
    requiresSurvey: boolean;
    requiresPreliminaryFinance: boolean;
    riskLevel: string;
  } | null;
  readiness: {
    status: string;
    satisfied: number;
    total: number;
    progress: number;
    cards: {
      key: string;
      applicable: boolean;
      satisfied: number;
      total: number;
      status: string;
    }[];
  };
  redFlags: {
    code: string;
    severity: string;
    title: string;
    description: string;
    owner: string;
    dueDate?: string | null;
    route: string;
    remediation: string;
  }[];
};

export type ProjectPmsData = {
  project: Project;
  workspace: Workspace;
  stageOne: StageOne;
};

type StageTab = { href: string; label: string };

export const PROJECT_STAGE_LABELS = {
  STAGE_1: 'KHỞI TẠO, HỒ SƠ DỰ ÁN & PHÊ DUYỆT',
  STAGE_2: 'THIẾT KẾ, SẢN PHẨM & DỰ TOÁN',
  STAGE_3: 'THƯƠNG MẠI, HỢP ĐỒNG & MUA HÀNG',
  STAGE_4: 'SẢN XUẤT, LOGISTICS, KHO & LẮP ĐẶT',
  STAGE_5: 'NGHIỆM THU, BÀN GIAO & BẢO HÀNH',
} as const;

export type ProjectStageKey = keyof typeof PROJECT_STAGE_LABELS;
type ProjectOption = { id: string; code: string; name: string };

export const projectStagePath = (projectId: string, stage: ProjectStageKey) =>
  `/projects/${projectId}/stage-${stage.slice(-1)}`;

const statusClasses: Record<string, string> = {
  ACTIVE: 'border-blue-200 bg-blue-50 text-blue-700',
  ON_TRACK: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  AT_RISK: 'border-amber-200 bg-amber-50 text-amber-700',
  OFF_TRACK: 'border-red-200 bg-red-50 text-red-700',
  BLOCKED: 'border-red-200 bg-red-50 text-red-700',
  CRITICAL: 'border-red-200 bg-red-50 text-red-700',
  IN_PROGRESS: 'border-blue-200 bg-blue-50 text-blue-700',
  READY_FOR_REVIEW: 'border-purple-200 bg-purple-50 text-purple-700',
  DONE: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  COMPLETED: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  NOT_APPLICABLE: 'border-black/15 bg-black/5 text-black/65',
  BYPASSED_WITH_APPROVAL: 'border-amber-200 bg-amber-50 text-amber-700',
  WARNING: 'border-amber-200 bg-amber-50 text-amber-700',
  'Chưa bắt đầu': 'border-black/15 bg-black/5 text-black/65',
  'Đang thực hiện': 'border-blue-200 bg-blue-50 text-blue-700',
  'Tạm dừng': 'border-amber-200 bg-amber-50 text-amber-700',
  'Hoàn thành': 'border-emerald-200 bg-emerald-50 text-emerald-700',
  'Cần xử lý': 'border-red-200 bg-red-50 text-red-700',
};
const overviewStatuses = new Set([
  'Chưa bắt đầu',
  'Đang thực hiện',
  'Tạm dừng',
  'Hoàn thành',
  'Cần xử lý',
]);

function date(value: string | null) {
  return value?.slice(0, 10) ?? '—';
}

export function ProjectPmsStatusPill({ status }: { status: string }) {
  return (
    <span
      className={`rounded-full border px-2 py-1 text-xs font-medium ${statusClasses[status] ?? 'border-black/15 bg-black/5 text-black/65'}`}
      data-status={status}
    >
      {overviewStatuses.has(status)
        ? status
        : projectDomainLabel('status', status)}
    </span>
  );
}

export const PROJECT_STAGE_ACCENTS: Record<
  ProjectStageKey,
  { solid: string; soft: string }
> = {
  STAGE_1: {
    solid: 'border-blue-700 bg-blue-700 text-white',
    soft: 'border-blue-200 bg-blue-50 text-blue-700',
  },
  STAGE_2: {
    solid: 'border-indigo-600 bg-indigo-600 text-white',
    soft: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  },
  STAGE_3: {
    solid: 'border-amber-600 bg-amber-600 text-white',
    soft: 'border-amber-200 bg-amber-50 text-amber-700',
  },
  STAGE_4: {
    solid: 'border-emerald-600 bg-emerald-600 text-white',
    soft: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  STAGE_5: {
    solid: 'border-teal-700 bg-teal-700 text-white',
    soft: 'border-teal-200 bg-teal-50 text-teal-700',
  },
};

export type ProjectStageHeaderProps = {
  activeStage: ProjectStageKey;
  project: ProjectOption;
  projects: readonly ProjectOption[];
  status?: string;
  canSwitchProject: boolean;
  canManageProjectAccess: boolean;
  canDeleteProject?: boolean;
  onProjectDeleted?: () => void | Promise<void>;
  onNavigate?: (path: string) => void;
};

export function ProjectStageHeader({
  activeStage,
  canManageProjectAccess,
  canDeleteProject,
  canSwitchProject,
  onNavigate,
  onProjectDeleted,
  project,
  projects,
  status,
}: ProjectStageHeaderProps) {
  const number = activeStage.slice(-1);
  return (
    <header
      className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
      data-project-stage-header={activeStage}
    >
      <div
        className="grid min-w-0 gap-3 border-b border-slate-100 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
        data-project-stage-header-row="stage"
      >
        <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] content-center items-center gap-3 lg:flex lg:min-h-[68px] lg:flex-wrap min-[1360px]:min-h-0">
          <span
            className={`order-1 rounded-md border px-3 py-1 text-sm font-bold ${PROJECT_STAGE_ACCENTS[activeStage].solid}`}
          >
            GIAI ĐOẠN {number}
          </span>
          <h1 className="order-3 col-span-2 text-xl font-bold text-slate-900 lg:order-2 lg:col-span-1 min-[1360px]:text-2xl">
            {PROJECT_STAGE_LABELS[activeStage]}
          </h1>
          {status && (
            <span className="order-2 justify-self-end lg:order-3">
              <ProjectPmsStatusPill status={status} />
            </span>
          )}
        </div>
        <nav
          aria-label="Giai đoạn dự án"
          className="max-w-full overflow-x-auto"
        >
          <div className="flex min-w-max gap-2">
            {Object.keys(PROJECT_STAGE_LABELS).map((stage) => {
              const stageKey = stage as ProjectStageKey;
              return (
                <Link
                  aria-current={stageKey === activeStage ? 'page' : undefined}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
                    stageKey === activeStage
                      ? PROJECT_STAGE_ACCENTS[activeStage].solid
                      : 'border-slate-200 bg-slate-50 text-slate-600'
                  }`}
                  data-stage-control={stageKey}
                  href={projectStagePath(project.id, stageKey)}
                  key={stageKey}
                >
                  GĐ{stageKey.slice(-1)}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
      <div
        className="grid min-w-0 gap-3 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end"
        data-project-stage-header-row="project"
      >
        <label className="grid min-w-0 gap-1 text-sm font-semibold">
          DỰ ÁN
          <select
            aria-label="Dự án đang chọn"
            className="w-full min-w-0 md:max-w-2xl"
            disabled={!canSwitchProject}
            id="project-stage-selector"
            name="projectId"
            onChange={(event) => {
              if (event.target.value === project.id) return;
              const path = projectStagePath(event.target.value, activeStage);
              if (onNavigate) onNavigate(path);
              else globalThis.location.assign(path);
            }}
            value={project.id}
          >
            {projects.map((option) => (
              <option key={option.id} value={option.id}>
                {option.code} · {option.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          <Link
            className="rounded border border-amber-300 px-3 py-2 text-center text-sm font-semibold text-amber-800"
            href={`/projects/${project.id}/risks`}
          >
            RỦI RO
          </Link>
          {canManageProjectAccess && (
            <Link
              className="rounded border border-blue-300 px-3 py-2 text-center text-sm font-semibold text-blue-700"
              href={`/projects/${project.id}/members`}
              id="project-permissions-action"
            >
              PHÂN QUYỀN DỰ ÁN
            </Link>
          )}
          {canDeleteProject && (
            <ProjectDeleteAction
              onDeleted={onProjectDeleted}
              project={project}
            />
          )}
        </div>
      </div>
    </header>
  );
}

function ProjectPmsTabs({
  activeStage,
  activeTab,
  actions,
  tabs,
}: {
  activeStage: string;
  activeTab?: string;
  actions?: React.ReactNode;
  tabs: StageTab[];
}) {
  return (
    <nav aria-label="Công việc dự án" className="flex flex-wrap gap-2">
      {tabs.map((tab) => (
        <Link
          aria-current={tab.href === activeTab ? 'page' : undefined}
          className={`rounded border px-3 py-2 text-sm ${tab.href === activeTab ? PROJECT_STAGE_ACCENTS[activeStage as ProjectStageKey].soft : ''}`}
          href={tab.href}
          key={tab.href}
        >
          {tab.label}
        </Link>
      ))}
      {actions}
    </nav>
  );
}

function ProjectPmsSummary({ stageOne }: { stageOne: StageOne }) {
  return (
    <section
      aria-label="Tóm tắt Giai đoạn 1"
      className="grid gap-3 sm:grid-cols-3"
    >
      <div className="panel">
        <p className="text-sm text-black/55">Sẵn sàng GĐ 1</p>
        <ProjectPmsStatusPill status={stageOne.readiness.status} />
        <p className="mt-2 text-sm">
          {stageOne.readiness.satisfied}/{stageOne.readiness.total} điều kiện
        </p>
      </div>
      <div className="panel">
        <p className="text-sm text-black/55">Hồ sơ bắt buộc</p>
        <strong>
          {stageOne.requiredDocuments.approved}/
          {stageOne.requiredDocuments.required}
        </strong>
        <p className="mt-2 text-sm">
          {stageOne.requiredDocuments.rejected} bị từ chối ·{' '}
          {stageOne.requiredDocuments.overdue} quá hạn
        </p>
      </div>
      <div className="panel">
        <p className="text-sm text-black/55">Tiến độ sẵn sàng</p>
        <strong>{stageOne.readiness.progress}%</strong>
      </div>
    </section>
  );
}

function ProjectPmsFlags({
  onCorrect,
  stageOne,
}: {
  onCorrect?: (route: string, code: string) => void;
  stageOne: StageOne;
}) {
  if (!stageOne.redFlags.length) return null;
  return (
    <section className="panel border-amber-200" aria-label="Việc cần xử lý">
      <h2 className="font-semibold text-amber-800">VIỆC CẦN XỬ LÝ</h2>
      <ul className="mt-3 grid gap-3">
        {stageOne.redFlags.slice(0, 3).map((flag) => (
          <li className="rounded border border-red-100 p-3" key={flag.code}>
            <div className="flex flex-wrap items-center gap-2">
              <ProjectPmsStatusPill status={flag.severity} />
              <strong>{flag.title}</strong>
            </div>
            <p className="mt-1 text-sm">{flag.description}</p>
            {(flag.owner || flag.dueDate) && (
              <p className="mt-1 text-sm text-black/65">
                {flag.owner &&
                  `Phụ trách: ${projectDomainLabel('role', flag.owner)}`}
                {flag.owner && flag.dueDate && ' · '}
                {flag.dueDate && `Hạn: ${date(flag.dueDate)}`}
              </p>
            )}
            {flag.route && (
              <Link
                className="mt-2 inline-block text-sm font-medium text-blue-700 underline"
                href={flag.route}
                onClick={() => onCorrect?.(flag.route, flag.code)}
              >
                XỬ LÝ
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ProjectPmsSteps({ stageOne }: { stageOne: StageOne }) {
  return (
    <section className="panel">
      <h2 className="font-semibold">Các bước Giai đoạn 1</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {stageOne.steps.length ? (
          stageOne.steps.map((step) => (
            <div className="rounded border border-black/10 p-3" key={step.id}>
              <strong className="text-sm">
                {projectDomainLabel('step', step.step)}
              </strong>
              <div className="mt-2">
                <ProjectPmsStatusPill status={step.status} />
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-black/65">Chưa có bước Giai đoạn 1.</p>
        )}
      </div>
    </section>
  );
}

function ProjectPmsRouting({ stageOne }: { stageOne: StageOne }) {
  if (!stageOne.routing) return null;
  return (
    <section className="rounded-lg bg-[var(--shell-navy)] p-5 text-white">
      <h2 className="font-semibold">Định tuyến nghiệp vụ</h2>
      <p className="mt-2 text-sm">
        {projectDomainLabel('projectType', stageOne.routing.projectType)}
      </p>
      <p className="mt-2 text-sm">
        {stageOne.routing.workstreams
          .map((value) => projectDomainLabel('workstream', value))
          .join(' · ')}
      </p>
      <p className="mt-2 text-sm">
        Rủi ro: {projectDomainLabel('risk', stageOne.routing.riskLevel)}
      </p>
    </section>
  );
}

export function ProjectPmsLoading() {
  return <p role="status">Đang tải không gian dự án…</p>;
}

export function ProjectPmsError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div role="alert">
      <p>{message}</p>
      <button className="mt-2" onClick={onRetry} type="button">
        Thử lại
      </button>
    </div>
  );
}

export function ProjectPmsOverview({
  project,
  stages,
}: {
  project: Project;
  stages: StageOverviewCard[];
}) {
  return (
    <div className="grid gap-5">
      <header className="panel">
        <p className="text-sm text-black/55">{project.code}</p>
        <h1 className="text-2xl font-semibold">TỔNG QUAN TIẾN ĐỘ DỰ ÁN</h1>
        <p className="mt-1 text-sm text-black/65">{project.name}</p>
      </header>
      <section
        aria-label="Tiến độ các giai đoạn"
        className="grid gap-4 lg:grid-cols-2"
      >
        {stages.map((stage) => (
          <article
            className="panel grid gap-3"
            data-stage-overview={stage.stageKey}
            key={stage.stageKey}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h2 className="font-semibold">{stage.title}</h2>
              <ProjectPmsStatusPill status={stage.status} />
            </div>
            <p className="text-sm text-black/65">{stage.objective}</p>
            {stage.progressPercent === null ||
            stage.completedSteps === null ||
            stage.totalSteps === null ? (
              <p className="text-sm text-black/55">
                Chưa có tiến độ được ghi nhận
              </p>
            ) : (
              <div className="grid gap-1">
                <div className="flex justify-between gap-3 text-sm">
                  <span>
                    {stage.completedSteps}/{stage.totalSteps} bước
                  </span>
                  <strong>{stage.progressPercent}%</strong>
                </div>
                <progress
                  aria-label={`Tiến độ ${stage.title}`}
                  className="w-full"
                  max={100}
                  value={stage.progressPercent}
                />
              </div>
            )}
            <p className="text-sm text-black/55">
              Cập nhật: {date(stage.updatedAt)}
            </p>
            <p className="text-sm">Hành động tiếp theo: {stage.nextAction}</p>
            <Link
              aria-label={`Mở ${stage.title}`}
              className="justify-self-start font-medium text-blue-700 underline"
              href={`/projects/${project.id}/${stage.stageKey.toLowerCase().replace('_', '-')}`}
            >
              MỞ GIAI ĐOẠN
            </Link>
          </article>
        ))}
      </section>
    </div>
  );
}

export function ProjectPmsShell({
  activeStage = 'STAGE_1',
  activeTab,
  canManageProjectAccess = false,
  canSwitchProject = false,
  project,
  projects = [{ id: project.id, code: project.code, name: project.name }],
  workspace,
  stageOne,
  children,
  contextSlot,
  onNavigate,
  tabs = [
    { href: `/projects/${project.id}/stage-1`, label: 'Tổng quan' },
    {
      href: `/projects/${project.id}/stage-1/initiation`,
      label: 'Khởi tạo dự án',
    },
  ],
  summarySlot,
  flagsSlot,
  governanceSlot,
  mainSlot,
  planSlot,
  documentsSlot,
  activitySlot,
  readinessSlot,
  stepsSlot,
  surveySlot,
  actions,
  onFlagCorrect,
  showDocuments = true,
}: Omit<ProjectPmsData, 'stageOne'> & {
  activeStage?: ProjectStageKey;
  activeTab?: string;
  canManageProjectAccess?: boolean;
  canSwitchProject?: boolean;
  children?: React.ReactNode;
  contextSlot?: React.ReactNode;
  onNavigate?: (path: string) => void;
  projects?: readonly ProjectOption[];
  stageOne?: StageOne;
  tabs?: StageTab[];
  summarySlot?: React.ReactNode;
  flagsSlot?: React.ReactNode;
  governanceSlot?: React.ReactNode;
  mainSlot?: React.ReactNode;
  planSlot?: React.ReactNode;
  documentsSlot?: React.ReactNode;
  activitySlot?: React.ReactNode;
  readinessSlot?: React.ReactNode;
  stepsSlot?: React.ReactNode;
  surveySlot?: React.ReactNode;
  actions?: React.ReactNode;
  onFlagCorrect?: (route: string, code: string) => void;
  showDocuments?: boolean;
}) {
  return (
    <div className="mx-auto grid w-full max-w-[1280px] min-w-0 grid-cols-[minmax(0,1fr)] gap-5 p-3 sm:p-5">
      <ProjectStageHeader
        activeStage={activeStage}
        canManageProjectAccess={canManageProjectAccess}
        canSwitchProject={canSwitchProject}
        onNavigate={onNavigate}
        project={project}
        projects={projects}
        status={
          workspace.stages.find(({ stageKey }) => stageKey === activeStage)
            ?.status
        }
      />
      {contextSlot}
      {(tabs.length > 0 || actions) && (
        <ProjectPmsTabs
          actions={actions}
          activeStage={activeStage}
          activeTab={activeTab}
          tabs={tabs}
        />
      )}
      {mainSlot ?? children}
      {summarySlot ?? (stageOne && <ProjectPmsSummary stageOne={stageOne} />)}
      {flagsSlot ??
        (stageOne && (
          <ProjectPmsFlags onCorrect={onFlagCorrect} stageOne={stageOne} />
        ))}
      {governanceSlot}
      {surveySlot}
      {planSlot}
      {showDocuments && documentsSlot}
      {stepsSlot ?? (stageOne && <ProjectPmsSteps stageOne={stageOne} />)}
      {readinessSlot}
      {activitySlot}
      {!mainSlot && !children && stageOne && (
        <ProjectPmsRouting stageOne={stageOne} />
      )}
    </div>
  );
}
