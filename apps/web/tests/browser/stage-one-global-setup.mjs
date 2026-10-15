import { execFileSync } from 'node:child_process';

const fixture = (name, command) =>
  execFileSync(
    'pnpm',
    [
      '--filter',
      '@galaxy/api',
      'exec',
      'node',
      `scripts/${name}-playwright-fixture.mjs`,
      ...(command ? [command] : []),
    ],
    { cwd: '../..', stdio: 'inherit' },
  );

export default function setup() {
  fixture('stage-one');
  try {
    fixture('stage-two');
  } catch (error) {
    fixture('stage-two', 'cleanup');
    fixture('stage-one', 'cleanup');
    throw error;
  }
}
