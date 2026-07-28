'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
type Item = {
  id: string;
  number: string;
  status: string;
  totalAmount: string;
  baseCurrency: string;
  shipment: { shipmentNumber: string };
};
export default function LandedCostsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    api<Item[]>('/landed-costs')
      .then(setItems)
      .catch((cause: Error) => setError(cause.message));
  }, []);
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">Landed Cost</h1>
      {error && <p role="alert">{error}</p>}
      <section className="panel overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr>
              <th>Số</th>
              <th>Shipment</th>
              <th>Tổng</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr className="border-t" key={item.id}>
                <td>
                  <Link href={`/logistics/landed-costs/${item.id}`}>
                    {item.number}
                  </Link>
                </td>
                <td>{item.shipment.shipmentNumber}</td>
                <td>
                  {item.totalAmount} {item.baseCurrency}
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
