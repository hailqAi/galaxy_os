'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Actor, api } from '../../../lib/api';
import { ProjectWorkspaceHeader } from '../../../../features/projects/project-workspace-header';
import { projectDomainLabel } from '../../../../features/projects/project-domain-labels';

type Revision = {
  revision: number;
  product: { name: string; brand?: { name: string } } | null;
  customProductName: string | null;
  material: string | null;
  finish: string | null;
  quantity: string;
  unit: string;
  customerApprovalStatus: string;
  technicalApprovalStatus: string;
  commercialApprovalStatus: string;
};
type Line = {
  id: string;
  code: string;
  positionName: string | null;
  currentRevision: number;
  lifecycleStatus: string;
  blocker: string | null;
  nextAction?: string | null;
  location: { name: string } | null;
  revisions: Revision[];
};
type Page = { items: Line[]; total: number; page: number; totalPages: number };
const lifecycle: Record<string, string> = {
  REQUIREMENT: 'Ghi nhận nhu cầu',
  SHORTLISTING: 'Lựa chọn phương án',
  CLIENT_REVIEW: 'Khách đang xem xét',
  CLIENT_APPROVED: 'Khách duyệt cấu hình',
  TECHNICAL_REVIEW: 'Thẩm định kỹ thuật',
  COMMERCIAL_REVIEW: 'Thẩm định thương mại',
  READY_FOR_ESTIMATE: 'Sẵn sàng dự toán',
  ESTIMATED: 'Đã lập dự toán',
  QUOTED: 'Đã báo giá',
  CONTRACTED: 'Đã đưa vào hợp đồng',
  READY_TO_ORDER: 'Sẵn sàng đặt hàng',
  ORDERED: 'Đã đặt hàng',
  IN_PRODUCTION: 'Đang sản xuất',
  READY_TO_SHIP: 'Sẵn sàng giao',
  IN_TRANSIT: 'Đang vận chuyển',
  WAREHOUSE_RECEIVED: 'Đã nhập kho',
  READY_FOR_INSTALLATION: 'Sẵn sàng lắp đặt',
  INSTALLED: 'Đã lắp đặt',
  ACCEPTED: 'Đã nghiệm thu',
  HANDED_OVER: 'Đã bàn giao',
  UNDER_WARRANTY: 'Đang bảo hành',
  CLOSED: 'Đã đóng',
  CANCELLED: 'Đã hủy',
};
const current = (line: Line) =>
  line.revisions.find((r) => r.revision === line.currentRevision) ??
  line.revisions[0];
