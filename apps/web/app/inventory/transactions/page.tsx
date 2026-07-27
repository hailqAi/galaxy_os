'use client';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
type Transaction = {
  id: string;
  transactionNumber: string;
  type: string;
  sourceType: string;
  postedAt: string;
  lines: { id: string; quantity: string }[];
};
export default function InventoryTransactionsPage() {
  const [items, setItems] = useState<Transaction[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    api<Transaction[]>('/inventory/transactions')
      .then(setItems)
      .catch((cause: Error) => setError(cause.message));
  }, []);
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">Giao dịch tồn kho</h1>
      {error && <p role="alert">{error}</p>}
      <section className="panel overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr>
              <th>Số</th>
              <th>Loại</th>
              <th>Nguồn</th>
              <th>Số dòng</th>
              <th>Ngày post</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr className="border-t" key={item.id}>
                <td>{item.transactionNumber}</td>
                <td>{item.type}</td>
                <td>{item.sourceType}</td>
                <td>{item.lines.length}</td>
                <td>{new Date(item.postedAt).toLocaleString('vi-VN')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
