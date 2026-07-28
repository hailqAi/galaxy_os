'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  readAt: string | null;
  createdAt: string;
  actor: { displayName: string } | null;
};
type Page = {
  items: Notification[];
  page: number;
  total: number;
  totalPages: number;
};

export default function NotificationsPage() {
  const [data, setData] = useState<Page>();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const load = useCallback(
    () =>
      api<Page>(
        `/notifications?${new URLSearchParams({ page: String(page), pageSize: '20', ...(unreadOnly && { unreadOnly: 'true' }) })}`,
      )
        .then(setData)
        .catch((cause: Error) => setError(cause.message)),
    [page, unreadOnly],
  );
  useEffect(() => void load(), [load]);
  async function action(id: string, name: 'read' | 'unread' | 'archive') {
    try {
      await api(`/notifications/${id}/${name}`, { method: 'POST' });
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  async function readAll() {
    try {
      await api('/notifications/read-all', { method: 'POST' });
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  return (
    <div className="grid gap-5">
      <p className="text-sm">Trang chủ / Thông báo</p>
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Thông báo</h1>
          <p className="text-sm text-black/60">
            Theo dõi công việc, dự án, phê duyệt và nhắc đến bạn
          </p>
        </div>
        <button onClick={() => void readAll()}>Đánh dấu tất cả đã đọc</button>
      </header>
      <section className="panel grid gap-4">
        <div className="flex gap-2">
          <button onClick={() => setUnreadOnly(false)}>Tất cả</button>
          <button onClick={() => setUnreadOnly(true)}>Chưa đọc</button>
          <span className="ml-auto">{data?.total ?? 0} thông báo</span>
        </div>
        {error && <p role="alert">{error}</p>}
        {!data ? (
          <p role="status">Đang tải thông báo…</p>
        ) : !data.items.length ? (
          <p>Không có thông báo phù hợp.</p>
        ) : (
          <ul className="grid gap-2">
            {data.items.map((item) => (
              <li
                className={`rounded border p-3 ${item.readAt ? '' : 'bg-blue-50'}`}
                key={item.id}
              >
                <div className="flex justify-between gap-3">
                  <div>
                    <strong>
                      {item.href ? (
                        <Link href={item.href}>{item.title}</Link>
                      ) : (
                        item.title
                      )}
                    </strong>
                    {item.body && <p>{item.body}</p>}
                    <p className="text-xs text-black/60">
                      {item.actor?.displayName
                        ? `${item.actor.displayName} · `
                        : ''}
                      {new Date(item.createdAt).toLocaleString('vi-VN')}
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <button
                      onClick={() =>
                        void action(item.id, item.readAt ? 'unread' : 'read')
                      }
                    >
                      {item.readAt ? 'Chưa đọc' : 'Đã đọc'}
                    </button>
                    <button onClick={() => void action(item.id, 'archive')}>
                      Lưu trữ
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="flex justify-end gap-2">
          <button disabled={page === 1} onClick={() => setPage(page - 1)}>
            Trước
          </button>
          <span>
            {page}/{data?.totalPages || 1}
          </span>
          <button
            disabled={!data || page >= data.totalPages}
            onClick={() => setPage(page + 1)}
          >
            Sau
          </button>
        </div>
      </section>
    </div>
  );
}
