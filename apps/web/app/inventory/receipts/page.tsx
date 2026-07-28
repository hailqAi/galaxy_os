'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
type Receipt = {
  id: string;
  receiptNumber: string;
  status: string;
  createdAt: string;
  warehouseId: string;
  _count: { lines: number; inspections: number };
};
export default function ReceiptsPage() {
  const [items, setItems] = useState<Receipt[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    api<Receipt[]>('/inventory/receipts')
      .then(setItems)
      .catch((cause: Error) => setError(cause.message));
  }, []);
  return (
    <div className="grid gap-6">
      <header className="flex justify-between">
        <h1 className="text-2xl font-semibold">Phiếu nhập kho</h1>
        <Link
          className="primary rounded px-3 py-2"
          href="/inventory/receipts/new"
        >
          Tạo phiếu nhập
        </Link>
      </header>
      {error && <p role="alert">{error}</p>}
      <section className="panel overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr>
              <th>Số phiếu</th>
              <th>Kho</th>
              <th>Số dòng</th>
              <th>QC</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr className="border-t" key={item.id}>
                <td>
                  <Link href={`/inventory/receipts/${item.id}`}>
                    {item.receiptNumber}
                  </Link>
                </td>
                <td>{item.warehouseId}</td>
                <td>{item._count.lines}</td>
                <td>{item._count.inspections}</td>
                <td>{item.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
