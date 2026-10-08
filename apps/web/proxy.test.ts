import { NextRequest } from 'next/server';
import { afterEach, expect, it, vi } from 'vitest';
import { proxy } from './proxy';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it.each(['SELF', 'MANAGED_DEPARTMENTS', 'ORGANIZATION', 'SYSTEM'])(
  'guards the ChatGPT management URL for %s scope despite read permission',
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
    expect(response.headers.get('location')).toBe(
      administrationScope === 'SYSTEM'
        ? null
        : 'http://localhost:3000/forbidden',
    );
  },
);
