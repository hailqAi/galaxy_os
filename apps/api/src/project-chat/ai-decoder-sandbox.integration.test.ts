import { mkdtemp, writeFile, readFile, rm, open } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { afterEach, expect, it, vi } from 'vitest';
import { pdfProcess } from './ai-decoder-sandbox';
import { scanPages } from './ai-native-source';
import { createHash } from 'node:crypto';

let work: string | undefined;
afterEach(async () => {
  vi.unstubAllEnvs();
  if (work) await rm(work, { recursive: true, force: true });
  work = undefined;
});

async function parser(program: string) {
  work = await mkdtemp(join(tmpdir(), 'galaxy-decoder-test-'));
  const binary = join(work, 'pdfinfo');
  await writeFile(binary, '#!/usr/bin/python3\n' + program, { mode: 0o755 });
  vi.stubEnv('GALAXY_AI_PDFINFO', binary);
}

it('reads a >50MB local source through a read-only mount without stdin or host access', async () => {
  await parser(`import os,sys,json,resource
assert sys.stdin.buffer.read()==b''
assert sys.argv[1]=='/input/source.pdf'
assert os.stat(sys.argv[1]).st_size==50000001
with open(sys.argv[1],'rb') as f:assert f.read(8)==b'%PDF-1.7'
try:
 with open(sys.argv[1],'wb') as f:f.write(b'BAD')
 sys.exit(41)
except OSError:pass
assert not os.path.exists(${JSON.stringify('/proc/' + process.pid + '/environ')})
print(json.dumps({'bytes':os.stat(sys.argv[1]).st_size,'as':resource.getrlimit(resource.RLIMIT_AS)[0]}))
`);
  const path = join(work!, 'large.pdf');
  const file = await open(path, 'wx', 0o600);
  try {
    await file.write('%PDF-1.7');
    await file.truncate(50_000_001);
  } finally {
    await file.close();
  }
  const output = await pdfProcess(
    'pdfinfo',
    ['/input/source.pdf'],
    path,
    4096,
    'PDF_VALIDATION_UNAVAILABLE',
  );
  expect(JSON.parse(output.toString())).toEqual({
    bytes: 50_000_001,
    as: 536_870_912,
  });
});

it('actually denies host secrets, API proc files and host loopback while keeping decoder limits', async () => {
  const server = createServer((socket) => socket.end('SYNTHETIC HOST ONLY'));
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  try {
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Missing fixture port');
    await parser(`import os,socket,resource,json,sys
sys.stdin.buffer.read()
assert not os.path.exists(${JSON.stringify('/proc/' + process.pid + '/environ')})
assert not os.path.exists(${JSON.stringify('/home/galaxy_os/.runtime/local-runtime.json')})
assert 'GALAXY_DECODER_SYNTHETIC_SECRET' not in os.environ
s=socket.socket();s.settimeout(0.2)
try:
 s.connect(('127.0.0.1',${address.port}));sys.exit(41)
except OSError:pass
print(json.dumps({'as':resource.getrlimit(resource.RLIMIT_AS)[0],'cpu':resource.getrlimit(resource.RLIMIT_CPU)[0],'fd':resource.getrlimit(resource.RLIMIT_NOFILE)[0],'uid':os.geteuid()}))
`);
    const sentinel = join(work!, 'outside-secret');
    await writeFile(sentinel, 'SYNTHETIC SECRET', { mode: 0o600 });
    const binary = join(work!, 'pdfinfo');
    const program = await readFile(binary, 'utf8');
    await writeFile(
      binary,
      '#!/usr/bin/python3\nimport os\nassert not os.path.exists(' +
        JSON.stringify(sentinel) +
        ')\n' +
        program.split('\n').slice(1).join('\n'),
      { mode: 0o755 },
    );
    vi.stubEnv('GALAXY_DECODER_SYNTHETIC_SECRET', 'SYNTHETIC ENV ONLY');
    const result = await pdfProcess(
      'pdfinfo',
      ['-'],
      Buffer.from('SYNTHETIC'),
      4096,
      'PDF_VALIDATION_UNAVAILABLE',
    );
    expect(JSON.parse(result.toString())).toMatchObject({
      as: 536870912,
      cpu: 4,
      fd: 64,
    });
    expect(JSON.parse(result.toString()).uid).not.toBe(0);
  } finally {
    await new Promise<void>((done, reject) =>
      server.close((error) => (error ? reject(error) : done())),
    );
  }
});

