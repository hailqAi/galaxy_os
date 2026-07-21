import { describe, expect, it } from 'vitest';
import { GET } from './route';

describe('GET /health', () => {
  it('reports the web shell as healthy', async () => {
    await expect(GET().json()).resolves.toEqual({
      status: 'ok',
      service: 'web',
    });
  });
});
