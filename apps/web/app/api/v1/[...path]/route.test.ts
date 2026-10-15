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
  it.each([
    ['mcp-connection'],
    ['mcp-auth', 'requests', 'request-id', 'consent'],
  ])(
    'forwards personal MCP settings and consent through the existing authenticated API path %j',
    async (...path) => {
      const fetch = vi.fn().mockResolvedValue(Response.json({ allowed: true }));
      vi.stubGlobal('fetch', fetch);
      const read = path.length === 1;
      const response = await (read ? GET : POST)(
        new NextRequest('http://localhost:3000/api/v1/' + path.join('/'), {
          method: read ? 'GET' : 'POST',
          headers: {
            origin: 'http://localhost:3000',
            cookie: 'galaxy_session=synthetic',
          },
          ...(read ? {} : { body: '{}' }),
        }),
        context(path),
      );
      expect(response.status).toBe(200);
      expect(fetch.mock.calls[0]?.[0].toString()).toBe(
        'http://127.0.0.1:33001/api/v1/' + path.join('/'),
      );
      expect(fetch.mock.calls[0]?.[1].headers.get('cookie')).toBe(
        'galaxy_session=synthetic',
      );
    },
  );
  it.each([
    'http://192.168.1.80:3000/path',
    'http://192.168.1.80:3000?query=1',
    'http://user:password@192.168.1.80:3000',
  ])('rejects a malformed browser Origin %s', async (origin) => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('GALAXY_INTERNAL_HTTP_ORIGINS', 'http://192.168.1.80:3000');
    const fetch = vi
      .fn()
      .mockResolvedValue(Response.json({ authenticated: true }));
    vi.stubGlobal('fetch', fetch);
    const response = await POST(
      new NextRequest('http://192.168.1.80:3000/api/v1/auth/login', {
        method: 'POST',
        headers: { host: '192.168.1.80:3000', origin },
        body: '{}',
      }),
      context(['auth', 'login']),
    );
    expect(response.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['login', 'logout'])(
    'handles LAN HTTP session cookie for %s without trusting forwarded client IP',
    async (action) => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv(
        'GALAXY_INTERNAL_HTTP_ORIGINS',
        'http://localhost:3000,http://192.168.1.80:3000',
      );
      vi.stubEnv('SESSION_COOKIE_NAME', 'galaxy_session');
      vi.stubEnv('TRUST_PROXY', 'true');
      const fetch = vi.fn().mockResolvedValue(
        Response.json(
          { authenticated: action === 'login' },
          {
            headers: {
              'set-cookie': `galaxy_session=opaque; Path=/; Secure; HttpOnly; SameSite=Lax; Expires=Wed, 30 Sep 2026 01:00:00 GMT`,
            },
          },
        ),
      );
      vi.stubGlobal('fetch', fetch);
      const response = await POST(
        new NextRequest(`http://192.168.1.80:3000/api/v1/auth/${action}`, {
          method: 'POST',
          headers: {
            host: '192.168.1.80:3000',
            origin: 'http://192.168.1.80:3000',
            'x-forwarded-for': '203.0.113.8',
          },
          body: '{}',
        }),
        context(['auth', action]),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get('set-cookie')).toContain(
        'HttpOnly; SameSite=Lax; Expires=',
      );
      expect(response.headers.get('set-cookie')).not.toMatch(/;\s*Secure/i);
      expect(fetch.mock.calls[0]?.[1]?.headers.has('x-forwarded-for')).toBe(
        false,
      );
    },
  );
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
    vi.stubEnv('GALAXY_PUBLIC_ACCESS', 'true');
    vi.stubEnv(
      'GALAXY_EDGE_PROOF',
      'synthetic-test-proof-with-at-least-32-bytes',
    );
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
          'x-galaxy-edge-proof': process.env.GALAXY_EDGE_PROOF!,
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

it.each([undefined, 'Bearer ' + 's'.repeat(43)])(
  'preserves the first MCP OAuth challenge and strips browser cookies (%s)',
  async (authorization) => {
    const fetch = vi.fn().mockResolvedValue(
      Response.json(
        { error: 'auth' },
        {
          status: 401,
          headers: {
            'WWW-Authenticate':
              'Bearer resource_metadata="https://example.test/metadata"',
          },
        },
      ),
    );
    vi.stubGlobal('fetch', fetch);
    const path = [
      'workspace-agent-mcp',
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    ];
    const response = await POST(
      new NextRequest('http://localhost:3000/api/v1/' + path.join('/'), {
        method: 'POST',
        headers: {
          ...(authorization ? { authorization } : {}),
          cookie: 'galaxy_session=private',
          'mcp-protocol-version': '2025-11-25',
          accept: 'application/json, text/event-stream',
        },
        body: '{}',
      }),
      context(path),
    );
    expect(response.status).toBe(401);
    expect(response.headers.get('WWW-Authenticate')).toContain(
      'resource_metadata',
    );
    expect(fetch.mock.calls[0]?.[1]?.headers.get('authorization')).toBe(
      authorization ?? null,
    );
    expect(fetch.mock.calls[0]?.[1]?.headers.has('cookie')).toBe(false);
  },
);
it('never lets an MCP bearer bypass browser CSRF on business endpoints or a foreign Origin', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  for (const [path, origin] of [
    [['projects'], ''],
    [['workspace-agent-mcp', 'x', 'y'], 'https://evil.example'],
  ] as const) {
    const response = await POST(
      new NextRequest('http://localhost:3000/api/v1/' + path.join('/'), {
        method: 'POST',
        headers: {
          authorization: 'Bearer ' + 's'.repeat(43),
          ...(origin ? { origin } : {}),
        },
        body: '{}',
      }),
      context([...path]),
    );
    expect(response.status).toBe(403);
  }
  expect(fetch).not.toHaveBeenCalled();
});

it('preserves the backend sandbox CSP and cancellation for a scoped Project preview', async () => {
  const policy =
    "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; frame-ancestors 'self'; sandbox";
  let forwardedSignal: AbortSignal | null | undefined;
  vi.stubGlobal('fetch', async (_url: string, options: RequestInit) => {
    forwardedSignal = options.signal;
    return new Response('<html>draft</html>', {
      headers: {
        'Content-Type': 'text/html',
        'Content-Security-Policy': policy,
      },
    });
  });
  const p = ['project-chat', 'projects', 'p', 'ai', 'files', 's', 'preview'];
  const request = new NextRequest(
    'http://localhost:3000/api/v1/' + p.join('/'),
  );
  const preview = await GET(request, context(p));
  expect(preview.headers.get('content-security-policy')).toBe(policy);
  expect(preview.headers.get('x-frame-options')).toBeNull();
  expect(forwardedSignal).toBe(request.signal);
});

it('forwards cancellation only for upload part streams and preserves the original streaming body', async () => {
  let options: RequestInit | undefined;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url, init) => {
      options = init;
      return Response.json({ status: 'UPLOADING' });
    }),
  );
  const part = new NextRequest(
    'http://localhost:3000/api/v1/uploads/session/parts?partNumber=1',
    {
      method: 'POST',
      headers: {
        origin: 'http://localhost:3000',
        'content-type': 'application/octet-stream',
      },
      body: 'part bytes',
    },
  );
  const { POST } = await import('./route');
  await POST(part, context(['uploads', 'session', 'parts']));
  expect(options?.signal).toBe(part.signal);
  expect(options?.body).toBe(part.body);
});
