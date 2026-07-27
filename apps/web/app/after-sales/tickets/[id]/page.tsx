'use client';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '../../../lib/api';
type Ticket = {
  ticketNumber: string;
  status: string;
  priority: string;
  description: string;
  resolutions: { id: string; summary: string }[];
  confirmations: { id: string; customerName: string; confirmed: boolean }[];
};
export default function TicketDetail() {
  const id = String(useParams().id);
  const [item, setItem] = useState<Ticket>();
  const [error, setError] = useState('');
  const load = useCallback(
    () =>
      api<Ticket>(`/service-tickets/${id}`)
        .then(setItem)
        .catch((e: Error) => setError(e.message)),
    [id],
  );
  useEffect(() => void load(), [load]);
  async function status(value: string) {
    try {
      await api(`/service-tickets/${id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: value }),
      });
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  async function resolve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api(`/service-tickets/${id}/resolve`, {
        method: 'POST',
        body: JSON.stringify({
          summary: form.get('summary'),
          evidenceFileId: form.get('evidenceFileId'),
        }),
      });
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api(`/service-tickets/${id}/confirm`, {
        method: 'POST',
        body: JSON.stringify({
          customerName: form.get('customerName'),
          confirmed: true,
        }),
      });
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  if (!item)
    return <p role={error ? 'alert' : 'status'}>{error || 'Đang tải…'}</p>;
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">
        {item.ticketNumber} · {item.status}
      </h1>
      {error && <p role="alert">{error}</p>}
      <section className="panel">
        <p>
          {item.priority} · {item.description}
        </p>
        <div className="flex flex-wrap gap-2">
          {[
            'TRIAGED',
            'SCHEDULED',
            'IN_PROGRESS',
            'WAITING_PARTS',
            'WAITING_SUPPLIER',
          ].map((value) => (
            <button key={value} onClick={() => status(value)}>
              {value}
            </button>
          ))}
        </div>
      </section>
      <form className="panel grid gap-3" onSubmit={resolve}>
        <input name="summary" placeholder="Kết quả xử lý" required />
        <input name="evidenceFileId" placeholder="Evidence File ID" required />
        <button className="primary">Resolve</button>
      </form>
      <form className="panel flex gap-3" onSubmit={confirm}>
        <input name="customerName" placeholder="Người xác nhận" required />
        <button>Xác nhận khách hàng</button>
      </form>
      <button
        onClick={() =>
          api(`/service-tickets/${id}/close`, { method: 'POST' })
            .then(load)
            .catch((e: Error) => setError(e.message))
        }
      >
        Đóng ticket
      </button>
    </div>
  );
}
