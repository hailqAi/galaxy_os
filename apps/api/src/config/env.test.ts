import { describe, expect, it } from 'vitest';
import { readEnvironment } from './env';

describe('readEnvironment', () => {
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
});
