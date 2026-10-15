import { NextRequest } from 'next/server';
import { afterEach, expect, it, vi } from 'vitest';
import { config, proxy } from './proxy';
import { unstable_doesMiddlewareMatch } from 'next/dist/experimental/testing/server/middleware-testing-utils';
import { GET as discovery } from './app/.well-known/oauth-authorization-server/route';

vi.hoisted(async () => {
  Object.defineProperty(globalThis, 'AsyncLocalStorage', {
    value: (await import('node:async_hooks')).AsyncLocalStorage,
    configurable: true,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it.each(['SELF', 'MANAGED_DEPARTMENTS', 'ORGANIZATION', 'SYSTEM'])(
  'opens personal MCP setup for an authenticated %s actor without granting SIWC administration',
  async (administrationScope) => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubGlobal('fetch', async () =>
      Response.json({
        mustChangePassword: false,
        permissions: ['system.settings.read'],
        administrationScope,
      }),
    );
    const response = await proxy(
      new NextRequest('http://localhost:3000/settings/chatgpt-connection'),
    );
    expect(response.headers.get('location')).toBeNull();
  },
);

it('serves cookie-less native OAuth discovery through the routing pipeline and rejects invalid Edge proof', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('APP_PUBLIC_ORIGIN', 'https://os.example.com');
  vi.stubEnv('TRUST_PROXY', 'true');
  vi.stubEnv('GALAXY_PUBLIC_ACCESS', 'true');
  vi.stubEnv('GALAXY_EDGE_PROOF', 'synthetic-proof-with-at-least-32-bytes');
  const fetch = vi
    .fn()
    .mockResolvedValue(Response.json({ issuer: 'https://os.example.com' }));
  vi.stubGlobal('fetch', fetch);
  const url = 'http://127.0.0.1:3000/.well-known/oauth-authorization-server';
  expect(unstable_doesMiddlewareMatch({ config, url })).toBe(false);
  for (const proof of [process.env.GALAXY_EDGE_PROOF!, 'invalid']) {
    const request = new NextRequest(url, {
      headers: {
        host: '127.0.0.1:3000',
        'x-forwarded-host': 'os.example.com',
        'x-forwarded-proto': 'https',
        'x-galaxy-edge-proof': proof,
      },
    });
    const response = unstable_doesMiddlewareMatch({ config, url })
      ? await proxy(request)
      : await discovery(request);
    expect(response.status).toBe(proof === 'invalid' ? 400 : 200);
    expect(response.headers.get('location')).toBeNull();
  }
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(String(fetch.mock.calls[0]![0])).toContain(
    '/workspace-agent-auth/metadata',
  );
  for (const path of [
    '/settings/workspace-agents',
    '/.well-known/oauth-authorization-server/other',
  ])
    expect(
      unstable_doesMiddlewareMatch({
        config,
        url: 'http://127.0.0.1:3000' + path,
      }),
    ).toBe(true);
});

it('allows only the same-host Project file path as a new preview frame source', async () => {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubGlobal('fetch', async () =>
    Response.json({
      mustChangePassword: false,
      permissions: [],
      administrationScope: 'SYSTEM',
    }),
  );
  const response = await proxy(
    new NextRequest('http://localhost:3000/projects/p/ai'),
  );
  expect(response.headers.get('content-security-policy')).toContain(
    'frame-src blob: http://localhost:3000/api/v1/project-chat/projects/',
  );
  expect(response.headers.get('content-security-policy')).toContain(
    "frame-ancestors 'none'",
  );
});

it('permits personal MCP consent for AI staff without dashboard or settings administration', async () => {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubGlobal('fetch', async () =>
    Response.json({
      mustChangePassword: false,
      permissions: ['ai.invoke'],
      administrationScope: 'SELF',
    }),
  );
  for (const path of [
    '/settings/chatgpt-connection',
    '/settings/mcp-consent',
  ]) {
    expect(
      (
        await proxy(new NextRequest('http://localhost:3000' + path))
      ).headers.get('location'),
    ).toBeNull();
  }
  expect(
    (
      await proxy(new NextRequest('http://localhost:3000/settings/system'))
    ).headers.get('location'),
  ).toBe('http://localhost:3000/forbidden');
});
