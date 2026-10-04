'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { Actor, api, apiUrl } from './lib/api';
import { isNavigationActive, visibleNavigation } from './portal-navigation';
import { clearProjectDocumentPendingBatchStorage } from '../features/projects/project-document-upload-queue';
import { AiSurfaceProvider } from '../features/project-chat/project-ai-surfaces';

export const canReadNotifications = (
  actor?: Pick<Actor, 'mustChangePassword' | 'permissions'>,
) =>
  Boolean(
    actor &&
      !actor.mustChangePassword &&
      actor.permissions.includes('notification.read'),
  );

export default function PortalShell({
  children,
  chatEnabled = false,
  aiEnabled = false,
}: {
  children: ReactNode;
  chatEnabled?: boolean;
  aiEnabled?: boolean;
}) {
  const path = usePathname();
  const router = useRouter();
  const [actor, setActor] = useState<Actor>();
  const [unread, setUnread] = useState(0);
  const [authEpoch, setAuthEpoch] = useState(0);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const publicPage =
    path === '/login' ||
    path === '/forgot-password' ||
    path === '/reset-password' ||
    path === '/forbidden';
  useEffect(() => {
    const controller = new AbortController();
    if (!publicPage)
      api<Actor>('/me', { signal: controller.signal })
        .then((value) => {
          if (!controller.signal.aborted) setActor(value);
        })
        .catch(() => {
          if (!controller.signal.aborted)
            router.replace(`/login?returnTo=${encodeURIComponent(path)}`);
        });
    return () => controller.abort();
  }, [path, publicPage, router, authEpoch]);
  useEffect(() => {
    const changed = () => {
      setActor(undefined);
      setAuthEpoch((value) => value + 1);
    };
    window.addEventListener('galaxy-ai-actor-changed', changed);
    return () => window.removeEventListener('galaxy-ai-actor-changed', changed);
  }, []);
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel('galaxy-auth');
    channel.onmessage = () => {
      setActor(undefined);
      setUnread(0);
      setAuthEpoch((v) => v + 1);
    };
    return () => channel.close();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    if (canReadNotifications(actor))
      api<{ count: number }>('/notifications/unread-count', {
        signal: controller.signal,
      })
        .then((result) => {
          if (!controller.signal.aborted) setUnread(result.count);
        })
        .catch(() => {
          if (!controller.signal.aborted) setUnread(0);
        });
    return () => controller.abort();
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
    window.dispatchEvent(new Event('galaxy-auth-changed'));
    await api('/auth/logout', { method: 'POST' });
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel('galaxy-auth');
      channel.postMessage('changed');
      channel.close();
    }
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
    <AiSurfaceProvider
      key={`${actor.organization.id}/${actor.userId}/${authEpoch}`}
      actor={actor}
      enabled={aiEnabled}
    >
      <div
        className="portal-shell min-h-screen"
        onKeyDown={(event) => {
          if (event.key === 'Escape') setNavigationOpen(false);
        }}
      >
        <div className="mobile-topbar">
          <button
            aria-label="Mở điều hướng"
            aria-controls="portal-sidebar"
            aria-expanded={navigationOpen}
            onClick={() => setNavigationOpen((value) => !value)}
          >
            ☰
          </button>
          <Link href="/">Galaxy OS</Link>
        </div>
        <aside
          id="portal-sidebar"
          className={`portal-sidebar flex flex-col px-4 py-3 md:min-h-screen md:px-5 md:py-6 ${navigationOpen ? 'is-open' : ''}`}
          onClick={(event) => {
            if ((event.target as HTMLElement).closest('a'))
              setNavigationOpen(false);
          }}
        >
          <Link className="text-xl font-semibold tracking-wide" href="/">
            Galaxy OS
          </Link>
          <p className="brand-caption mt-1 text-xs">
            {actor.organization.name}
          </p>
          <nav
            aria-label="Điều hướng chính"
            className="mt-3 flex gap-2 overflow-x-auto pb-1 md:mt-8 md:flex-col md:overflow-visible md:pb-0"
          >
            <p className="nav-section-label">Làm việc</p>
            {visibleNavigation(actor.permissions, actor.administrationScope)
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((group) => (
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
              ))}
            {chatEnabled && (
              <Link className="rounded px-3 py-2 text-sm" href="/work">
                Trao đổi dự án
              </Link>
            )}
          </nav>
          <Link
            className="portal-user-card mt-3 flex items-center gap-3 rounded-lg p-2 md:mt-auto md:p-3"
            href={
              actor.membershipKind === 'EXTERNAL' ? '/work' : '/account/profile'
            }
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
              <small className="block truncate text-slate-400">
                {actor.roles.map(({ name }) => name).join(', ')}
                {actor.roles.length > 0 && ' · '}
                {actor.administrationScope}
              </small>
            </span>
          </Link>
        </aside>
        <div>
          <header className="portal-header flex items-center justify-between gap-2 border-b border-black/10 bg-white px-3 sm:px-6">
            {actor.membershipKind !== 'EXTERNAL' && (
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
            )}
            <div className="flex items-center gap-3">
              <Link
                className="hidden text-right text-sm sm:block"
                href={
                  actor.membershipKind === 'EXTERNAL'
                    ? '/work'
                    : '/account/profile'
                }
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
    </AiSurfaceProvider>
  );
}
