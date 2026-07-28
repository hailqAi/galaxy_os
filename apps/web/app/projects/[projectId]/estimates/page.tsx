'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';

type Estimate = {
  id: string;
  number: string;
  title: string;
  currentVersion: number;
  status: string;
  updatedAt: string;
};
export default function EstimatesPage() {
  const projectId = String(useParams().projectId);
  const [items, setItems] = useState<Estimate[]>([]);
  const [message, setMessage] = useState('');
  const load = useCallback(
    () =>
      api<Estimate[]>(`/projects/${projectId}/estimates`)
        .then(setItems)
        .catch((e: Error) => setMessage(e.message)),
    [projectId],
  );
  useEffect(() => {
    void load();
  }, [load]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await api(`/projects/${projectId}/estimates`, {
        method: 'POST',
        body: JSON.stringify({
          number: value.number,
          title: value.title,
          currency: value.currency,
          lines: [
            {
              section: value.section,
              itemType: value.itemType,
              customDescription: value.description,
              quantity: value.quantity,
              unit: value.unit,
              netPurchasePrice: value.netPurchasePrice,
              currency: value.currency,
              exchangeRateSnapshot: value.exchangeRateSnapshot,
              sellingPrice: value.sellingPrice,
            },
          ],
        }),
      });
      event.currentTarget.reset();
      await load();
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  return (
    <div className="grid gap-6">
      <p>
        <Link href={`/projects/${projectId}?workspace=estimates`}>
          Không gian dự án
        </Link>{' '}
        → Dự toán
      </p>
      <header>
        <h1 className="text-2xl font-semibold">Dự toán / BOQ</h1>
        <p>Chi phí nội bộ và giá bán được lưu riêng theo từng version.</p>
      </header>
      {message && <p role="alert">{message}</p>}
      <section className="panel">
        <h2 className="font-semibold">Tạo dự toán</h2>
        <form
          className="mt-4 grid gap-3 md:grid-cols-4"
          onSubmit={(e) => void create(e)}
        >
          <input name="number" placeholder="Số dự toán" required />
          <input name="title" placeholder="Tên dự toán" required />
          <input name="currency" defaultValue="VND" maxLength={3} required />
          <input
            name="exchangeRateSnapshot"
            defaultValue="1"
            inputMode="decimal"
            required
          />
          <input name="section" placeholder="Nhóm hạng mục" required />
          <input
            name="itemType"
            placeholder="Loại hạng mục"
            defaultValue="PRODUCT"
            required
          />
          <input name="description" placeholder="Mô tả" />
          <input name="unit" defaultValue="cái" required />
          <input
            name="quantity"
            type="number"
            min="0.001"
            step="0.001"
            defaultValue="1"
            required
          />
          <input
            name="netPurchasePrice"
            type="number"
            min="0"
            step="0.01"
            placeholder="Giá mua thuần"
            required
          />
          <input
            name="sellingPrice"
            type="number"
            min="0"
            step="0.01"
            placeholder="Đơn giá bán"
            required
          />
          <button className="primary">Tạo dự toán V1</button>
        </form>
      </section>
      <section className="panel overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr>
              <th>Số</th>
              <th>Tên</th>
              <th>Version</th>
              <th>Trạng thái</th>
              <th>Cập nhật</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr className="border-t" key={item.id}>
                <td className="py-3">
                  <Link href={`/projects/${projectId}/estimates/${item.id}`}>
                    {item.number}
                  </Link>
                </td>
                <td>{item.title}</td>
                <td>V{item.currentVersion}</td>
                <td>{item.status}</td>
                <td>{new Date(item.updatedAt).toLocaleDateString('vi-VN')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!items.length && (
          <p className="py-5">
            Chưa có dự toán. Dùng form trên để tạo BOQ đầu tiên.
          </p>
        )}
      </section>
    </div>
  );
}
