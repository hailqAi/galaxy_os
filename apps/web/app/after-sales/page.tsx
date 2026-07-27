'use client';
import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '../lib/api';
type Ticket = {
  id: string;
  ticketNumber: string;
  issueCategory: string;
  priority: string;
  status: string;
  slaDueAt: string | null;
};
export default function AfterSalesPage() {
  const [projectId, setProjectId] = useState(
    useSearchParams().get('projectId') ?? '',
  );
  const [items, setItems] = useState<Ticket[]>([]);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!projectId) return setItems([]);
    try {
      setItems(await api<Ticket[]>(`/service-tickets?projectId=${projectId}`));
      setError('');
    } catch (cause) {
      setError((cause as Error).message);
    }
  }, [projectId]);
  useEffect(() => {
    const timeout = setTimeout(() => void load(), 0);
    return () => clearTimeout(timeout);
  }, [load]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api('/service-tickets', {
        method: 'POST',
        body: JSON.stringify({
          ticketNumber: form.get('ticketNumber'),
          customerId: form.get('customerId'),
          projectId,
          warrantyAssetId: form.get('warrantyAssetId') || undefined,
          issueCategory: form.get('issueCategory'),
          priority: form.get('priority'),
          description: form.get('description'),
          chargeable: form.get('chargeable') === 'on',
        }),
      });
      event.currentTarget.reset();
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">After-sales</h1>
      {error && <p role="alert">{error}</p>}
      <label className="panel">
        Project ID
        <input
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
        />
      </label>
      <form className="panel grid gap-3 md:grid-cols-2" onSubmit={create}>
        <input name="ticketNumber" placeholder="Số ticket" required />
        <input name="customerId" placeholder="Customer ID" required />
        <input
          name="warrantyAssetId"
          placeholder="Warranty Asset ID (nếu có)"
        />
        <input name="issueCategory" placeholder="Nhóm vấn đề" required />
        <select name="priority">
          <option>LOW</option>
          <option>NORMAL</option>
          <option>HIGH</option>
          <option>URGENT</option>
        </select>
        <textarea name="description" placeholder="Mô tả" required />
        <label>
          <input name="chargeable" type="checkbox" /> Có tính phí
        </label>
        <button className="primary" disabled={!projectId}>
          Tạo ticket
        </button>
      </form>
      <section className="panel">
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <Link href={`/after-sales/tickets/${item.id}`}>
                {item.ticketNumber} · {item.priority} · {item.status}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
