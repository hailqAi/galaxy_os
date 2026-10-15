import { spawnSync } from 'node:child_process';
import { accessSync, constants, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const major = Number(process.versions.node.split('.')[0]);

if (major < 20) {
  console.error(`Node.js 20+ is required; found ${process.version}.`);
  process.exit(1);
}

try {
  const pdf = process.env.GALAXY_AI_PDFINFO ?? '/usr/bin/pdfinfo';
  if (!isAbsolute(pdf)) throw new Error('GALAXY_AI_PDFINFO must be absolute');
  const mounts = [];
  for (const operation of ['pdfinfo', 'pdftotext', 'pdftoppm']) {
    const path = join(dirname(pdf), operation);
    try {
      accessSync(path, constants.X_OK);
    } catch {
      throw new Error(`PDF tools missing executable ${path} (poppler-utils)`);
    }
    mounts.push('--ro-bind', realpathSync(path), '/decoder/' + operation);
  }
  const libraries = process.env.GALAXY_AI_PDF_LIBRARY_PATH?.split(':') ?? [];
  if (libraries.length > 4) throw new Error('Too many PDF library paths');
  for (const [i, path] of libraries.entries()) {
    if (!isAbsolute(path) || path === '/')
      throw new Error(
        'GALAXY_AI_PDF_LIBRARY_PATH must contain absolute directories',
      );
    mounts.push('--ro-bind', realpathSync(path), '/decoder-libs/' + i);
  }
  if (libraries.length)
    mounts.push(
      '--setenv',
      'LD_LIBRARY_PATH',
      libraries.map((_, i) => '/decoder-libs/' + i).join(':'),
    );
  for (const path of [
    '/usr/bin/bwrap',
    '/usr/bin/prlimit',
    '/usr/bin/timeout',
    '/usr/bin/python3',
    '/usr/bin/ffmpeg',
    '/usr/bin/ffprobe',
    process.execPath,
  ])
    accessSync(path, constants.X_OK);
  for (const tool of ['ffmpeg', 'ffprobe']) {
    const result = spawnSync('/usr/bin/' + tool, ['-version'], {
      env: {},
      encoding: 'utf8',
      timeout: 6000,
      maxBuffer: 8192,
    });
    if (result.status !== 0)
      throw new Error(
        `${tool} unavailable: ${result.error?.message ?? result.stderr}`,
      );
  }
  if (process.getuid?.() === 0)
    throw new Error('Document decoders require a non-root user');
  const dependencies = realpathSync(
    fileURLToPath(new URL('../node_modules', import.meta.url)),
  );
  const sharp = relative(
    dependencies,
    createRequire(new URL('../apps/api/package.json', import.meta.url)).resolve(
      'sharp',
    ),
  );
  if (sharp.startsWith('..') || isAbsolute(sharp))
    throw new Error('Sharp must be inside repository node_modules');
  mounts.push(
    '--ro-bind',
    dependencies,
    '/modules',
    '--ro-bind',
    realpathSync(process.execPath),
    '/decoder/node',
  );
  const probes = [
    ...['pdfinfo', 'pdftotext', 'pdftoppm'].map((operation) => [
      '/decoder/' + operation,
      '-v',
    ]),
    [
      '/usr/bin/python3',
      '-I',
      '-c',
      'import json,os,posixpath,re,struct,sys,zipfile; from xml.parsers import expat; print(sys.executable)',
    ],
    [
      '/decoder/node',
      '-e',
      `const sharp=require(${JSON.stringify('/modules/' + sharp)});sharp.concurrency(1);sharp({create:{width:1,height:1,channels:3,background:'white'}}).png().toBuffer().then(b=>sharp(b).raw().toBuffer()).catch(e=>{console.error(e.message);process.exitCode=1})`,
    ],
  ];
  for (const command of probes) {
    const result = spawnSync(
      '/usr/bin/bwrap',
      [
        '--unshare-all',
        '--new-session',
        '--die-with-parent',
        '--clearenv',
        '--cap-drop',
        'ALL',
        '--ro-bind',
        '/usr',
        '/usr',
        '--ro-bind',
        '/lib',
        '/lib',
        '--ro-bind',
        '/lib64',
        '/lib64',
        '--ro-bind',
        '/etc/fonts',
        '/etc/fonts',
        '--proc',
        '/proc',
        '--dev',
        '/dev',
        '--tmpfs',
        '/tmp',
        '--chdir',
        '/tmp',
        '--setenv',
        'HOME',
        '/tmp',
        '--setenv',
        'PATH',
        '/usr/bin',
        '--setenv',
        'LANG',
        'C.UTF-8',
        ...mounts,
        '--remount-ro',
        '/dev',
        '--remount-ro',
        '/tmp',
        '--remount-ro',
        '/',
        '/usr/bin/prlimit',
        '--as=2147483648',
        '--cpu=4',
        '--nofile=64',
        '--nproc=32',
        '/usr/bin/timeout',
        '--signal=KILL',
        '5',
        ...command,
      ],
      { env: {}, encoding: 'utf8', timeout: 6000, maxBuffer: 8192 },
    );
    if (result.status !== 0)
      throw new Error(
        `${command[0]} sandbox probe failed: exit=${result.status} signal=${result.signal}; ${result.error?.message ?? result.stderr}`,
      );
  }
  console.log(
    `Environment OK: Node ${process.version}, document decoders and system Python ready.`,
  );
} catch (error) {
  console.error(`Environment unavailable: ${error.message}`);
  process.exitCode = 1;
}
