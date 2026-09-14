import { execFileSync } from 'node:child_process';

const cleanup = (name) =>
  execFileSync(
    'pnpm',
    [
      '--filter',
      '@galaxy/api',
      'exec',
      'node',
      `scripts/${name}-playwright-fixture.mjs`,
      'cleanup',
    ],
    { cwd: '../..', stdio: 'inherit' },
  );

export default function teardown() {
  try {
    cleanup('stage-two');
  } finally {
    cleanup('stage-one');
  }
}
