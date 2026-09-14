import { execFileSync } from 'node:child_process';

export default function setup() {
  execFileSync(
    'pnpm',
    [
      '--filter',
      '@galaxy/api',
      'exec',
      'node',
      'scripts/product-playwright-fixture.mjs',
    ],
    { cwd: '../..', stdio: 'inherit' },
  );
}
