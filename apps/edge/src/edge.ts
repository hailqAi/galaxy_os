import { constants } from 'node:crypto';
import { constants as fsConstants, existsSync, readFileSync } from 'node:fs';
import { open } from 'node:fs/promises';
import {
  createServer as createHttpServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { isIP } from 'node:net';
import { resolve, sep } from 'node:path';
import httpProxy from 'http-proxy';

export type EdgeConfig = {
  publicHost: string;
  httpPort: number;
  httpsPort: number;
  upstream: URL;
  acmeWebroot: string;
  tlsCert: string;
  tlsKey: string;
  trustProxy: boolean;
};

type Log = (entry: Record<string, unknown>) => void;
const challengePrefix = '/.well-known/acme-challenge/';
const hostnamePattern =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*$/;

function port(value: string | undefined, fallback: number) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535)
    throw new Error('Edge port must be an integer from 0 to 65535');
  return parsed;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): EdgeConfig {
  const publicHost = (
    env.EDGE_PUBLIC_HOST ?? 'os.galaxycentre.vn'
  ).toLowerCase();
  if (!hostnamePattern.test(publicHost) || isIP(publicHost))
    throw new Error('EDGE_PUBLIC_HOST must be a valid DNS hostname');
  const upstream = new URL(env.EDGE_UPSTREAM ?? 'http://127.0.0.1:3000');
  if (
    upstream.protocol !== 'http:' ||
    upstream.username ||
    upstream.password ||
    upstream.pathname !== '/' ||
    upstream.search ||
    upstream.hash
  )
    throw new Error('EDGE_UPSTREAM must be an HTTP origin');
  return {
    publicHost,
    httpPort: port(env.EDGE_HTTP_PORT, 8080),
    httpsPort: port(env.EDGE_HTTPS_PORT, 8443),
    upstream,
    acmeWebroot: env.EDGE_ACME_WEBROOT ?? '/home/galaxy_os/.runtime/acme',
    tlsCert: env.EDGE_TLS_CERT ?? '/home/galaxy_os/.runtime/tls/fullchain.pem',
    tlsKey: env.EDGE_TLS_KEY ?? '/home/galaxy_os/.runtime/tls/privkey.pem',
    trustProxy: env.EDGE_TRUST_PROXY === 'true',
  };
}

function host(req: IncomingMessage): string | null {
  const values: string[] = [];
  for (let index = 0; index < req.rawHeaders.length; index += 2)
    if (req.rawHeaders[index]?.toLowerCase() === 'host')
      values.push(req.rawHeaders[index + 1] ?? '');
  if (values.length !== 1 || /[\s,\\/@]/.test(values[0]!)) return null;
  try {
    const url = new URL(`http://${values[0]}`);
    if (url.username || url.password || url.pathname !== '/' || !url.hostname)
      return null;
    return url.port
      ? `${url.hostname.toLowerCase()}:${url.port}`
      : url.hostname.toLowerCase();
  } catch {
    return null;
  }
}

const loopback = (address: string | undefined) =>
  address === '127.0.0.1' ||
  address === '::1' ||
  address === '::ffff:127.0.0.1';
const publicHostAllowed = (
  value: string | null,
  config: EdgeConfig,
  port: number,
) => value === config.publicHost || value === `${config.publicHost}:${port}`;
const localHealthAllowed = (
  req: IncomingMessage,
  value: string | null,
  port: number,
) =>
  loopback(req.socket.remoteAddress) &&
  (value === 'localhost' ||
    value === `localhost:${port}` ||
    value === '127.0.0.1' ||
    value === `127.0.0.1:${port}` ||
    value === `[::1]:${port}`);

function send(
  res: ServerResponse,
  status: number,
  body: string,
  contentType = 'text/plain; charset=utf-8',
) {
  res.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': contentType,
    'x-content-type-options': 'nosniff',
  });
  res.end(body);
}

