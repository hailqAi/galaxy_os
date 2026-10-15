import { randomUUID } from 'node:crypto';

const instanceId = randomUUID();
export function runtimeIdentity(headers?: Headers, trusted = false) {
  const supplied = trusted ? headers?.get('x-request-id') : undefined;
  return {
    requestId:
      supplied && /^[a-zA-Z0-9_-]{1,80}$/.test(supplied)
        ? supplied
        : randomUUID(),
    instanceId,
    releaseId: process.env.GALAXY_RELEASE_ID ?? 'development',
  };
}
export function observeResponse(
  response: Response,
  identity: ReturnType<typeof runtimeIdentity>,
  method: string,
  pathname: string,
  passthrough = false,
) {
  response.headers.set('x-request-id', identity.requestId);
  response.headers.set('x-galaxy-instance', identity.instanceId);
  response.headers.set('x-galaxy-release', identity.releaseId);
  console.log(
    JSON.stringify({
      event: passthrough ? 'http_dispatch' : 'http_response',
      service: 'web',
      ...identity,
      method,
      pathname,
      ...(!passthrough && { status: response.status }),
    }),
  );
  return response;
}
