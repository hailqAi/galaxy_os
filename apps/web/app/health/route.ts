import { observeResponse, runtimeIdentity } from '../../runtime-http';
import { trustedRequestOrigin } from '../../host-config';

export const dynamic = 'force-dynamic';
export function GET(request?: Request) {
  const identity = runtimeIdentity(
    request?.headers,
    process.env.NODE_ENV === 'production' &&
      !!request &&
      trustedRequestOrigin(
        request.headers,
        new URL(request.url).origin,
      )?.startsWith('https://') === true,
  );
  return observeResponse(
    Response.json(
      { status: 'ok', service: 'web', ...identity },
      { headers: { 'cache-control': 'no-store' } },
    ),
    identity,
    'GET',
    '/health',
  );
}
