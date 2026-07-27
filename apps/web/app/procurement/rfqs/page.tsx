'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

type RFQ = {
  id: string;
  rfqNumber: string;
  responseDeadline: string;
  status: string;
  purchaseRequest: { requestNumber: string };
  _count: { recipients: number };
};

export default function RFQsPage() {
  const projectId = useSearchParams().get('projectId');
  const [items, setItems] = useState<RFQ[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    void api<{ items: RFQ[] }>(
      `/rfqs?pageSize=50${projectId ? `&projectId=${projectId}` : ''}`,
    )
      .then(({ items }) => setItems(items))
      .catch((e: Error) => setError(e.message));
  }, [projectId]);
  return (
    <div className="grid gap-6">
      <header className="flex justify-between">
        <div>
          <h1 className="text-2xl font-semibold">RFQ nhà cung cấp</h1>
          <p>Yêu cầu báo giá từ các nhà cung cấp đã chọn.</p>
        </div>
        <Link
          className="primary rounded px-3 py-2"
          href={`/procurement/rfqs/new${projectId ? `?projectId=${projectId}` : ''}`}
        >
          Tạo RFQ
        </Link>
      </header>
      {error && <p role="alert">{error}</p>}
      <section className="panel overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr>
              <th>Số RFQ</th>
              <th>Yêu cầu mua hàng</th>
              <th>Nhà cung cấp</th>
              <th>Hạn phản hồi</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr className="border-t" key={item.id}>
                <td className="py-3">
                  <Link href={`/procurement/rfqs/${item.id}`}>
                    {item.rfqNumber}
                  </Link>
                </td>
                <td>{item.purchaseRequest.requestNumber}</td>
                <td>{item._count.recipients}</td>
                <td>
                  {new Date(item.responseDeadline).toLocaleDateString('vi-VN')}
                </td>
                <td>{item.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!items.length && <p className="py-5">Chưa có RFQ.</p>}
      </section>
    </div>
  );
}
