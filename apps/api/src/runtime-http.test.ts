import { expect, it, vi } from 'vitest';
import { observeHttp } from './runtime-http';
it('records real HTTP receive/finish times with a safe request ID and no URL query', () => {
  let finish = () => {};
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  try {
    observeHttp(
      {
        headers: { 'x-request-id': 'trace-fixture' },
        method: 'POST',
        url: '/mcp/oauth/token?code=do-not-log',
      },
      {
        statusCode: 401,
        setHeader: () => {},
        on: (_event, callback) => {
          finish = callback;
        },
      },
      () => {},
    );
    finish();
    const value = JSON.parse(log.mock.calls[0]![0] as string);
    expect(value).toMatchObject({
      requestId: 'trace-fixture',
      pathname: '/mcp/oauth/token',
      status: 401,
      durationMs: expect.any(Number),
      receivedAt: expect.any(String),
      finishedAt: expect.any(String),
    });
    expect(JSON.stringify(value)).not.toContain('do-not-log');
  } finally {
    log.mockRestore();
  }
});
