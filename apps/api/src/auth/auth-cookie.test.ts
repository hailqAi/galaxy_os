import { afterEach, expect, it, vi } from 'vitest';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CurrentActor } from '../access-control/current-actor';

afterEach(() => vi.unstubAllEnvs());
it('keeps API session cookies Secure for HTTPS public origin in the managed local artifact', async () => {
  vi.stubEnv(
    'DATABASE_URL',
    'postgresql://unused:unused@127.0.0.1:55435/unused',
  );
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('APP_PUBLIC_ORIGIN', 'https://os.example.com');
  const expiresAt = new Date('2026-10-01');
  const controller = new AuthController({
    login: async () => ({ token: 'synthetic', expiresAt }),
    logout: async () => {},
    changePassword: async () => {},
  } as unknown as AuthService);
  const cookie = vi.fn();
  const clearCookie = vi.fn();
  await controller.login(
    { email: 'synthetic@example.com', password: 'synthetic' },
    {},
    { cookie, clearCookie },
  );
  await controller.logout({} as CurrentActor, { cookie, clearCookie });
  await controller.changePassword(
    {} as CurrentActor,
    {
      currentPassword: 'synthetic',
      newPassword: 'synthetic',
      confirmNewPassword: 'synthetic',
    },
    { cookie, clearCookie },
  );
  expect(cookie.mock.calls[0]?.[2]).toMatchObject({
    secure: true,
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
  expect(clearCookie.mock.calls).toHaveLength(2);
  for (const call of clearCookie.mock.calls)
    expect(call[1]).toMatchObject({
      secure: true,
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    });
});
