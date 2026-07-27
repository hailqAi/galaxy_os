'use client';
import { use, useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
type Item = {
  number: string;
  status: string;
  totalAmount: string;
  baseCurrency: string;
  lines: {
    id: string;
    category: string;
    description: string;
    baseAmount: string;
    allocationMethod: string;
  }[];
};
export default function LandedCostDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [item, setItem] = useState<Item>();
  const [error, setError] = useState('');
  const load = useCallback(
    () =>
      api<Item>(`/landed-costs/${id}`)
        .then(setItem)
        .catch((cause: Error) => setError(cause.message)),
    [id],
  );
  useEffect(() => void load(), [load]);
  async function finalize() {
    try {
      await api(`/landed-costs/${id}/finalize`, { method: 'POST' });
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  if (!item)
    return (
      <p role={error ? 'alert' : undefined}>
        {error || 'Đang tải landed cost…'}
      </p>
    );
  return (
    <div className="grid gap-6">
      <header className="flex justify-between">
        <h1 className="text-2xl font-semibold">{item.number}</h1>
        {item.status === 'DRAFT' && (
          <button className="primary rounded px-3 py-2" onClick={finalize}>
            Finalize
          </button>
        )}
      </header>
      {error && <p role="alert">{error}</p>}
      <section className="panel">
        <p>
          {item.totalAmount} {item.baseCurrency} · {item.status}
        </p>
      </section>
      <section className="panel overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr>
              <th>Loại</th>
              <th>Mô tả</th>
              <th>Số tiền</th>
              <th>Phân bổ</th>
            </tr>
          </thead>
          <tbody>
            {item.lines.map((line) => (
              <tr className="border-t" key={line.id}>
                <td>{line.category}</td>
                <td>{line.description}</td>
                <td>{line.baseAmount}</td>
                <td>{line.allocationMethod}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
