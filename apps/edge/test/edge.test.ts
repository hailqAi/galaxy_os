import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { createServer, request as httpRequest, type Server } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { connect } from 'node:tls';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createEdge, type EdgeConfig } from '../src/edge.js';

const temporary = mkdtempSync(join(tmpdir(), 'galaxy-edge-'));
const cert = join(temporary, 'cert.pem');
const key = join(temporary, 'key.pem');
const acme = join(temporary, 'acme');
const logs: Record<string, unknown>[] = [];
const running: { stop(): Promise<void> }[] = [];

beforeAll(() => {
  mkdirSync(acme);
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      key,
      '-out',
      cert,
      '-days',
      '1',
      '-subj',
      '/CN=os.galaxycentre.vn',
    ],
    { stdio: 'ignore' },
  );
});

afterEach(async () => {
  await Promise.all(running.splice(0).map((server) => server.stop()));
  logs.length = 0;
});

function config(upstreamPort: number, tls = true): EdgeConfig {
  return {
    publicHost: 'os.galaxycentre.vn',
    httpPort: 0,
    httpsPort: 0,
    upstream: new URL(`http://127.0.0.1:${upstreamPort}`),
    acmeWebroot: acme,
    tlsCert: tls ? cert : join(temporary, 'missing-cert'),
    tlsKey: tls ? key : join(temporary, 'missing-key'),
    trustProxy: true,
  };
}

function address(server: Server) {
  const value = server.address();
  if (!value || typeof value === 'string')
    throw new Error('Server is not listening');
  return value.port;
}

function get(port: number, path: string, host = 'os.galaxycentre.vn') {
  return new Promise<{
    status: number;
    headers: NodeJS.Dict<string | string[]>;
    body: string;
  }>((resolve, reject) => {
    const request = httpRequest(
      { port, path, headers: { host } },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () =>
          resolve({
            status: response.statusCode!,
            headers: response.headers,
            body: Buffer.concat(chunks).toString(),
          }),
        );
      },
    );
    request.on('error', reject).end();
  });
}

function secure(
  port: number,
  options: { path?: string; method?: string; body?: string } = {},
) {
  return new Promise<{
    status: number;
    headers: NodeJS.Dict<string | string[]>;
    body: string;
  }>((resolve, reject) => {
    const request = httpsRequest(
      {
        port,
        path: options.path ?? '/',
        method: options.method,
        rejectUnauthorized: false,
        headers: {
          host: 'os.galaxycentre.vn',
          'content-type': 'application/json',
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () =>
          resolve({
            status: response.statusCode!,
            headers: response.headers,
            body: Buffer.concat(chunks).toString(),
          }),
        );
      },
    );
    request.on('error', reject);
    request.end(options.body);
  });
}

async function listen(server: Server) {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server;
}

describe('Galaxy edge', () => {
  it('serves ACME, rejects traversal and arbitrary hosts, and redirects normal HTTP', async () => {
    writeFileSync(join(acme, 'challenge_token'), 'challenge-value\n');
    const edge = createEdge(config(1, false), (entry) => logs.push(entry));
    running.push(edge);
    await edge.start();
    const port = address(edge.http);

    expect(
      await get(port, '/.well-known/acme-challenge/challenge_token'),
    ).toMatchObject({ status: 200, body: 'challenge-value\n' });
    expect(
      (await get(port, '/.well-known/acme-challenge/%2e%2e%2fsecret')).status,
    ).toBe(404);
    expect((await get(port, '/', 'attacker.example')).status).toBe(400);
    expect(await get(port, '/health', 'localhost')).toMatchObject({
      status: 503,
      body: '{"ready":false,"tls":false,"upstream":false}',
    });
    expect(await get(port, '/login?returnTo=%2F')).toMatchObject({
      status: 308,
      headers: { location: 'https://os.galaxycentre.vn/login?returnTo=%2F' },
    });
    expect(edge.https).toBeUndefined();
    expect(logs).toContainEqual({
      event: 'tls_certificate_not_installed',
      https: false,
    });
  });

  it('proxies TLS requests with fixed forwarding headers and preserves Set-Cookie', async () => {
    let received = {
      body: '',
      host: '',
      forwardedFor: '',
      forwardedHost: '',
      forwardedProto: '',
    };
    const upstream = await listen(
      createServer((request, response) => {
        const chunks: Buffer[] = [];
        request.on('data', (chunk: Buffer) => chunks.push(chunk));
        request.on('end', () => {
          received = {
            body: Buffer.concat(chunks).toString(),
            host: request.headers.host ?? '',
            forwardedFor: String(request.headers['x-forwarded-for']),
            forwardedHost: String(request.headers['x-forwarded-host']),
            forwardedProto: String(request.headers['x-forwarded-proto']),
          };
          response.setHeader('set-cookie', [
            'galaxy_session=opaque; Path=/; Secure; HttpOnly; SameSite=Lax',
          ]);
          response.end('proxied');
        });
      }),
    );
    running.push({
      stop: () =>
        new Promise<void>((resolve) => upstream.close(() => resolve())),
    });
    const edge = createEdge(config(address(upstream)), (entry) =>
      logs.push(entry),
    );
    running.push(edge);
    await edge.start();

    const response = await secure(address(edge.https!), {
      path: '/api/v1/auth/login',
      method: 'POST',
      body: JSON.stringify({ password: 'never-log-this' }),
    });
    expect(response).toMatchObject({ status: 200, body: 'proxied' });
    expect(response.headers['set-cookie']?.[0]).toContain('Secure; HttpOnly');
    expect(received).toMatchObject({
      body: '{"password":"never-log-this"}',
      host: 'os.galaxycentre.vn',
      forwardedHost: 'os.galaxycentre.vn',
      forwardedProto: 'https',
    });
    expect(received.forwardedFor).toMatch(/127\.0\.0\.1/);
    expect(JSON.stringify(logs)).not.toContain('never-log-this');
  });

  it('configures WebSocket upgrades through the TLS listener', async () => {
    const upstream = await listen(createServer());
    upstream.on('upgrade', (request, socket) => {
      expect(request.headers['x-forwarded-proto']).toBe('https');
      socket.end(
        'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n',
      );
    });
    running.push({
      stop: () =>
        new Promise<void>((resolve) => upstream.close(() => resolve())),
    });
    const edge = createEdge(config(address(upstream)));
    running.push(edge);
    await edge.start();

    const response = await new Promise<string>((resolve, reject) => {
      const socket = connect(
        { port: address(edge.https!), rejectUnauthorized: false },
        () =>
          socket.write(
            'GET /socket HTTP/1.1\r\nHost: os.galaxycentre.vn\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n',
          ),
      );
      socket.once('data', (data) => {
        resolve(data.toString());
        socket.destroy();
      });
      socket.on('error', reject);
    });
    expect(response).toContain('101 Switching Protocols');
  });

  it('returns a safe 502 and shuts down gracefully', async () => {
    const edge = createEdge(config(1), (entry) => logs.push(entry));
    await edge.start();
    const response = await secure(address(edge.https!));
    expect(response).toMatchObject({ status: 502, body: 'Bad Gateway' });
    expect(response.body).not.toMatch(/ECONNREFUSED|127\.0\.0\.1/);
    await edge.stop();
    expect(edge.http.listening).toBe(false);
    expect(edge.https?.listening).toBe(false);
    expect(logs.at(-1)).toEqual({ event: 'shutdown_complete' });
  });
});
