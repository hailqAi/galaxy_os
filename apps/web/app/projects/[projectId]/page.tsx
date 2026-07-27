'use client';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { EntityComments } from '../../entity-comments';
import { EntityFiles } from '../../entity-files';
import { api } from '../../lib/api';

type Project = {
  id: string;
  code: string;
  name: string;
  location: string | null;
  customer: { id: string; displayName: string };
  phase: string;
  status: string;
  healthStatus: string;
  progressPercentage: number;
  contractedValue: string | null;
  estimatedValue: string | null;
  currency: string;
  projectManager: { displayName: string } | null;
  salesOwner?: { displayName: string } | null;
  members: { id: string }[];
  departments: { id: string }[];
};
type Activity = {
  id: string;
  event: string;
  createdAt: string;
  actor: { displayName: string };
};

const stages = [
  ['REQUIREMENT', 'Yêu cầu', 'requirements'],
  ['DESIGN', 'Thiết kế', 'design'],
  ['PRODUCT_SELECTION', 'Lựa chọn sản phẩm', 'products'],
  ['ESTIMATE', 'Dự toán', 'estimates'],
  ['QUOTATION', 'Báo giá', 'quotations'],
  ['CONTRACT', 'Hợp đồng', 'contracts'],
  ['PROCUREMENT', 'Mua hàng', 'procurement'],
  ['PRODUCTION', 'Sản xuất', 'production'],
  ['SHIPPING', 'Vận chuyển', 'shipping'],
  ['WAREHOUSE', 'Kho', 'warehouse'],
  ['INSTALLATION', 'Lắp đặt', 'installation'],
  ['INSPECTION', 'Nghiệm thu', 'inspection'],
  ['HANDOVER', 'Bàn giao', 'handover'],
  ['WARRANTY', 'Bảo hành', 'warranty'],
] as const;
const navigation = [
  ['overview', 'Tổng quan'],
  ['customer', 'Khách hàng'],
  ['requirements', 'Yêu cầu & Khảo sát'],
  ['design', 'Thiết kế'],
  ['products', 'Sản phẩm'],
  ['estimates', 'Dự toán'],
  ['quotations', 'Báo giá'],
  ['contracts', 'Hợp đồng'],
  ['receivables', 'Thanh toán khách hàng'],
  ['procurement', 'Mua hàng'],
  ['suppliers', 'Nhà cung cấp'],
  ['production', 'Sản xuất'],
  ['shipping', 'Vận chuyển'],
  ['warehouse', 'Kho dự án'],
  ['installation', 'Lắp đặt'],
  ['inspection', 'Nghiệm thu'],
  ['handover', 'Bàn giao'],
  ['warranty', 'Bảo hành'],
  ['tasks', 'Công việc'],
  ['files', 'Tệp tin'],
  ['comments', 'Trao đổi'],
  ['timeline', 'Dòng thời gian'],
] as const;
const actions: Record<string, [string, string]> = {
  estimates: ['Tạo dự toán', 'Bắt đầu BOQ từ yêu cầu đã duyệt.'],
  quotations: ['Tạo báo giá', 'Tạo báo giá từ dự toán đã duyệt.'],
  contracts: ['Tạo hợp đồng', 'Tạo dự thảo từ báo giá được chấp nhận.'],
  receivables: ['Lập lịch thanh toán', 'Tạo các mốc thu theo hợp đồng.'],
  procurement: ['Tạo yêu cầu mua hàng', 'Chọn hạng mục cần đặt mua.'],
  shipping: ['Tạo lô hàng', 'Liên kết PO/PI và lịch vận chuyển.'],
  warehouse: ['Nhập kho', 'Đối chiếu PO, packing list và kiểm tra chất lượng.'],
  installation: ['Tạo lệnh lắp đặt', 'Chỉ phát hành khi hàng sẵn sàng.'],
  inspection: ['Tạo biên bản nghiệm thu', 'Ghi nhận kết quả và punch list.'],
  handover: ['Tạo hồ sơ bàn giao', 'Tổng hợp serial, hướng dẫn và bảo hành.'],
  warranty: ['Tạo phiếu bảo hành', 'Đăng ký tài sản sau bàn giao.'],
};

