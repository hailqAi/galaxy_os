import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';
import { resolve } from 'node:path';
import {
  developmentHosts,
  publicHosts,
  validateProductionEnvironment,
} from './host-config';

loadEnvConfig(
  resolve(process.cwd(), '../..'),
  process.env.NODE_ENV !== 'production',
  console,
  true,
);
validateProductionEnvironment();

const headers = [
  { key: 'Cache-Control', value: 'no-store' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
  },
];

const config: NextConfig = {
  poweredByHeader: false,
  allowedDevOrigins: developmentHosts(),
  experimental: {
    serverActions: {
      allowedOrigins:
        process.env.NODE_ENV === 'production'
          ? publicHosts()
          : developmentHosts(),
      bodySizeLimit: '100kb',
    },
  },
  async headers() {
    return [{ source: '/(.*)', headers }];
  },
};

export default config;