export function ProductTable({
  projectId,
  items,
  onSelect,
}: {
  projectId: string;
  items: Line[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="product-table">
        <thead>
          <tr>
            <th>Hạng mục / Cấu hình</th>
            <th>Khu vực</th>
            <th>Phê duyệt cấu hình</th>
            <th>Tình trạng thực hiện</th>
            <th>Vướng mắc</th>
            <th>Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {items.map((line) => {
            const revision = current(line);
            return (
              <tr key={line.id}>
                <td>
                  <button
                    className="item-title"
                    onClick={() => onSelect(line.id)}
                  >
                    {line.code} ·{' '}
                    {revision?.product?.name ??
                      revision?.customProductName ??
                      line.positionName ??
                      'Chưa có cấu hình'}
                  </button>
                  <p className="mt-2 text-xs text-slate-500">
                    {line.positionName} ·{' '}
                    {revision
                      ? `${revision.quantity} ${revision.unit} · Bản ${revision.revision}`
                      : 'Chưa có phiên bản'}
                  </p>
                </td>
                <td>{line.location?.name ?? 'Chưa xác định'}</td>
                <td>
                  {revision ? (
                    <div className="grid gap-1 text-xs">
                      <span>
                        Khách:{' '}
                        {projectDomainLabel(
                          'status',
                          revision.customerApprovalStatus,
                        )}
                      </span>
                      <span>
                        Kỹ thuật:{' '}
                        {projectDomainLabel(
                          'status',
                          revision.technicalApprovalStatus,
                        )}
                      </span>
                      <span>
                        Thương mại:{' '}
                        {projectDomainLabel(
                          'status',
                          revision.commercialApprovalStatus,
                        )}
                      </span>
                    </div>
                  ) : (
                    'Chưa có dữ liệu'
                  )}
                </td>
                <td>
                  <span className="status-pill">
                    {lifecycle[line.lifecycleStatus] ?? 'Chưa xác định'}
                  </span>
                </td>
                <td
                  className={line.blocker ? 'text-amber-800' : 'text-slate-500'}
                >
                  {line.blocker ?? 'Chưa ghi nhận'}
                </td>
                <td>
                  <Link href={`/projects/${projectId}/products/${line.id}`}>
                    Chi tiết →
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function ProjectProductsPage() {
  const projectId = String(useParams().projectId),
    query = useSearchParams();
  const [data, setData] = useState<Page>(),
    [actor, setActor] = useState<Actor>();
  const [projectName, setProjectName] = useState('Dự án');
  const [message, setMessage] = useState(''),
    [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState(''),
    [detail, setDetail] = useState<Line>(),
    [detailError, setDetailError] = useState('');
  const drawer = useRef<HTMLDialogElement>(null);
  const search = query.get('search') ?? '',
    approvalStatus = query.get('approvalStatus') ?? '',
    blocked = query.get('blocked') === 'true';
  const page = Math.max(1, Number(query.get('page')) || 1);
  const sort = query.get('sort') ?? 'updatedAt',
    direction = query.get('direction') ?? 'desc';
  const params = new URLSearchParams({
    page: String(page),
    pageSize: '20',
    sort,
    direction,
    ...(search && { search }),
    ...(approvalStatus && { approvalStatus }),
    ...(blocked && { blocked: 'true' }),
  }).toString();
  const change = (patch: Record<string, string>) => {
    const q = new URLSearchParams(params);
    q.set('page', '1');
    for (const [key, value] of Object.entries(patch))
      if (value) q.set(key, value);
      else q.delete(key);
    window.history.pushState(window.history.state, '', `?${q}`);
  };
  useEffect(() => {
    const controller = new AbortController(),
      init = { signal: controller.signal };
    api<Actor>('/me', init)
      .then((value) => {
        setActor(value);
        if (value.permissions.includes('project.read'))
          return api<{ name: string }>(`/projects/${projectId}`, init).then(
            (p) => setProjectName(p.name),
          );
      })
      .catch((e) => {
        if (!controller.signal.aborted) setMessage((e as Error).message);
      });
    return () => controller.abort();
  }, [projectId]);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setData(undefined);
      setMessage('');
      api<Page>(`/projects/${projectId}/products?${params}`, {
        signal: controller.signal,
      })
        .then((value) => {
          if (!controller.signal.aborted) setData(value);
        })
        .catch((e) => {
          if (!controller.signal.aborted) setMessage((e as Error).message);
        });
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [projectId, params, revision]);
  useEffect(() => {
    const controller = new AbortController();
    if (!selected) {
      drawer.current?.close();
      return;
    }
    drawer.current?.showModal();
    api<Line>(`/projects/${projectId}/products/${selected}`, {
      signal: controller.signal,
    })
      .then((value) => {
        if (!controller.signal.aborted) setDetail(value);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setDetailError((e as Error).message);
      });
    return () => controller.abort();
  }, [projectId, selected]);
  function selectLine(id: string) {
    setDetail(undefined);
    setDetailError('');
    setSelected(id);
  }
  const configuration = detail ? current(detail) : undefined;
  return (
    <div className="grid gap-5">
      <ProjectWorkspaceHeader
        projectId={projectId}
        name={projectName}
        active="products"
        permissions={actor?.permissions ?? []}
      />
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Hạng mục dự án</h2>
          <p className="mt-2 text-sm text-slate-500">
            Cấu hình, phê duyệt và tình trạng của cùng hồ sơ hạng mục.
          </p>
        </div>
        {actor?.permissions.includes('project.product.create') && (
          <Link
            className="primary rounded px-4 py-2"
            href={`/projects/${projectId}/products/new`}
          >
            + Tạo dòng sản phẩm
          </Link>
        )}
      </header>
      <section className="panel grid gap-4">
        <div className="flex flex-wrap gap-3">
          <input
            aria-label="Tìm sản phẩm dự án"
            placeholder="Tìm mã hoặc tên hạng mục…"
            value={search}
            onChange={(e) => change({ search: e.target.value })}
          />
          <select
            aria-label="Trạng thái phê duyệt"
            value={approvalStatus}
            onChange={(e) => change({ approvalStatus: e.target.value })}
          >
            <option value="">Tất cả phê duyệt</option>
            {[
              'DRAFT',
              'PENDING',
              'APPROVED',
              'APPROVED_WITH_COMMENTS',
              'REJECTED',
            ].map((value) => (
              <option key={value} value={value}>
                {projectDomainLabel('status', value)}
              </option>
            ))}
          </select>
          <select
            aria-label="Sắp xếp hạng mục"
            value={`${sort}:${direction}`}
            onChange={(e) => {
              const [sort, direction] = e.target.value.split(':');
              change({ sort: sort!, direction: direction! });
            }}
          >
            <option value="updatedAt:desc">Cập nhật mới nhất</option>
            <option value="code:asc">Mã tăng dần</option>
            <option value="lifecycleStatus:asc">Tình trạng thực hiện</option>
          </select>
          <button
            aria-pressed={blocked}
            onClick={() => change({ blocked: blocked ? '' : 'true' })}
          >
            Có vướng mắc
          </button>
        </div>
        {message ? (
          <div role="alert">
            <p>{message}</p>
            <button onClick={() => setRevision((n) => n + 1)}>Thử lại</button>
          </div>
        ) : !data ? (
          <p role="status">Đang tải hạng mục…</p>
        ) : data.items.length ? (
          <ProductTable
            projectId={projectId}
            items={data.items}
            onSelect={selectLine}
          />
        ) : (
          <p className="empty-state">Chưa có hạng mục phù hợp trong dự án.</p>
        )}
        <footer className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span>
            {data ? `${data.total} hạng mục phù hợp` : 'Đang tải số lượng'}
          </span>
          <div className="flex items-center gap-3">
            <button
              disabled={page <= 1}
              onClick={() => change({ page: String(page - 1) })}
            >
              Trước
            </button>
            <span>
              {page}/{data?.totalPages || 1}
            </span>
            <button
              disabled={!data || page >= data.totalPages}
              onClick={() => change({ page: String(page + 1) })}
            >
              Sau
            </button>
          </div>
        </footer>
      </section>
      <p className="text-xs text-slate-500">
        Phê duyệt cấu hình không phải chữ ký hợp đồng. Mức ký một phần/đủ phạm
        vi và phụ trách cấp hạng mục chưa có nguồn liên kết trong mô hình hiện
        tại; xem hồ sơ chi tiết để kiểm tra căn cứ.
      </p>
      <dialog
        ref={drawer}
        className="source-drawer"
        aria-labelledby="product-drawer-title"
        onClose={() => selectLine('')}
      >
        <header>
          <h2 id="product-drawer-title" className="font-semibold">
            Chi tiết hạng mục
          </h2>
          <button onClick={() => drawer.current?.close()}>Đóng</button>
        </header>
        {detailError ? (
          <p role="alert">{detailError}</p>
        ) : !detail ? (
          <p role="status">Đang đọc phiên bản…</p>
        ) : (
          <div className="grid gap-5">
            <h3 className="text-xl font-semibold">
              {detail.code} ·{' '}
              {configuration?.product?.name ?? configuration?.customProductName}
            </h3>
            <p>
              {detail.location?.name} · {detail.positionName}
            </p>
            <dl className="detail-grid">
              <dt>Vật liệu / hoàn thiện</dt>
              <dd>
                {configuration?.material ?? 'Chưa xác định'} /{' '}
                {configuration?.finish ?? 'Chưa xác định'}
              </dd>
              <dt>Số lượng</dt>
              <dd>
                {configuration?.quantity} {configuration?.unit}
              </dd>
              <dt>Tình trạng</dt>
              <dd>{lifecycle[detail.lifecycleStatus] ?? 'Chưa xác định'}</dd>
              <dt>Vướng mắc</dt>
              <dd>{detail.blocker ?? 'Chưa ghi nhận'}</dd>
              <dt>Việc tiếp theo</dt>
              <dd>{detail.nextAction ?? 'Chưa xác định'}</dd>
            </dl>
            <Link
              className="primary rounded p-3 text-center"
              href={`/projects/${projectId}/products/${detail.id}`}
            >
              Mở cấu hình, phê duyệt & hồ sơ nguồn
            </Link>
            <Link href={`/projects/${projectId}/ai?productLineId=${detail.id}`}>
              Hỏi AI về hạng mục →
            </Link>
            <section>
              <h4 className="font-semibold">Lịch sử cấu hình</h4>
              {detail.revisions.map((r) => (
                <p className="mt-2" key={r.revision}>
                  Bản {r.revision} · {r.customProductName ?? r.product?.name} ·
                  Khách:{' '}
                  {projectDomainLabel('status', r.customerApprovalStatus)}
                </p>
              ))}
            </section>
          </div>
        )}
      </dialog>
    </div>
  );
}
