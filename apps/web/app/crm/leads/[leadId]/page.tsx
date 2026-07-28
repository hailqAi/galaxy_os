'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { EntityFiles } from '../../../entity-files';
import { EntityComments } from '../../../entity-comments';

type Lead = {
  id: string;
  name: string;
  companyName: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  priority: string;
  estimatedValue: string | null;
  currency: string;
  expectedCloseDate: string | null;
  notes: string | null;
  source: { name: string } | null;
  owner: { displayName: string } | null;
  department: { name: string } | null;
  opportunity: { id: string; name: string } | null;
  activity: {
    id: string;
    event: string;
    description: string | null;
    createdAt: string;
    actor: { displayName: string };
  }[];
};

export default function LeadDetailPage() {
  const id = String(useParams().leadId);
  const router = useRouter();
  const [lead, setLead] = useState<Lead>();
  const [message, setMessage] = useState('');
  const load = useCallback(
    () =>
      api<Lead>(`/leads/${id}`)
        .then(setLead)
        .catch((error: Error) => setMessage(error.message)),
    [id],
  );
  useEffect(() => {
    void load();
  }, [load]);
  async function status(next: string) {
    try {
      await api(`/leads/${id}/change-status`, {
        method: 'POST',
        body: JSON.stringify({ status: next }),
      });
      await load();
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  async function convert() {
    try {
      const result = await api<{ opportunityId: string }>(
        `/leads/${id}/convert-to-opportunity`,
        { method: 'POST' },
      );
      router.push(`/crm/opportunities/${result.opportunityId}`);
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  if (message && !lead) return <p role="alert">{message}</p>;
  if (!lead) return <p role="status">Đang tải Lead…</p>;
  return (
    <div className="grid gap-5">
      <p className="text-sm">
        <Link href="/crm/leads">Khách hàng tiềm năng</Link> / {lead.name}
      </p>
      <header className="flex flex-wrap justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{lead.name}</h1>
          <p>
            {lead.status} · {lead.priority} ·{' '}
            {lead.owner?.displayName ?? 'Chưa gán'}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            className="rounded border px-3 py-2"
            href={`/crm/leads/${id}/edit`}
          >
            Sửa
          </Link>
          {!['CONVERTED', 'ARCHIVED'].includes(lead.status) && (
            <>
              <button onClick={() => void status('CONTACTED')}>
                Đã liên hệ
              </button>
              <button className="primary" onClick={() => void convert()}>
                Chuyển thành cơ hội
              </button>
            </>
          )}
        </div>
      </header>
      {message && <p role="alert">{message}</p>}
      <section className="panel">
        <h2 className="font-semibold">Tổng quan</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <dt>Công ty</dt>
            <dd>{lead.companyName ?? '—'}</dd>
          </div>
          <div>
            <dt>Người liên hệ</dt>
            <dd>{lead.contactName ?? '—'}</dd>
          </div>
          <div>
            <dt>Điện thoại</dt>
            <dd>{lead.phone ?? '—'}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{lead.email ?? '—'}</dd>
          </div>
          <div>
            <dt>Nguồn</dt>
            <dd>{lead.source?.name ?? '—'}</dd>
          </div>
          <div>
            <dt>Phòng ban</dt>
            <dd>{lead.department?.name ?? '—'}</dd>
          </div>
          <div>
            <dt>Giá trị dự kiến</dt>
            <dd>
              {lead.estimatedValue
                ? Number(lead.estimatedValue).toLocaleString('vi-VN')
                : '—'}{' '}
              {lead.currency}
            </dd>
          </div>
          <div>
            <dt>Ngày chốt</dt>
            <dd>
              {lead.expectedCloseDate
                ? new Date(lead.expectedCloseDate).toLocaleDateString('vi-VN')
                : '—'}
            </dd>
          </div>
        </dl>
        {lead.notes && <p className="mt-4">{lead.notes}</p>}
      </section>
      <section className="panel">
        <h2 className="font-semibold">Hoạt động</h2>
        {lead.activity.length ? (
          <ol className="mt-4 divide-y">
            {lead.activity.map((item) => (
              <li className="py-3" key={item.id}>
                <strong>{item.actor.displayName}</strong> · {item.event}
                <br />
                <small>
                  {new Date(item.createdAt).toLocaleString('vi-VN')}
                </small>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-3">Chưa có hoạt động.</p>
        )}
      </section>
      <EntityFiles entityType="Lead" entityId={id} />
      <EntityComments entityType="Lead" entityId={id} />
    </div>
  );
}
