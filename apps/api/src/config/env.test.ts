import { describe, expect, it } from 'vitest';
import { readEnvironment } from './env';

describe('readEnvironment', () => {
  it('rejects a non-PostgreSQL database URL', () => {
    expect(() =>
      readEnvironment({ DATABASE_URL: 'redis://localhost:6379' }),
    ).toThrow();
  });
});
