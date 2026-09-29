import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { describe, expect, it } from 'vitest';
import { projectChatEnabled } from './project-chat-runtime';

const local = {
  FEATURE_PROJECT_CHAT: 'true',
  M2_DEPLOYMENT_TARGET: 'local-main',
  NODE_ENV: 'development',
  API_PORT: '3001',
  ALLOW_DEV_AUTH: 'false',
  DATABASE_URL:
    'postgresql://local:unused@localhost:5432/galaxy_os?schema=public',
  SESSION_COOKIE_NAME: 'galaxy_session',
  GALAXY_LOCAL_RUNTIME_TOKEN: 'managed',
  FILE_STORAGE_PATH: '/home/galaxy_os/.runtime/files',
};
describe('M2 runtime target', () => {
  it('requires explicit managed local opt-in with the reviewed main target', () => {
    expect(projectChatEnabled({})).toBe(false);
    expect(projectChatEnabled(local)).toBe(true);
    for (const change of [
      { M2_DEPLOYMENT_TARGET: undefined },
      { GALAXY_LOCAL_RUNTIME_TOKEN: undefined },
      { NODE_ENV: 'production' },
      { ALLOW_DEV_AUTH: 'true' },
      { API_PORT: '33001' },
      { DATABASE_URL: local.DATABASE_URL.replace('galaxy_os?', 'demo?') },
      { SESSION_COOKIE_NAME: 'galaxy_m2a_test_session' },
      { FILE_STORAGE_PATH: undefined },
    ])
      expect(() => projectChatEnabled({ ...local, ...change })).toThrow();
  });
  it('never lets local opt-in bypass test isolation', () => {
    for (const marker of [
      { NODE_ENV: 'test' },
      { G00_TEST_RUN_ID: 'bad' },
      { GALAXY_TEST_ISOLATION: 'confirmed' },
    ])
      expect(() => projectChatEnabled({ ...local, ...marker })).toThrow();
    const isolated = parseEnv(
      readFileSync('../../scripts/m2-a-isolated.env.example', 'utf8'),
    );
    expect(projectChatEnabled(isolated)).toBe(true);
    expect(() =>
      projectChatEnabled({
        ...isolated,
        M2_DEPLOYMENT_TARGET: 'local-main',
        DATABASE_URL: local.DATABASE_URL,
      }),
    ).toThrow();
  });
});
