'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../../lib/api';

type Line = {
  id: string;
  section: string;
  customDescription: string | null;
  itemType: string;
  quantity: string;
  unit: string;
  sellingPrice: string;
  totalCost?: string;
};
type Estimate = {
  number: string;
  title: string;
  currency: string;
  versions: {
    version: number;
    status: string;
    subtotalCost?: string;
    subtotalSelling: string;
    lines: Line[];
    approvals: {
      id: string;
      decision: string;
      comment: string | null;
      createdAt: string;
    }[];
  }[];
};
export default function EstimatePage() {
  const { projectId, estimateId } = useParams<{
    projectId: string;
    estimateId: string;
  }>();
  const [item, setItem] = useState<Estimate>();
  const [message, setMessage] = useState('');
  const load = useCallback(
    () =>
      api<Estimate>(`/projects/${projectId}/estimates/${estimateId}`)
        .then(setItem)
        .catch((e: Error) => setMessage(e.message)),
    [estimateId, projectId],
  );
  useEffect(() => {
    void load();
  }, [load]);
  async function action(name: 'submit' | 'approve' | 'reject') {
    try {
      await api(`/projects/${projectId}/estimates/${estimateId}/${name}`, {
        method: 'POST',
        body: '{}',
      });
      await load();
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  if (!item)
    return (
      <p role={message ? 'alert' : 'status'}>
        {message || 'Đang tải dự toán…'}
      </p>
    );
  const version = item.versions[0];
  if (!version) return <p role="alert">Dự toán không có version hợp lệ.</p>;
  const money = (value?: string) =>
    value === undefined
      ? 'Không có quyền xem'
      : new Intl.NumberFormat('vi-VN').format(Number(value));
  return (
    <div className="grid gap-6">
      <p>
        <Link href={`/projects/${projectId}/estimates`}>Dự toán</Link> →{' '}
        {item.number}
      </p>
      <header className="flex justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{item.title}</h1>
          <p>
            {item.number} · V{version.version} · {version.status}
          </p>
        </div>
        <div className="flex gap-2">
          {version.status === 'DRAFT' && (
            <button className="primary" onClick={() => void action('submit')}>
              Gửi duyệt
            </button>
          )}
          {version.status === 'PENDING' && (
            <>
              <button
                className="primary"
                onClick={() => void action('approve')}
              >
                Duyệt
              </button>
              <button onClick={() => void action('reject')}>Từ chối</button>
            </>
          )}
        </div>
      </header>
      {message && <p role="alert">{message}</p>}
      <section className="panel overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr>
              <th>Nhóm</th>
              <th>Mô tả</th>
              <th>Khối lượng</th>
              <th>Giá bán</th>
              <th>Chi phí nội bộ</th>
            </tr>
          </thead>
          <tbody>
            {version.lines.map((line) => (
              <tr className="border-t" key={line.id}>
                <td className="py-3">{line.section}</td>
                <td>{line.customDescription || line.itemType}</td>
                <td>
                  {line.quantity} {line.unit}
                </td>
                <td>{money(line.sellingPrice)}</td>
                <td>{money(line.totalCost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-4 flex justify-end gap-6">
          <strong>Chi phí: {money(version.subtotalCost)}</strong>
          <strong>
            Giá bán: {money(version.subtotalSelling)} {item.currency}
          </strong>
        </div>
      </section>
      <section className="panel">
        <h2 className="font-semibold">Lịch sử phê duyệt</h2>
        {version.approvals.length ? (
          <ul>
            {version.approvals.map((a) => (
              <li key={a.id}>
                {a.decision} · {new Date(a.createdAt).toLocaleString('vi-VN')}{' '}
                {a.comment}
              </li>
            ))}
          </ul>
        ) : (
          <p>Chưa có quyết định.</p>
        )}
      </section>
    </div>
  );
}
