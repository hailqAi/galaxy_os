import { describe, expect, it } from 'vitest';
import { redact } from './security-redaction';

describe('security redaction', () => {
  it('removes credential fields from structured data and URLs', () => {
    const url = new URL('/login', 'http://local');
    url.searchParams.set('password', 'not-a-real-secret');
    url.searchParams.set('returnTo', '/');
    const output = redact({
      password: 'not-a-real-secret',
      confirmNewPassword: 'not-a-real-confirmation',
      rawToken: 'not-a-real-token',
      nested: { authorization: 'not-a-real-header' },
      url: `${url.pathname}${url.search}`,
    });
    expect(JSON.stringify(output)).not.toContain('not-a-real-secret');
    expect(JSON.stringify(output)).not.toContain('not-a-real-header');
    expect(JSON.stringify(output)).not.toContain('not-a-real-confirmation');
    expect(JSON.stringify(output)).not.toContain('not-a-real-token');
    expect(output).toMatchObject({
      password: '[REDACTED]',
      nested: { authorization: '[REDACTED]' },
    });
    const redactedUrl = new URL(
      (output as { url: string }).url,
      'http://local',
    );
    expect(redactedUrl.searchParams.get('password')).toBe('[REDACTED]');
  });

  it('redacts application logger input before serialization', () => {
    const output = redact({
      request: { cookie: 'not-a-real-cookie', password: 'not-a-real-secret' },
      stack: 'authorization: not-a-real-header',
    });
    expect(JSON.stringify(output)).not.toContain('not-a-real-cookie');
    expect(JSON.stringify(output)).not.toContain('not-a-real-secret');
    expect(JSON.stringify(output)).not.toContain('not-a-real-header');
  });
});
