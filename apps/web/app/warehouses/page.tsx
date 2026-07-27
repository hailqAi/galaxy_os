'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
type Warehouse = {
  id: string;
  code: string;
  name: string;
  type: string;
  address: string | null;
  _count: { zones: number; locations: number };
};
export default function WarehousesPage() {
  const projectId = useSearchParams().get('projectId');
  const [items, setItems] = useState<Warehouse[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    api<Warehouse[]>(
      `/warehouses${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`,
    )
      .then(setItems)
      .catch((cause: Error) => setError(cause.message));
  }, [projectId]);
  return (
    <div className="grid gap-6">
      <header className="flex justify-between">
        <h1 className="text-2xl font-semibold">Kho</h1>
        <Link className="primary rounded px-3 py-2" href="/warehouses/new">
          Tạo kho
        </Link>
      </header>
      {error && <p role="alert">{error}</p>}
      <section className="panel overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr>
              <th>Mã</th>
              <th>Tên</th>
              <th>Loại</th>
              <th>Vị trí</th>
              <th>Địa chỉ</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr className="border-t" key={item.id}>
                <td>
                  <Link href={`/warehouses/${item.id}`}>{item.code}</Link>
                </td>
                <td>{item.name}</td>
                <td>{item.type}</td>
                <td>
                  {item._count.zones} khu · {item._count.locations} vị trí
                </td>
                <td>{item.address || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!items.length && !error && <p className="py-6">Chưa có kho.</p>}
      </section>
    </div>
  );
}