async function upstreamHealthy(config: EdgeConfig) {
  try {
    const response = await fetch(new URL('/health', config.upstream), {
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function health(res: ServerResponse, config: EdgeConfig, tls: boolean) {
  const upstream = await upstreamHealthy(config);
  send(
    res,
    upstream ? 200 : 503,
    JSON.stringify({ ready: upstream, tls, upstream }),
    'application/json; charset=utf-8',
  );
}

export function createEdge(
  config: EdgeConfig,
  log: Log = (entry) => console.log(JSON.stringify(entry)),
) {
  const proxy = httpProxy.createProxyServer({
    target: config.upstream.origin,
    changeOrigin: false,
    xfwd: false,
    ws: true,
  });
  proxy.on('proxyReq', (proxyReq, req) => {
    proxyReq.setHeader('host', req.headers.host ?? config.publicHost);
    proxyReq.setHeader('x-forwarded-proto', 'https');
    proxyReq.setHeader('x-forwarded-host', config.publicHost);
    proxyReq.setHeader(
      'x-forwarded-for',
      req.socket.remoteAddress ?? 'unknown',
    );
  });
  proxy.on('error', (_error, _req, response) => {
    if (response && 'writeHead' in response && !response.headersSent)
      send(response, 502, 'Bad Gateway');
    else if (response && 'destroy' in response) response.destroy();
    log({ event: 'proxy_error', status: 502 });
  });

  const http = createHttpServer(async (req, res) => {
    const requestHost = host(req);
    const url = new URL(req.url ?? '/', 'http://edge.invalid');
    if (
      url.pathname === '/health' &&
      localHealthAllowed(req, requestHost, config.httpPort)
    )
      return health(res, config, false);
    if (!publicHostAllowed(requestHost, config, config.httpPort))
      return send(res, 400, 'Invalid Host');
    if (url.pathname.startsWith(challengePrefix)) {
      const token = url.pathname.slice(challengePrefix.length);
      if (!/^[A-Za-z0-9_-]+$/.test(token)) return send(res, 404, 'Not Found');
      const root = resolve(config.acmeWebroot);
      const file = resolve(root, token);
      if (!file.startsWith(`${root}${sep}`)) return send(res, 404, 'Not Found');
      try {
        const challenge = await open(
          file,
          fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
        );
        try {
          return send(res, 200, await challenge.readFile('utf8'));
        } finally {
          await challenge.close();
        }
      } catch {
        return send(res, 404, 'Not Found');
      }
    }
    res.writeHead(308, {
      location: `https://${config.publicHost}${url.pathname}${url.search}`,
    });
    res.end();
  });

  let https: Server | undefined;
  if (existsSync(config.tlsCert) && existsSync(config.tlsKey)) {
    https = createHttpsServer(
      {
        cert: readFileSync(config.tlsCert),
        key: readFileSync(config.tlsKey),
        minVersion: 'TLSv1.2',
        secureOptions: constants.SSL_OP_NO_COMPRESSION,
      },
      async (req, res) => {
        const requestHost = host(req);
        const url = new URL(req.url ?? '/', 'https://edge.invalid');
        if (
          url.pathname === '/health' &&
          localHealthAllowed(req, requestHost, config.httpsPort)
        )
          return health(res, config, true);
        if (!publicHostAllowed(requestHost, config, config.httpsPort))
          return send(res, 400, 'Invalid Host');
        proxy.web(req, res);
      },
    );
    https.on('upgrade', (req, socket, head) => {
      if (!publicHostAllowed(host(req), config, config.httpsPort))
        return socket.destroy();
      req.headers['x-forwarded-proto'] = 'https';
      req.headers['x-forwarded-host'] = config.publicHost;
      req.headers['x-forwarded-for'] = req.socket.remoteAddress ?? 'unknown';
      proxy.ws(req, socket, head);
    });
  }

  const listen = (server: Server, portNumber: number) =>
    new Promise<void>((resolvePromise, reject) => {
      server.once('error', reject);
      server.listen(portNumber, '0.0.0.0', () => {
        server.off('error', reject);
        resolvePromise();
      });
    });
  const close = (server: Server | undefined) =>
    server && server.listening
      ? new Promise<void>((resolvePromise) =>
          server.close(() => resolvePromise()),
        )
      : Promise.resolve();
  return {
    http,
    https,
    async start() {
      await listen(http, config.httpPort);
      log({ event: 'http_listening', port: config.httpPort });
      if (https) {
        await listen(https, config.httpsPort);
        log({ event: 'https_listening', port: config.httpsPort });
      } else log({ event: 'tls_certificate_not_installed', https: false });
    },
    async stop() {
      await Promise.all([close(http), close(https)]);
      proxy.close();
      log({ event: 'shutdown_complete' });
    },
  };
}
