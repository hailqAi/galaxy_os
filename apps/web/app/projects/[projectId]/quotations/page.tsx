'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';

type Quotation = {
  id: string;
  number: string;
  currentVersion: number;
  status: string;
  currency: string;
  grandTotal: string;
  validUntil: string | null;
};
export default function QuotationsPage() {
  const projectId = String(useParams().projectId);
  const [items, setItems] = useState<Quotation[]>([]);
  const [message, setMessage] = useState('');
  const load = useCallback(
    () =>
      api<Quotation[]>(`/projects/${projectId}/quotations`)
        .then(setItems)
        .catch((e: Error) => setMessage(e.message)),
    [projectId],
  );
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  return (
    <div className="grid gap-6">
      <p>
        <Link href={`/projects/${projectId}/stage-1`}>Không gian dự án</Link> →
        Báo giá
      </p>
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Báo giá</h1>
          <p>Mỗi lần chỉnh sửa sau khi duyệt hoặc gửi tạo một version mới.</p>
        </div>
        <Link
          className="primary rounded px-3 py-2"
          href={`/projects/${projectId}/quotations/new`}
        >
          Tạo từ dự toán
        </Link>
      </header>
      {message && <p role="alert">{message}</p>}
      <section className="panel overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr>
              <th>Số báo giá</th>
              <th>Version</th>
              <th>Trạng thái</th>
              <th>Hiệu lực</th>
              <th className="text-right">Tổng giá trị</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr className="border-t" key={item.id}>
                <td className="py-3">
                  <Link href={`/projects/${projectId}/quotations/${item.id}`}>
                    {item.number}
                  </Link>
                </td>
                <td>V{item.currentVersion}</td>
                <td>{item.status}</td>
                <td>
                  {item.validUntil
                    ? new Date(item.validUntil).toLocaleDateString('vi-VN')
                    : '—'}
                </td>
                <td className="text-right">
                  {new Intl.NumberFormat('vi-VN').format(
                    Number(item.grandTotal),
                  )}{' '}
                  {item.currency}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!items.length && (
          <p className="py-6">Chưa có báo giá. Tạo từ một dự toán đã duyệt.</p>
        )}
      </section>
    </div>
  );
}
