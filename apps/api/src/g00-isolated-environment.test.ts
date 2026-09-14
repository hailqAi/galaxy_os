import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assertG00Isolation } from '../scripts/g00-isolated-environment.mjs';

const valid = {
  NODE_ENV: 'test',
  GALAXY_TEST_ISOLATION: 'confirmed',
  G00_TEST_RUN_ID: '20260914g00',
  G00_COMPOSE_PROJECT: 'galaxy_os_g00_20260914g00',
  G00_POSTGRES_PORT: '55432',
  G00_POSTGRES_PASSWORD: 'test-only',
  G00_REDIS_PORT: '56379',
  API_PORT: '33001',
  DATABASE_URL:
    'postgresql://galaxy_g00_test:test-only@127.0.0.1:55432/galaxy_os_g00_20260914g00?schema=public',
  REDIS_URL: 'redis://127.0.0.1:56379/0',
  G00_TEST_ROOT: '/tmp/galaxy-os-g00-20260914g00',
  FILE_STORAGE_PATH: '/tmp/galaxy-os-g00-20260914g00/files',
  LOCAL_UPLOAD_PATH: '/tmp/galaxy-os-g00-20260914g00/uploads',
  AVATAR_STORAGE_PATH: '/tmp/galaxy-os-g00-20260914g00/avatars',
  ALLOW_DEV_AUTH: 'false',
  FEATURE_MARKETING: 'false',
  SMTP_HOST: '127.0.0.1',
} satisfies NodeJS.ProcessEnv;

describe('G00 isolated test environment guard', () => {
  it('accepts the exact dedicated database, Redis, API, and storage scope', () => {
    expect(assertG00Isolation(valid)).toMatchObject({
      runId: '20260914g00',
      composeProject: 'galaxy_os_g00_20260914g00',
      databaseName: 'galaxy_os_g00_20260914g00',
      databaseUser: 'galaxy_g00_test',
      testRoot: '/tmp/galaxy-os-g00-20260914g00',
    });
  });

  it.each([
    ['missing confirmation', { GALAXY_TEST_ISOLATION: undefined }],
    [
      'shared database',
      {
        DATABASE_URL:
          'postgresql://galaxy_g00_test:test-only@127.0.0.1:5432/galaxy_os?schema=public',
      },
    ],
    [
      'external database host',
      {
        DATABASE_URL:
          'postgresql://galaxy_g00_test:test-only@db.example.com:55432/galaxy_os_g00_20260914g00?schema=public',
      },
    ],
    ['shared Redis port', { REDIS_URL: 'redis://127.0.0.1:6379/0' }],
    ['storage outside the owned root', { FILE_STORAGE_PATH: '/tmp/files' }],
    [
      'storage with surrounding whitespace',
      { FILE_STORAGE_PATH: ` ${valid.FILE_STORAGE_PATH} ` },
    ],
    ['Docker host override', { DOCKER_HOST: 'ssh://shared.example.test' }],
    ['Docker context override', { DOCKER_CONTEXT: 'remote' }],
    ['development authentication', { ALLOW_DEV_AUTH: 'true' }],
    ['marketing enabled', { FEATURE_MARKETING: 'true' }],
    ['SMTP credentials', { SMTP_PASSWORD: 'production-secret' }],
  ])('rejects %s before any write', (_label, override) => {
    expect(() => assertG00Isolation({ ...valid, ...override })).toThrow(
      /G00 isolation rejected/,
    );
  });

  it.each(['root', 'child'])('rejects an existing %s symlink', (kind) => {
    const runId = `sym${kind}${process.pid}${Date.now()}`;
    const testRoot = `/tmp/galaxy-os-g00-${runId}`;
    const target = mkdtempSync('/tmp/galaxy-os-g00-symlink-target-');
    const paths = {
      root: testRoot,
      files: `${testRoot}/files`,
      uploads: `${testRoot}/uploads`,
      avatars: `${testRoot}/avatars`,
    };
    const source = {
      ...valid,
      G00_TEST_RUN_ID: runId,
      G00_COMPOSE_PROJECT: `galaxy_os_g00_${runId}`,
      DATABASE_URL: `postgresql://galaxy_g00_test:test-only@127.0.0.1:55432/galaxy_os_g00_${runId}?schema=public`,
      G00_TEST_ROOT: paths.root,
      FILE_STORAGE_PATH: paths.files,
      LOCAL_UPLOAD_PATH: paths.uploads,
      AVATAR_STORAGE_PATH: paths.avatars,
    };

    try {
      if (kind === 'root') symlinkSync(target, paths.root, 'dir');
      else {
        mkdirSync(paths.root);
        symlinkSync(target, paths.files, 'dir');
      }
      expect(() => assertG00Isolation(source)).toThrow(
        /G00 isolation rejected/,
      );
    } finally {
      rmSync(paths.root, { recursive: true, force: true });
      rmSync(target, { recursive: true, force: true });
    }
  });
});
