import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { proxy } from './proxy';

const request = (path: string) =>
  new NextRequest(`http://localhost:3000${path}`);

describe('protected routing', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('redirects unauthenticated protected routes before rendering', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
    );
    const response = await proxy(request('/settings/users?x=1'));
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/login?returnTo=%2Fsettings%2Fusers%3Fx%3D1',
    );
  });

  it('removes credential fields from Login URLs before rendering', async () => {
    const unsafe = new URL('/login', 'http://localhost:3000');
    unsafe.searchParams.set('password', 'test-value');
    unsafe.searchParams.set('returnTo', '/settings');
    const response = await proxy(new NextRequest(unsafe));
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/login?returnTo=%2Fsettings',
    );
    const nested = new URL('/login', 'http://localhost:3000');
    nested.searchParams.set('returnTo', '/settings?password=test-value');
    const nestedResponse = await proxy(new NextRequest(nested));
    expect(nestedResponse.headers.get('location')).toBe(
      'http://localhost:3000/login',
    );
  });

  it('forbids deep links without their read permission', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ mustChangePassword: false, permissions: [] }),
        ),
    );
    const response = await proxy(request('/settings/users'));
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/forbidden',
    );
  });

  it('forces first-login password change before administration', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          mustChangePassword: true,
          permissions: ['user.read'],
        }),
      ),
    );
    const response = await proxy(request('/settings/users'));
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/account/change-password',
    );
  });

  it('redirects an authenticated user away from Login', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          mustChangePassword: false,
          permissions: ['user.read'],
          administrationScope: 'SYSTEM',
        }),
      ),
    );
    const response = await proxy(request('/login'));
    expect(response.headers.get('location')).toBe('http://localhost:3000/');
  });
});

describe('web CSP', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('permits the development runtime without forcing HTTPS', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
    );
    const response = await proxy(request('/login'));
    const csp = response.headers.get('content-security-policy');
    expect(csp).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
    expect(csp).toContain("connect-src 'self' ws: wss:");
    expect(csp).toContain("form-action 'self'");
    expect(csp).not.toContain('upgrade-insecure-requests');
  });

  it('uses a unique nonce and no eval in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_PUBLIC_ORIGIN', 'https://galaxy.example');
    vi.stubEnv('DEV_ALLOWED_ORIGINS', 'development.example');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
    );
    const productionRequest = () =>
      new NextRequest('https://galaxy.example/login');
    const first = await proxy(productionRequest());
    const second = await proxy(productionRequest());
    const firstCsp = first.headers.get('content-security-policy')!;
    expect(firstCsp).toContain("script-src 'self' 'nonce-");
    expect(firstCsp).not.toContain("'unsafe-eval'");
    expect(firstCsp).not.toBe(second.headers.get('content-security-policy'));
    expect(
      (
        await proxy(
          new NextRequest('https://development.example/login', {
            headers: { host: 'development.example' },
          }),
        )
      ).status,
    ).toBe(400);
  });
});
