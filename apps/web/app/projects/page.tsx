'use client';
import Link from 'next/link';
import React, {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { api } from '../lib/api';
import {
  type StageOneMode,
  type StageOneRow,
  type StageOneSummary,
  stageOneRows,
} from './stage-one-projects';
import { projectDomainLabel } from '../../features/projects/project-domain-labels';
import { ProjectDeleteAction } from './project-delete-action';
type Project = {
  id: string;
  code: string;
  name: string;
  status: string;
  healthStatus: string;
  progressPercentage: number;
  currentStage?: string;
  updatedAt: string;
  stages: { stageKey: string; status: string }[];
  customer: { displayName: string };
  projectManager: { displayName: string } | null;
  canDeleteProject?: boolean;
};
type Page = {
  items: Project[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};
type Dashboard = {
  total: number;
  active: number;
  needsAttention: number;
  completed: number;
  permittedCommands: { create: boolean };
  estimatedValues?: { currency: string; value: string }[];
  contractValues?: { currency: string; value: string }[];
  receivedValues?: { currency: string; value: string }[];
  receivableValues?: { currency: string; value: string }[];
  payableValues?: { currency: string; value: string }[];
  pendingApprovals?: number;
  dueWarrantyAssets?: number;
  dueServiceTickets?: number;
};
const projectStages = [
  'STAGE_1',
  'STAGE_2',
  'STAGE_3',
  'STAGE_4',
  'STAGE_5',
] as const;
type StageOneSummaryBatch = {
  items: (StageOneSummary & { projectId: string })[];
};

type ProjectLoadCallbacks = {
  onStart: () => void;
  onData: (data: Page) => void;
  onRows: (rows: StageOneRow<Project>[], message: string) => void;
  onListError: (message: string) => void;
};

type DashboardLoadCallbacks = {
  onStart: () => void;
  onData: (dashboard: Dashboard) => void;
  onError: (message: string) => void;
};

export function projectListPath({
  currentStage,
  mine,
  page,
  search,
  status,
  health,
}: {
  currentStage?: string;
  mine?: boolean;
  page: number;
  search?: string;
  status?: string;
  health?: string;
}) {
  return `/projects?${new URLSearchParams({
    page: String(page),
    pageSize: '20',
    ...(mine && { mine: 'true' }),
    ...(search && { search }),
    ...(currentStage && { currentStage }),
    ...(status && { status }),
    ...(health && { health }),
  })}`;
}

export async function loadProjectsPage({
  callbacks,
  isCurrent,
  path,
  stageOneMode,
}: {
  callbacks: ProjectLoadCallbacks;
  isCurrent: () => boolean;
  path: string;
  stageOneMode?: StageOneMode;
}) {
  if (!isCurrent()) return;
  callbacks.onStart();
  try {
    const result = await api<Page>(path);
    if (!isCurrent()) return;
    callbacks.onData(result);
    if (!stageOneMode) return;
    let entries: { project: Project; summary?: StageOneSummary }[] =
      result.items.map((project) => ({ project }));
    if (entries.length) {
      try {
        const summaries = await api<StageOneSummaryBatch>(
          `/projects/stage-1-summaries?projectIds=${result.items.map(({ id }) => id).join(',')}`,
        );
        const byProjectId = new Map(
          summaries.items.map(({ projectId, ...summary }) => [
            projectId,
            summary,
          ]),
        );
        entries = result.items.map((project) => ({
          project,
          summary: byProjectId.get(project.id),
        }));
      } catch {}
    }
    if (!isCurrent()) return;
    callbacks.onRows(
      stageOneRows(stageOneMode, entries),
      entries.some(({ summary }) => !summary)
        ? 'Một số dữ liệu Stage 1 không thể tải.'
        : '',
    );
  } catch (error) {
    if (isCurrent()) callbacks.onListError((error as Error).message);
  }
}

export async function loadProjectDashboard({
  callbacks,
  isCurrent,
}: {
  callbacks: DashboardLoadCallbacks;
  isCurrent: () => boolean;
}) {
  if (!isCurrent()) return;
  callbacks.onStart();
  try {
    const dashboard = await api<Dashboard>('/projects/dashboard');
    if (isCurrent()) callbacks.onData(dashboard);
  } catch (error) {
    if (isCurrent()) callbacks.onError((error as Error).message);
  }
}

export function applyProjectFilter(
  value: string,
  setFilter: (value: string) => void,
  setPage: (value: number) => void,
) {
  setFilter(value);
  setPage(1);
}

function money(value: string) {
  const [integer = '', fraction] = value.split('.');
  return `${integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}${fraction ? `,${fraction}` : ''}`;
}

function ProjectTable({
  items,
  onProjectDeleted,
}: {
  items: Project[];
  onProjectDeleted?: () => void | Promise<void>;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-[1080px] table-fixed text-[13px]">
        <colgroup>
          <col className="w-[130px]" />
          <col className="w-[200px]" />
          <col className="w-[150px]" />
          <col className="w-[130px]" />
          <col className="w-[125px]" />
          <col className="w-[130px]" />
          <col className="w-[120px]" />
          <col className="w-[90px]" />
          <col className="w-[105px]" />
        </colgroup>
        <thead>
          <tr>
            <th>Mã dự án</th>
            <th>Tên dự án</th>
            <th>Khách hàng</th>
            <th>Quản lý dự án</th>
            <th>Tiến độ</th>
            <th>Giai đoạn đang xử lý</th>
            <th>Trạng thái</th>
            <th>Cập nhật</th>
            <th className="sticky right-0 z-10">Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td className="font-semibold text-slate-700">
                <span className="block truncate" title={item.code}>
                  {item.code}
                </span>
              </td>
              <td>
                <Link
                  className="block truncate font-semibold text-slate-900 hover:text-blue-700"
                  href={`/projects/${item.id}/stage-1`}
                  title={item.name}
                >
                  {item.name}
                </Link>
              </td>
              <td>
                <span
                  className="block truncate"
                  title={item.customer.displayName}
                >
                  {item.customer.displayName}
                </span>
              </td>
              <td>
                <span className="block truncate">
                  {item.projectManager?.displayName ?? '—'}
                </span>
              </td>
              <td>
                <div className="grid min-w-28 gap-1">
                  <div className="flex items-center justify-between text-xs">
                    <span>{item.progressPercentage}%</span>
                  </div>
                  <progress
                    aria-label={`Tiến độ ${item.name}`}
                    className="h-1.5 w-full accent-blue-600"
                    max={100}
                    value={item.progressPercentage}
                  />
                </div>
              </td>
              <td>
                {projectDomainLabel('stage', item.currentStage ?? 'STAGE_1')}
              </td>
              <td>
                <span className="whitespace-nowrap rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
                  {projectDomainLabel('status', item.status)}
                </span>
              </td>
              <td>{new Date(item.updatedAt).toLocaleDateString('vi-VN')}</td>
              <td className="sticky right-0 bg-white">
                <div className="flex items-center gap-2">
                  <Link
                    className="primary inline-flex whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold"
                    href={`/projects/${item.id}/stage-1`}
                  >
                    MỞ DỰ ÁN
                  </Link>
                  {item.canDeleteProject && (
                    <ProjectDeleteAction
                      onDeleted={onProjectDeleted}
                      project={item}
                    />
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DashboardView({
  children,
  data,
  dashboardError,
  error,
  loading,
  onDashboardRetry,
  onRetry,
  onProjectDeleted,
  pagination,
  summary,
}: {
  children?: ReactNode;
  data?: Page;
  dashboardError?: string;
  error?: string;
  loading?: boolean;
  onDashboardRetry?: () => void;
  onRetry?: () => void;
  onProjectDeleted?: () => void | Promise<void>;
  pagination?: ReactNode;
  summary?: Dashboard;
}) {
  return (
    <>
      <section className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <h1 className="text-[22px] font-semibold text-slate-900">
              TỔNG QUAN DỰ ÁN
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Theo dõi toàn bộ dự án bạn được quyền xem.
            </p>
          </div>
          {summary?.permittedCommands.create && (
            <Link
              className="primary rounded-lg px-4 py-2 text-sm font-semibold"
              href="/projects/new"
            >
              TẠO DỰ ÁN
            </Link>
          )}
        </div>
        {summary ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {(
                [
                  ['Tổng dự án', summary.total],
                  ['Đang thực hiện', summary.active],
                  ['Cần xử lý', summary.needsAttention],
                  ['Đã hoàn thành', summary.completed],
                  ...(summary.estimatedValues?.length
                    ? [
                        [
                          'Tổng giá trị',
                          summary.estimatedValues
                            .map(
                              ({ currency, value }) =>
                                `${currency} ${money(value)}`,
                            )
                            .join(' · '),
                        ],
                      ]
                    : []),
                  ...[
                    ['Giá trị hợp đồng', summary.contractValues],
                    ['Tổng đã thu', summary.receivedValues],
                    ['Công nợ phải thu', summary.receivableValues],
                    ['Công nợ phải trả', summary.payableValues],
                  ].flatMap(([label, values]) =>
                    Array.isArray(values) && values.length
                      ? [
                          [
                            label,
                            values
                              .map(
                                ({ currency, value }) =>
                                  `${currency} ${money(value)}`,
                              )
                              .join(' · '),
                          ],
                        ]
                      : [],
                  ),
                  ...(summary.pendingApprovals !== undefined
                    ? [['Phê duyệt đang chờ', summary.pendingApprovals]]
                    : []),
                  ...(summary.dueWarrantyAssets !== undefined ||
                  summary.dueServiceTickets !== undefined
                    ? [
                        [
                          'Bảo hành/bảo trì đến hạn',
                          [
                            ...(summary.dueWarrantyAssets !== undefined
                              ? [`Bảo hành ${summary.dueWarrantyAssets}`]
                              : []),
                            ...(summary.dueServiceTickets !== undefined
                              ? [`Dịch vụ ${summary.dueServiceTickets}`]
                              : []),
                          ].join(' · '),
                        ],
                      ]
                    : []),
                ] as [string, string | number][]
              ).map(([label, value]) => (
                <div
                  className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                  key={label}
                >
                  <p className="text-sm text-slate-500">{label}</p>
                  <strong className="mt-1 block break-words text-lg text-slate-900 2xl:text-xl">
                    {value}
                  </strong>
                </div>
              ))}
            </div>
            {summary.total > 0 && (
              <section
                aria-label="Tiến độ danh mục dự án"
                className="grid gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <h2 className="font-semibold">TIẾN ĐỘ DANH MỤC DỰ ÁN</h2>
                <progress
                  aria-label="Tỷ lệ dự án đã hoàn thành"
                  className="h-3 w-full accent-blue-600"
                  max={summary.total}
                  value={summary.completed}
                />
                <p className="text-sm text-slate-600">
                  {summary.completed}/{summary.total} dự án đã hoàn thành
                </p>
              </section>
            )}
          </>
        ) : dashboardError ? (
          <div role="alert">
            <p>{dashboardError}</p>
            {onDashboardRetry && (
              <button onClick={onDashboardRetry}>Thử lại</button>
            )}
          </div>
        ) : (
          <p role="status">Đang tải tổng quan dự án…</p>
        )}
      </section>
      <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        {children}
        {error ? (
          <div role="alert">
            <p>{error}</p>
            {onRetry && <button onClick={onRetry}>Thử lại</button>}
          </div>
        ) : loading || !data ? (
          <p role="status">Đang tải dự án…</p>
        ) : !data.items.length ? (
          <p>Chưa có dự án phù hợp.</p>
        ) : (
          <ProjectTable
            items={data.items}
            onProjectDeleted={onProjectDeleted}
          />
        )}
        {pagination}
      </section>
    </>
  );
}

export function ProjectsPage({
  mine = false,
  stageOneMode,
}: {
  mine?: boolean;
  stageOneMode?: StageOneMode;
}) {
  const [data, setData] = useState<Page>();
  const [dashboard, setDashboard] = useState<Dashboard>();
  const [dashboardError, setDashboardError] = useState('');
  const [stageRows, setStageRows] = useState<StageOneRow<Project>[]>();
  const [search, setSearch] = useState('');
  const [currentStage, setCurrentStage] = useState('');
  const [status, setStatus] = useState('');
  const [health, setHealth] = useState('');
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState('');
  const [listFailed, setListFailed] = useState(false);
  const loadGeneration = useRef(0);
  const dashboardGeneration = useRef(0);
  const invalidateLoad = useCallback(() => ++loadGeneration.current, []);
  const invalidateDashboardLoad = useCallback(
    () => ++dashboardGeneration.current,
    [],
  );
  const loadDashboard = useCallback(async () => {
    const request = ++dashboardGeneration.current;
    await loadProjectDashboard({
      callbacks: {
        onStart: () => {
          setDashboard(undefined);
          setDashboardError('');
        },
        onData: (value) => {
          setDashboard(value);
          setDashboardError('');
        },
        onError: setDashboardError,
      },
      isCurrent: () => request === dashboardGeneration.current,
    });
  }, []);
  const load = useCallback(async () => {
    const request = ++loadGeneration.current;
    await loadProjectsPage({
      callbacks: {
        onStart: () => {
          setListFailed(false);
          setMessage('');
          setStageRows(undefined);
        },
        onData: setData,
        onRows: (rows, partialMessage) => {
          setStageRows(rows);
          if (partialMessage) setMessage(partialMessage);
        },
        onListError: (error) => {
          setData(undefined);
          setStageRows(undefined);
          setMessage(error);
          setListFailed(true);
        },
      },
      isCurrent: () => request === loadGeneration.current,
      path: projectListPath({
        currentStage,
        health,
        mine,
        page,
        search,
        status,
      }),
      stageOneMode,
    });
  }, [currentStage, health, mine, page, search, stageOneMode, status]);
  useEffect(() => {
    const timeout = setTimeout(() => void load(), 0);
    return () => {
      clearTimeout(timeout);
      invalidateLoad();
    };
  }, [invalidateLoad, load]);
  useEffect(() => {
    if (mine || stageOneMode) return;
    const timeout = setTimeout(() => void loadDashboard(), 0);
    return () => {
      clearTimeout(timeout);
      invalidateDashboardLoad();
    };
  }, [invalidateDashboardLoad, loadDashboard, mine, stageOneMode]);
  const visibleStageRows = stageRows ?? [];
  const filters = (
    <div className="flex flex-wrap gap-3">
      <input
        aria-label="Tìm dự án"
        autoComplete="off"
        id="project-search"
        name="search"
        placeholder="Tìm mã hoặc tên…"
        value={search}
        onChange={(event) =>
          applyProjectFilter(event.target.value, setSearch, setPage)
        }
      />
      <select
        aria-label="Giai đoạn hiện tại"
        id="project-stage-filter"
        name="currentStage"
        value={currentStage}
        onChange={(event) =>
          applyProjectFilter(event.target.value, setCurrentStage, setPage)
        }
      >
        <option value="">Tất cả giai đoạn</option>
        {projectStages.map((value) => (
          <option key={value} value={value}>
            {projectDomainLabel('stage', value)}
          </option>
        ))}
      </select>
      <select
        aria-label="Trạng thái"
        id="project-status-filter"
        name="status"
        value={status}
        onChange={(event) =>
          applyProjectFilter(event.target.value, setStatus, setPage)
        }
      >
        <option value="">Tất cả trạng thái</option>
        {['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'].map(
          (value) => (
            <option key={value} value={value}>
              {projectDomainLabel('status', value)}
            </option>
          ),
        )}
      </select>
      <select
        aria-label="Sức khỏe"
        id="project-health-filter"
        name="health"
        value={health}
        onChange={(event) =>
          applyProjectFilter(event.target.value, setHealth, setPage)
        }
      >
        <option value="">Tất cả sức khỏe</option>
        {['ON_TRACK', 'AT_RISK', 'OFF_TRACK'].map((value) => (
          <option key={value} value={value}>
            {projectDomainLabel('status', value)}
          </option>
        ))}
      </select>
    </div>
  );
  return (
    <div className="mx-auto grid w-full max-w-[1280px] gap-5">
      <p className="text-sm text-black/55">Trang chủ / Dự án</p>
      {(stageOneMode || mine) && (
        <header>
          <h1 className="text-2xl font-semibold">
            {stageOneMode === 'actions'
              ? 'Việc cần xử lý'
              : stageOneMode === 'alerts'
                ? 'Cảnh báo dự án'
                : 'Dự án của tôi'}
          </h1>
          <p className="text-sm text-black/60">
            {stageOneMode
              ? 'Tình trạng Giai đoạn 1 từ các dự án bạn được phép xem'
              : 'Các dự án bạn trực tiếp tham gia.'}
          </p>
        </header>
      )}
      {!stageOneMode && !mine && (
        <DashboardView
          data={data}
          dashboardError={dashboardError || undefined}
          error={listFailed ? message : undefined}
          loading={!data}
          onDashboardRetry={() => void loadDashboard()}
          onRetry={() => void load()}
          pagination={
            <div className="flex justify-end gap-2">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Trước
              </button>
              <span className="px-3 py-2">
                {page}/{data?.totalPages || 1}
              </span>
              <button
                disabled={!data || page >= data.totalPages}
                onClick={() => setPage(page + 1)}
              >
                Sau
              </button>
            </div>
          }
          summary={dashboard}
          onProjectDeleted={async () => {
            await Promise.all([load(), loadDashboard()]);
          }}
        >
          {filters}
          {message && !listFailed && <p role="alert">{message}</p>}
        </DashboardView>
      )}
      {(stageOneMode || mine) && (
        <section className="panel grid gap-4">
          {filters}
          {message && !listFailed && <p role="alert">{message}</p>}
          {listFailed ? (
            <div role="alert">
              <p>{message}</p>
              <button onClick={() => void load()}>Thử lại</button>
            </div>
          ) : !data ? (
            <p role="status">Đang tải dự án…</p>
          ) : stageOneMode && !stageRows ? (
            <p role="status">Đang tải tình trạng Stage 1…</p>
          ) : stageOneMode && !visibleStageRows.length ? (
            <p>Không có mục Stage 1 phù hợp.</p>
          ) : stageOneMode === 'actions' ? (
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>Mã</th>
                    <th>Dự án</th>
                    <th>Readiness</th>
                    <th>Việc cần xử lý</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleStageRows
                    .filter(
                      (row): row is Extract<typeof row, { type: 'action' }> =>
                        row.type === 'action',
                    )
                    .map((row) => (
                      <tr key={row.project.id}>
                        <td>{row.project.code}</td>
                        <td>
                          <Link
                            className="underline"
                            href={`/projects/${row.project.id}/stage-1`}
                          >
                            {row.project.name}
                          </Link>
                        </td>
                        <td>{row.readinessStatus}</td>
                        <td>
                          {row.redFlags.length
                            ? row.redFlags.map(({ title }) => title).join('; ')
                            : 'Stage 1 chưa hoàn tất.'}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : stageOneMode === 'alerts' ? (
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>Mã</th>
                    <th>Dự án</th>
                    <th>Mức độ</th>
                    <th>Cảnh báo</th>
                    <th>Khắc phục</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleStageRows
                    .filter(
                      (row): row is Extract<typeof row, { type: 'alert' }> =>
                        row.type === 'alert',
                    )
                    .map((row) => (
                      <tr key={`${row.project.id}:${row.code}`}>
                        <td>{row.project.code}</td>
                        <td>
                          <Link
                            className="underline"
                            href={`/projects/${row.project.id}/stage-1`}
                          >
                            {row.project.name}
                          </Link>
                        </td>
                        <td>{row.severity}</td>
                        <td>{row.title}</td>
                        <td>{row.remediation}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : !data.items.length ? (
            <p>Chưa có dự án phù hợp.</p>
          ) : (
            <ProjectTable items={data.items} />
          )}
          <div className="flex justify-end gap-2">
            <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Trước
            </button>
            <span className="px-3 py-2">
              {page}/{data?.totalPages || 1}
            </span>
            <button
              disabled={!data || page >= data.totalPages}
              onClick={() => setPage(page + 1)}
            >
              Sau
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

export default function AllProjectsPage() {
  return <ProjectsPage />;
}
