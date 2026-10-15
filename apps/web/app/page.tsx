'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Actor, api, ApiError } from './lib/api';
import { projectDomainLabel } from '../features/projects/project-domain-labels';

export type Dashboard = {
  asOf: string;
  scope: string;
  kpis: {
    activeLeads: number | null;
    activeProjects: number | null;
    overdueTasks: number | null;
  };
  opportunityValues?: { currency: string; value: string }[];
  pipeline: { stage: string; count: number }[];
  projectHealth: { health: string; count: number }[];
  activity?: {
    id: string;
    entityId: string;
    projectName: string;
    event: string;
    createdAt: string;
    actor: { displayName: string } | null;
  }[];
  attentionTasks: {
    id: string;
    title: string;
    status: string;
    priority: string;
    dueDate: string | null;
    project: { id: string; name: string } | null;
    assignees: { user: { displayName: string } }[];
  }[];
};
type Portfolio = {
  receivableValues?: Amount[];
  payableValues?: Amount[];
  receivedValues?: Amount[];
  contractValues?: Amount[];
};
type Amount = { currency: string; value: string };
export function decimalLabel(value: string) {
  const [whole = '', fraction] = value.split('.');
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}${fraction ? `,${fraction}` : ''}`;
}
function amounts(values?: Amount[]) {
  return values?.length
    ? values.map((v) => `${decimalLabel(v.value)} ${v.currency}`).join(' · ')
    : 'Chưa có dữ liệu';
}
const healthNames: Record<string, string> = {
  ON_TRACK: 'Đúng tiến độ',
  AT_RISK: 'Có nguy cơ',
  OFF_TRACK: 'Chậm tiến độ',
};
const healthColors: Record<string, string> = {
  ON_TRACK: '#10b981',
  AT_RISK: '#f59e0b',
  OFF_TRACK: '#f43f5e',
};
const stageNames: Record<string, string> = {
  DISCOVERY: 'Khám phá',
  REQUIREMENT: 'Yêu cầu',
  DESIGN_PREPARATION: 'Chuẩn bị thiết kế',
  QUALIFICATION: 'Xác định nhu cầu',
  SURVEY: 'Khảo sát',
  PROPOSAL: 'Phương án',
  QUOTATION: 'Báo giá',
  NEGOTIATION: 'Thương lượng',
  WON: 'Thành công',
  LOST: 'Không thành công',
};

export function OperationalDashboard({
  data,
  portfolio,
  error,
  onRefresh,
}: {
  data?: Dashboard;
  portfolio?: Portfolio;
  error?: string;
  onRefresh?: () => void;
}) {
  const [operation, setOperation] = useState('Tài chính');
  const healthTotal =
    data?.projectHealth.reduce((sum, item) => sum + item.count, 0) ?? 0;
  const gradient = data?.projectHealth
    .reduce<{ end: number; stops: string[] }>(
      (result, item) => {
        const end =
          result.end + (healthTotal ? (item.count / healthTotal) * 100 : 0);
        return {
          end,
          stops: [
            ...result.stops,
            `${healthColors[item.health] ?? '#94a3b8'} ${result.end}% ${end}%`,
          ],
        };
      },
      { end: 0, stops: [] },
    )
    .stops.join(', ');
  const maxStage = Math.max(
    1,
    ...(data?.pipeline.map((item) => item.count) ?? []),
  );
  return (
    <div className="galaxy-dashboard grid gap-6">
      <p className="breadcrumb">
        <Link href="/">Trang chủ</Link>
        <span>/</span>Tổng quan
      </p>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Tổng quan Galaxy OS</h1>
          <p className="mt-2 text-xs text-slate-500">
            {data ? (
              <>
                Dữ liệu tại{' '}
                <time dateTime={data.asOf}>
                  {new Date(data.asOf).toLocaleString('vi-VN')}
                </time>
              </>
            ) : (
              'Tổng quan vận hành theo quyền truy cập'
            )}
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="scope-chip">
            Phạm vi: <strong>Theo quyền của bạn</strong>
          </span>
          <button aria-label="Làm mới tổng quan" onClick={onRefresh}>
            ↻
          </button>
        </div>
      </header>
      {error ? (
        <section className="panel empty-state" role="alert">
          <h2>Không thể tải tổng quan</h2>
          <p>{error}</p>
          <button onClick={onRefresh}>Thử lại</button>
        </section>
      ) : !data ? (
        <section
          className="kpi-grid"
          role="status"
          aria-label="Đang tải tổng quan"
        >
          {[0, 1, 2, 3].map((n) => (
            <div className="panel skeleton-card" key={n}>
              <div />
              <div />
              <div />
            </div>
          ))}
        </section>
      ) : (
        <>
          <section className="kpi-grid" aria-label="Chỉ tiêu tổng quan">
            {[
              {
                label: 'Hồ sơ tiềm năng',
                value: data.kpis.activeLeads,
                icon: '◎',
                note: 'Đang xử lý, trong phạm vi được cấp',
                href: '/crm/leads?active=true',
                tone: 'blue',
              },
              {
                label: 'Giá trị cơ hội',
                value: amounts(data.opportunityValues),
                icon: '₫',
                note: data.opportunityValues
                  ? 'Chưa kết thúc · tách theo đồng tiền'
                  : 'Chưa có dữ liệu được phép hiển thị',
                href: '/crm/opportunities?active=true&financial=true',
                tone: 'green',
              },
              {
                label: 'Dự án đang thực hiện',
                value: data.kpis.activeProjects,
                icon: '▦',
                note: 'Lập kế hoạch và đang thực hiện',
                href: '/projects?active=true',
                tone: 'purple',
              },
              {
                label: 'Công việc quá hạn',
                value: data.kpis.overdueTasks,
                icon: '◷',
                note: 'Chưa hoàn tất, hạn trước thời điểm cập nhật',
                href: '/tasks?tab=overdue',
                tone: 'red',
              },
            ].map((item) => (
              <div className={`panel kpi-card ${item.tone}`} key={item.label}>
                <span className="kpi-icon" aria-hidden="true">
                  {item.icon}
                </span>
                <p>{item.label}</p>
                <strong>{item.value ?? 'Chưa được cấp'}</strong>
                <small>{item.note}</small>
                {item.value !== null && (
                  <Link
                    href={item.href}
                    className="card-link"
                    aria-label={`Xem ${item.label.toLowerCase()}`}
                  >
                    Xem chi tiết →
                  </Link>
                )}
              </div>
            ))}
          </section>
          <section className="panel data-panel">
            <header className="section-heading">
              <h2>Ưu tiên xử lý</h2>
              <span className="text-sm text-slate-500">
                Tối đa 8 việc đang mở · hạn gần nhất trước
              </span>
              <Link href="/tasks?tab=all">Xem tất cả →</Link>
            </header>
            {!data.attentionTasks.length ? (
              <div className="empty-state">
                <h3>Chưa có công việc trong phạm vi này</h3>
                <p>
                  Công việc sẽ xuất hiện khi bạn được phân công hoặc được cấp
                  quyền.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="priority-table">
                  <thead>
                    <tr>
                      <th>Công việc & dự án</th>
                      <th>Phụ trách</th>
                      <th>Hạn xử lý</th>
                      <th>Trạng thái</th>
                      <th>Hành động</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.attentionTasks.map((task) => (
                      <tr key={task.id}>
                        <td>
                          <Link
                            className="font-semibold"
                            href={`/tasks/${task.id}`}
                          >
                            {task.title}
                          </Link>
                          {task.project && (
                            <Link
                              className="mt-1 block text-xs text-slate-500"
                              href={`/projects/${task.project.id}/overview`}
                            >
                              {task.project.name}
                            </Link>
                          )}
                        </td>
                        <td>
                          {task.assignees
                            .map((a) => a.user.displayName)
                            .join(', ') || 'Chưa phân công'}
                        </td>
                        <td>
                          {task.dueDate
                            ? new Date(task.dueDate).toLocaleDateString('vi-VN')
                            : 'Chưa có hạn'}
                        </td>
                        <td>
                          <span
                            className={`status-badge ${task.status === 'BLOCKED' ? 'danger' : ''}`}
                          >
                            {projectDomainLabel('status', task.status)}
                          </span>
                        </td>
                        <td>
                          <Link
                            className="secondary-link"
                            href={`/tasks/${task.id}`}
                          >
                            Mở công việc
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="panel">
              <header className="section-heading">
                <h2>Cơ hội đang theo dõi</h2>
                <Link href="/opportunities">Xem cơ hội →</Link>
              </header>
              <p className="text-xs text-slate-500">
                Số hồ sơ hiện tại theo trạng thái · không phải tỷ lệ chuyển đổi
              </p>
              <div className="pipeline-chart">
                {data.pipeline.length ? (
                  data.pipeline.map((stage) => (
                    <Link
                      key={stage.stage}
                      href={`/crm/opportunities?stage=${stage.stage}`}
                      className="pipeline-row"
                    >
                      <span>
                        {stageNames[stage.stage] ??
                          projectDomainLabel('status', stage.stage)}
                      </span>
                      <span
                        className="pipeline-bar"
                        style={{
                          width: `${Math.max(8, (stage.count / maxStage) * 100)}%`,
                        }}
                      >
                        {stage.count}
                      </span>
                    </Link>
                  ))
                ) : (
                  <p className="empty-state">
                    Chưa có dữ liệu cơ hội trong phạm vi này.
                  </p>
                )}
              </div>
            </section>
            <section className="panel">
              <header className="section-heading">
                <h2>Sức khỏe dự án</h2>
                <Link href="/projects">Xem dự án →</Link>
              </header>
              {healthTotal ? (
                <div className="health-chart">
                  <div
                    className="health-ring"
                    role="img"
                    aria-label={`${healthTotal} dự án theo quyền xem`}
                    style={{ background: `conic-gradient(${gradient})` }}
                  >
                    <div>
                      <strong>{healthTotal}</strong>
                      <small>Dự án được phép xem</small>
                    </div>
                  </div>
                  <ul>
                    {data.projectHealth.map((item) => (
                      <li key={item.health}>
                        <Link href={`/projects?health=${item.health}`}>
                          <i
                            style={{ background: healthColors[item.health] }}
                          />
                          {healthNames[item.health] ?? item.health}
                          <strong>{item.count}</strong>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="empty-state">Chưa có dữ liệu sức khỏe dự án.</p>
              )}
            </section>
          </div>
          <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
            <section className="panel">
              <header className="section-heading">
                <h2>Theo dõi vận hành</h2>
                <div className="segmented">
                  {['Tài chính', 'Cung ứng', 'Thi công'].map((label) => (
                    <button
                      key={label}
                      aria-pressed={operation === label}
                      onClick={() => setOperation(label)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </header>
              {operation === 'Tài chính' ? (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {[
                      ['Tổng phải thu', portfolio?.receivableValues],
                      ['Tổng phải trả', portfolio?.payableValues],
                      ['Tiền đã thu', portfolio?.receivedValues],
                      ['Giá trị hợp đồng', portfolio?.contractValues],
                    ].map(([label, values]) => (
                      <div className="metric-box" key={String(label)}>
                        <p>{String(label)}</p>
                        <strong>
                          {amounts(values as Amount[] | undefined)}
                        </strong>
                      </div>
                    ))}
                  </div>
                  <p className="mt-4 text-xs text-slate-500">
                    Snapshot toàn bộ dự án được phép đọc từng chỉ tiêu; tách
                    theo currency. Phải thu là nghĩa vụ còn lại, khác tiền đã
                    thu. Không có dữ liệu sẽ không hiển thị số 0 giả.
                  </p>
                  <Link
                    className="mt-4 inline-block card-link"
                    href="/projects"
                  >
                    Mở dự án để xem căn cứ →
                  </Link>
                </>
              ) : (
                <div className="empty-state">
                  <h3>
                    Chưa có chuỗi dữ liệu tổng hợp {operation.toLowerCase()}
                  </h3>
                  <p>
                    Xem hồ sơ và công việc ở từng dự án để kiểm tra thực trạng.
                  </p>
                  <Link className="secondary-link" href="/projects">
                    Mở danh sách dự án
                  </Link>
                </div>
              )}
            </section>
            <section className="panel">
              <header className="section-heading">
                <h2>Hoạt động gần đây</h2>
              </header>
              {data.activity?.length ? (
                <ul className="divide-y">
                  {data.activity.map((item) => (
                    <li className="py-3" key={item.id}>
                      <Link href={`/projects/${item.entityId}/activity`}>
                        <strong>{item.projectName}</strong>
                        <p>
                          {projectDomainLabel('activity', item.event)} ·{' '}
                          {item.actor?.displayName ?? 'Hệ thống'}
                        </p>
                      </Link>
                      <time className="text-xs text-slate-500">
                        {new Date(item.createdAt).toLocaleString('vi-VN')}
                      </time>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="empty-state">
                  <p>Chưa có hoạt động dự án trong phạm vi được cấp quyền.</p>
                  <Link className="secondary-link" href="/projects">
                    Mở hồ sơ dự án →
                  </Link>
                </div>
              )}
              <div className="publication-note">
                <h3>Hồ sơ đã phát hành</h3>
                <p>
                  Ấn bản và lịch sử phát hành nằm trong phòng khách của dự án.
                </p>
                <Link href="/work">Mở không gian làm việc →</Link>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<Dashboard>();
  const [portfolio, setPortfolio] = useState<Portfolio>();
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api<Dashboard>('/dashboard', { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) {
          setData(value);
          setError('');
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          setData(undefined);
          setError(
            cause instanceof ApiError && cause.status === 403
              ? 'Bạn chưa được cấp quyền xem tổng quan.'
              : 'Không thể tải dữ liệu. Vui lòng thử lại.',
          );
        }
      });
    api<Actor>('/me', { signal: controller.signal })
      .then(async (actor) => {
        if (actor.permissions.includes('project.read')) {
          const value = await api<Portfolio>('/projects/dashboard', {
            signal: controller.signal,
          });
          if (!controller.signal.aborted) setPortfolio(value);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setPortfolio(undefined);
      });
    return () => controller.abort();
  }, [revision]);
  return (
    <OperationalDashboard
      data={data}
      portfolio={portfolio}
      error={error}
      onRefresh={() => {
        setData(undefined);
        setPortfolio(undefined);
        setRevision((r) => r + 1);
      }}
    />
  );
}
