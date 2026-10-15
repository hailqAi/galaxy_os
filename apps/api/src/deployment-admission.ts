import { existsSync, readFileSync } from 'node:fs';
import { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { finalize } from 'rxjs';
let inFlight = 0;
let nativeInFlight = 0;
export const deploymentInFlight = () => inFlight;
export const deploymentNativeInFlight = () => nativeInFlight;
export async function trackNativeWork<T>(work: () => Promise<T>): Promise<T> {
  nativeInFlight++;
  try {
    return await work();
  } finally {
    nativeInFlight--;
  }
}
export class DeploymentRequests implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler) {
    inFlight++;
    return next.handle().pipe(
      finalize(() => {
        inFlight--;
      }),
    );
  }
}

export function deploymentDraining() {
  const file = process.env.GALAXY_DEPLOYMENT_GATE;
  return !!file && existsSync(file);
}
export function deploymentClosed() {
  if (!deploymentDraining()) return false;
  try {
    return (
      readFileSync(process.env.GALAXY_DEPLOYMENT_GATE!, 'utf8') !== 'drain'
    );
  } catch {
    return true;
  }
}
export function deploymentAdmission(
  req: { method?: string; url?: string },
  res: {
    setHeader(name: string, value: string): void;
    status(code: number): { json(value: unknown): void };
  },
  next: () => void,
) {
  const file = process.env.GALAXY_DEPLOYMENT_GATE;
  if (!file || !existsSync(file)) return next();
  const path = req.url?.split('?')[0] ?? '/';
  let draining = false;
  try {
    draining = readFileSync(file, 'utf8') === 'drain';
  } catch {
    /* Fail closed during replacement. */
  }
  const read = ['GET', 'HEAD', 'OPTIONS'].includes(req.method ?? '');
  const continuation =
    path === '/mcp' ||
    (req.method === 'POST' &&
      (path === '/mcp/oauth/token' ||
        /^\/api\/v1\/project-chat\/projects\/[^/]+\/ai\/answers\/[^/]+\/mcp\/cancel$/.test(
          path,
        ))) ||
    /^\/api\/v1\/uploads\/[^/]+\/(?:parts|complete|abort)$/.test(path);
  if (
    /^\/api\/v1\/(?:health|ready)$/.test(path) ||
    (draining && (read || continuation))
  )
    return next();
  res.setHeader('Retry-After', '5');
  res.status(503).json({ error: 'GALAXY_DEPLOYMENT_IN_PROGRESS' });
}
