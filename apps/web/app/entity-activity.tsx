'use client';

import { useEffect, useState } from 'react';
import { api } from './lib/api';

type Activity = {
  id: string;
  event: string;
  description: string | null;
  createdAt: string;
  actor: { displayName: string };
};

export function EntityActivity({
  entityType,
  entityId,
}: {
  entityType: string;
  entityId: string;
}) {
  const [items, setItems] = useState<Activity[]>();
  const [error, setError] = useState('');
  useEffect(() => {
    api<{ items: Activity[] }>(
      `/activities?${new URLSearchParams({ entityType, entityId, pageSize: '20' })}`,
    )
      .then((result) => setItems(result.items))
      .catch((cause: Error) => setError(cause.message));
  }, [entityId, entityType]);
  return (
    <section className="panel">
      <h2 className="font-semibold">Hoạt động</h2>
      {error ? (
        <p role="alert">{error}</p>
      ) : !items ? (
        <p role="status">Đang tải hoạt động…</p>
      ) : !items.length ? (
        <p>Chưa có hoạt động.</p>
      ) : (
        <ul className="divide-y">
          {items.map((item) => (
            <li className="py-3" key={item.id}>
              <strong>{item.actor.displayName}</strong> · {item.event}
              {item.description && <p>{item.description}</p>}
              <time className="text-xs text-black/60">
                {new Date(item.createdAt).toLocaleString('vi-VN')}
              </time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
