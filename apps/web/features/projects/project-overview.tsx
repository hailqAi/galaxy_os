'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, Actor } from '../../app/lib/api';
import { projectDomainLabel } from './project-domain-labels';
import {
  ProjectWorkspaceHeader,
  projectGroups,
} from './project-workspace-header';

type Project = {
  id: string;
  name: string;
  code: string;
  status: string;
  healthStatus: string;
  customer: { displayName: string };
  projectManager: { displayName: string } | null;
  expectedCompletionDate: string | null;
};
type Task = {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
  assignees: { user: { displayName: string } }[];
};
type Contract = {
  id: string;
  contractNumber: string;
  status: string;
  currentValue: string;
  currency: string;
};
type Product = {
  id: string;
  code: string;
  positionName: string | null;
  lifecycleStatus: string;
  blocker: string | null;
  revisions: {
    customProductName: string | null;
    product: { name: string } | null;
  }[];
};
type Activity = {
  id: string;
  event: string;
  description: string | null;
  createdAt: string;
  actor: { displayName: string } | null;
};
type Overview = {
  project: Project;
  permissions: string[];
  tasks?: Task[];
  contracts?: Contract[];
  products?: { items: Product[]; total: number };
  activity?: Activity[];
  aiEnabled?: boolean;
  errors?: string[];
};
const date = (value: string | null) =>
  value ? new Date(value).toLocaleDateString('vi-VN') : 'Chưa xác định';

