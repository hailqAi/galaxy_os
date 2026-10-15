import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import https from 'node:https';
import { isIP } from 'node:net';
import { type IncomingMessage } from 'node:http';
import ipaddr from 'ipaddr.js';
import { Webhook } from 'standardwebhooks';

export async function networkTarget(raw: string) {
  const url = new URL(raw);
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (
    raw.length > 16384 ||
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.hash ||
    (url.port && url.port !== '443') ||
    /(?:^|\.)(?:localhost|local|internal)$/i.test(hostname)
  )
    throw new Error('MCP_PUBLIC_HTTPS_REQUIRED');
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const addresses = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await Promise.race([
        lookup(hostname, { all: true, verbatim: true }),
        new Promise<never>((_resolve, reject) => {
          deadline = setTimeout(
            () => reject(new Error('MCP_NETWORK_TIMEOUT')),
            30000,
          );
          deadline.unref();
        }),
      ]).finally(() => clearTimeout(deadline));
  if (
    !addresses.length ||
    addresses.some(({ address }) => ipaddr.parse(address).range() !== 'unicast')
  )
    throw new Error('MCP_PUBLIC_HTTPS_REQUIRED');
  return { url, addresses };
}
function encryptionKey() {
  const raw = process.env.GALAXY_MCP_ENCRYPTION_KEY ?? '';
  const key = /^[a-f0-9]{64}$/.test(raw)
    ? Buffer.from(raw, 'hex')
    : Buffer.from(raw, 'base64');
  if (key.length !== 32)
    throw new ServiceUnavailableException('MCP_ENCRYPTION_KEY_REQUIRED');
  return key;
}
export function validateMcpEncryptionKey() {
  encryptionKey();
}
export function encryptMcpSecret(value: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const bytes = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), bytes]
    .map((part) => part.toString('base64url'))
    .join('.');
}
export function decryptMcpSecret(value: string) {
  const parts = value.split('.');
  if (parts.length !== 3) throw new Error('MCP_CREDENTIAL_INVALID');
  const [iv, tag, bytes] = parts.map((part) => Buffer.from(part, 'base64url'));
  const cipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv!);
  cipher.setAuthTag(tag!);
  return Buffer.concat([cipher.update(bytes!), cipher.final()]).toString(
    'utf8',
  );
}
export function signedWebhook(
  subscriptionId: string,
  secret: string,
  eventId: string,
  payload: unknown,
  previousSecret?: string,
) {
  const body = JSON.stringify(payload);
  if (Buffer.byteLength(body) > 256 * 1024)
    throw new Error('MCP_EVENT_TOO_LARGE');
  const now = new Date();
  const signatures = [secret, ...(previousSecret ? [previousSecret] : [])].map(
    (key) => new Webhook(key).sign(eventId, now, body),
  );
  return {
    body,
    headers: {
      'content-type': 'application/json',
      'webhook-id': eventId,
      'webhook-timestamp': String(Math.floor(now.getTime() / 1000)),
      'webhook-signature': signatures.join(' '),
      'x-mcp-subscription-id': subscriptionId,
    },
  };
}

export class McpRemoteResponseError extends Error {
  constructor(readonly status: number) {
    super('MCP_REMOTE_RESPONSE_FAILED');
  }
}
@Injectable()
export class McpNetwork {
  async request(
    raw: string,
    method: 'GET' | 'POST',
    headers: Record<string, string>,
    body?: string,
    signal?: AbortSignal,
    acceptedStatuses: readonly number[] = [],
  ): Promise<IncomingMessage> {
    const { url, addresses } = await networkTarget(raw);
    if (signal?.aborted) throw new Error('MCP_NETWORK_TIMEOUT');
    return new Promise((resolve, reject) => {
      const req = https.request(
        url,
        {
          method,
          agent: false,
          signal,
          headers: { ...headers, 'accept-encoding': 'identity' },
          lookup: (_host, options, callback) => {
            if (options.all) callback(null, addresses);
            else callback(null, addresses[0]!.address, addresses[0]!.family);
          },
        },
        (response) => {
          clearTimeout(connectionTimer);
          if (
            (!acceptedStatuses.includes(response.statusCode ?? 500) &&
              ((response.statusCode ?? 500) < 200 ||
                (response.statusCode ?? 500) >= 300)) ||
            (response.headers['content-encoding'] &&
              response.headers['content-encoding'] !== 'identity')
          ) {
            response.destroy();
            reject(new McpRemoteResponseError(response.statusCode ?? 500));
            return;
          }
          resolve(response);
        },
      );
      const connectionTimer = setTimeout(
        () => req.destroy(new Error('MCP_NETWORK_TIMEOUT')),
        30000,
      );
      req.setTimeout(30000, () =>
        req.destroy(new Error('MCP_NETWORK_TIMEOUT')),
      );
      req.on('error', (error) => {
        clearTimeout(connectionTimer);
        reject(
          Object.assign(
            new Error(
              signal?.aborted || error.message === 'MCP_NETWORK_TIMEOUT'
                ? 'MCP_NETWORK_TIMEOUT'
                : 'MCP_REMOTE_UNAVAILABLE',
            ),
            { code: (error as NodeJS.ErrnoException).code },
          ),
        );
      });
      req.end(body);
    });
  }
  async post(
    raw: string,
    request: { headers: Record<string, string>; body: string },
  ) {
    const abort = new AbortController();
    const deadline = setTimeout(() => abort.abort(), 30000);
    let response: IncomingMessage | undefined;
    const stop = () => response?.destroy(new Error('MCP_NETWORK_TIMEOUT'));
    abort.signal.addEventListener('abort', stop, { once: true });
    try {
      response = await this.request(
        raw,
        'POST',
        request.headers,
        request.body,
        abort.signal,
      );
      if (abort.signal.aborted) {
        stop();
        throw new Error('MCP_NETWORK_TIMEOUT');
      }
      const chunks: Buffer[] = [];
      let bytes = 0;
      for await (const chunk of response) {
        bytes += (chunk as Buffer).length;
        if (bytes > 16384) {
          response.destroy();
          throw new Error('MCP_CALLBACK_RESPONSE_TOO_LARGE');
        }
        chunks.push(chunk as Buffer);
      }
      return {
        status: response.statusCode!,
        body: Buffer.concat(chunks).toString('utf8'),
      };
    } finally {
      clearTimeout(deadline);
      abort.signal.removeEventListener('abort', stop);
    }
  }
  download(raw: string) {
    return this.request(raw, 'GET', { accept: 'application/octet-stream' });
  }
}
