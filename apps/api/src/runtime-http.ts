import { randomUUID } from 'node:crypto';

const instanceId = randomUUID();
export function runtimeIdentity(supplied?: string) {
  return {
    requestId:
      supplied && /^[a-zA-Z0-9_-]{1,80}$/.test(supplied)
        ? supplied
        : randomUUID(),
    instanceId,
    releaseId: process.env.GALAXY_RELEASE_ID ?? 'development',
  };
}
export type RuntimeRequest = {
  headers?: Record<string, string | undefined>;
  method?: string;
  url?: string;
  runtimeIdentity?: ReturnType<typeof runtimeIdentity>;
};
export type RuntimeResponse = {
  setHeader(name: string, value: string): void;
  statusCode: number;
  on(event: string, callback: () => void): void;
};
export function observeHttp(
  request: RuntimeRequest,
  response: RuntimeResponse,
  next: () => void,
) {
  const identity = (request.runtimeIdentity = runtimeIdentity(
    request.headers?.['x-request-id'],
  ));
  response.setHeader('x-request-id', identity.requestId);
  response.setHeader('x-galaxy-instance', identity.instanceId);
  response.setHeader('x-galaxy-release', identity.releaseId);
  response.on('finish', () =>
    console.log(
      JSON.stringify({
        event: 'http_response',
        service: 'api',
        ...identity,
        method: request.method,
        pathname: request.url?.split('?')[0],
        status: response.statusCode,
      }),
    ),
  );
  next();
}
