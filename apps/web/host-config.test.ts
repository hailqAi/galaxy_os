import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  developmentHosts,
  normalizeHost,
  publicHosts,
  trustedRequestHost,
  validateProductionEnvironment,
} from './host-config';
import { proxy } from './proxy';
import { NextRequest } from 'next/server';

afterEach(() => vi.unstubAllEnvs());

describe('development host configuration', () => {
  it('normalizes defaults, URLs, ports, IPv4 addresses, and hostnames', () => {
    expect(
      developmentHosts(
        ' 192.0.2.40:3000, http://192.168.1.20:3000, WINDOWS-PC, ,localhost ',
      ),
    ).toEqual([
      'localhost',
      '127.0.0.1',
      '192.0.2.40',
      '192.168.1.20',
      'windows-pc',
    ]);
  });

  it.each(['*', 'bad host', 'example.com:not-a-port', '999.1.1.1'])(
    'rejects malformed configuration %s',
    (value) => expect(() => developmentHosts(value)).toThrow(),
  );

  it.each(['localhost:3000', '127.0.0.1:3000', 'WINDOWS-PC:3000'])(
    'removes the port from %s',
    (value) => expect(normalizeHost(value)).not.toContain(':3000'),
  );
});

describe('Host validation', () => {
  const request = (host: string) =>
    proxy(
      new NextRequest('http://127.0.0.1:3000/forgot-password', {
        headers: { host },
      }),
    );

  it.each([
    'localhost:3000',
    '127.0.0.1:3000',
    '192.0.2.40:3000',
    '192.168.1.20:3000',
    'WINDOWS-PC:3000',
  ])('accepts configured host %s in development', async (host) => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('DEV_ALLOWED_ORIGINS', '192.0.2.40,192.168.1.20,windows-pc');
    expect((await request(host)).status).not.toBe(400);
  });

  it('accepts additional trusted production hosts and rejects wildcards', () => {
    expect(publicHosts('https://os.example.com', 'login.example.com')).toEqual([
      'os.example.com',
      'login.example.com',
    ]);
    expect(() => publicHosts('https://os.example.com', '*')).toThrow();
  });

  it('does not trust forwarded headers by default', () => {
    vi.stubEnv('TRUST_PROXY', 'false');
    expect(
      trustedRequestHost(
        new Headers({
          host: 'os.example.com',
          'x-forwarded-host': 'evil.example',
        }),
      ),
    ).toBe('os.example.com');
  });

  it('rejects unsafe production configuration', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('TRUST_PROXY', 'true');
    vi.stubEnv('APP_PUBLIC_ORIGIN', 'http://os.example.com');
    vi.stubEnv('NEXT_PUBLIC_API_URL', '/api/v1');
    expect(() => validateProductionEnvironment()).toThrow('HTTPS');
    vi.stubEnv('APP_PUBLIC_ORIGIN', 'https://os.example.com');
    vi.stubEnv('ALLOW_DEV_AUTH', 'true');
    expect(() => validateProductionEnvironment()).toThrow(
      'Development authentication',
    );
  });

  it('rejects unconfigured and malformed hosts', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect((await request('external.example:3000')).status).toBe(400);
    expect((await request('bad host:3000')).status).toBe(400);
    expect((await request('http://localhost:3000')).status).toBe(400);
  });

  it('uses only APP_PUBLIC_ORIGIN in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_PUBLIC_ORIGIN', 'https://galaxy.example');
    vi.stubEnv('DEV_ALLOWED_ORIGINS', 'development.example');
    expect((await request('galaxy.example')).status).not.toBe(400);
    expect((await request('development.example')).status).toBe(400);
    expect((await request('localhost')).status).toBe(400);
  });
});
