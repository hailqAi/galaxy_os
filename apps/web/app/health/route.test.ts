import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

describe('GET /health', () => {
  it('reports the web shell as healthy', async () => {
    await expect(GET().json()).resolves.toMatchObject({
      status: 'ok',
      service: 'web',
    });
  });
  afterEach(() => vi.unstubAllEnvs());
  it('identifies fresh requests and a stable process without exposing configuration', async () => {
    vi.stubEnv('GALAXY_RELEASE_ID', 'release-fixture');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const first = GET();
    const second = GET();
    const a = await first.json();
    const b = await second.json();
    expect(a.releaseId).toBe('release-fixture');
    expect(a.instanceId).toBe(b.instanceId);
    expect(a.requestId).not.toBe(b.requestId);
    expect(first.headers.get('cache-control')).toBe('no-store');
    expect(first.headers.get('x-request-id')).toBe(a.requestId);
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({
      requestId: a.requestId,
      status: 200,
    });
    log.mockRestore();
  });
  it('does not reuse request IDs supplied by an untrusted HTTP client', async () => {
    const request = new Request('http://localhost:3000/health', {
      headers: { 'x-request-id': 'repeated-client-id' },
    });
    const a = await GET(request).json();
    const b = await GET(request).json();
    expect(a.requestId).not.toBe('repeated-client-id');
    expect(a.requestId).not.toBe(b.requestId);
  });
});
