'use client';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
type Asset = {
  id: string;
  status: string;
  productId: string;
  warrantyStart: string;
  warrantyEnd: string;
  inventorySerialId: string | null;
};
export default function ProjectWarrantyPage() {
  const projectId = String(useParams().projectId);
  const [items, setItems] = useState<Asset[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    void api<Asset[]>(`/warranty/assets?projectId=${projectId}`)
      .then(setItems)
      .catch((e: Error) => setError(e.message));
  }, [projectId]);
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">Tài sản bảo hành</h1>
      {error && <p role="alert">{error}</p>}
      <section className="panel overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr>
              <th>Product</th>
              <th>Serial</th>
              <th>Bắt đầu</th>
              <th>Kết thúc</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr className="border-t" key={item.id}>
                <td>{item.productId}</td>
                <td>{item.inventorySerialId ?? '—'}</td>
                <td>
                  {new Date(item.warrantyStart).toLocaleDateString('vi-VN')}
                </td>
                <td>
                  {new Date(item.warrantyEnd).toLocaleDateString('vi-VN')}
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
