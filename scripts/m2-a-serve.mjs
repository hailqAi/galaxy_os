import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { assertG00Isolation } from '../apps/api/scripts/g00-isolated-environment.mjs';

const root = new URL('../', import.meta.url);
const env = {
  ...parseEnv(
    readFileSync(new URL('scripts/m2-a-isolated.env.example', root), 'utf8'),
  ),
  PATH: process.env.PATH,
};
assertG00Isolation(env);
const mode = process.argv[2];
if (!['api', 'web'].includes(mode))
  throw new Error('Use m2-a-serve.mjs api|web');
const clockMonitor = process.argv.includes('--clock-monitor');
const productionWeb = process.argv.includes('--production');
const child = spawn(
  process.execPath,
  mode === 'api'
    ? [
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
              ? { APP_PUBLIC_ORIGIN: 'https://localhost:33003' }
              : {}),
          }
        : { ...env, ...(clockMonitor ? { M2_CLOCK_OBSERVE: 'true' } : {}) },
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
