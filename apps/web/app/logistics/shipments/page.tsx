'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

type Shipment = {
  id: string;
  shipmentNumber: string;
  mode: string;
  etd: string | null;
  eta: string | null;
  status: string;
  purchaseOrder: { poNumber: string };
};

export default function ShipmentsPage() {
  const projectId = useSearchParams().get('projectId');
  const [items, setItems] = useState<Shipment[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    api<{ items: Shipment[] }>(
      `/shipments${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`,
    )
      .then((result) => setItems(result.items))
      .catch((cause: Error) => setError(cause.message));
  }, [projectId]);
  return (
    <div className="grid gap-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Vận chuyển</h1>
        <Link
          className="primary rounded px-3 py-2"
          href={`/logistics/shipments/new${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`}
        >
          Tạo Shipment
        </Link>
      </header>
      {error && <p role="alert">{error}</p>}
      <section className="panel overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr>
              <th>Số Shipment</th>
              <th>PO</th>
              <th>Phương thức</th>
              <th>ETD</th>
              <th>ETA</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr className="border-t" key={item.id}>
                <td className="py-3">
                  <Link href={`/logistics/shipments/${item.id}`}>
                    {item.shipmentNumber}
                  </Link>
                </td>
                <td>{item.purchaseOrder.poNumber}</td>
                <td>{item.mode}</td>
                <td>
                  {item.etd
                    ? new Date(item.etd).toLocaleDateString('vi-VN')
                    : '—'}
                </td>
                <td>
                  {item.eta
                    ? new Date(item.eta).toLocaleDateString('vi-VN')
                    : '—'}
                </td>
                <td>{item.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!items.length && !error && <p className="py-6">Chưa có shipment.</p>}
      </section>
    </div>
  );
}
