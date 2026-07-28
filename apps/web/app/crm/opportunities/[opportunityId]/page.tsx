'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { EntityFiles } from '../../../entity-files';
import { EntityComments } from '../../../entity-comments';
type Opportunity = {
  id: string;
  name: string;
  stage: string;
  probability: number;
  estimatedValue: string | null;
  currency: string;
  expectedCloseDate: string | null;
  customer: { id: string; displayName: string } | null;
  primaryContact: { displayName: string } | null;
  owner: { displayName: string } | null;
  department: { name: string } | null;
  project: { id: string; code: string } | null;
  lead: { id: string; name: string } | null;
  activity: {
    id: string;
    event: string;
    createdAt: string;
    actor: { displayName: string };
  }[];
};
export default function OpportunityDetailPage() {
  const id = String(useParams().opportunityId);
  const router = useRouter();
  const [item, setItem] = useState<Opportunity>();
  const [message, setMessage] = useState('');
  const load = useCallback(
    () =>
      api<Opportunity>(`/opportunities/${id}`)
        .then(setItem)
        .catch((error: Error) => setMessage(error.message)),
    [id],
  );
  useEffect(() => {
    void load();
  }, [load]);
  async function action(kind: 'won' | 'lost' | 'project') {
    try {
      if (kind === 'project') {
        const result = await api<{ projectId: string }>(
          `/opportunities/${id}/create-project`,
          { method: 'POST' },
        );
        router.push(`/projects/${result.projectId}`);
        return;
      }
      const lostReason =
        kind === 'lost' ? window.prompt('Lý do thất bại')?.trim() : undefined;
      if (kind === 'lost' && !lostReason) return;
      await api(`/opportunities/${id}/mark-${kind}`, {
        method: 'POST',
        body: lostReason ? JSON.stringify({ lostReason }) : undefined,
      });
      await load();
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  if (message && !item) return <p role="alert">{message}</p>;
  if (!item) return <p role="status">Đang tải cơ hội…</p>;
  return (
    <div className="grid gap-5">
      <p className="text-sm">
        <Link href="/crm/opportunities">Cơ hội</Link> / {item.name}
      </p>
      <header className="flex flex-wrap justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{item.name}</h1>
          <p>
            {item.stage} · {item.probability}% ·{' '}
            {item.owner?.displayName ?? 'Chưa gán'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!['WON', 'LOST'].includes(item.stage) && (
            <>
              <button onClick={() => void action('won')}>
                Đánh dấu thành công
              </button>
              <button onClick={() => void action('lost')}>
                Đánh dấu thất bại
              </button>
            </>
          )}
          <button
            className="primary"
            disabled={!!item.project}
            onClick={() => void action('project')}
          >
            {item.project ? 'Đã tạo dự án' : 'Tạo dự án'}
          </button>
        </div>
      </header>
      {message && <p role="alert">{message}</p>}
      <section className="panel">
        <h2 className="font-semibold">Tổng quan</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <dt>Khách hàng</dt>
            <dd>{item.customer?.displayName ?? 'Chưa có'}</dd>
          </div>
          <div>
            <dt>Liên hệ chính</dt>
            <dd>{item.primaryContact?.displayName ?? '—'}</dd>
          </div>
          <div>
            <dt>Phòng ban</dt>
            <dd>{item.department?.name ?? '—'}</dd>
          </div>
          <div>
            <dt>Giá trị</dt>
            <dd>
              {item.estimatedValue
                ? Number(item.estimatedValue).toLocaleString('vi-VN')
                : '—'}{' '}
              {item.currency}
            </dd>
          </div>
          <div>
            <dt>Ngày chốt</dt>
            <dd>
              {item.expectedCloseDate
                ? new Date(item.expectedCloseDate).toLocaleDateString('vi-VN')
                : '—'}
            </dd>
          </div>
          <div>
            <dt>Lead</dt>
            <dd>
              {item.lead ? (
                <Link href={`/crm/leads/${item.lead.id}`}>
                  {item.lead.name}
                </Link>
              ) : (
                '—'
              )}
            </dd>
          </div>
        </dl>
      </section>
      <section className="panel">
        <h2 className="font-semibold">Hoạt động</h2>
        {item.activity.length ? (
          <ol className="mt-3 divide-y">
            {item.activity.map((activity) => (
              <li className="py-3" key={activity.id}>
                <strong>{activity.actor.displayName}</strong> · {activity.event}
                <br />
                <small>
                  {new Date(activity.createdAt).toLocaleString('vi-VN')}
                </small>
              </li>
            ))}
          </ol>
        ) : (
          <p>Chưa có hoạt động.</p>
        )}
      </section>
      <EntityFiles entityType="Opportunity" entityId={id} />
      <EntityComments entityType="Opportunity" entityId={id} />
    </div>
  );
}
