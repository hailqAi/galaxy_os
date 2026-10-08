import { lstatSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL, URL } from 'node:url';

const reject = (reason) => {
  throw new Error(`G00 isolation rejected: ${reason}`);
};

const required = (source, name) => {
  const value = source[name]?.trim();
  if (!value) reject(`${name} is required`);
  return value;
};

const port = (source, name) => {
  const value = Number(required(source, name));
  if (!Number.isInteger(value) || value < 1024 || value > 65535)
    reject(`${name} must be an unprivileged TCP port`);
  return value;
};

const url = (source, name) => {
  try {
    return new URL(required(source, name));
  } catch {
    return reject(`${name} is invalid`);
  }
};

const scopedDirectory = (source, name, expected) => {
  const value = required(source, name);
  if (source[name] !== value || value !== expected || resolve(value) !== value)
    reject(`${name} is outside the owned scope`);

  let stat;
  try {
    stat = lstatSync(value);
  } catch (error) {
    if (error?.code === 'ENOENT') return value;
    reject(`${name} cannot be inspected`);
  }
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    realpathSync(value) !== value ||
    (process.getuid && stat.uid !== process.getuid())
  )
    reject(`${name} is not an owned canonical directory`);
  return value;
};

export function assertG00Isolation(source = process.env) {
  if (source.GALAXY_TEST_ISOLATION !== 'confirmed')
    reject('explicit confirmation is required');
  if (source.NODE_ENV !== 'test') reject('NODE_ENV must be test');
  if (source.ALLOW_DEV_AUTH !== 'false') reject('dev authentication is off');
  if (source.FEATURE_MARKETING !== 'false') reject('marketing is off');
  if (source.SMTP_HOST !== '127.0.0.1') reject('SMTP must stay on loopback');
  if (source.SMTP_USER || source.SMTP_PASSWORD)
    reject('SMTP credentials are forbidden');
  if (source.DOCKER_HOST !== undefined || source.DOCKER_CONTEXT !== undefined)
    reject('Docker daemon overrides are forbidden');

  const runId = required(source, 'G00_TEST_RUN_ID');
  if (!/^[a-z0-9]{8,32}$/.test(runId)) reject('G00_TEST_RUN_ID is unsafe');
  const composeProject = required(source, 'G00_COMPOSE_PROJECT');
  if (composeProject !== `galaxy_os_g00_${runId}`)
    reject('Compose project does not match the run id');

  const postgresPort = port(source, 'G00_POSTGRES_PORT');
  const redisPort = port(source, 'G00_REDIS_PORT');
  const apiPort = port(source, 'API_PORT');
  if (
    [postgresPort, redisPort, apiPort].some((value) =>
      [3000, 3001, 5432, 6379].includes(value),
    )
  )
    reject('shared service ports are forbidden');
  if (new Set([postgresPort, redisPort, apiPort]).size !== 3)
    reject('service ports must be distinct');

  const database = url(source, 'DATABASE_URL');
  const databaseName = `galaxy_os_g00_${runId}`;
  const databasePassword = required(source, 'G00_POSTGRES_PASSWORD');
  if (!/^[A-Za-z0-9-]{8,64}$/.test(databasePassword))
    reject('G00_POSTGRES_PASSWORD is unsafe');
  if (
    database.protocol !== 'postgresql:' ||
    database.hostname !== '127.0.0.1' ||
    Number(database.port) !== postgresPort ||
    database.username !== 'galaxy_g00_test' ||
    database.password !== databasePassword ||
    database.pathname !== `/${databaseName}` ||
    database.searchParams.get('schema') !== 'public' ||
    [...database.searchParams.keys()].some(
      (key) => !['schema', 'connection_limit'].includes(key),
    ) ||
    database.searchParams.getAll('schema').length !== 1 ||
    database.searchParams.getAll('connection_limit').length > 1 ||
    (database.searchParams.has('connection_limit') &&
      !/^[1-5]$/.test(database.searchParams.get('connection_limit')))
  )
    reject('DATABASE_URL is not the dedicated G00 database');

  const redis = url(source, 'REDIS_URL');
  if (
    redis.protocol !== 'redis:' ||
    redis.hostname !== '127.0.0.1' ||
    Number(redis.port) !== redisPort ||
    redis.pathname !== '/0' ||
    redis.username ||
    redis.password ||
    redis.search
  )
    reject('REDIS_URL is not the dedicated G00 Redis instance');

  const expectedRoot = `/tmp/galaxy-os-g00-${runId}`;
  if (realpathSync('/tmp') !== '/tmp') reject('/tmp is not canonical');
  const testRoot = scopedDirectory(source, 'G00_TEST_ROOT', expectedRoot);
  for (const [name, child] of [
    ['FILE_STORAGE_PATH', 'files'],
    ['LOCAL_UPLOAD_PATH', 'uploads'],
    ['AVATAR_STORAGE_PATH', 'avatars'],
  ])
    scopedDirectory(source, name, `${testRoot}/${child}`);

  return {
    runId,
    composeProject,
    databaseName,
    databaseUser: database.username,
    postgresPort,
    redisPort,
    apiPort,
    testRoot,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const isolated = assertG00Isolation();
  process.stdout.write(`${JSON.stringify(isolated)}\n`);
}
