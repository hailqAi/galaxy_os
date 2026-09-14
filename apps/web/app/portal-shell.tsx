'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { Actor, api, apiUrl } from './lib/api';
import { isNavigationActive, visibleNavigation } from './portal-navigation';
import { clearProjectDocumentPendingBatchStorage } from '../features/projects/project-document-upload-queue';

export const canReadNotifications = (
  actor?: Pick<Actor, 'mustChangePassword' | 'permissions'>,
) =>
  Boolean(
    actor &&
      !actor.mustChangePassword &&
      actor.permissions.includes('notification.read'),
  );

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
    if (canReadNotifications(actor))
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
    clearProjectDocumentPendingBatchStorage(sessionStorage);
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
    <div className="portal-shell min-h-screen">
      <aside className="portal-sidebar flex flex-col px-4 py-3 md:min-h-screen md:px-5 md:py-6">
        <Link className="text-xl font-semibold tracking-wide" href="/">
          Galaxy OS
        </Link>
        <p className="mt-1 text-sm text-black/55">{actor.organization.name}</p>
        <nav
          aria-label="Điều hướng chính"
          className="mt-3 flex gap-2 overflow-x-auto pb-1 md:mt-8 md:flex-col md:overflow-visible md:pb-0"
        >
          {visibleNavigation(actor.permissions, actor.administrationScope).map(
            (group) => (
              <section className="grid shrink-0 gap-1" key={group.key}>
                <Link
                  aria-current={
                    isNavigationActive(group, path) &&
                    !group.children?.some((item) =>
                      isNavigationActive(item, path),
                    )
                      ? 'page'
                      : undefined
                  }
                  className={`rounded px-3 py-2 text-sm font-semibold hover:bg-black/5 ${
                    isNavigationActive(group, path)
                      ? 'portal-nav-active bg-black/5'
                      : 'text-black/70'
                  }`}
                  href={group.href}
                >
                  <span aria-hidden="true" className="mr-2">
                    {group.icon}
                  </span>
                  {group.label}
                </Link>
                {isNavigationActive(group, path) &&
                  group.children?.map((item) => (
                    <Link
                      aria-current={
                        isNavigationActive(item, path) ? 'page' : undefined
                      }
                      className={`ml-5 hidden rounded px-3 py-1.5 text-xs hover:bg-black/5 md:block ${
                        isNavigationActive(item, path)
                          ? 'portal-nav-active bg-black/10'
                          : 'text-black/60'
                      }`}
                      href={item.href}
                      key={item.key}
                    >
                      {item.label}
                    </Link>
                  ))}
              </section>
            ),
          )}
        </nav>
        <Link
          className="portal-user-card mt-3 flex items-center gap-3 rounded-lg p-2 md:mt-auto md:p-3"
          href="/account/profile"
        >
          {actor.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- authenticated same-origin avatar path
            <img
              alt=""
              className="h-9 w-9 rounded-full object-cover"
              src={`${apiUrl}${actor.avatarUrl}`}
            />
          ) : (
            <span className="portal-avatar grid h-9 w-9 place-items-center rounded-full text-xs text-white">
              {initials}
            </span>
          )}
          <span className="min-w-0">
            <strong className="block truncate text-sm">
              {actor.displayName}
            </strong>
            <small className="block truncate text-black/55">
              {actor.roles.map(({ name }) => name).join(', ')}
              {actor.roles.length > 0 && ' · '}
              {actor.administrationScope}
            </small>
          </span>
        </Link>
      </aside>
      <div>
        <header className="portal-header flex items-center justify-between gap-2 border-b border-black/10 bg-white px-3 sm:px-6">
          <form className="min-w-0 flex-1" onSubmit={search}>
            <input
              aria-label="Tìm kiếm toàn hệ thống"
              autoComplete="off"
              className="w-full sm:w-64"
              id="portal-search"
              minLength={2}
              name="q"
              placeholder="Tìm khách hàng, dự án, công việc…"
            />
          </form>
          <div className="flex items-center gap-3">
            <Link
              className="hidden text-right text-sm sm:block"
              href="/account/profile"
            >
              <strong className="block">{actor.displayName}</strong>
              <span className="block text-xs text-black/55">
                {actor.roles[0]?.name ?? actor.administrationScope}
              </span>
            </Link>
            {canReadNotifications(actor) && (
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
            <button onClick={() => void logout()}>Đăng xuất</button>
          </div>
        </header>
        <main className="portal-main">{children}</main>
      </div>
    </div>
  );
}
