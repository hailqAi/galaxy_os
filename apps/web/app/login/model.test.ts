import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  authenticate,
  INVALID_LOGIN,
  permittedReturnTo,
  safeReturnTo,
  UNAVAILABLE_LOGIN,
  validateLogin,
} from './model';

afterEach(() => vi.unstubAllGlobals());

describe('safeReturnTo', () => {
  it('preserves relative paths and rejects external redirects', () => {
    expect(safeReturnTo('/settings/users?tab=roles')).toBe(
      '/settings/users?tab=roles',
    );
    expect(safeReturnTo('https://evil.example')).toBeNull();
    expect(safeReturnTo('//evil.example')).toBeNull();
    expect(safeReturnTo('/\\evil.example')).toBeNull();
    const credentialReturn = new URL('/login', 'http://local');
    credentialReturn.searchParams.set('password', 'test-value');
    expect(
      safeReturnTo(`${credentialReturn.pathname}${credentialReturn.search}`),
    ).toBeNull();
    const tokenReturn = new URL('/reset-password', 'http://local');
    tokenReturn.searchParams.set('token', 'test-value');
    expect(
      safeReturnTo(`${tokenReturn.pathname}${tokenReturn.search}`),
    ).toBeNull();
    const nested = new URL('/settings', 'http://local');
    nested.searchParams.set('next', '/reset-password?token=test-value');
    expect(safeReturnTo(`${nested.pathname}${nested.search}`)).toBeNull();
  });
  it('uses an administrative return path only when permitted', () => {
    expect(permittedReturnTo('/settings/users', ['user.read'])).toBe(
      '/settings/users',
    );
    expect(permittedReturnTo('/settings/users', [])).toBeNull();
  });
});

describe('login submission', () => {
  it('validates required fields and email format', () => {
    expect(validateLogin('', '')).toEqual({
      email: 'Vui lòng nhập email.',
      password: 'Vui lòng nhập mật khẩu.',
    });
    expect(validateLogin('invalid', 'present').email).toBe(
      'Email không hợp lệ.',
    );
    expect(validateLogin('person@example.test', 'present')).toEqual({
      email: '',
      password: '',
    });
  });
  it('posts credentials in JSON without placing them in the URL', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ authenticated: true }))
      .mockResolvedValueOnce(
        Response.json({ mustChangePassword: false, permissions: [] }),
      );
    vi.stubGlobal('fetch', fetch);
    await authenticate('person@example.test', 'runtime-only-value');
    expect(fetch.mock.calls[0]?.[0]).toBe('/api/v1/auth/login');
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify({
        email: 'person@example.test',
        password: 'runtime-only-value',
      }),
    });
    expect(String(fetch.mock.calls[0]?.[0])).not.toContain('person@example');
    expect(String(fetch.mock.calls[0]?.[0])).not.toContain('runtime-only');
  });

  it('uses safe visible errors for invalid credentials and outages', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({}, { status: 401 })),
    );
    await expect(authenticate('person@example.test', 'x')).rejects.toThrow(
      INVALID_LOGIN,
    );
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(authenticate('person@example.test', 'x')).rejects.toThrow(
      UNAVAILABLE_LOGIN,
    );
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ authenticated: true }))
        .mockResolvedValueOnce(Response.json({}, { status: 401 })),
    );
    await expect(authenticate('person@example.test', 'x')).rejects.toThrow(
      UNAVAILABLE_LOGIN,
    );
  });

  it('keeps a safe native POST fallback and password input', () => {
    const source = readFileSync(join(__dirname, 'page.tsx'), 'utf8');
    expect(source).toContain('method="post"');
    expect(source).toContain('event.preventDefault()');
    expect(source).toContain('type="submit"');
    expect(source).toContain('type="button"');
    expect(source).toContain('aria-pressed={show}');
    expect(source).toContain('if (submitting.current) return');
    expect(source).toContain("type={show ? 'text' : 'password'}");
    expect(source).not.toContain('searchParams.get("password")');
    expect(source).not.toContain('${password}');
    expect(source).not.toMatch(/router\.(?:push|replace)\(password\)/i);
  });
});
