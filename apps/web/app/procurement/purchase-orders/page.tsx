'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
type PO = {
  id: string;
  poNumber: string;
  supplierId: string;
  currency: string;
  totalAmount: string;
  status: string;
  revision: number;
  expectedReadyDate: string | null;
  _count: { lines: number };
};
export default function PurchaseOrdersPage() {
  const projectId = useSearchParams().get('projectId');
  const [items, setItems] = useState<PO[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    void api<PO[]>(
      `/purchase-orders${projectId ? `?projectId=${projectId}` : ''}`,
    )
      .then(setItems)
      .catch((e: Error) => setError(e.message));
  }, [projectId]);
  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Đơn mua hàng</h1>
        <p>PO chỉ tạo từ lựa chọn nhà cung cấp đã duyệt.</p>
      </header>
      {error && <p role="alert">{error}</p>}
      <section className="panel overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr>
              <th>Số PO</th>
              <th>Nhà cung cấp</th>
              <th>Line</th>
              <th>Giá trị</th>
              <th>Sẵn sàng dự kiến</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr className="border-t" key={item.id}>
                <td className="py-3">
                  <Link href={`/procurement/purchase-orders/${item.id}`}>
                    {item.poNumber}
                  </Link>
                </td>
                <td>{item.supplierId}</td>
                <td>{item._count.lines}</td>
                <td>
                  {new Intl.NumberFormat('vi-VN').format(
                    Number(item.totalAmount),
                  )}{' '}
                  {item.currency}
                </td>
                <td>
                  {item.expectedReadyDate
                    ? new Date(item.expectedReadyDate).toLocaleDateString(
                        'vi-VN',
                      )
                    : '—'}
                </td>
                <td>{item.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!items.length && <p className="py-5">Chưa có PO.</p>}
      </section>
    </div>
  );
}
