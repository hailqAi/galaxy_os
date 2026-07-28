'use client';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '../../../lib/api';

type Payment = {
  id: string;
  amount: string;
  currency: string;
  status: string;
  paymentMethod: string;
  bankReferenceProtected?: string;
  allocations: {
    id: string;
    amount: string;
    schedule: { milestone: string };
  }[];
  statusHistory: { id: string; toStatus: string; createdAt: string }[];
};

export default function SupplierPaymentDetailPage() {
  const id = useParams<{ id: string }>().id;
  const [item, setItem] = useState<Payment | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(
    () =>
      api<Payment>(`/supplier-payments/${id}`)
        .then(setItem)
        .catch((cause: Error) => setError(cause.message)),
    [id],
  );
  useEffect(() => void load(), [load]);
  async function action(name: string) {
    try {
      await api(`/supplier-payments/${id}/${name}`, {
        method: 'POST',
        body: '{}',
      });
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  async function allocate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api(`/supplier-payments/${id}/allocate`, {
        method: 'POST',
        body: JSON.stringify({
          allocations: [
            { scheduleId: form.get('scheduleId'), amount: form.get('amount') },
          ],
        }),
      });
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  if (!item)
    return <p role={error ? 'alert' : undefined}>{error || 'Đang tải…'}</p>;
  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold">
          Thanh toán {item.amount} {item.currency}
        </h1>
        <p>
          {item.paymentMethod} · {item.status}
        </p>
      </header>
      {error && <p role="alert">{error}</p>}
      <div className="flex gap-2">
        {item.status === 'DRAFT' && (
          <button onClick={() => void action('submit')}>Gửi duyệt</button>
        )}
        {item.status === 'SUBMITTED' && (
          <>
            <button onClick={() => void action('approve')}>Phê duyệt</button>
            <button onClick={() => void action('reject')}>Từ chối</button>
          </>
        )}
      </div>
      {item.status === 'APPROVED' && (
        <form className="panel grid gap-3 md:grid-cols-2" onSubmit={allocate}>
          <label>
            Schedule ID
            <input name="scheduleId" required />
          </label>
          <label>
            Số tiền phân bổ
            <input inputMode="decimal" name="amount" required />
          </label>
          <button className="primary w-fit rounded px-3 py-2" type="submit">
            Phân bổ
          </button>
        </form>
      )}
      <section className="panel">
        <h2 className="font-semibold">Phân bổ</h2>
        {item.allocations.map((allocation) => (
          <p key={allocation.id}>
            {allocation.schedule.milestone}: {allocation.amount} {item.currency}
          </p>
        ))}
      </section>
      <section className="panel">
        <h2 className="font-semibold">Hoạt động</h2>
        {item.statusHistory.map((history) => (
          <p key={history.id}>
            {history.toStatus} ·{' '}
            {new Date(history.createdAt).toLocaleString('vi-VN')}
          </p>
        ))}
      </section>
    </div>
  );
}