export default function ProjectWorkspace() {
  const id = String(useParams().projectId);
  const query = useSearchParams();
  const [project, setProject] = useState<Project>();
  const [activity, setActivity] = useState<Activity[]>([]);
  const [workspace, setWorkspace] = useState(
    () =>
      query.get('workspace') ||
      (typeof sessionStorage === 'undefined'
        ? null
        : sessionStorage.getItem(`project-workspace:${id}`)) ||
      'overview',
  );
  const [message, setMessage] = useState('');
  const load = useCallback(async () => {
    try {
      const [item, timeline] = await Promise.all([
        api<Project>(`/projects/${id}`),
        api<Activity[]>(`/projects/${id}/timeline`),
      ]);
      setProject(item);
      setActivity(timeline);
    } catch (error) {
      setMessage((error as Error).message);
    }
  }, [id]);
  useEffect(() => {
    const timeout = setTimeout(() => void load(), 0);
    return () => clearTimeout(timeout);
  }, [load]);
  function open(value: string) {
    setWorkspace(value);
    sessionStorage.setItem(`project-workspace:${id}`, value);
    history.replaceState(null, '', `?workspace=${value}`);
  }
  if (message && !project) return <p role="alert">{message}</p>;
  if (!project) return <p role="status">Đang tải không gian dự án…</p>;
  const currentStage = Math.max(
    0,
    stages.findIndex(([phase]) => phase === project.phase),
  );
  const quick = actions[workspace];
  const money = (value: string | null) =>
    value
      ? new Intl.NumberFormat('vi-VN', {
          style: 'currency',
          currency: project.currency,
          maximumFractionDigits: 0,
        }).format(Number(value))
      : '—';
  return (
    <div className="grid gap-5">
      <p>
        <Link href="/projects">Dự án</Link> → {project.code} →{' '}
        {navigation.find(([key]) => key === workspace)?.[1]}
      </p>
      <header className="panel flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-black/55">{project.code}</p>
          <h1 className="text-2xl font-semibold">{project.name}</h1>
          <p>
            {project.customer.displayName} ·{' '}
            {project.location ?? 'Chưa có địa điểm'}
          </p>
          <p>
            {project.projectManager?.displayName ?? 'Chưa gán PM'} ·{' '}
            {project.phase} · {project.status}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            className="rounded border px-3 py-2"
            href={`/projects/${id}/edit`}
          >
            Chỉnh sửa
          </Link>
          {quick && (
            <button className="primary" onClick={() => open(workspace)}>
              {quick[0]}
            </button>
          )}
        </div>
      </header>
      <section aria-label="Tiến trình dự án" className="panel overflow-x-auto">
        <div className="flex min-w-max gap-2">
          {stages.map(([phase, label, target], index) => (
            <button
              className={`rounded border px-3 py-2 text-left text-xs ${index === currentStage ? 'bg-ink text-white' : ''}`}
              key={phase}
              onClick={() => open(target)}
            >
              <span className="block">{label}</span>
              <small>
                {index < currentStage
                  ? 'Hoàn thành'
                  : index === currentStage
                    ? 'Đang thực hiện'
                    : 'Chưa bắt đầu'}
              </small>
            </button>
          ))}
        </div>
      </section>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {[
          ['Sức khỏe', project.healthStatus],
          ['Tiến độ', `${project.progressPercentage}%`],
          ['Giá trị hợp đồng', money(project.contractedValue)],
          ['Chi phí dự kiến', money(project.estimatedValue)],
          ['Thành viên', project.members.length],
          ['Phòng ban', project.departments.length],
        ].map(([label, value]) => (
          <div className="panel" key={label}>
            <p className="text-sm text-black/55">{label}</p>
            <strong>{value}</strong>
          </div>
        ))}
      </section>
      <div className="grid gap-5 lg:grid-cols-[230px_1fr_280px]">
        <nav
          aria-label="Không gian dự án"
          className="panel flex gap-1 overflow-x-auto lg:flex-col"
        >
          {navigation.map(([key, label]) => (
            <button
              className={`whitespace-nowrap rounded px-3 py-2 text-left text-sm ${workspace === key ? 'bg-ink text-white' : 'hover:bg-black/5'}`}
              key={key}
              onClick={() => open(key)}
            >
              {label}
            </button>
          ))}
        </nav>
        <main className="min-w-0">
          {workspace === 'overview' ? (
            <section className="panel">
              <h2 className="font-semibold">Điều hành dự án</h2>
              <p className="mt-2">
                Giai đoạn hiện tại: {project.phase}. Chọn một giai đoạn phía
                trên hoặc mục bên trái để tiếp tục công việc.
              </p>
              <div className="mt-4 rounded border border-amber-300 bg-amber-50 p-3">
                <strong>Cần chú ý</strong>
                <p>
                  {project.healthStatus === 'ON_TRACK'
                    ? 'Không có cảnh báo nghiêm trọng.'
                    : 'Dự án cần được rà soát tiến độ và đầu việc bị chặn.'}
                </p>
              </div>
            </section>
          ) : workspace === 'customer' ? (
            <section className="panel">
              <h2 className="font-semibold">Khách hàng</h2>
              <p>{project.customer.displayName}</p>
              <Link href={`/customers/${project.customer.id}`}>
                Mở hồ sơ khách hàng
              </Link>
            </section>
          ) : workspace === 'files' ? (
            <EntityFiles entityType="Project" entityId={id} />
          ) : workspace === 'comments' ? (
            <EntityComments entityType="Project" entityId={id} />
          ) : workspace === 'timeline' ? (
            <section className="panel">
              <h2 className="font-semibold">Dòng thời gian</h2>
              <ol className="mt-3 divide-y">
                {activity.map((item) => (
                  <li className="py-2" key={item.id}>
                    <strong>{item.actor.displayName}</strong> · {item.event}
                    <br />
                    <small>
                      {new Date(item.createdAt).toLocaleString('vi-VN')}
                    </small>
                  </li>
                ))}
              </ol>
            </section>
          ) : (
            <section className="panel">
              <h2 className="font-semibold">
                {navigation.find(([key]) => key === workspace)?.[1]}
              </h2>
              <p className="mt-2">
                {quick?.[1] ?? 'Chưa có dữ liệu trong mục này.'}
              </p>
              <Link
                className="mt-4 inline-block"
                href={
                  workspace === 'estimates'
                    ? `/projects/${id}/estimates`
                    : workspace === 'quotations'
                      ? `/projects/${id}/quotations`
                      : workspace === 'contracts'
                        ? `/projects/${id}/contracts`
                        : workspace === 'tasks'
                          ? `/tasks?projectId=${id}`
                          : workspace === 'suppliers'
                            ? '/partners'
                            : workspace === 'products'
                              ? '/catalog'
                              : workspace === 'procurement'
                                ? `/procurement/requests?projectId=${id}`
                                : workspace === 'production'
                                  ? `/production?projectId=${id}`
                                  : workspace === 'shipping'
                                    ? `/logistics/shipments?projectId=${id}`
                                    : workspace === 'warehouse'
                                      ? `/inventory?projectId=${id}`
                                      : workspace === 'installation'
                                        ? `/installations?projectId=${id}`
                                        : workspace === 'inspection'
                                          ? `/projects/${id}/inspections`
                                          : workspace === 'handover'
                                            ? `/projects/${id}/handover`
                                            : workspace === 'warranty'
                                              ? `/projects/${id}/warranty`
                                              : '#'
                }
              >
                {quick?.[0] ?? 'Mở danh sách liên quan'}
              </Link>
              {workspace === 'procurement' && (
                <>
                  <Link
                    className="ml-4 mt-4 inline-block"
                    href={`/procurement/rfqs?projectId=${id}`}
                  >
                    Mở RFQ nhà cung cấp
                  </Link>
                  <Link
                    className="ml-4 mt-4 inline-block"
                    href={`/procurement/supplier-quotes?projectId=${id}`}
                  >
                    Mở báo giá nhà cung cấp
                  </Link>
                </>
              )}
            </section>
          )}
        </main>
        <aside className="panel h-fit">
          <h2 className="font-semibold">Tóm tắt</h2>
          <dl className="mt-3 grid gap-2 text-sm">
            <div>
              <dt>Khách hàng</dt>
              <dd className="font-medium">{project.customer.displayName}</dd>
            </div>
            <div>
              <dt>Quản lý dự án</dt>
              <dd className="font-medium">
                {project.projectManager?.displayName ?? 'Chưa gán'}
              </dd>
            </div>
            <div>
              <dt>Trạng thái</dt>
              <dd className="font-medium">{project.status}</dd>
            </div>
          </dl>
        </aside>
      </div>
    </div>
  );
}
