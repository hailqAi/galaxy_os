import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { safeReturnTo } from './app/login/model';
import { isProjectChatPath, routePermissions } from './app/portal-navigation';
import {
  developmentHosts,
  internalApiUrl,
  publicHosts,
  trustedRequestHost,
  internalHttpOrigins,
  trustedRequestOrigin,
} from './host-config';
import { observeResponse, runtimeIdentity } from './runtime-http';

const apiBaseUrl =
  process.env.NODE_ENV === 'production'
    ? internalApiUrl()
    : (process.env.INTERNAL_API_URL ?? 'http://127.0.0.1:3001/api/v1');

const allowedHosts = () => {
  return new Set(
    process.env.NODE_ENV === 'production'
      ? [
          ...publicHosts(),
          ...internalHttpOrigins().map((origin) => new URL(origin).hostname),
        ]
      : developmentHosts(),
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
    'frame-src blob:',
    "worker-src 'self' blob:",
    "manifest-src 'self'",
  ].join('; ');

export async function proxy(request: NextRequest) {
  const identity = runtimeIdentity(
    request.headers,
    process.env.NODE_ENV === 'production' &&
      trustedRequestOrigin(request.headers, request.nextUrl.origin)?.startsWith(
        'https://',
      ) === true,
  );
  const requestHost = trustedRequestHost(request.headers, request.nextUrl.host);
  if (!requestHost || !allowedHosts().has(requestHost))
    return observeResponse(
      new NextResponse('Invalid Host', { status: 400 }),
      identity,
      request.method,
      request.nextUrl.pathname,
    );

  const development = process.env.NODE_ENV === 'development';
  const nonce = randomBytes(16).toString('base64url');
  const csp = contentSecurityPolicy(nonce, development);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('Content-Security-Policy', csp);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('x-request-id', identity.requestId);
  requestHeaders.delete('x-galaxy-edge-proof');
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
    const actorResponse = await fetch(`${apiBaseUrl}/me`, {
      headers: {
        cookie: request.headers.get('cookie') ?? '',
        'x-request-id': identity.requestId,
      },
      cache: 'no-store',
    }).catch(() => null);
    const actor = actorResponse?.ok
      ? ((await actorResponse.json().catch(() => null)) as {
          mustChangePassword: boolean;
          membershipKind?: string;
          permissions: string[];
          administrationScope:
            | 'SYSTEM'
            | 'SELF'
            | 'MANAGED_DEPARTMENTS'
            | 'ORGANIZATION';
        })
      : null;
    if (
      !actorResponse ||
      (actorResponse.status !== 401 && !actorResponse.ok) ||
      (actorResponse.ok &&
        (!actor ||
          !Array.isArray(actor.permissions) ||
          !actor.permissions.every(
            (permission) => typeof permission === 'string',
          )))
    ) {
      return observeResponse(
        new NextResponse(
          'Tạm thời không kết nối được hệ thống. Vui lòng thử lại.',
          {
            status: 503,
            headers: {
              'cache-control': 'no-store',
              'Content-Security-Policy': csp,
            },
          },
        ),
        identity,
        request.method,
        path,
      );
    }
    if (path === '/login') {
      if (actor)
        response = NextResponse.redirect(
          new URL(
            actor.mustChangePassword
              ? '/account/change-password'
              : actor.membershipKind === 'EXTERNAL'
                ? '/work'
                : '/',
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
    } else if (
      path.startsWith('/marketing') &&
      process.env.FEATURE_MARKETING !== 'true'
    ) {
      response = NextResponse.redirect(new URL('/forbidden', request.url));
    } else {
      const roomRoute =
        process.env.FEATURE_PROJECT_CHAT === 'true' && isProjectChatPath(path);
      const required =
        !roomRoute &&
        path !== '/forbidden' &&
        routePermissions.find(([prefix]) => path.startsWith(prefix))?.[1];
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
  return observeResponse(
    response,
    identity,
    request.method,
    path,
    response.headers.get('x-middleware-next') === '1',
  );
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
