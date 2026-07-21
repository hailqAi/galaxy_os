'use client';
import { useEffect, useState } from 'react';
import { Actor, api } from './lib/api';
export default function DashboardPage() {
  const [actor, setActor] = useState<Actor>();
  useEffect(() => {
    api<Actor>('/me')
      .then(setActor)
      .catch(() => undefined);
  }, []);
  return (
    <section aria-labelledby="page-title">
      <p className="text-sm font-medium uppercase tracking-[0.2em] text-brass">
        Sprint 1
      </p>
      <h1 className="mt-2 text-3xl font-semibold" id="page-title">
        Tổng quan
      </h1>
      <div className="mt-8 max-w-3xl rounded-lg border border-black/10 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-medium">
          Xin chào {actor?.displayName ?? ''}
        </h2>
        <p className="mt-2 text-black/65">
          {actor
            ? `${actor.organization.name} · ${actor.roles.map((role) => role.name).join(', ') || 'Tài khoản cá nhân'}`
            : 'Đang tải thông tin tài khoản…'}
        </p>
      </div>
    </section>
  );
}
