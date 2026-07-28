'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
type Item = {
  id: string;
  title: string;
  status: string;
  scheduledAt: string | null;
  variants: { channel: string }[];
};
export default function CalendarPage() {
  const [items, setItems] = useState<Item[]>();
  useEffect(() => {
    api<{ items: Item[] }>('/content?pageSize=100')
      .then((data) => setItems(data.items.filter((item) => item.scheduledAt)))
      .catch(() => setItems([]));
  }, []);
  return (
    <div className="grid gap-5">
      <p>Trang chủ / Marketing / Lịch xuất bản</p>
      <h1 className="text-2xl font-semibold">Lịch xuất bản</h1>
      {!items ? (
        <p role="status">Đang tải lịch…</p>
      ) : !items.length ? (
        <p className="panel">Chưa có nội dung được lập lịch.</p>
      ) : (
        <section className="panel">
          <ul className="divide-y">
            {items.map((item) => (
              <li className="py-3" key={item.id}>
                <time>
                  {new Date(item.scheduledAt!).toLocaleString('vi-VN')}
                </time>{' '}
                ·{' '}
                <Link href={`/marketing/content/${item.id}`}>{item.title}</Link>{' '}
                · {item.variants.map((v) => v.channel).join(', ')} ·{' '}
                {item.status}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
