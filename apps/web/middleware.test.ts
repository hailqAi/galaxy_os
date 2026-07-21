import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { middleware } from './middleware';

const request = (path: string) =>
  new NextRequest(`http://localhost:3000${path}`);

describe('protected routing', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('redirects unauthenticated protected routes before rendering', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
    );
    const response = await middleware(request('/settings/users?x=1'));
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/login?returnTo=%2Fsettings%2Fusers%3Fx%3D1',
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
    const response = await middleware(request('/settings/users'));
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
    const response = await middleware(request('/settings/users'));
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/account/change-password',
    );
  });
});
