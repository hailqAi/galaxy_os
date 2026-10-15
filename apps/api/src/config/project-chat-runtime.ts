import { isAbsolute } from 'node:path';
import { assertG00Isolation } from '../../scripts/g00-isolated-environment.mjs';

export function projectChatEnabled(env: NodeJS.ProcessEnv = process.env) {
  if (env.FEATURE_PROJECT_CHAT !== 'true') return false;
  if (
    env.M2_DEPLOYMENT_TARGET !== 'local-main' ||
    env.NODE_ENV === 'test' ||
    env.GALAXY_TEST_ISOLATION !== undefined ||
    Object.keys(env).some((key) => key.startsWith('G00_'))
  ) {
    assertG00Isolation(env);
    return true;
  }
  const db = new URL(env.DATABASE_URL ?? '');
  if (
    env.NODE_ENV !== 'development' ||
    env.API_PORT !== '3001' ||
    env.ALLOW_DEV_AUTH !== 'false' ||
    !env.GALAXY_LOCAL_RUNTIME_TOKEN ||
    env.SESSION_COOKIE_NAME !== 'galaxy_session' ||
    !isAbsolute(env.FILE_STORAGE_PATH ?? '') ||
    db.protocol !== 'postgresql:' ||
    !['localhost', '127.0.0.1'].includes(db.hostname) ||
    (db.port || '5432') !== '5432' ||
    db.pathname !== '/galaxy_os' ||
    (db.searchParams.get('schema') ?? 'public') !== 'public' ||
    [...db.searchParams.keys()].some((key) => key !== 'schema')
  )
    throw new Error(
      'M2 local cần launcher đã kiểm source/schema và đúng đích galaxy_os:3001',
    );
  return true;
}
