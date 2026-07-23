'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { Actor, api, apiUrl } from './lib/api';
import { visibleNavigation } from './portal-navigation';

export default function PortalShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [actor, setActor] = useState<Actor>();
  const [unread, setUnread] = useState(0);
  const publicPage =
    path === '/login' ||
    path === '/forgot-password' ||
    path === '/reset-password' ||
    path === '/forbidden';
  useEffect(() => {
    if (!publicPage)
      api<Actor>('/me')
        .then(setActor)
        .catch(() =>
          router.replace(`/login?returnTo=${encodeURIComponent(path)}`),
        );
  }, [path, publicPage, router]);
  useEffect(() => {
    if (actor?.permissions.includes('notification.read'))
      api<{ count: number }>('/notifications/unread-count')
        .then((result) => setUnread(result.count))
        .catch(() => setUnread(0));
  }, [actor, path]);
  if (publicPage) return children;
  if (!actor)
    return (
      <main className="grid min-h-screen place-items-center" aria-live="polite">
        Đang tải tài khoản…
      </main>
    );
  const initials = actor.displayName
    .split(/\s+/)
    .map((part) => part[0])
    .slice(-2)
    .join('')
    .toUpperCase();
  async function logout() {
    await api('/auth/logout', { method: 'POST' });
    setActor(undefined);
    router.replace('/login');
    router.refresh();
  }
  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = String(
      new FormData(event.currentTarget).get('q') ?? '',
    ).trim();
    if (query.length >= 2)
      router.push(`/search?q=${encodeURIComponent(query)}`);
  }
  return (
    <div className="min-h-screen md:grid md:grid-cols-[240px_1fr]">
      <aside className="bg-ink px-5 py-6 text-white">
        <Link className="text-xl font-semibold tracking-wide" href="/">
          Galaxy OS
        </Link>
        <p className="mt-1 text-sm text-white/60">{actor.organization.name}</p>
        <nav
          aria-label="Điều hướng chính"
          className="mt-8 flex flex-wrap gap-2 md:flex-col"
        >
          {visibleNavigation(actor.permissions, actor.administrationScope).map(
            (item) => (
              <Link
                className="rounded px-3 py-2 text-sm hover:bg-white/10"
                href={item.href}
                key={item.href}
              >
                {item.label}
              </Link>
            ),
          )}
        </nav>
      </aside>
      <div>
        <header className="flex min-h-16 items-center justify-between border-b border-black/10 bg-white px-6">
          <form onSubmit={search}>
            <input
              aria-label="Tìm kiếm toàn hệ thống"
              className="w-64"
              minLength={2}
              name="q"
              placeholder="Tìm khách hàng, dự án, công việc…"
            />
          </form>
          <div className="flex items-center gap-3">
            {actor.permissions.includes('notification.read') && (
              <Link
                aria-label={`${unread} thông báo chưa đọc`}
                className="relative rounded px-2 py-1"
                href="/notifications"
              >
                🔔
                {unread > 0 && (
                  <span className="absolute -right-1 -top-1 rounded-full bg-red-600 px-1 text-xs text-white">
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </Link>
            )}
            {actor.avatarUrl ? (
              <img
                alt=""
                className="h-9 w-9 rounded-full object-cover"
                src={`${apiUrl}${actor.avatarUrl}`}
              />
            ) : (
              <span className="grid h-9 w-9 place-items-center rounded-full bg-ink text-xs text-white">
                {initials}
              </span>
            )}
            <Link href="/account/profile">{actor.displayName}</Link>
            <button onClick={() => void logout()}>Đăng xuất</button>
          </div>
        </header>
        <main className="p-6 lg:p-10">{children}</main>
      </div>
    </div>
  );
}
