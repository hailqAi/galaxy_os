import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { assertG00Isolation } from '../apps/api/scripts/g00-isolated-environment.mjs';

const root = new URL('../', import.meta.url);
const env = {
  ...parseEnv(
    readFileSync(
      new URL(
        process.env.GALAXY_TEST_ENV_FILE ?? 'scripts/m2-a-isolated.env.example',
        root,
      ),
      'utf8',
    ),
  ),
  PATH: process.env.PATH,
};
assertG00Isolation(env);
const mode = process.argv[2];
if (!['api', 'web'].includes(mode))
  throw new Error('Use m2-a-serve.mjs api|web');
const clockMonitor = process.argv.includes('--clock-monitor');
const aiFixture = process.argv.includes('--ai-fixture');
if (aiFixture && (mode !== 'api' || env.FEATURE_PROJECT_AI !== 'true'))
  throw new Error('AI fixture chỉ dùng API test M3 đã cô lập');
const productionWeb = process.argv.includes('--production');
const child = spawn(
  process.execPath,
  mode === 'api'
    ? [
        ...(aiFixture
          ? [
              '--import',
              fileURLToPath(
                new URL('scripts/m3-browser-provider-fixture.mjs', root),
              ),
            ]
          : []),
        ...(clockMonitor
          ? [
              '--import',
              fileURLToPath(new URL('scripts/m2-clock-monitor.mjs', root)),
            ]
          : []),
        'dist/main.js',
      ]
    : [
        'node_modules/next/dist/bin/next',
        productionWeb ? 'start' : 'dev',
        '--hostname',
        '127.0.0.1',
        '--port',
        '33002',
        ...(productionWeb ? [] : ['--webpack']),
      ],
  {
    cwd: fileURLToPath(new URL(`apps/${mode}/`, root)),
    env:
      mode === 'web'
        ? {
            ...env,
            NODE_ENV: productionWeb ? 'production' : 'development',
            ...(productionWeb
              ? {
                  APP_PUBLIC_ORIGIN: 'https://localhost:33003',
                  GALAXY_PUBLIC_ACCESS: 'true',
                  GALAXY_EDGE_PROOF:
                    'm2-isolated-fixture-edge-proof-not-for-main-20260930',
                }
              : {}),
          }
        : {
            ...env,
            ...(clockMonitor ? { M2_CLOCK_OBSERVE: 'true' } : {}),
            ...(aiFixture
              ? {
                  GALAXY_AI_API_KEY: 'm3-browser-synthetic-only',
                  GALAXY_AI_MODEL: 'm3-browser-fixture',
                  GALAXY_AI_ALLOWED_MODELS: 'm3-browser-fixture',
                  GALAXY_AI_MAX_REQUESTS_PER_DAY: '100',
                  GALAXY_AI_ALLOW_PROJECT_DATA: 'true',
                }
              : {}),
          },
    stdio: 'inherit',
  },
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => child.kill(signal));
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
