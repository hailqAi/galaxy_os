import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const require = createRequire(
  new URL('../apps/web/package.json', import.meta.url),
);
const vitest = dirname(require.resolve('vitest/package.json'));

// Only these disposable runner probes replace Date.now. No app, API, DB or
// acceptance suite uses this preload; host clock evidence remains mandatory.
for (const [name, body, expectedExit] of [
  [
    'forward wall jump does not time out a short test',
    'globalThis.wallShift = 183000;',
    0,
  ],
  [
    'backward wall jump cannot hide a real synchronous overrun',
    `
    globalThis.wallShift = -183000;
    const start = performance.now();
    while (performance.now() - start < 80) {}
  `,
    1,
  ],
  [
    'backward wall jump cannot hide a real asynchronous timeout',
    `
    globalThis.wallShift = -183000;
    await new Promise(resolve => setTimeout(resolve, 80));
  `,
    1,
  ],
]) {
  test(name, () => {
    const directory = mkdtempSync(join(tmpdir(), 'galaxy-vitest-clock-'));
    try {
      const preload = join(directory, 'clock.mjs');
      writeFileSync(
        preload,
        `
        const nativeNow = Date.now.bind(Date);
        globalThis.wallShift = 0;
        Date.now = () => nativeNow() + globalThis.wallShift;
      `,
      );
      writeFileSync(
        join(directory, 'probe.test.mjs'),
        `
        import { it } from ${JSON.stringify(join(vitest, 'dist/index.js'))};
        it('clock probe', async () => { ${body} }, 40);
      `,
      );
      writeFileSync(
        join(directory, 'vitest.config.mjs'),
        'export default { test: { include: ["probe.test.mjs"] } };',
      );
      const env = { ...process.env, NODE_OPTIONS: `--import=${preload}` };
      delete env.NODE_TEST_CONTEXT;
      const result = spawnSync(
        process.execPath,
        [
          join(vitest, 'vitest.mjs'),
          'run',
          '--pool=forks',
          '--no-file-parallelism',
          '--poolOptions.forks.singleFork',
        ],
        {
          cwd: directory,
          env,
          encoding: 'utf8',
          timeout: 20000,
        },
      );
      assert.ifError(result.error);
      const output = result.stdout + result.stderr;
      assert.equal(result.status, expectedExit, output);
      assert.match(
        output,
        expectedExit === 0 ? /1 passed/ : /timed out in 40ms/,
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}
