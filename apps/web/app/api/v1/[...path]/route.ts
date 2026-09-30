import { NextRequest } from 'next/server';
import { isIP } from 'node:net';
import {
  internalApiUrl,
  internalHttpOrigins,
  trustedRequestOrigin,
} from '../../../../host-config';
import { observeResponse, runtimeIdentity } from '../../../../runtime-http';

const apiBaseUrl =
  process.env.NODE_ENV === 'production'
    ? internalApiUrl()
    : (process.env.INTERNAL_API_URL ?? 'http://127.0.0.1:3001/api/v1');
const approvedRoots = new Set([
  'audit-logs',
  'auth',
  'brands',
  'custom-fields',
  'customers',
  'contacts',
  'leads',
  'lead-sources',
  'opportunities',
  'purchase-requests',
  'rfqs',
  'supplier-quotations',
  'supplier-comparisons',
  'purchase-orders',
  'proforma-invoices',
  'supplier-payables',
  'supplier-payment-schedules',
  'supplier-payments',
  'projects',
  'project-chat',
  'products',
  'suppliers',
  'tasks',
  'surveys',
  'requirements',
  'files',
  'comments',
  'notifications',
  'activities',
  'dashboard',
  'search',
  'imports',
  'production-orders',
  'forwarders',
  'shipments',
  'customs',
  'landed-costs',
  'warehouses',
  'inventory',
  'installation',
  'inspections',
  'inspection-items',
  'handovers',
  'handover-documents',
  'warranty',
  'service-tickets',
  'service-visits',
  'warranty-claims',
  'campaigns',
  'content',
  'publishing-jobs',
  'departments',
  'health',
  'me',
  'organization',
  'permissions',
  'ready',
  'roles',
  'system',
  'users',
  'uploads',
]);
const requestHeaders = [
  'accept',
  'content-type',
  'content-range',
  'cookie',
  'etag',
  'x-csrf-token',
  'x-chat-actor',
] as const;
const responseHeaders = [
  'content-length',
  'content-range',
  'etag',
  'location',
  'set-cookie',
  'upload-offset',
] as const;

async function forward(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const requestOrigin = trustedRequestOrigin(
    request.headers,
    request.nextUrl.origin,
  );
  if (!requestOrigin)
    return Response.json({ message: 'Invalid Host' }, { status: 400 });
  const origin = request.headers.get('origin');
  if (!['GET', 'HEAD'].includes(request.method) && origin !== requestOrigin)
    return Response.json({ message: 'Forbidden' }, { status: 403 });
  const path = (await params).path;
  if (
    !path.length ||
    !approvedRoots.has(path[0]!) ||
    path.some(
      (part, index) =>
        !/^[A-Za-z0-9_-]+$/.test(part) &&
        !(
          index === 2 &&
          path[0] === 'me' &&
          path[1] === 'avatar' &&
          /^[0-9a-f-]+\.(jpg|png|webp)$/.test(part)
        ),
    ) ||
    [...request.nextUrl.searchParams.keys()].some((key) =>
      /password|token|cookie|authorization/i.test(key),
    )
  )
    return Response.json({ message: 'Not found' }, { status: 404 });

  const upstream = new URL(`${apiBaseUrl}/${path.join('/')}`);
  upstream.search = request.nextUrl.search;
  const headers = new Headers();
  const identity = runtimeIdentity(
    request.headers,
    process.env.NODE_ENV === 'production' &&
      requestOrigin.startsWith('https://'),
  );
  headers.set('x-request-id', identity.requestId);
  for (const name of requestHeaders) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (
    process.env.TRUST_PROXY === 'true' &&
    requestOrigin.startsWith('https://')
  ) {
    const forwardedIp = request.headers
      .get('x-forwarded-for')
      ?.split(',')[0]
      ?.trim();
    if (forwardedIp && isIP(forwardedIp))
      headers.set('x-forwarded-for', forwardedIp);
  }
  try {
    const hasBody = !['GET', 'HEAD'].includes(request.method);
    const options: RequestInit & { duplex?: 'half' } = {
      method: request.method,
      headers,
      body: hasBody ? request.body : undefined,
      cache: 'no-store',
      redirect: 'manual',
    };
    if (hasBody) options.duplex = 'half';
    const upstreamResponse = await fetch(upstream, options);
    const outgoingHeaders = new Headers();
    for (const name of [
      'cache-control',
      'content-type',
      'content-disposition',
      ...responseHeaders,
    ]) {
      if (name === 'set-cookie') continue;
      const value = upstreamResponse.headers.get(name);
      if (value) outgoingHeaders.set(name, value);
    }
    for (const cookie of upstreamResponse.headers.getSetCookie()) {
      const name = cookie.slice(0, cookie.indexOf('='));
      outgoingHeaders.append(
        'set-cookie',
        internalHttpOrigins().includes(requestOrigin) &&
          name === (process.env.SESSION_COOKIE_NAME ?? 'galaxy_session')
          ? cookie.replace(/;\s*Secure(?=;|$)/gi, '')
          : cookie,
      );
    }
    outgoingHeaders.set('cache-control', 'no-store');
    return observeResponse(
      new Response(upstreamResponse.body, {
        status: upstreamResponse.status,
        headers: outgoingHeaders,
      }),
      identity,
      request.method,
      request.nextUrl.pathname,
    );
  } catch {
    return observeResponse(
      Response.json(
        { message: 'Service unavailable' },
        { status: 502, headers: { 'cache-control': 'no-store' } },
      ),
      identity,
      request.method,
      request.nextUrl.pathname,
    );
  }
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;
