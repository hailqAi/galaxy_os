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

export function validateProductionEnvironment() {
  if (process.env.NODE_ENV !== 'production') return;
  if (process.env.ALLOW_DEV_AUTH === 'true')
    throw new Error(
      'Development authentication cannot be enabled in production',
    );
  if (process.env.TRUST_PROXY !== 'true')
    throw new Error('TRUST_PROXY must be true in production');
  publicHosts();
  if (process.env.NEXT_PUBLIC_API_URL !== '/api/v1')
    throw new Error('NEXT_PUBLIC_API_URL must be /api/v1 in production');
}

export function trustedRequestHost(headers: Headers, fallback = '') {
  const trustProxy = process.env.TRUST_PROXY === 'true';
  const forwardedHost = trustProxy
    ? headers.get('x-forwarded-host')?.trim()
    : undefined;
  const forwardedProto = trustProxy
    ? headers.get('x-forwarded-proto')?.trim()
    : undefined;
  if (
    trustProxy &&
    process.env.NODE_ENV === 'production' &&
    forwardedProto !== 'https'
  )
    return null;
  return normalizeHostHeader(forwardedHost || headers.get('host') || fallback);
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
