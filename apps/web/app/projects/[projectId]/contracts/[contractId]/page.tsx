'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '../../../../lib/api';
type Contract = {
  contractNumber: string;
  status: string;
  originalValue: string;
  currentValue: string;
  currency: string;
  sellerLegalEntity: string;
  buyerLegalEntity: string;
  appendices: {
    id: string;
    appendixNumber: string;
    title: string;
    valueChange: string;
    status: string;
  }[];
  paymentSchedules: {
    id: string;
    milestoneName: string;
    dueDate: string;
    amount: string;
    paidAmount: string;
    outstandingAmount: string;
    status: string;
  }[];
  guarantees: {
    id: string;
    guaranteeNumber: string;
    type: string;
    expiryDate: string;
    status: string;
  }[];
};
export default function ContractPage() {
  const { projectId, contractId } = useParams<{
    projectId: string;
    contractId: string;
  }>();
  const [item, setItem] = useState<Contract>();
  const [message, setMessage] = useState('');
  const load = useCallback(
    () =>
      api<Contract>(`/projects/${projectId}/contracts/${contractId}`)
        .then(setItem)
        .catch((e: Error) => setMessage(e.message)),
    [projectId, contractId],
  );
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  async function transition(status: string) {
    try {
      await api(`/projects/${projectId}/contracts/${contractId}/transition`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      });
      await load();
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  async function appendix(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await api(`/projects/${projectId}/contracts/${contractId}/appendices`, {
        method: 'POST',
        body: JSON.stringify({
          ...values,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      event.currentTarget.reset();
      await load();
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  async function schedules(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const v = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await api(
        `/projects/${projectId}/contracts/${contractId}/payment-schedules`,
        {
          method: 'POST',
          body: JSON.stringify({
            items: [
              {
                milestoneName: v.milestoneName,
                dueDate: v.dueDate,
                amount: v.amount,
              },
            ],
          }),
        },
      );
      event.currentTarget.reset();
      await load();
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  if (!item)
    return (
      <p role={message ? 'alert' : 'status'}>
        {message || 'Đang tải hợp đồng…'}
      </p>
    );
  const money = (v: string) => new Intl.NumberFormat('vi-VN').format(Number(v));
  return (
    <div className="grid gap-6">
      <p>
        <Link href={`/projects/${projectId}/contracts`}>Hợp đồng</Link> →{' '}
        {item.contractNumber}
      </p>
      <header className="flex justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{item.contractNumber}</h1>
          <p>
            {item.sellerLegalEntity} ↔ {item.buyerLegalEntity} · {item.status}
          </p>
        </div>
        <div className="flex gap-2">
          {item.status === 'DRAFT' && (
            <button onClick={() => void transition('INTERNAL_REVIEW')}>
              Gửi duyệt
            </button>
          )}
          {item.status === 'INTERNAL_REVIEW' && (
            <button
              className="primary"
              onClick={() => void transition('SIGNED')}
            >
              Đánh dấu đã ký
            </button>
          )}
          {item.status === 'SIGNED' && (
            <button
              className="primary"
              onClick={() => void transition('ACTIVE')}
            >
              Kích hoạt
            </button>
          )}
        </div>
      </header>
      {message && <p role="alert">{message}</p>}
      <section className="grid gap-3 sm:grid-cols-2">
        <div className="panel">
          <p>Giá trị gốc</p>
          <strong>
            {money(item.originalValue)} {item.currency}
          </strong>
        </div>
        <div className="panel">
          <p>Giá trị hiện tại</p>
          <strong>
            {money(item.currentValue)} {item.currency}
          </strong>
        </div>
      </section>
      <section className="grid gap-5 lg:grid-cols-2">
        <form className="panel grid gap-3" onSubmit={(e) => void appendix(e)}>
          <h2 className="font-semibold">Tạo phụ lục</h2>
          <input name="appendixNumber" placeholder="Số phụ lục" required />
          <select name="type">
            <option value="VALUE_INCREASE">Tăng giá trị</option>
            <option value="VALUE_DECREASE">Giảm giá trị</option>
            <option value="OTHER">Khác</option>
          </select>
          <input name="title" placeholder="Tiêu đề" required />
          <input
            name="valueChange"
            type="number"
            step="0.01"
            defaultValue="0"
            required
          />
          <input name="currency" defaultValue={item.currency} required />
          <button className="primary">Tạo phụ lục</button>
          <ul>
            {item.appendices.map((a) => (
              <li key={a.id}>
                {a.appendixNumber} · {a.title} · {money(a.valueChange)} ·{' '}
                {a.status}
              </li>
            ))}
          </ul>
        </form>
        <form className="panel grid gap-3" onSubmit={(e) => void schedules(e)}>
          <h2 className="font-semibold">Lịch thanh toán</h2>
          <input name="milestoneName" placeholder="Mốc thanh toán" required />
          <input name="dueDate" type="date" required />
          <input name="amount" type="number" min="0.01" step="0.01" required />
          <button className="primary">Thêm mốc</button>
          <ul>
            {item.paymentSchedules.map((s) => (
              <li key={s.id}>
                {s.milestoneName} ·{' '}
                {new Date(s.dueDate).toLocaleDateString('vi-VN')} · còn{' '}
                {money(s.outstandingAmount)} · {s.status}
              </li>
            ))}
          </ul>
        </form>
      </section>
    </div>
  );
}
