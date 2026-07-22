import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from './route';

const context = (path: string[]) => ({ params: Promise.resolve({ path }) });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('same-origin API forwarder', () => {
  it('forwards Login JSON to the fixed internal API and preserves status and cookie', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ authenticated: true }), {
        status: 201,
        headers: {
          'content-type': 'application/json',
          'set-cookie': 'galaxy_session=opaque; Path=/; HttpOnly; SameSite=Lax',
        },
      }),
    );
    vi.stubGlobal('fetch', fetch);
    const request = new NextRequest('http://localhost:3000/api/v1/auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
      },
      body: JSON.stringify({ email: 'person@example.test', password: 'x' }),
    });
    const response = await POST(request, context(['auth', 'login']));
    expect(fetch.mock.calls[0]?.[0].toString()).toBe(
      'http://127.0.0.1:3001/api/v1/auth/login',
    );
    expect(
      new TextDecoder().decode(fetch.mock.calls[0]?.[1]?.body as ArrayBuffer),
    ).toBe(JSON.stringify({ email: 'person@example.test', password: 'x' }));
    expect(response.status).toBe(201);
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect(await response.json()).toEqual({ authenticated: true });
  });

  it('rejects unapproved and traversal paths before fetching', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(
      (
        await GET(
          new NextRequest('http://localhost:3000/api/v1/external'),
          context(['external']),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await GET(
          new NextRequest('http://localhost:3000/api/v1/me?sessionToken=value'),
          context(['me']),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await GET(
          new NextRequest('http://localhost:3000/api/v1/auth/x'),
          context(['auth', '..']),
        )
      ).status,
    ).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects cross-origin browser mutations', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const response = await POST(
      new NextRequest('http://localhost:3000/api/v1/auth/logout', {
        method: 'POST',
        headers: { host: 'localhost:3000', origin: 'https://evil.example' },
      }),
      context(['auth', 'logout']),
    );
    expect(response.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('supports same-origin Login behind a trusted loopback proxy', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_PUBLIC_ORIGIN', 'https://os.example.com');
    vi.stubEnv('TRUST_PROXY', 'true');
    const fetch = vi
      .fn()
      .mockResolvedValue(Response.json({ authenticated: true }));
    vi.stubGlobal('fetch', fetch);
    const response = await POST(
      new NextRequest('http://127.0.0.1:3000/api/v1/auth/login', {
        method: 'POST',
        headers: {
          host: '127.0.0.1:3000',
          origin: 'https://os.example.com',
          'x-forwarded-host': 'os.example.com',
          'x-forwarded-proto': 'https',
          'x-forwarded-for': '203.0.113.8',
        },
        body: '{}',
      }),
      context(['auth', 'login']),
    );
    expect(response.status).toBe(200);
    expect(fetch.mock.calls[0]?.[1]?.headers.get('x-forwarded-for')).toBe(
      '203.0.113.8',
    );
  });

  it('returns a safe no-store response for internal connection failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('internal detail')),
    );
    const response = await GET(
      new NextRequest('http://localhost:3000/api/v1/me'),
      context(['me']),
    );
    expect(response.status).toBe(502);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).not.toContain('internal detail');
  });
});
