import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { safeReturnTo } from './app/login/model';
import { routePermissions } from './app/portal-navigation';
import {
  developmentHosts,
  publicHosts,
  trustedRequestHost,
} from './host-config';

const internalApiUrl =
  process.env.INTERNAL_API_URL ?? 'http://127.0.0.1:3001/api/v1';

const allowedHosts = () => {
  return new Set(
    process.env.NODE_ENV === 'production' ? publicHosts() : developmentHosts(),
  );
};

const contentSecurityPolicy = (nonce: string, development: boolean) =>
  [
    "default-src 'self'",
    development
      ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
      : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    development ? "connect-src 'self' ws: wss:" : "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
  ].join('; ');

export async function proxy(request: NextRequest) {
  const requestHost = trustedRequestHost(
    request.headers,
    request.nextUrl.hostname,
  );
  if (!requestHost || !allowedHosts().has(requestHost))
    return new NextResponse('Invalid Host', { status: 400 });

  const development = process.env.NODE_ENV === 'development';
  const nonce = randomBytes(16).toString('base64url');
  const csp = contentSecurityPolicy(nonce, development);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('Content-Security-Policy', csp);
  requestHeaders.set('x-nonce', nonce);
  let response = NextResponse.next({ request: { headers: requestHeaders } });
  const path = request.nextUrl.pathname;
  const returnTo = request.nextUrl.searchParams.get('returnTo');
  const unsafeReturnTo = returnTo && !safeReturnTo(returnTo);
  if (
    path === '/login' &&
    (unsafeReturnTo ||
      [...request.nextUrl.searchParams.keys()].some(
        (key) => !['returnTo', 'reason', 'sessionExpired'].includes(key),
      ))
  ) {
    const login = new URL('/login', request.url);
    for (const key of ['returnTo', 'reason', 'sessionExpired']) {
      const value = request.nextUrl.searchParams.get(key);
      if (value && !(key === 'returnTo' && unsafeReturnTo))
        login.searchParams.set(key, value);
    }
    response = NextResponse.redirect(login);
  } else if (path !== '/forgot-password' && path !== '/reset-password') {
    const actorResponse = await fetch(`${internalApiUrl}/me`, {
      headers: { cookie: request.headers.get('cookie') ?? '' },
      cache: 'no-store',
    }).catch(() => null);
    const actor = actorResponse?.ok
      ? ((await actorResponse.json()) as {
          mustChangePassword: boolean;
          permissions: string[];
          administrationScope:
            | 'SYSTEM'
            | 'SELF'
            | 'MANAGED_DEPARTMENTS'
            | 'ORGANIZATION';
        })
      : null;
    if (path === '/login') {
      if (actor)
        response = NextResponse.redirect(
          new URL(
            actor.mustChangePassword ? '/account/change-password' : '/',
            request.url,
          ),
        );
    } else if (!actor) {
      const login = new URL('/login', request.url);
      login.searchParams.set('returnTo', `${path}${request.nextUrl.search}`);
      response = NextResponse.redirect(login);
    } else if (
      actor.mustChangePassword &&
      path !== '/account/change-password'
    ) {
      response = NextResponse.redirect(
        new URL('/account/change-password', request.url),
      );
    } else {
      const required = routePermissions.find(([prefix]) =>
        path.startsWith(prefix),
      )?.[1];
      if (
        (path.startsWith('/settings/users') &&
          actor.administrationScope === 'SELF') ||
        (required && !actor.permissions.includes(required))
      ) {
        response = NextResponse.redirect(new URL('/forbidden', request.url));
      } else if (path === '/settings') {
        const first = routePermissions.find(([, permission]) =>
          actor.permissions.includes(permission),
        );
        response = NextResponse.redirect(
          new URL(first?.[0] ?? '/', request.url),
        );
      }
    }
  }
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico|health).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
