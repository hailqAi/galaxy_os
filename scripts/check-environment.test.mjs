import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

for (const path of ['/missing-galaxy-tools/pdfinfo', 'relative/pdfinfo']) {
  test(`preflight rejects unavailable PDF tools: ${path}`, () => {
    const result = spawnSync(
      process.execPath,
      [new URL('./check-environment.mjs', import.meta.url).pathname],
      {
        env: { ...process.env, GALAXY_AI_PDFINFO: path },
        encoding: 'utf8',
      },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /PDF tools|GALAXY_AI_PDFINFO/);
    assert.doesNotMatch(result.stdout, /Environment OK/);
  });
}
