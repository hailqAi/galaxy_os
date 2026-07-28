'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
type Request = {
  id: string;
  requestNumber: string;
  sourceType: string;
  status: string;
  priority: string;
  requiredDate: string | null;
  project: { name: string };
  _count: { lines: number };
};
export default function RequestsPage() {
  const query = useSearchParams();
  const projectId = query.get('projectId');
  const [items, setItems] = useState<Request[]>([]);
  const [message, setMessage] = useState('');
  const load = useCallback(
    () =>
      api<{ items: Request[] }>(
        `/purchase-requests?pageSize=50${projectId ? `&projectId=${projectId}` : ''}`,
      )
        .then((r) => setItems(r.items))
        .catch((e: Error) => setMessage(e.message)),
    [projectId],
  );
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  return (
    <div className="grid gap-6">
      <header className="flex justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Yêu cầu mua hàng</h1>
          <p>Tập hợp nhu cầu đã được phép trước khi gửi RFQ.</p>
        </div>
        <Link
          className="primary rounded px-3 py-2"
          href={`/procurement/requests/new${projectId ? `?projectId=${projectId}` : ''}`}
        >
          Tạo yêu cầu
        </Link>
      </header>
      {message && <p role="alert">{message}</p>}
      <section className="panel overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr>
              <th>Số</th>
              <th>Dự án</th>
              <th>Nguồn</th>
              <th>Hạng mục</th>
              <th>Ưu tiên</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr className="border-t" key={item.id}>
                <td className="py-3">
                  <Link href={`/procurement/requests/${item.id}`}>
                    {item.requestNumber}
                  </Link>
                </td>
                <td>{item.project.name}</td>
                <td>{item.sourceType}</td>
                <td>{item._count.lines}</td>
                <td>{item.priority}</td>
                <td>{item.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!items.length && <p className="py-5">Chưa có yêu cầu mua hàng.</p>}
      </section>
    </div>
  );
}
