'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
type Item = {
  id: string;
  title: string;
  brandEcosystem: string;
  status: string;
  scheduledAt: string | null;
  author: { displayName: string };
  campaign: { name: string } | null;
  variants: { channel: string }[];
};
export default function ContentPage() {
  const [items, setItems] = useState<Item[]>();
  const [error, setError] = useState('');
  useEffect(() => {
    api<{ items: Item[] }>('/content?pageSize=50')
      .then((result) => setItems(result.items))
      .catch((cause: Error) => setError(cause.message));
  }, []);
  return (
    <div className="grid gap-5">
      <p className="text-sm">Trang chủ / Marketing / Nội dung</p>
      <header className="flex justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Nội dung Marketing</h1>
          <p className="text-sm text-black/60">
            Review, phê duyệt và lập lịch đa kênh
          </p>
        </div>
        <Link className="primary" href="/marketing/content/new">
          + Tạo nội dung
        </Link>
      </header>
      {error && <p role="alert">{error}</p>}
      {!items ? (
        <p role="status">Đang tải nội dung…</p>
      ) : !items.length ? (
        <p className="panel">Chưa có nội dung.</p>
      ) : (
        <section className="panel">
          <table>
            <thead>
              <tr>
                <th>Tiêu đề</th>
                <th>Hệ sinh thái</th>
                <th>Chiến dịch</th>
                <th>Kênh</th>
                <th>Trạng thái</th>
                <th>Tác giả</th>
                <th>Lịch</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <Link href={`/marketing/content/${item.id}`}>
                      {item.title}
                    </Link>
                  </td>
                  <td>{item.brandEcosystem}</td>
                  <td>{item.campaign?.name ?? '—'}</td>
                  <td>
                    {item.variants
                      .map((variant) => variant.channel)
                      .join(', ') || '—'}
                  </td>
                  <td>{item.status}</td>
                  <td>{item.author.displayName}</td>
                  <td>
                    {item.scheduledAt
                      ? new Date(item.scheduledAt).toLocaleString('vi-VN')
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
