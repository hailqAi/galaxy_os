const hostnamePattern =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*$/;

export function normalizeHost(value: string): string | null {
  const input = value.trim();
  const isUrl = /^[a-z][a-z\d+.-]*:\/\//i.test(input);
  if (!input || input === '*' || (!isUrl && /[/?#@\[\]]/.test(input)))
    return null;
  try {
    const url = new URL(isUrl ? input : `http://${input}`);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return null;
    const hostname = url.hostname.toLowerCase();
    if (!hostname || hostname === '*' || !hostnamePattern.test(hostname))
      return null;
    const parts = hostname.split('.');
    if (
      parts.length === 4 &&
      parts.every((part) => /^\d+$/.test(part)) &&
      parts.some((part) => Number(part) > 255)
    )
      return null;
    return hostname;
  } catch {
    return null;
  }
}

export const normalizeHostHeader = (value: string) =>
  /:\/\//.test(value) ? null : normalizeHost(value);

export function publicHosts(
  origin = process.env.APP_PUBLIC_ORIGIN,
  configured = process.env.TRUSTED_PUBLIC_HOSTS,
) {
  if (!origin) throw new Error('APP_PUBLIC_ORIGIN is required in production');
  const url = new URL(origin);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error('APP_PUBLIC_ORIGIN must be an absolute HTTPS origin');
  const hosts = [url.hostname, ...(configured?.split(',') ?? [])].map(
    (entry) => {
      const host = normalizeHost(entry);
      if (!host) throw new Error(`Invalid trusted public host: ${entry}`);
      return host;
    },
  );
  return [...new Set(hosts)];
}

export function internalApiUrl(
  value = process.env.INTERNAL_API_URL ?? 'http://127.0.0.1:3001/api/v1',
) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('INTERNAL_API_URL must be an exact loopback HTTP API base');
  }
  if (
    url.protocol !== 'http:' ||
    url.hostname !== '127.0.0.1' ||
    !url.port ||
    url.username ||
    url.password ||
    url.pathname !== '/api/v1' ||
    url.search ||
    url.hash
  )
    throw new Error('INTERNAL_API_URL must be an exact loopback HTTP API base');
  return `${url.origin}/api/v1`;
}

export function validateProductionEnvironment() {
  if (process.env.NODE_ENV !== 'production') return;
  if (process.env.ALLOW_DEV_AUTH === 'true')
    throw new Error(
      'Development authentication cannot be enabled in production',
    );
  if (process.env.TRUST_PROXY !== 'true')
    throw new Error('TRUST_PROXY must be true in production');
  publicHosts();
  internalApiUrl();
  if (process.env.NEXT_PUBLIC_API_URL !== '/api/v1')
    throw new Error('NEXT_PUBLIC_API_URL must be /api/v1 in production');
}

export function trustedRequestHost(headers: Headers, fallback = '') {
  if (process.env.NODE_ENV === 'production') {
    const origin = trustedRequestOrigin(
      headers,
      fallback ? `http://${fallback}` : '',
    );
    return origin ? new URL(origin).hostname : null;
  }
  const trustProxy = process.env.TRUST_PROXY === 'true';
  const forwardedHost = trustProxy
    ? headers.get('x-forwarded-host')?.trim()
    : undefined;
  return normalizeHostHeader(forwardedHost || headers.get('host') || fallback);
}

export function internalHttpOrigins(
  value = process.env.GALAXY_INTERNAL_HTTP_ORIGINS,
) {
  return (value?.split(',') ?? []).filter(Boolean).map((entry) => {
    const url = new URL(entry.trim());
    const parts = url.hostname.split('.').map(Number);
    const privateIp =
      /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname) &&
      parts.every((n) => n >= 0 && n <= 255) &&
      (parts[0] === 10 ||
        (parts[0] === 172 && parts[1]! >= 16 && parts[1]! <= 31) ||
        (parts[0] === 192 && parts[1] === 168));
    if (
      url.protocol !== 'http:' ||
      (!['localhost', '127.0.0.1'].includes(url.hostname) && !privateIp) ||
      !url.port ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    )
      throw new Error(
        'GALAXY_INTERNAL_HTTP_ORIGINS requires exact local HTTP origins',
      );
    return url.origin;
  });
}

export function trustedRequestOrigin(
  headers: Headers,
  fallbackOrigin = '',
): string | null {
  const rawHost =
    headers.get('host') ?? (fallbackOrigin ? new URL(fallbackOrigin).host : '');
  if (!normalizeHostHeader(rawHost) || /[\s,\\]/.test(rawHost)) return null;
  const forwardedHost = headers.get('x-forwarded-host')?.trim();
  const forwardedProto = headers.get('x-forwarded-proto')?.trim();
  if (process.env.NODE_ENV !== 'production') {
    const host = trustedRequestHost(headers, rawHost);
    if (!host || !developmentHosts().includes(host)) return null;
    const protocol =
      process.env.TRUST_PROXY === 'true' && forwardedProto
        ? `${forwardedProto}:`
        : fallbackOrigin
          ? new URL(fallbackOrigin).protocol
          : 'http:';
    return new URL(
      `${protocol}//${process.env.TRUST_PROXY === 'true' && forwardedHost ? forwardedHost : rawHost}`,
    ).origin;
  }
  const local = new URL(`http://${rawHost}`).origin;
  if (internalHttpOrigins().includes(local)) {
    if (
      (forwardedHost &&
        forwardedHost.toLowerCase() !== rawHost.toLowerCase()) ||
      (forwardedProto && forwardedProto !== 'http')
    )
      return null;
    return local;
  }
  const expected = process.env.GALAXY_EDGE_PROOF;
  const supplied = headers.get('x-galaxy-edge-proof');
  if (
    process.env.GALAXY_PUBLIC_ACCESS !== 'true' ||
    process.env.TRUST_PROXY !== 'true' ||
    !expected ||
    expected.length < 32 ||
    !supplied ||
    Buffer.byteLength(expected) !== Buffer.byteLength(supplied) ||
    !timingSafeEqual(Buffer.from(expected), Buffer.from(supplied)) ||
    forwardedProto !== 'https' ||
    !forwardedHost ||
    !normalizeHostHeader(forwardedHost)
  )
    return null;
  const url = new URL(`https://${forwardedHost}`);
  return publicHosts().includes(url.hostname) &&
    (url.origin === process.env.APP_PUBLIC_ORIGIN ||
      !url.port ||
      url.port === '443')
    ? url.origin
    : null;
}

export function developmentHosts(value = process.env.DEV_ALLOWED_ORIGINS) {
  const hosts = ['localhost', '127.0.0.1'];
  for (const entry of value?.split(',') ?? []) {
    if (!entry.trim()) continue;
    const host = normalizeHost(entry);
    if (!host) throw new Error(`Invalid DEV_ALLOWED_ORIGINS entry: ${entry}`);
    hosts.push(host);
  }
  return [...new Set(hosts)];
}
import { timingSafeEqual } from 'node:crypto';
