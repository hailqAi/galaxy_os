import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { spawnSync } from 'node:child_process';
import { createEdge } from '../apps/edge/dist/edge.js';
import { assertG00Isolation } from '../apps/api/scripts/g00-isolated-environment.mjs';

const env = parseEnv(
  readFileSync(new URL('m2-a-isolated.env.example', import.meta.url), 'utf8'),
);
const isolation = assertG00Isolation(env);
const tls = `${isolation.testRoot}/tls`;
process.umask(0o077);
mkdirSync(tls, { recursive: true, mode: 0o700 });
if (!existsSync(`${tls}/cert.pem`)) {
  const result = spawnSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      `${tls}/key.pem`,
      '-out',
      `${tls}/cert.pem`,
      '-subj',
      '/CN=localhost',
      '-addext',
      'subjectAltName=DNS:localhost',
      '-days',
      '2',
    ],
    { stdio: 'ignore' },
  );
  if (result.status !== 0)
    throw new Error('Không tạo được chứng chỉ TLS thử nghiệm');
}
const edge = createEdge({
  publicHost: 'localhost',
  httpPort: 0,
  httpsPort: 33003,
  upstream: new URL('http://127.0.0.1:33002'),
  acmeWebroot: tls,
  tlsCert: `${tls}/cert.pem`,
  tlsKey: `${tls}/key.pem`,
  trustProxy: false,
  proof: 'm2-isolated-fixture-edge-proof-not-for-main-20260930',
  publicAccess: true,
});
if (!edge.https) throw new Error('Thiếu TLS server');
edge.https.listen(33003, '127.0.0.1', () =>
  console.log('M2-A TLS thử: https://localhost:33003'),
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => void edge.stop());
