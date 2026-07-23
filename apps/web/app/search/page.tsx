'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { api } from '../lib/api';

type SearchData = {
  query: string;
  groups: {
    entityType: string;
    total: number;
    items: { id: string; title: string; subtitle?: string; href: string }[];
  }[];
};

export default function SearchPage() {
  const params = useSearchParams();
  const query = params.get('q')?.trim() ?? '';
  const [data, setData] = useState<SearchData>();
  const [error, setError] = useState('');
  useEffect(() => {
    if (query.length < 2) return;
    api<SearchData>(`/search?q=${encodeURIComponent(query)}`)
      .then(setData)
      .catch((cause: Error) => setError(cause.message));
  }, [query]);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = String(new FormData(event.currentTarget).get('q') ?? '').trim();
    if (q.length >= 2)
      window.location.assign(`/search?q=${encodeURIComponent(q)}`);
  }
  return (
    <div className="grid gap-5">
      <p className="text-sm">Trang chủ / Tìm kiếm</p>
      <header>
        <h1 className="text-2xl font-semibold">Tìm kiếm</h1>
        <p className="text-sm text-black/60">
          Kết quả chỉ gồm dữ liệu bạn được phép xem
        </p>
      </header>
      <form className="panel flex gap-2" onSubmit={submit}>
        <input defaultValue={query} minLength={2} name="q" required />
        <button className="primary">Tìm</button>
      </form>
      {error && <p role="alert">{error}</p>}
      {!data ? (
        <p role="status">Đang tìm kiếm…</p>
      ) : !data.groups.some((group) => group.total) ? (
        <p>Không tìm thấy kết quả.</p>
      ) : (
        data.groups.map((group) =>
          group.total ? (
            <section className="panel" key={group.entityType}>
              <h2 className="font-semibold">
                {group.entityType} ({group.total})
              </h2>
              <ul className="divide-y">
                {group.items.map((item) => (
                  <li className="py-2" key={item.id}>
                    <Link href={item.href}>{item.title}</Link>
                    {item.subtitle && (
                      <span className="ml-2 text-sm text-black/60">
                        {item.subtitle}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ) : null,
        )
      )}
    </div>
  );
}
