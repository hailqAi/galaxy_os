import { NextRequest, NextResponse } from 'next/server';
import { routePermissions } from './app/portal-navigation';

const apiUrl =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path === '/forgot-password' || path === '/reset-password')
    return NextResponse.next();
  const actorResponse = await fetch(`${apiUrl}/me`, {
    headers: { cookie: request.headers.get('cookie') ?? '' },
    cache: 'no-store',
  }).catch(() => null);
  const actor = actorResponse?.ok
    ? ((await actorResponse.json()) as {
        mustChangePassword: boolean;
        permissions: string[];
        administrationScope: 'SELF' | 'MANAGED_DEPARTMENTS' | 'ORGANIZATION';
      })
    : null;
  if (path === '/login') {
    if (!actor) return NextResponse.next();
    return NextResponse.redirect(
      new URL(
        actor.mustChangePassword ? '/account/change-password' : '/',
        request.url,
      ),
    );
  }
  if (!actor) {
    const login = new URL('/login', request.url);
    login.searchParams.set('returnTo', `${path}${request.nextUrl.search}`);
    return NextResponse.redirect(login);
  }
  if (actor.mustChangePassword && path !== '/account/change-password')
    return NextResponse.redirect(
      new URL('/account/change-password', request.url),
    );
  const required = routePermissions.find(([prefix]) =>
    path.startsWith(prefix),
  )?.[1];
  if (
    path.startsWith('/settings/users') &&
    actor.administrationScope === 'SELF'
  )
    return NextResponse.redirect(new URL('/forbidden', request.url));
  if (required && !actor.permissions.includes(required))
    return NextResponse.redirect(new URL('/forbidden', request.url));
  if (path === '/settings') {
    const first = routePermissions.find(([, permission]) =>
      actor.permissions.includes(permission),
    );
    return NextResponse.redirect(new URL(first?.[0] ?? '/', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|health|forbidden).*)'],
};
