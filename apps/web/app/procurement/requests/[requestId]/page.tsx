'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
type Request = {
  id: string;
  requestNumber: string;
  sourceType: string;
  status: string;
  priority: string;
  notes: string | null;
  project: { name: string };
  lines: {
    id: string;
    customDescription: string | null;
    quantity: string;
    unit: string;
    targetPrice: string | null;
    currency: string;
    technicalRequirements: string | null;
  }[];
  approvals: {
    id: string;
    decision: string;
    comment: string | null;
    createdAt: string;
  }[];
};
export default function RequestPage() {
  const id = String(useParams().requestId);
  const [item, setItem] = useState<Request>();
  const [message, setMessage] = useState('');
  const load = useCallback(
    () =>
      api<Request>(`/purchase-requests/${id}`)
        .then(setItem)
        .catch((e: Error) => setMessage(e.message)),
    [id],
  );
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  async function action(name: string) {
    try {
      await api(`/purchase-requests/${id}/${name}`, {
        method: 'POST',
        body: '{}',
      });
      await load();
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  if (!item)
    return (
      <p role={message ? 'alert' : 'status'}>
        {message || 'Đang tải yêu cầu…'}
      </p>
    );
  return (
    <div className="grid gap-6">
      <p>
        <Link href="/procurement/requests">Yêu cầu mua hàng</Link> →{' '}
        {item.requestNumber}
      </p>
      <header className="flex justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{item.requestNumber}</h1>
          <p>
            {item.project.name} · {item.sourceType} · {item.status}
          </p>
        </div>
        <div className="flex gap-2">
          {item.status === 'DRAFT' && (
            <button className="primary" onClick={() => void action('submit')}>
              Gửi duyệt
            </button>
          )}
          {item.status === 'SUBMITTED' && (
            <>
              <button
                className="primary"
                onClick={() => void action('approve')}
              >
                Duyệt
              </button>
              <button onClick={() => void action('reject')}>Từ chối</button>
            </>
          )}
        </div>
      </header>
      {message && <p role="alert">{message}</p>}
      <section className="panel overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr>
              <th>Mô tả</th>
              <th>Khối lượng</th>
              <th>Giá mục tiêu</th>
              <th>Yêu cầu kỹ thuật</th>
            </tr>
          </thead>
          <tbody>
            {item.lines.map((line) => (
              <tr className="border-t" key={line.id}>
                <td className="py-3">{line.customDescription}</td>
                <td>
                  {line.quantity} {line.unit}
                </td>
                <td>
                  {line.targetPrice || '—'} {line.currency}
                </td>
                <td>{line.technicalRequirements || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="panel">
        <h2 className="font-semibold">Phê duyệt</h2>
        {item.approvals.length ? (
          <ul>
            {item.approvals.map((a) => (
              <li key={a.id}>
                {a.decision} · {new Date(a.createdAt).toLocaleString('vi-VN')} ·{' '}
                {a.comment}
              </li>
            ))}
          </ul>
        ) : (
          <p>Chưa có quyết định.</p>
        )}
      </section>
    </div>
  );
}
