'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

type Quote = {
  id: string;
  quotationNumber: string;
  supplierId: string;
  currency: string;
  totalAmount: string;
  status: string;
  revision: number;
  validUntil: string | null;
  rfq: { rfqNumber: string };
};

export default function SupplierQuotesPage() {
  const projectId = useSearchParams().get('projectId');
  const [items, setItems] = useState<Quote[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    void api<{ items: Quote[] }>(
      `/supplier-quotations?pageSize=50${projectId ? `&projectId=${projectId}` : ''}`,
    )
      .then(({ items }) => setItems(items))
      .catch((e: Error) => setError(e.message));
  }, [projectId]);
  return (
    <div className="grid gap-6">
      <header className="flex justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Báo giá nhà cung cấp</h1>
          <p>Giá và điều kiện nhận theo từng RFQ.</p>
        </div>
        <Link
          className="primary rounded px-3 py-2"
          href={`/procurement/supplier-quotes/new${projectId ? `?projectId=${projectId}` : ''}`}
        >
          Ghi nhận báo giá
        </Link>
      </header>
      {error && <p role="alert">{error}</p>}
      <section className="panel overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr>
              <th>Số báo giá</th>
              <th>RFQ</th>
              <th>Phiên bản</th>
              <th>Giá trị</th>
              <th>Hiệu lực</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr className="border-t" key={item.id}>
                <td className="py-3">
                  <Link href={`/procurement/supplier-quotes/${item.id}`}>
                    {item.quotationNumber}
                  </Link>
                </td>
                <td>{item.rfq.rfqNumber}</td>
                <td>R{item.revision}</td>
                <td>
                  {new Intl.NumberFormat('vi-VN').format(
                    Number(item.totalAmount),
                  )}{' '}
                  {item.currency}
                </td>
                <td>
                  {item.validUntil
                    ? new Date(item.validUntil).toLocaleDateString('vi-VN')
                    : '—'}
                </td>
                <td>{item.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!items.length && (
          <p className="py-5">Chưa nhận báo giá nhà cung cấp.</p>
        )}
      </section>
    </div>
  );
}
