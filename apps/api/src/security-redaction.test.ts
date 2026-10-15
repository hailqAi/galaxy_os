import { describe, expect, it } from 'vitest';
import { redact } from './security-redaction';

it('redacts inbound MCP credentials and signed artifact URLs', () => {
  const output = redact({
    secret: 'mcp-private',
    'webhook-signature': 'mcp-private',
    GALAXY_MCP_ENCRYPTION_KEY: 'mcp-private',
    download_url: 'https://files.example.com/a?signature=mcp-private',
    message: 'secret: mcp-private',
    input: 'https://os.example.com/mcp/input-file?ticket=mcp-private',
    remote:
      'Failed https://files.example.com/a?X-Amz-Signature=mcp-private&x=1',
  });
  expect(JSON.stringify(output)).not.toContain('mcp-private');
});

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

it('redacts OAuth credentials, callback state/code and retained authorization hints', () => {
  const value = redact({
    access_token: 'oauth-secret',
    refresh_token: 'refresh-secret',
    id_token: 'id-secret',
    code_verifier: 'pkce-secret',
    nonce: 'nonce-secret',
    state: 'state-secret',
    code: 'code-secret',
    url: 'http://127.0.0.1:14555/auth/callback?code=code-secret&state=state-secret',
    authorize:
      'https://auth.openai.com/api/accounts/authorize?id_token_hint=id-secret',
  });
  expect(JSON.stringify(value)).not.toContain('-secret');
});

it('redacts camelCase Workspace and OAuth credentials in objects, messages and URLs', () => {
  for (const key of [
    'accessToken',
    'refreshToken',
    'clientSecret',
    'codeVerifier',
    'clientState',
  ]) {
    expect(JSON.stringify(redact({ [key]: 'e01-secret' }))).not.toContain(
      'e01-secret',
    );
    expect(redact(key + ': e01-secret')).not.toContain('e01-secret');
    expect(
      redact('https://example.test/?' + key + '=e01-secret'),
    ).not.toContain('e01-secret');
  }
});
