import { afterEach, expect, it, vi } from 'vitest';
import { createM2BrowserFixture } from './m2-browser.fixture';

const { connect } = vi.hoisted(() => ({ connect: vi.fn() }));
vi.mock('node:child_process', () => ({
  execFileSync: () => JSON.stringify({ apiPort: 33001 }),
}));
vi.mock('@prisma/client', () => ({ PrismaClient: connect }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it.each([undefined, 'http://127.0.0.1:3001/api/v1'])(
  'rejects missing or main API before connecting or sending a request: %s',
  async (api) => {
    vi.stubEnv('INTERNAL_API_URL', api);
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(createM2BrowserFixture()).rejects.toThrow(
      'Fixture API target mismatch',
    );
    expect(connect).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  },
);

it('requires API readiness before fixture database writes', async () => {
  vi.stubEnv('INTERNAL_API_URL', 'http://127.0.0.1:33001/api/v1');
  const fetch = vi.fn(async () => new Response('{}', { status: 503 }));
  vi.stubGlobal('fetch', fetch);
  await expect(createM2BrowserFixture()).rejects.toThrow(
    'Fixture API not ready',
  );
  expect(fetch).toHaveBeenCalledWith(
    'http://127.0.0.1:33001/api/v1/ready',
    expect.objectContaining({ redirect: 'error' }),
  );
  expect(connect).not.toHaveBeenCalled();
});
