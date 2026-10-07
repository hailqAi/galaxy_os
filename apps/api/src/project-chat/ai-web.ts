import { lookup } from 'node:dns/promises';
import type { LookupAddress } from 'node:dns';
import { isIP } from 'node:net';
import http from 'node:http';
import https from 'node:https';
import ipaddr from 'ipaddr.js';
import { parse, type DefaultTreeAdapterMap } from 'parse5';
import { z } from 'zod';
import { AiError, assertLegacyProviderAllowed } from './ai-registry';

export type WebPolicy = {
  enabled: boolean;
  revision: string;
  organizationId: string;
  decisionReference: string;
  creditsPerDay: number;
  maxCallsPerRequest: number;
  accountPaidUsageDisabled: boolean;
  subjects: { id: string; label: string; query: string; domains: string[] }[];
  key: string;
};
function publicIp(address: string) {
  try {
    return ipaddr.parse(address).range() === 'unicast';
  } catch {
    return false;
  }
}
export async function publicTarget(raw: string, signal: AbortSignal) {
  signal.throwIfAborted();
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AiError('PUBLIC_URL_REQUIRED');
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (
    raw.length > 2048 ||
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !['80', '443'].includes(url.port)) ||
    (!hostname.includes('.') && !isIP(hostname)) ||
    /(?:^|\.)(?:localhost|local|internal)$/i.test(hostname) ||
    [...url.searchParams.keys()].some((key) =>
      /token|secret|password|signature|credential|api.?key|authorization/i.test(
        key,
      ),
    )
  )
    throw new AiError('PUBLIC_URL_REQUIRED');
  url.hash = '';
  const addresses = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await new Promise<LookupAddress[]>((resolve, reject) => {
        const abort = () => reject(new AiError('CANCELLED'));
        signal.addEventListener('abort', abort, { once: true });
        lookup(hostname, { all: true, verbatim: true })
          .then(resolve, reject)
          .finally(() => signal.removeEventListener('abort', abort));
        if (signal.aborted) abort();
      });
  signal.throwIfAborted();
  if (!addresses.length || addresses.some((item) => !publicIp(item.address)))
    throw new AiError('PUBLIC_URL_REQUIRED');
  return { url, addresses };
}
function pageText(bytes: Buffer, mime: string) {
  const charset = /charset\s*=\s*["']?([^;\s"']+)/i.exec(mime)?.[1] ?? 'utf-8';
  let text: string;
  try {
    text = new TextDecoder(charset, { fatal: true }).decode(bytes);
  } catch {
    throw new AiError('WEB_ENCODING_UNSUPPORTED');
  }
  let title = '';
  if (/html/i.test(mime)) {
    const document = parse(text, { scriptingEnabled: false });
    const stack: { node: DefaultTreeAdapterMap['node']; inTitle: boolean }[] = [
      { node: document, inTitle: false },
    ];
    const parts: string[] = [];
    let visited = 0;
    while (stack.length) {
      const { node, inTitle } = stack.pop()!;
      if (++visited > 50000) throw new AiError('WEB_PAGE_TOO_LARGE');
      if (
        'tagName' in node &&
        [
          'script',
          'style',
          'noscript',
          'iframe',
          'object',
          'svg',
          'template',
        ].includes(node.tagName)
      )
        continue;
      if ('value' in node) {
        if (inTitle) title += node.value;
        else parts.push(node.value);
      }
      if ('childNodes' in node)
        for (const child of [...node.childNodes].reverse())
          stack.push({
            node: child,
            inTitle: inTitle || ('tagName' in node && node.tagName === 'title'),
          });
    }
    text = parts.join('\n');
  }
  text = text
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .trim();
  const truncated = Buffer.byteLength(text) > 20000;
  while (Buffer.byteLength(text) > 20000)
    text = text.slice(0, Math.floor(text.length * 0.9));
  return {
    title: title.trim().slice(0, 200),
    text,
    coverage: truncated
      ? 'Đã fetch trang; nội dung trả về bị giới hạn 20 KB.'
      : 'Nội dung văn bản của trang đã fetch; không thực thi script hoặc tải tài nguyên nhúng.',
  };
}
export async function fetchPublicPage(
  raw: string,
  signal: AbortSignal,
  beforeRequest: () => Promise<void>,
) {
  const combined = AbortSignal.any([signal, AbortSignal.timeout(10000)]);
  let target = raw;
  for (let redirect = 0; redirect <= 3; redirect++) {
    const { url, addresses } = await publicTarget(target, combined);
    await beforeRequest();
    combined.throwIfAborted();
    const response = await new Promise<{
      location?: string;
      bytes: Buffer;
      mime: string;
    }>((resolve, reject) => {
      const request = (url.protocol === 'https:' ? https : http).request(
        url,
        {
          method: 'GET',
          agent: false,
          signal: combined,
          headers: {
            Accept: 'text/html, application/xhtml+xml, text/plain',
            'Accept-Encoding': 'identity',
            'User-Agent': 'Galaxy-OS-Public-Reader/1.0',
          },
          lookup: (_host, options, callback) => {
            if (options.all) callback(null, addresses);
            else callback(null, addresses[0]!.address, addresses[0]!.family);
          },
        },
        (res) => {
          if ([301, 302, 303, 307, 308].includes(res.statusCode ?? 0)) {
            res.destroy();
            resolve({
              location: res.headers.location,
              bytes: Buffer.alloc(0),
              mime: '',
            });
            return;
          }
          const mime = res.headers['content-type'] ?? '';
          if (
            res.statusCode !== 200 ||
            !/^(text\/html|application\/xhtml\+xml|text\/plain)(?:;|$)/i.test(
              mime,
            ) ||
            (res.headers['content-encoding'] &&
              res.headers['content-encoding'] !== 'identity')
          ) {
            res.destroy();
            reject(new AiError('PUBLIC_PAGE_UNAVAILABLE'));
            return;
          }
          const parts: Buffer[] = [];
          let size = 0;
          res.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > 262144) {
              res.destroy();
              reject(new AiError('WEB_PAGE_TOO_LARGE'));
            } else parts.push(chunk);
          });
          res.on('error', reject);
          res.on('end', () => resolve({ bytes: Buffer.concat(parts), mime }));
        },
      );
      request.on('error', reject);
      request.end();
    });
    if (response.location) {
      target = new URL(response.location, url).href;
      continue;
    }
    if (!response.mime) throw new AiError('PUBLIC_PAGE_UNAVAILABLE');
    return {
      url: url.href,
      ...pageText(response.bytes, response.mime),
      retrievedAt: new Date().toISOString(),
      kind: 'PAGE' as const,
      provider: 'LOCAL_PUBLIC_FETCH',
    };
  }
  throw new AiError('WEB_REDIRECT_LIMIT');
}
export async function webSearch(
  policy: WebPolicy,
  subjectId: string,
  topic: 'specifications' | 'manual' | 'certification',
  signal: AbortSignal,
  beforeRequest: () => Promise<void>,
  receipt: (value: {
    requestId: string | null;
    credits: number | null;
  }) => Promise<void>,
) {
  assertLegacyProviderAllowed();
  if (
    !policy.enabled ||
    !policy.key ||
    !policy.accountPaidUsageDisabled ||
    policy.creditsPerDay < 1 ||
    policy.maxCallsPerRequest < 1
  )
    throw new AiError('NEEDS_PROVIDER_CONFIGURATION_OR_BUDGET');
  const subject = policy.subjects.find((item) => item.id === subjectId);
  if (!subject) throw new AiError('PUBLIC_SUBJECT_REQUIRED');
  const query = subject.query + ' ' + topic;
  const combined = AbortSignal.any([signal, AbortSignal.timeout(10000)]);
  await beforeRequest();
  combined.throwIfAborted();
  assertLegacyProviderAllowed();
  let recorded = false;
  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      redirect: 'error',
      signal: combined,
      headers: {
        Authorization: `Bearer ${policy.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        search_depth: 'basic',
        topic: 'general',
        max_results: 3,
        auto_parameters: false,
        include_answer: false,
        include_raw_content: false,
        include_images: false,
        include_usage: true,
        ...(subject.domains.length
          ? {
              include_domains: subject.domains,
              include_domains_mode: 'restrict',
            }
          : {}),
      }),
    });
    if (!response.ok || !response.body)
      throw new AiError('WEB_SEARCH_UNAVAILABLE', response.status);
    const reader = response.body.getReader(),
      parts: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.length;
        if (size > 262144) throw new AiError('WEB_PAGE_TOO_LARGE');
        parts.push(part.value);
      }
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
    const raw: unknown = JSON.parse(Buffer.concat(parts).toString('utf8'));
    const evidence = z
      .object({
        request_id: z.string().max(200).optional().catch(undefined),
        usage: z
          .object({ credits: z.number().finite().nonnegative().max(1000000) })
          .optional()
          .catch(undefined),
      })
      .parse(raw);
    const credits = evidence.usage?.credits ?? null;
    recorded = true;
    await receipt({ requestId: evidence.request_id ?? null, credits });
    if (credits === null) throw new AiError('WEB_COST_UNVERIFIED');
    if (credits > 1) throw new AiError('WEB_COST_VIOLATION');
    const result = z
      .object({
        request_id: z.string().max(200),
        usage: z.object({ credits: z.number().finite().nonnegative().max(1) }),
        results: z
          .array(
            z.object({
              title: z.string().max(500),
              url: z.string().url().max(2048),
              content: z.string().max(12000),
            }),
          )
          .max(3),
      })
      .parse(raw);
    return {
      query,
      requestId: result.request_id,
      credits: result.usage.credits,
      results: result.results,
      provider: 'TAVILY',
      kind: 'SNIPPET' as const,
      retrievedAt: new Date().toISOString(),
    };
  } finally {
    if (!recorded) await receipt({ requestId: null, credits: null });
  }
}
