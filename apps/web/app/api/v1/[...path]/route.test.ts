import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from './route';

// Fix the mocked upstream before the route module captures its configuration.
vi.hoisted(() =>
  vi.stubEnv('INTERNAL_API_URL', 'http://127.0.0.1:33001/api/v1'),
);

const context = (path: string[]) => ({ params: Promise.resolve({ path }) });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('same-origin API forwarder', () => {
  it('forwards the upload constraints contract to the fixed internal API', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json({ maxBytes: 8, allowedExtensions: ['.pdf'] }),
      );
    vi.stubGlobal('fetch', fetch);

    const response = await GET(
      new NextRequest('http://localhost:3000/api/v1/uploads/constraints'),
      context(['uploads', 'constraints']),
    );

    expect(response.status).toBe(200);
    expect(fetch.mock.calls[0]?.[0].toString()).toBe(
      'http://127.0.0.1:33001/api/v1/uploads/constraints',
    );
  });

  it.each([
    'project-chat',
    'brands',
    'purchase-requests',
    'rfqs',
    'supplier-quotations',
    'supplier-comparisons',
    'purchase-orders',
    'proforma-invoices',
    'supplier-payables',
    'supplier-payment-schedules',
    'supplier-payments',
    'production-orders',
    'forwarders',
    'shipments',
    'customs',
    'landed-costs',
    'warehouses',
    'inventory',
    'installation',
    'inspections',
    'inspection-items',
    'handovers',
    'handover-documents',
    'warranty',
    'service-tickets',
    'service-visits',
    'warranty-claims',
  ])('forwards the live downstream Project API root %s', async (root) => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ items: [] }));
    vi.stubGlobal('fetch', fetch);

    const response = await GET(
      new NextRequest(`http://localhost:3000/api/v1/${root}`),
      context([root]),
    );

    expect(response.status).toBe(200);
    expect(fetch.mock.calls[0]?.[0].toString()).toBe(
      `http://127.0.0.1:33001/api/v1/${root}`,
    );
  });

  it('forwards upload initiation without changing its request or response contract', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ uploadSessionId: 'session-1' }), {
        status: 201,
        headers: {
          'content-type': 'application/json',
          location: '/api/v1/uploads/session-1',
          'upload-offset': '0',
        },
      }),
    );
    vi.stubGlobal('fetch', fetch);
    const request = new NextRequest(
      'http://localhost:3000/api/v1/uploads/initiate',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: 'galaxy_session=opaque',
          origin: 'http://localhost:3000',
          'x-csrf-token': 'csrf-value',
        },
        body: JSON.stringify({ projectId: 'project-1' }),
      },
    );
    const arrayBuffer = vi.spyOn(request, 'arrayBuffer');

    const response = await POST(request, context(['uploads', 'initiate']));

    expect(fetch.mock.calls[0]?.[0].toString()).toBe(
      'http://127.0.0.1:33001/api/v1/uploads/initiate',
    );
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      body: request.body,
      duplex: 'half',
    });
    expect(arrayBuffer).not.toHaveBeenCalled();
    const headers = fetch.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.get('cookie')).toBe('galaxy_session=opaque');
    expect(headers.get('x-csrf-token')).toBe('csrf-value');
    expect(response.status).toBe(201);
    expect(response.headers.get('location')).toBe('/api/v1/uploads/session-1');
    expect(response.headers.get('upload-offset')).toBe('0');
    expect(await response.json()).toEqual({ uploadSessionId: 'session-1' });
  });

  it('streams a binary upload part and preserves protocol headers', async () => {
    vi.stubEnv('DEV_ALLOWED_ORIGINS', '192.168.1.80');
    const fetch = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 201,
        headers: {
          'content-range': 'bytes 0-2/3',
          etag: 'response-etag',
        },
      }),
    );
    vi.stubGlobal('fetch', fetch);
    const request = new NextRequest(
      'http://192.168.1.80:3000/api/v1/uploads/id/parts',
      {
        method: 'POST',
        headers: {
          origin: 'http://192.168.1.80:3000',
          cookie: 'session=member',
          'content-type': 'application/octet-stream',
          'content-range': 'bytes 0-2/3',
          etag: 'request-etag',
          'x-csrf-token': 'csrf-value',
        },
        body: new Uint8Array([1, 2, 3]),
      },
    );
    const arrayBuffer = vi.spyOn(request, 'arrayBuffer');

    const response = await POST(request, context(['uploads', 'id', 'parts']));

    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      body: request.body,
      duplex: 'half',
    });
    expect(arrayBuffer).not.toHaveBeenCalled();
    const headers = fetch.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get('content-range')).toBe('bytes 0-2/3');
    expect(headers.get('etag')).toBe('request-etag');
    expect(headers.get('cookie')).toBe('session=member');
    expect(headers.get('x-csrf-token')).toBe('csrf-value');
    expect(response.status).toBe(201);
    expect(response.headers.get('content-range')).toBe('bytes 0-2/3');
    expect(response.headers.get('etag')).toBe('response-etag');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3]),
    );
  });

  it.each(['preview', 'download'])(
    'forwards Content-Length without buffering a streamed file %s',
    async (action) => {
      const bytes = new Uint8Array([1, 2, 3, 4]);
      const upstream = new Response(bytes, {
        headers: {
          'content-disposition': `${action}; filename*=UTF-8''file.pdf`,
          'content-length': String(bytes.byteLength),
          'content-type': 'application/pdf',
        },
      });
      const arrayBuffer = vi.spyOn(upstream, 'arrayBuffer');
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(upstream));

      const response = await GET(
        new NextRequest(`http://localhost:3000/api/v1/files/file-1/${action}`),
        context(['files', 'file-1', action]),
      );

      expect(arrayBuffer).not.toHaveBeenCalled();
      expect(response.headers.get('content-length')).toBe('4');
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    },
  );

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
        cookie: 'galaxy_session=opaque',
        origin: 'http://localhost:3000',
      },
      body: JSON.stringify({ email: 'person@example.test', password: 'x' }),
    });
    const arrayBuffer = vi.spyOn(request, 'arrayBuffer');
    const response = await POST(request, context(['auth', 'login']));
    expect(fetch.mock.calls[0]?.[0].toString()).toBe(
      'http://127.0.0.1:33001/api/v1/auth/login',
    );
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      body: request.body,
      duplex: 'half',
    });
    expect(
      (fetch.mock.calls[0]?.[1]?.headers as Headers).get('content-type'),
    ).toBe('application/json');
    expect((fetch.mock.calls[0]?.[1]?.headers as Headers).get('cookie')).toBe(
      'galaxy_session=opaque',
    );
    expect(response.status).toBe(201);
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect(await response.json()).toEqual({ authenticated: true });
  });

  it('does not attach a body or duplex option to GET requests', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal('fetch', fetch);

    await GET(
      new NextRequest('http://localhost:3000/api/v1/me', {
        headers: { cookie: 'galaxy_session=opaque' },
      }),
      context(['me']),
    );

    expect(fetch.mock.calls[0]?.[1]?.body).toBeUndefined();
    expect(fetch.mock.calls[0]?.[1]).not.toHaveProperty('duplex');
    expect((fetch.mock.calls[0]?.[1]?.headers as Headers).get('cookie')).toBe(
      'galaxy_session=opaque',
    );
  });

  it('forwards the validated avatar filename while keeping dotted paths closed', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('avatar'));
    vi.stubGlobal('fetch', fetch);
    const key = '185d8b80-17f5-45bd-845c-8a7b2caac486.jpg';

    const response = await GET(
      new NextRequest(`http://localhost:3000/api/v1/me/avatar/${key}`),
      context(['me', 'avatar', key]),
    );

    expect(response.status).toBe(200);
    expect(fetch.mock.calls[0]?.[0].toString()).toBe(
      `http://127.0.0.1:33001/api/v1/me/avatar/${key}`,
    );

    expect(
      (
        await GET(
          new NextRequest('http://localhost:3000/api/v1/files/file.pdf'),
          context(['files', 'file.pdf']),
        )
      ).status,
    ).toBe(404);
    expect(fetch).toHaveBeenCalledOnce();
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

  it.each(['http://localhost:8080', 'https://localhost:3000'])(
    'rejects a same-host mutation from %s',
    async (origin) => {
      const fetch = vi.fn().mockResolvedValue(Response.json({ ok: true }));
      vi.stubGlobal('fetch', fetch);

      const response = await POST(
        new NextRequest('http://localhost:3000/api/v1/auth/logout', {
          method: 'POST',
          headers: { host: 'localhost:3000', origin },
        }),
        context(['auth', 'logout']),
      );

      expect(response.status).toBe(403);
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it('accepts a localhost mutation when Next is bound to 0.0.0.0', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal('fetch', fetch);

    const response = await POST(
      new NextRequest('http://0.0.0.0:3000/api/v1/auth/login', {
        method: 'POST',
        headers: {
          host: 'localhost:3000',
          origin: 'http://localhost:3000',
        },
        body: '{}',
      }),
      context(['auth', 'login']),
    );

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledOnce();
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