export function ProjectOverviewView({
  project,
  permissions,
  tasks,
  contracts,
  products,
  activity,
  aiEnabled,
  errors = [],
}: Overview) {
  const base = `/projects/${project.id}`;
  const signed = contracts?.filter((c) =>
    ['SIGNED', 'ACTIVE', 'SUSPENDED', 'COMPLETED'].includes(c.status),
  );
  return (
    <div className="project-overview grid gap-5">
      <ProjectWorkspaceHeader
        projectId={project.id}
        name={project.name}
        code={project.code}
        active="overview"
        permissions={permissions}
        aiEnabled={aiEnabled}
      />
      {!!errors.length && (
        <p role="alert" className="panel">
          {errors.join(' · ')}
        </p>
      )}
      <section className="panel flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="eyebrow">Cam kết với khách hàng</span>
          <p className="mt-2 font-semibold">
            {signed
              ? signed.length
                ? 'Đã có hợp đồng ký'
                : 'Chưa ghi nhận hợp đồng ký'
              : 'Chưa có dữ liệu cam kết được phép hiển thị'}
          </p>
          <small>Khách hàng: {project.customer.displayName}</small>
        </div>
        <div>
          <span className="eyebrow">Tình trạng thực hiện</span>
          <p className="mt-2 font-semibold">
            {projectDomainLabel('status', project.status)}
          </p>
          <small>{projectDomainLabel('status', project.healthStatus)}</small>
        </div>
        <div>
          <span className="eyebrow">Quản lý dự án</span>
          <p className="mt-2">
            {project.projectManager?.displayName ?? 'Chưa phân công'}
          </p>
        </div>
      </section>
      <div className="overview-main-grid">
        <section className="panel !p-0">
          <div className="card-heading">
            <h2>Việc ưu tiên</h2>
            {permissions.includes('task.read') && (
              <Link href={`/tasks?tab=all&projectId=${project.id}&open=true`}>
                Xem tất cả →
              </Link>
            )}
          </div>
          {tasks?.length ? (
            <ul className="divide-y">
              {tasks.map((task) => (
                <li
                  key={task.id}
                  className="flex flex-wrap items-start justify-between gap-3 p-5"
                >
                  <div>
                    <Link className="font-semibold" href={`/tasks/${task.id}`}>
                      {task.title}
                    </Link>
                    <p className="mt-1 text-xs text-slate-500">
                      {task.assignees
                        .map((a) => a.user.displayName)
                        .join(', ') || 'Chưa phân công'}{' '}
                      · Hạn: {date(task.dueDate)}
                    </p>
                  </div>
                  <span className="status-pill">
                    {projectDomainLabel('status', task.status)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-state">
              {tasks
                ? 'Không có việc đang mở trong phạm vi được đọc.'
                : 'Chưa có dữ liệu công việc được phép hiển thị.'}
            </p>
          )}
          <p className="px-5 pb-4 text-xs text-slate-500">
            Tối đa 8 việc đang mở, hạn gần nhất trước. Mở công việc để xem nguồn
            và xử lý.
          </p>
        </section>
        <section className="panel milestone-card">
          <span className="eyebrow">Mốc tiếp theo</span>
          <h2 className="mt-3 font-semibold">
            {tasks?.find((t) => t.dueDate)?.title ?? 'Dự kiến hoàn thành dự án'}
          </h2>
          <p className="my-5 text-2xl font-bold">
            {date(
              tasks?.find((t) => t.dueDate)?.dueDate ??
                project.expectedCompletionDate,
            )}
          </p>
          <p className="text-sm text-slate-500">
            {tasks?.find((t) => t.dueDate)
              ? 'Hạn công việc đang mở từ hồ sơ dự án.'
              : 'Ngày dự kiến trong hồ sơ; chưa phải cam kết hợp đồng.'}
          </p>
          <Link className="mt-5 inline-block text-sm" href={`${base}/stage-1`}>
            Xem quy trình hiện hữu →
          </Link>
        </section>
      </div>
      <section>
        <div className="mb-3 flex justify-between">
          <h2 className="font-semibold">Bốn nhóm chuyên môn</h2>
          <Link className="text-sm" href={`${base}/work`}>
            Mở không gian làm việc →
          </Link>
        </div>
        <div className="group-card-grid">
          {projectGroups.map(([group, label], index) => (
            <Link
              className="panel group-card"
              key={group}
              href={`${base}/work?group=${group}`}
            >
              <span className="group-number">0{index + 1}</span>
              <h3 className="my-3 font-semibold">{label}</h3>
              <p className="text-xs text-slate-500">
                Trao đổi, công việc ghim và nguồn theo quyền.
              </p>
              <span className="mt-5 block text-xs">Mở nhóm →</span>
            </Link>
          ))}
        </div>
      </section>
      <div className="overview-main-grid">
        <section className="panel !p-0">
          <div className="card-heading">
            <h2>Hạng mục dự án{products ? ` (${products.total})` : ''}</h2>
            {permissions.includes('project.product.view') && (
              <Link href={`${base}/products`}>Xem tất cả →</Link>
            )}
          </div>
          {products?.items.length ? (
            <ul className="divide-y">
              {products.items.map((item) => (
                <li className="p-4" key={item.id}>
                  <Link
                    className="font-semibold"
                    href={`${base}/products/${item.id}`}
                  >
                    {item.code} ·{' '}
                    {item.revisions[0]?.product?.name ??
                      item.revisions[0]?.customProductName ??
                      item.positionName ??
                      'Hạng mục'}
                  </Link>
                  <p className="mt-2 text-xs">
                    {item.blocker ?? 'Chưa ghi nhận vướng mắc'}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-state">
              {products
                ? 'Chưa có hạng mục trong dự án.'
                : 'Chưa có dữ liệu hạng mục được phép hiển thị.'}
            </p>
          )}
        </section>
        <section className="panel">
          <h2 className="font-semibold">Tài chính dự án</h2>
          <p className="mt-2 text-xs text-slate-500">
            Giá trị theo từng hợp đồng; tách đồng tiền. Đây không phải tiền đã
            thu.
          </p>
          {signed?.length ? (
            <ul className="mt-4 divide-y">
              {signed.map((c) => (
                <li className="py-3" key={c.id}>
                  <Link href={`${base}/contracts/${c.id}`}>
                    {c.contractNumber}
                  </Link>
                  <strong className="mt-2 block">
                    {c.currentValue.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}{' '}
                    {c.currency}
                  </strong>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-state">
              {contracts
                ? 'Chưa có hợp đồng ký để hiển thị giá trị.'
                : 'Chưa có dữ liệu tài chính được phép hiển thị'}
            </p>
          )}
          {permissions.includes('contract.read') && (
            <Link className="text-sm" href={`${base}/contracts`}>
              Mở hợp đồng & lịch thanh toán →
            </Link>
          )}
        </section>
      </div>
      <section className="panel">
        <div className="mb-4 flex justify-between">
          <h2 className="font-semibold">Hoạt động gần đây</h2>
          <Link className="text-sm" href={`${base}/activity`}>
            Xem lịch sử →
          </Link>
        </div>
        {activity?.length ? (
          <ul className="divide-y">
            {activity.slice(0, 6).map((item) => (
              <li
                className="flex flex-wrap justify-between gap-3 py-3"
                key={item.id}
              >
                <Link href={`${base}/activity`}>
                  <strong>{item.actor?.displayName ?? 'Hệ thống'}</strong> ·{' '}
                  {item.description ??
                    projectDomainLabel('activity', item.event)}
                </Link>
                <time className="text-xs text-slate-500">
                  {new Date(item.createdAt).toLocaleString('vi-VN')}
                </time>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">
            Chưa có hoạt động trong hồ sơ được đọc.
          </p>
        )}
      </section>
    </div>
  );
}

export function ProjectOverview({ projectId }: { projectId: string }) {
  const [data, setData] = useState<Overview>();
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController(),
      init = { signal: controller.signal };
    void Promise.all([
      api<Actor>('/me', init),
      api<{ project: Project }>(
        `/projects/${projectId}/workspace-summary`,
        init,
      ),
    ])
      .then(async ([actor, summary]) => {
        const result: Overview = {
          project: summary.project,
          permissions: actor.permissions,
          errors: [],
        };
        const read = async <T,>(
          permission: string,
          path: string,
          apply: (value: T) => void,
          label: string,
        ) => {
          if (!actor.permissions.includes(permission)) return;
          try {
            apply(await api<T>(path, init));
          } catch (e) {
            if (!controller.signal.aborted)
              result.errors!.push(`${label}: ${(e as Error).message}`);
          }
        };
        await Promise.all([
          read<{ items: Task[] }>(
            'task.read',
            `/tasks?projectId=${projectId}&open=true&pageSize=8&sort=dueDate&direction=asc`,
            (page) => {
              result.tasks = page.items;
            },
            'Công việc',
          ),
          read<Contract[]>(
            'contract.read',
            `/projects/${projectId}/contracts`,
            (value) => {
              result.contracts = value;
            },
            'Hợp đồng',
          ),
          read<Overview['products']>(
            'project.product.view',
            `/projects/${projectId}/products?pageSize=5`,
            (value) => {
              result.products = value;
            },
            'Hạng mục',
          ),
          read<Activity[]>(
            'project.read',
            `/projects/${projectId}/timeline`,
            (value) => {
              result.activity = value;
            },
            'Hoạt động',
          ),
          api<{ aiEnabled: boolean; authorityActions: string[] }>(
            `/project-chat/projects/${projectId}/rooms`,
            init,
          )
            .then((value) => {
              result.aiEnabled =
                value.aiEnabled && value.authorityActions.includes('INVOKE');
            })
            .catch(() => undefined),
        ]);
        if (!controller.signal.aborted) setData(result);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError((e as Error).message);
      });
    return () => controller.abort();
  }, [projectId, revision]);
  return error ? (
    <section className="panel empty-state" role="alert">
      <p>{error}</p>
      <button
        onClick={() => {
          setError('');
          setData(undefined);
          setRevision((value) => value + 1);
        }}
      >
        Thử lại
      </button>
    </section>
  ) : data ? (
    <ProjectOverviewView {...data} />
  ) : (
    <p role="status" className="panel">
      Đang tải tổng quan dự án…
    </p>
  );
}
