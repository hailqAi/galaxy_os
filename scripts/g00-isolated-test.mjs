import { spawnSync } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertG00Isolation } from '../apps/api/scripts/g00-isolated-environment.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const isolated = assertG00Isolation();
const compose = [
  'compose',
  '--env-file',
  '/dev/null',
  '-p',
  isolated.composeProject,
  '-f',
  'docker-compose.g00.yml',
];

const execute = (command, args, capture = false) => {
  const result = spawnSync(command, args, {
    cwd: root,
    env: process.env,
    encoding: 'utf8',
    stdio: capture ? 'pipe' : 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      (capture && result.stderr) ||
        `${command} ${args.join(' ')} exited ${result.status}`,
    );
  return capture ? result.stdout.trim() : '';
};

const docker = (...args) => execute('docker', [...compose, ...args]);
const dockerOutput = (...args) =>
  execute('docker', [...compose, ...args], true);

function verifyDockerDaemon() {
  if (execute('docker', ['context', 'show'], true) !== 'default')
    throw new Error('Docker context is not the verified local context');
  if (
    execute(
      'docker',
      [
        'context',
        'inspect',
        'default',
        '--format',
        '{{.Endpoints.docker.Host}}',
      ],
      true,
    ) !== 'unix:///var/run/docker.sock'
  )
    throw new Error('Docker context does not use the verified local socket');
}

function verifyProjectContainers(required) {
  const output = execute(
    'docker',
    [
      'ps',
      '-a',
      '--filter',
      `label=com.docker.compose.project=${isolated.composeProject}`,
      '--format',
      '{{.ID}}|{{.Label "com.docker.compose.project"}}|{{.Label "com.docker.compose.service"}}',
    ],
    true,
  );
  const services = output
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('|'));
  if (
    services.some(
      ([id, project, service]) =>
        !id ||
        project !== isolated.composeProject ||
        !['postgres', 'redis'].includes(service),
    ) ||
    new Set(services.map(([, , service]) => service)).size !== services.length
  )
    throw new Error('Compose project contains an unexpected container');
  if (
    required &&
    !['postgres', 'redis'].every((service) =>
      services.some(([, , found]) => found === service),
    )
  )
    throw new Error('Compose project is missing a G00 service container');
}

function verifyServices() {
  verifyDockerDaemon();
  verifyProjectContainers(true);
  if (
    dockerOutput('port', 'postgres', '5432') !==
      `127.0.0.1:${isolated.postgresPort}` ||
    dockerOutput('port', 'redis', '6379') !== `127.0.0.1:${isolated.redisPort}`
  )
    throw new Error('Published ports do not match the G00 endpoints');
  const identity = dockerOutput(
    'exec',
    '-T',
    'postgres',
    'psql',
    '-U',
    isolated.databaseUser,
    '-d',
    isolated.databaseName,
    '-Atc',
    "SELECT current_database() || ':' || current_user",
  );
  if (identity !== `${isolated.databaseName}:${isolated.databaseUser}`)
    throw new Error('PostgreSQL identity does not match the G00 scope');
  if (dockerOutput('exec', '-T', 'redis', 'redis-cli', 'PING') !== 'PONG')
    throw new Error('Dedicated G00 Redis did not answer PONG');
}

function verifyDatabaseEndpoint() {
  const identity = execute(
    'pnpm',
    [
      '--filter',
      '@galaxy/api',
      'exec',
      'node',
      '--input-type=module',
      '--eval',
      "import { PrismaClient } from '@prisma/client'; const prisma = new PrismaClient(); try { const [row] = await prisma.$queryRawUnsafe('SELECT current_database() AS database, current_user AS username'); process.stdout.write(`${row.database}:${row.username}`); } finally { await prisma.$disconnect(); }",
    ],
    true,
  );
  if (identity !== `${isolated.databaseName}:${isolated.databaseUser}`)
    throw new Error('Prisma endpoint does not match the G00 database');
}

async function makeDirectory(path) {
  try {
    await mkdir(path);
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
  }
  assertG00Isolation();
}

async function up() {
  verifyDockerDaemon();
  await makeDirectory(isolated.testRoot);
  for (const child of ['files', 'uploads', 'avatars'])
    await makeDirectory(`${isolated.testRoot}/${child}`);
  docker('up', '-d', '--wait');
  verifyServices();
}

function prepare() {
  verifyServices();
  execute('pnpm', ['db:generate']);
  verifyDatabaseEndpoint();
  execute('pnpm', ['--filter', '@galaxy/api', 'prisma:deploy']);
  execute('pnpm', ['--filter', '@galaxy/api', 'prisma:seed']);
}

function smoke() {
  verifyServices();
  execute('pnpm', [
    '--filter',
    '@galaxy/api',
    'exec',
    'vitest',
    'run',
    'test/g00-isolated-smoke.integration.test.ts',
    '--no-file-parallelism',
    '--poolOptions.forks.singleFork',
  ]);
}

async function down() {
  verifyDockerDaemon();
  verifyProjectContainers(false);
  docker('down', '--volumes', '--remove-orphans');
  assertG00Isolation();
  await rm(isolated.testRoot, { recursive: true, force: true });
}

const command = process.argv[2] ?? 'check';
if (command === 'check') {
  process.stdout.write(`${JSON.stringify(isolated)}\n`);
} else if (command === 'up') await up();
else if (command === 'prepare') prepare();
else if (command === 'smoke') smoke();
else if (command === 'down') await down();
else if (command === 'run') {
  try {
    await up();
    prepare();
    smoke();
  } finally {
    await down();
  }
} else throw new Error(`Unknown G00 command: ${command}`);
