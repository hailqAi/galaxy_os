import { describe, expect, it } from 'vitest';
import { readEnvironment } from './env';

describe('readEnvironment', () => {
  const database = { DATABASE_URL: 'postgresql://localhost/galaxy' };

  it('rejects a non-PostgreSQL database URL', () => {
    expect(() =>
      readEnvironment({ DATABASE_URL: 'redis://localhost:6379' }),
    ).toThrow();
  });

  it('rejects development authentication in production', () => {
    expect(() =>
      readEnvironment({
        DATABASE_URL: 'postgresql://localhost/galaxy',
        NODE_ENV: 'production',
        ALLOW_DEV_AUTH: 'true',
      }),
    ).toThrow('Development authentication cannot be enabled in production');
  });

  it('requires an HTTPS public origin in production', () => {
    expect(() =>
      readEnvironment({
        ...database,
        NODE_ENV: 'production',
        APP_PUBLIC_ORIGIN: 'http://os.example.com',
      }),
    ).toThrow('Production APP_PUBLIC_ORIGIN must use HTTPS');
  });

  it('requires explicit proxy trust in production', () => {
    expect(() =>
      readEnvironment({
        ...database,
        NODE_ENV: 'production',
        APP_PUBLIC_ORIGIN: 'https://os.example.com',
      }),
    ).toThrow('TRUST_PROXY must be enabled in production');
  });

  it('enables development authentication only when explicitly true', () => {
    expect(
      readEnvironment({ ...database, ALLOW_DEV_AUTH: 'true' }).ALLOW_DEV_AUTH,
    ).toBe(true);
    expect(
      readEnvironment({ ...database, ALLOW_DEV_AUTH: 'false' }).ALLOW_DEV_AUTH,
    ).toBe(false);
  });

  it('normalizes the development user email', () => {
    expect(
      readEnvironment({
        ...database,
        DEV_AUTH_USER_EMAIL: '  Admin@Galaxy.Local ',
      }).DEV_AUTH_USER_EMAIL,
    ).toBe('admin@galaxy.local');
  });

  it('uses safe defaults when optional local configuration is missing', () => {
    expect(readEnvironment(database)).toMatchObject({
      API_PORT: 3001,
      NODE_ENV: 'development',
      ALLOW_DEV_AUTH: false,
      DEV_AUTH_USER_EMAIL: 'admin@galaxy.local',
      TRUST_PROXY: false,
    });
  });
});
