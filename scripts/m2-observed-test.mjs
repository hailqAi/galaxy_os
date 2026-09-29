import { performance } from 'node:perf_hooks';
import { clockEvidence } from './m2-clock-monitor.mjs';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { assertG00Isolation } from '../apps/api/scripts/g00-isolated-environment.mjs';

const root = new URL('../', import.meta.url);
const mode = process.argv[2];
if (!['api', 'web', 'browser'].includes(mode))
  throw new Error('Dùng api|web|browser [test arguments]');
const runId = randomUUID();
const env = {
  ...parseEnv(
    readFileSync(new URL('scripts/m2-a-isolated.env.example', root), 'utf8'),
  ),
  PATH: process.env.PATH,
  ...(mode === 'browser'
    ? {
        APP_PUBLIC_ORIGIN: 'https://localhost:33003',
        ...(process.env.M2_CHROME_CDP_ENDPOINT
          ? { M2_CHROME_CDP_ENDPOINT: process.env.M2_CHROME_CDP_ENDPOINT }
          : {}),
      }
    : {}),
  M2_CLOCK_OBSERVE: 'true',
  M2_CLOCK_RUN_ID: runId,
  NODE_OPTIONS: `--import=${fileURLToPath(new URL('scripts/m2-clock-monitor.mjs', root))}`,
};
const isolated = assertG00Isolation(env);
const directory = `${isolated.testRoot}/clock/${runId}`;
async function run(args, cwd) {
  const started = performance.now();
  const child = spawn(process.execPath, args, { cwd, env, stdio: 'inherit' });
  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code) =>
      resolve({
        code: code ?? 1,
        pid: child.pid,
        durationMs: performance.now() - started,
      }),
    );
  });
}
function evidence(phase, requireSuccess = true) {
  try {
    const samples = readdirSync(directory)
      .filter((n) => n.endsWith('.jsonl'))
      .flatMap((n) =>
        readFileSync(`${directory}/${n}`, 'utf8')
          .trim()
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line)),
      );
    return clockEvidence(samples, requireSuccess ? phase.code : 0, {
      pid: phase.pid,
      minimumCoverage: Math.max(1, phase.durationMs - 500),
    });
  } catch {
    return 'CLOCK_UNVERIFIED';
  }
}
// Host diagnostic previously showed a ~30-second cycle. Observe a full cycle
// before starting expensive acceptance; never override clocks or retry a run.
const baseline = await run(
  [
    '--input-type=module',
    '-e',
    'await new Promise(resolve=>setTimeout(resolve,45000))',
  ],
  fileURLToPath(root),
);
let result = { runId, mode, clock: 'CLEAN', tests: 'NOT_RUN', exitCode: 2 };
if (evidence(baseline) !== 'CLEAN')
  result.clock = evidence(baseline) + '_BASELINE';
else {
  const browser = mode === 'browser',
    app = mode === 'api' ? 'api' : 'web';
  const args = browser
    ? [
        'node_modules/@playwright/test/cli.js',
        'test',
        '--config=playwright.m2.config.ts',
      ]
    : ['node_modules/vitest/vitest.mjs', 'run'];
  if (mode === 'web') args.push('--exclude', 'tests/browser/**');
  if (mode === 'api')
    args.push('--no-file-parallelism', '--poolOptions.forks.singleFork');
  args.push(...process.argv.slice(3));
  const testPhase = await run(
    args,
    fileURLToPath(new URL(`apps/${app}/`, root)),
  );
  result = {
    runId,
    mode,
    clock: evidence(testPhase, false),
    tests: testPhase.code === 0 ? 'PASS' : 'FAIL',
    exitCode: testPhase.code,
  };
  if (result.clock !== 'CLEAN') result.exitCode = 2;
}
writeFileSync(
  `${directory}/summary.json`,
  JSON.stringify(result, null, 2) + '\n',
  { mode: 0o600 },
);
console.log(JSON.stringify({ ...result, evidence: directory }));
process.exitCode = result.exitCode;
