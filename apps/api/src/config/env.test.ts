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
      UPLOAD_MAX_FILE_BYTES: 21_474_836_480,
      UPLOAD_ORGANIZATION_QUOTA_BYTES: 107_374_182_400,
      UPLOAD_GLOBAL_QUOTA_BYTES: 1_099_511_627_776,
      UPLOAD_STAGING_CAPACITY_BYTES: 824_633_720_832,
      UPLOAD_ACTOR_STAGING_LIMIT: 20,
      TRUST_PROXY: false,
    });
  });

  it.each(['0', '1.5', '9007199254740992', 'not-a-number'])(
    'rejects invalid upload maximum %s at startup',
    (UPLOAD_MAX_FILE_BYTES) => {
      expect(() =>
        readEnvironment({ ...database, UPLOAD_MAX_FILE_BYTES }),
      ).toThrow();
    },
  );

  it('requires organization capacity for three copies of the largest upload', () => {
    expect(() =>
      readEnvironment({
        ...database,
        UPLOAD_MAX_FILE_BYTES: '100',
        UPLOAD_ORGANIZATION_QUOTA_BYTES: '299',
      }),
    ).toThrow('Upload organization quota must cover staging amplification');
  });

  it('does not allow one organization quota to exceed global file capacity', () => {
    expect(() =>
      readEnvironment({
        ...database,
        UPLOAD_MAX_FILE_BYTES: '100',
        UPLOAD_ORGANIZATION_QUOTA_BYTES: '1000',
        UPLOAD_GLOBAL_QUOTA_BYTES: '999',
      }),
    ).toThrow('Global file capacity must cover every organization quota');
  });

  it('reserves staging headroom for unreleased parts across restarts', () => {
    expect(() =>
      readEnvironment({
        ...database,
        UPLOAD_MAX_FILE_BYTES: '100',
        UPLOAD_ORGANIZATION_QUOTA_BYTES: '1000',
        UPLOAD_GLOBAL_QUOTA_BYTES: '3000',
        UPLOAD_STAGING_CAPACITY_BYTES: '1200',
      }),
    ).toThrow('Upload staging capacity cannot absorb finalization');
  });

  it('requires an explicitly provisioned global file cap in production', () => {
    expect(() =>
      readEnvironment({
        ...database,
        NODE_ENV: 'production',
        APP_PUBLIC_ORIGIN: 'https://os.example.com',
        TRUST_PROXY: 'true',
        SMTP_HOST: 'smtp.example.com',
        EMAIL_FROM: 'noreply@example.com',
      }),
    ).toThrow('Production requires explicit UPLOAD_GLOBAL_QUOTA_BYTES');
  });

  it('requires an explicitly provisioned staging capacity in production', () => {
    expect(() =>
      readEnvironment({
        ...database,
        NODE_ENV: 'production',
        APP_PUBLIC_ORIGIN: 'https://os.example.com',
        TRUST_PROXY: 'true',
        SMTP_HOST: 'smtp.example.com',
        EMAIL_FROM: 'noreply@example.com',
        UPLOAD_GLOBAL_QUOTA_BYTES: '1099511627776',
      }),
    ).toThrow('Production requires explicit UPLOAD_STAGING_CAPACITY_BYTES');
  });

  it.each([
    ['/srv/galaxy/files', '/srv/galaxy/files'],
    ['/srv/galaxy/files', '/srv/galaxy/files/staging'],
    ['/srv/galaxy/uploads/files', '/srv/galaxy/uploads'],
  ])(
    'keeps canonical file storage and upload staging disjoint (%s, %s)',
    (FILE_STORAGE_PATH, LOCAL_UPLOAD_PATH) => {
      expect(() =>
        readEnvironment({
          ...database,
          FILE_STORAGE_PATH,
          LOCAL_UPLOAD_PATH,
        }),
      ).toThrow('File storage and upload staging paths must be disjoint');
    },
  );
});
