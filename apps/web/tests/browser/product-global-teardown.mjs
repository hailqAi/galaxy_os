import { execFileSync } from 'node:child_process';

export default function teardown() {
  execFileSync(
    'pnpm',
    [
      '--filter',
      '@galaxy/api',
      'exec',
      'node',
      'scripts/product-playwright-fixture.mjs',
      'cleanup',
    ],
    { cwd: '../..', stdio: 'inherit' },
  );
}
