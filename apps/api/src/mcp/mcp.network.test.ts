import { describe, expect, it, vi, afterEach } from 'vitest';
import { lookup } from 'node:dns/promises';
import {
  networkTarget,
  encryptMcpSecret,
  decryptMcpSecret,
  signedWebhook,
  validateMcpEncryptionKey,
} from './mcp.network';
import { Webhook } from 'standardwebhooks';
import { PassThrough } from 'node:stream';
import { IncomingMessage } from 'node:http';
import { McpNetwork } from './mcp.network';
vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }));
afterEach(() => vi.unstubAllEnvs());

describe('MCP network credentials and destinations', () => {
  it('bounds callback body reception even while it continues sending bytes', async () => {
    vi.useFakeTimers();
    const network = new McpNetwork(),
      body = new PassThrough();
    vi.spyOn(network, 'request').mockResolvedValue(
      body as unknown as IncomingMessage,
    );
    const checking = expect(
      network.post('https://example.com/events', { headers: {}, body: '{}' }),
    ).rejects.toThrow('MCP_NETWORK_TIMEOUT');
    const trickle = setInterval(() => body.write(' '), 20000);
    await vi.advanceTimersByTimeAsync(30001);
    await checking;
    clearInterval(trickle);
    vi.useRealTimers();
  });
  it('bounds DNS resolution independently of the duration of file streaming', async () => {
    vi.useFakeTimers();
    vi.mocked(lookup).mockImplementation(() => new Promise(() => {}) as never);
    const check = expect(
      networkTarget('https://example.com/file'),
    ).rejects.toThrow('MCP_NETWORK_TIMEOUT');
    await vi.advanceTimersByTimeAsync(30001);
    await check;
    vi.useRealTimers();
  });
  it('rejects local, private, mixed public/private and redirect destinations before contact', async () => {
    for (const url of [
      'http://example.com/file',
      'https://127.0.0.1/file',
      'https://[::1]/file',
      'https://192.168.1.10/file',
      'https://user:password@example.com/file',
      'https://example.com:3001/file',
    ]) {
      await expect(networkTarget(url)).rejects.toThrow();
    }
    vi.mocked(lookup).mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '10.0.0.1', family: 4 },
    ] as never);
    await expect(networkTarget('https://example.com/file')).rejects.toThrow();
  });
  it('permits actual signed artifact queries while pinning every resolved public address', async () => {
    vi.mocked(lookup).mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
    ] as never);
    const target = await networkTarget(
      'https://example.com/result.xlsx?signature=temporary',
    );
    expect(target.addresses).toEqual([{ address: '93.184.216.34', family: 4 }]);
    expect(target.url.searchParams.get('signature')).toBe('temporary');
  });
  it('encrypts credentials with authenticated encryption and rejects tampering', () => {
    vi.stubEnv(
      'GALAXY_MCP_ENCRYPTION_KEY',
      Buffer.alloc(32, 9).toString('base64'),
    );
    const ciphertext = encryptMcpSecret('signed-secret');
    expect(ciphertext).not.toContain('signed-secret');
    expect(decryptMcpSecret(ciphertext)).toBe('signed-secret');
    expect(() => decryptMcpSecret(ciphertext.slice(0, -3) + 'bad')).toThrow();
  });
  it('rejects an invalid encryption key before the MCP endpoint is enabled', () => {
    vi.stubEnv('GALAXY_MCP_ENCRYPTION_KEY', 'short');
    expect(validateMcpEncryptionKey).toThrow('MCP_ENCRYPTION_KEY_REQUIRED');
  });
  it('sends the exact bytes covered by Standard Webhooks and enforces the payload limit', () => {
    const secret = 'whsec_' + Buffer.alloc(32, 4).toString('base64');
    const signed = signedWebhook('sub-1', secret, 'evt-1', {
      name: 'galaxy.ai_job.created',
      eventId: 'evt-1',
      data: { job_id: 'sample' },
    });
    expect(
      new Webhook(secret).verify(signed.body, signed.headers),
    ).toMatchObject({ eventId: 'evt-1', data: { job_id: 'sample' } });
    expect(() =>
      signedWebhook('sub-1', secret, 'evt-1', { text: 'x'.repeat(256 * 1024) }),
    ).toThrow();
  });
});
