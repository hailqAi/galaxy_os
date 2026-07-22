import { NextRequest } from 'next/server';
import { isIP } from 'node:net';
import {
  developmentHosts,
  publicHosts,
  trustedRequestHost,
} from '../../../../host-config';

const internalApiUrl =
  process.env.INTERNAL_API_URL ?? 'http://127.0.0.1:3001/api/v1';
const approvedRoots = new Set([
  'audit-logs',
  'auth',
  'custom-fields',
  'departments',
  'health',
  'me',
  'organization',
  'permissions',
  'ready',
  'roles',
  'system',
  'users',
]);

async function forward(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const requestHost = trustedRequestHost(
    request.headers,
    request.nextUrl.hostname,
  );
  const allowedHosts = new Set(
    process.env.NODE_ENV === 'production' ? publicHosts() : developmentHosts(),
  );
  if (!requestHost || !allowedHosts.has(requestHost))
    return Response.json({ message: 'Invalid Host' }, { status: 400 });
  const origin = request.headers.get('origin');
  try {
    if (
      !['GET', 'HEAD'].includes(request.method) &&
      (!origin ||
        (process.env.NODE_ENV === 'production'
          ? origin !== process.env.APP_PUBLIC_ORIGIN
          : new URL(origin).hostname !== requestHost))
    )
      return Response.json({ message: 'Forbidden' }, { status: 403 });
  } catch {
    return Response.json({ message: 'Forbidden' }, { status: 403 });
  }
  const path = (await params).path;
  if (
    !path.length ||
    !approvedRoots.has(path[0]!) ||
    path.some((part) => !/^[A-Za-z0-9_-]+$/.test(part)) ||
    [...request.nextUrl.searchParams.keys()].some((key) =>
      /password|token|cookie|authorization/i.test(key),
    )
  )
    return Response.json({ message: 'Not found' }, { status: 404 });

  const upstream = new URL(`${internalApiUrl}/${path.join('/')}`);
  upstream.search = request.nextUrl.search;
  const headers = new Headers();
  for (const name of ['accept', 'content-type', 'cookie']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (process.env.TRUST_PROXY === 'true') {
    const forwardedIp = request.headers
      .get('x-forwarded-for')
      ?.split(',')[0]
      ?.trim();
    if (forwardedIp && isIP(forwardedIp))
      headers.set('x-forwarded-for', forwardedIp);
  }
  try {
    const upstreamResponse = await fetch(upstream, {
      method: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method)
        ? undefined
        : await request.arrayBuffer(),
      cache: 'no-store',
      redirect: 'manual',
    });
    const responseHeaders = new Headers();
    for (const name of [
      'cache-control',
      'content-type',
      'content-disposition',
    ]) {
      const value = upstreamResponse.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    for (const cookie of upstreamResponse.headers.getSetCookie())
      responseHeaders.append('set-cookie', cookie);
    responseHeaders.set('cache-control', 'no-store');
    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: responseHeaders,
    });
  } catch {
    return Response.json(
      { message: 'Service unavailable' },
      { status: 502, headers: { 'cache-control': 'no-store' } },
    );
  }
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;
