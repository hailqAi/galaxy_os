'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { EntityComments } from '../../../../entity-comments';
import { EntityActivity } from '../../../../entity-activity';
import { EntityFiles } from '../../../../entity-files';
import { Actor, api } from '../../../../lib/api';

type Approval = {
  id: string;
  type: string;
  status: string;
  notes: string | null;
  createdAt: string;
};
type Revision = {
  id: string;
  revision: number;
  product: { name: string; brand: { name: string } } | null;
  variant: { name: string } | null;
  supplier: { legalName: string } | null;
  customProductName: string | null;
  customDescription: string | null;
  material: string | null;
  finish: string | null;
  color: string | null;
  width: string | null;
  depth: string | null;
  height: string | null;
  quantity: string;
  unit: string;
  customerApprovalStatus: string;
  technicalApprovalStatus: string;
  commercialApprovalStatus: string;
  lockedAt: string | null;
  createdAt: string;
  approvals: Approval[];
};
type Line = {
  id: string;
  code: string;
  positionName: string | null;
  currentRevision: number;
  lifecycleStatus: string;
  blocker: string | null;
  location: { name: string } | null;
  revisions: Revision[];
};

export default function ProjectProductDetailPage() {
  const { projectId, lineId } = useParams<{
    projectId: string;
    lineId: string;
  }>();
  const [line, setLine] = useState<Line>();
  const [actor, setActor] = useState<Actor>();
  const [message, setMessage] = useState('');
  const [externalApprover, setExternalApprover] = useState('');
  const load = useCallback(
    () =>
      Promise.all([
        api<Line>(`/projects/${projectId}/products/${lineId}`),
        api<Actor>('/me'),
      ])
        .then(([item, current]) => {
          setLine(item);
          setActor(current);
        })
        .catch((error: Error) => setMessage(error.message)),
    [lineId, projectId],
  );
  useEffect(() => void load(), [load]);
  async function command(
    type: 'CUSTOMER' | 'TECHNICAL' | 'COMMERCIAL',
    action: 'submit' | 'decision',
  ) {
    const external =
      type === 'CUSTOMER' && action === 'decision'
        ? {
            approvedByExternalName: externalApprover,
            approvalMethod: 'EMAIL_CONFIRMATION',
          }
        : {};
    try {
      await api(
        `/projects/${projectId}/products/${lineId}/approvals/${type}/${action}`,
        {
          method: 'POST',
          body:
            action === 'decision'
              ? JSON.stringify({ decision: 'APPROVED', ...external })
              : undefined,
        },
      );
      await load();
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  async function revise() {
    await api(`/projects/${projectId}/products/${lineId}/revisions`, {
      method: 'POST',
    });
    await load();
  }
  if (message && !line) return <p role="alert">{message}</p>;
  if (!line || !actor) return <p role="status">Đang tải sản phẩm…</p>;
  const current = line.revisions.find(
    ({ revision }) => revision === line.currentRevision,
  )!;
  const permission = (value: string) => actor.permissions.includes(value);
  const approvalCards: [
    string,
    'CUSTOMER' | 'TECHNICAL' | 'COMMERCIAL',
    string,
  ][] = [
    ['Khách hàng', 'CUSTOMER', current.customerApprovalStatus],
    ['Kỹ thuật', 'TECHNICAL', current.technicalApprovalStatus],
    ['Thương mại', 'COMMERCIAL', current.commercialApprovalStatus],
  ];
  return (
    <div className="grid gap-5">
      <p>
        <Link href={`/projects/${projectId}/products`}>Sản phẩm nội thất</Link>{' '}
        → {line.code}
      </p>
      <header className="panel flex flex-wrap justify-between gap-4">
        <div>
          <p>
            {line.code} · Revision {line.currentRevision}
          </p>
          <h1 className="text-2xl font-semibold">
            {current.product
              ? `${current.product.brand.name} · ${current.product.name}`
              : current.customProductName}
          </h1>
          <p>
            {line.lifecycleStatus} · {line.location?.name} · {line.positionName}
          </p>
        </div>
        {current.lockedAt
          ? permission('project.product.revise') && (
              <button onClick={() => void revise()}>Tạo revision</button>
            )
          : permission('project.product.update') && (
              <Link
                className="rounded border px-3 py-2"
                href={`/projects/${projectId}/products/${lineId}/edit`}
              >
                Chỉnh sửa nháp
              </Link>
            )}
      </header>
      {message && <p role="alert">{message}</p>}
      <section className="grid gap-3 sm:grid-cols-3">
        {approvalCards.map(([label, type, status]) => (
          <div className="panel" key={type}>
            <h2 className="font-semibold">{label}</h2>
            <p>{status}</p>
            {status === 'DRAFT' &&
              permission(`project.product.submit_${type.toLowerCase()}`) && (
                <button onClick={() => void command(type as never, 'submit')}>
                  Gửi phê duyệt
                </button>
              )}
            {status === 'PENDING' &&
              permission(`project.product.approve_${type.toLowerCase()}`) && (
                <>
                  {type === 'CUSTOMER' && (
                    <label>
                      Người xác nhận bên ngoài
                      <input
                        value={externalApprover}
                        onChange={(event) =>
                          setExternalApprover(event.target.value)
                        }
                      />
                    </label>
                  )}
                  <button
                    disabled={type === 'CUSTOMER' && !externalApprover.trim()}
                    onClick={() => void command(type as never, 'decision')}
                  >
                    Phê duyệt
                  </button>
                </>
              )}
          </div>
        ))}
      </section>
      <section className="panel">
        <h2 className="font-semibold">Cấu hình hiện hành</h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <dt>Material / finish</dt>
            <dd>
              {current.material ?? '—'} / {current.finish ?? '—'} /{' '}
              {current.color ?? '—'}
            </dd>
          </div>
          <div>
            <dt>Kích thước</dt>
            <dd>
              {current.width ?? '—'} × {current.depth ?? '—'} ×{' '}
              {current.height ?? '—'}
            </dd>
          </div>
          <div>
            <dt>Khối lượng</dt>
            <dd>
              {current.quantity} {current.unit}
            </dd>
          </div>
          <div>
            <dt>Nhà cung cấp</dt>
            <dd>{current.supplier?.legalName ?? '—'}</dd>
          </div>
          <div>
            <dt>Blocker</dt>
            <dd>{line.blocker ?? 'Không có'}</dd>
          </div>
        </dl>
      </section>
      <section className="panel">
        <h2 className="font-semibold">Lịch sử revision và phê duyệt</h2>
        <ol className="mt-3 divide-y">
          {line.revisions.map((revision) => (
            <li className="py-3" key={revision.id}>
              Revision {revision.revision} ·{' '}
              {revision.lockedAt ? 'Đã khóa' : 'Có thể chỉnh sửa'} ·{' '}
              {new Date(revision.createdAt).toLocaleString('vi-VN')}
              {revision.approvals.map((approval) => (
                <p key={approval.id}>
                  {approval.type}: {approval.status}
                </p>
              ))}
            </li>
          ))}
        </ol>
      </section>
      <EntityFiles entityType="ProjectProductLine" entityId={lineId} />
      <EntityActivity entityType="ProjectProductLine" entityId={lineId} />
      <EntityComments entityType="ProjectProductLine" entityId={lineId} />
    </div>
  );
}