it('cancels a running decoder and releases admission without a late result', async () => {
  await parser(
    'import time,sys\nsys.stdin.buffer.read()\ntime.sleep(20)\nprint("LATE")\n',
  );
  const control = new AbortController();
  const pending = pdfProcess(
    'pdfinfo',
    ['-'],
    Buffer.from('SYNTHETIC'),
    4096,
    'PDF_VALIDATION_UNAVAILABLE',
    control.signal,
  );
  setTimeout(() => control.abort(), 100);
  await expect(pending).rejects.toThrow('REQUEST_CANCELLED');
  await writeFile(
    join(work!, 'pdfinfo'),
    '#!/usr/bin/python3\nprint("NEXT")\n',
    { mode: 0o755 },
  );
  expect(
    (
      await pdfProcess(
        'pdfinfo',
        ['-'],
        Buffer.from('SYNTHETIC'),
        4096,
        'PDF_VALIDATION_UNAVAILABLE',
      )
    ).toString(),
  ).toBe('NEXT\n');
});

it('denies even a one-byte file allocation in private writable mount locations', async () => {
  await parser(`import sys,os,errno
sys.stdin.buffer.read()
for directory in ['/', '/tmp', '/dev', '/dev/shm']:
 try:
  with open(directory.rstrip('/')+'/synthetic-write', 'wb') as output:output.write(b'x')
 except OSError as error:
  assert error.errno in [errno.EROFS, errno.EACCES], (directory,error)
 else:sys.exit(42)
print('READ_ONLY')
`);
  expect(
    (
      await pdfProcess(
        'pdfinfo',
        ['-'],
        Buffer.from('SYNTHETIC'),
        4096,
        'PDF_VALIDATION_UNAVAILABLE',
      )
    ).toString(),
  ).toBe('READ_ONLY\n');
});

it('kills a stalled decoder at its deadline and fails closed', async () => {
  await parser(
    'import time,sys\nsys.stdin.buffer.read()\ntime.sleep(20)\nprint("LATE")\n',
  );
  const start = Date.now();
  await expect(
    pdfProcess(
      'pdfinfo',
      ['-'],
      Buffer.from('SYNTHETIC'),
      4096,
      'PDF_VALIDATION_UNAVAILABLE',
    ),
  ).rejects.toThrow('PDF_VALIDATION_UNAVAILABLE');
  expect(Date.now() - start).toBeLessThan(7000);
}, 10000);

it('passes a tool cancellation through PDF metadata validation before scan rendering', async () => {
  await parser('import time,sys\nsys.stdin.buffer.read()\ntime.sleep(20)\n');
  const bytes = Buffer.from('%PDF-1.4\nSYNTHETIC\n%%EOF\n');
  const control = new AbortController();
  const pending = scanPages(
    {
      organizationId: 'o',
      projectId: 'p',
      roomId: 'r',
      sourceId: 'f',
      version: '1',
      text: '',
    },
    'Synthetic.pdf',
    bytes,
    createHash('sha256').update(bytes).digest('hex'),
    control.signal,
  );
  setTimeout(() => control.abort(), 100);
  await expect(pending).rejects.toThrow('REQUEST_CANCELLED');
}, 10000);

it('refuses a third active decoder and releases both cancelled slots', async () => {
  await parser('import time,sys\nsys.stdin.buffer.read()\ntime.sleep(20)\n');
  const first = new AbortController(),
    second = new AbortController();
  const a = pdfProcess(
    'pdfinfo',
    ['-'],
    Buffer.from('SYNTHETIC'),
    4096,
    'PDF_VALIDATION_UNAVAILABLE',
    first.signal,
  );
  const b = pdfProcess(
    'pdfinfo',
    ['-'],
    Buffer.from('SYNTHETIC'),
    4096,
    'PDF_VALIDATION_UNAVAILABLE',
    second.signal,
  );
  const settled = Promise.allSettled([a, b]);
  await expect(
    pdfProcess(
      'pdfinfo',
      ['-'],
      Buffer.from('SYNTHETIC'),
      4096,
      'PDF_VALIDATION_UNAVAILABLE',
    ),
  ).rejects.toThrow('DOCUMENT_DECODER_BUSY');
  first.abort();
  second.abort();
  expect((await settled).every((result) => result.status === 'rejected')).toBe(
    true,
  );
});
