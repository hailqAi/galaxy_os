'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '../../lib/api';

type Log = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  createdAt: string;
  actor?: { displayName: string; email: string };
  beforeData?: Record<string, unknown>;
  afterData?: Record<string, unknown>;
};
const detail = (log: Log) => {
  const keys = new Set([
    ...Object.keys(log.beforeData ?? {}),
    ...Object.keys(log.afterData ?? {}),
  ]);
  return (
    [...keys]
      .filter(
        (key) =>
          JSON.stringify(log.beforeData?.[key]) !==
          JSON.stringify(log.afterData?.[key]),
      )
      .slice(0, 3)
      .map(
        (key) =>
          `${key}: ${String(log.beforeData?.[key] ?? '—')} → ${String(log.afterData?.[key] ?? '—')}`,
      )
      .join('; ') || 'Không có chi tiết trường'
  );
};

export default function AuditLogsPage() {
  const [items, setItems] = useState<Log[]>([]);
  const [message, setMessage] = useState('Đang tải…');
  async function load(query = '') {
    try {
      const data = await api<{ items: Log[] }>(
        `/audit-logs?pageSize=100${query}`,
      );
      setItems(data.items);
      setMessage('');
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  useEffect(() => {
    api<{ items: Log[] }>('/audit-logs?pageSize=100')
      .then((data) => {
        setItems(data.items);
        setMessage('');
      })
      .catch((error: Error) => setMessage(error.message));
  }, []);
  function filter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const query = [...data.entries()]
      .filter(([, value]) => value)
      .map(([key, value]) => `&${key}=${encodeURIComponent(String(value))}`)
      .join('');
    void load(query);
  }
  return (
    <div className="panel overflow-x-auto">
      <h2 className="text-xl font-semibold">Nhật ký kiểm toán</h2>
      <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={filter}>
        <label>
          Người thực hiện
          <input name="actor" placeholder="UUID người dùng" />
        </label>
        <label>
          Hành động
          <input name="action" />
        </label>
        <label>
          Loại đối tượng
          <input name="entityType" />
        </label>
        <label>
          Từ ngày
          <input name="from" type="date" />
        </label>
        <label>
          Đến ngày
          <input name="to" type="date" />
        </label>
        <button type="submit">Lọc</button>
      </form>
      <p className="mt-4" role="status">
        {message}
      </p>
      {!items.length && !message ? (
        <p>Chưa có nhật ký phù hợp.</p>
      ) : (
        <table className="mt-3">
          <thead>
            <tr>
              <th>Thời gian</th>
              <th>Người thực hiện</th>
              <th>Hành động</th>
              <th>Đối tượng</th>
              <th>Thay đổi</th>
            </tr>
          </thead>
          <tbody>
            {items.map((log) => (
              <tr key={log.id}>
                <td>{new Date(log.createdAt).toLocaleString('vi-VN')}</td>
                <td>{log.actor?.displayName ?? 'Hệ thống'}</td>
                <td>{log.action}</td>
                <td>{log.entityType}</td>
                <td>{detail(log)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
