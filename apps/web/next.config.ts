import type { NextConfig } from 'next';

const apiOrigin = new URL(
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1',
).origin;
const headers = [
  { key: 'Cache-Control', value: 'no-store' },
  {
    key: 'Content-Security-Policy',
    value: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ${apiOrigin}; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`,
  },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
  },
];

const config: NextConfig = {
  async headers() {
    return [{ source: '/(.*)', headers }];
  },
};

export default config;
