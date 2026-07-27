'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
type Item = {
  id: string;
  declarationNumber: string;
  status: string;
  totalTaxAmount: string;
  currency: string;
  shipment: { shipmentNumber: string };
};
export default function CustomsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    api<Item[]>('/customs')
      .then(setItems)
      .catch((cause: Error) => setError(cause.message));
  }, []);
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">Hải quan và thuế nhập khẩu</h1>
      {error && <p role="alert">{error}</p>}
      <section className="panel overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr>
              <th>Tờ khai</th>
              <th>Shipment</th>
              <th>Tổng thuế</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr className="border-t" key={item.id}>
                <td>
                  <Link href={`/logistics/customs/${item.id}`}>
                    {item.declarationNumber}
                  </Link>
                </td>
                <td>{item.shipment.shipmentNumber}</td>
                <td>
                  {item.totalTaxAmount} {item.currency}
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
