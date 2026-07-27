'use client';
import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';

type Order = {
  id: string;
  status: string;
  progressPercentage: string;
  plannedReadyDate: string | null;
  purchaseOrder: { poNumber: string };
};
export default function ProductionPage() {
  const [items, setItems] = useState<Order[]>([]);
  const [error, setError] = useState('');
  const load = useCallback(
    () =>
      api<Order[]>('/production-orders')
        .then(setItems)
        .catch((cause: Error) => setError(cause.message)),
    [],
  );
  useEffect(() => void load(), [load]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api('/production-orders', {
        method: 'POST',
        body: JSON.stringify({ purchaseOrderId: form.get('purchaseOrderId') }),
      });
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Theo dõi sản xuất</h1>
      </header>
      {error && <p role="alert">{error}</p>}
      <form className="panel flex flex-wrap gap-3" onSubmit={create}>
        <label>
          PO đã xác nhận
          <input name="purchaseOrderId" required />
        </label>
        <button className="primary self-end rounded px-3 py-2" type="submit">
          Tạo Production Order
        </button>
      </form>
      <section className="panel overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr>
              <th>PO</th>
              <th>Tiến độ</th>
              <th>Sẵn sàng dự kiến</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr className="border-t" key={item.id}>
                <td className="py-3">
                  <Link href={`/production/${item.id}`}>
                    {item.purchaseOrder.poNumber}
                  </Link>
                </td>
                <td>{item.progressPercentage}%</td>
                <td>
                  {item.plannedReadyDate
                    ? new Date(item.plannedReadyDate).toLocaleDateString(
                        'vi-VN',
                      )
                    : '—'}
                </td>
                <td>{item.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
