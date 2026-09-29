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
  ...(process.env.NODE_ENV === 'production'
    ? [
        {
          key: 'Strict-Transport-Security',
          value: 'max-age=31536000; includeSubDomains',
        },
      ]
    : []),
];

const config: NextConfig = {
  // Test builds must not replace the user's running development artifacts.
  distDir:
    process.env.GALAXY_TEST_ISOLATION === 'confirmed'
      ? '.next/m2-build'
      : '.next',
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
  async redirects() {
    return [
      {
        source: '/projects/:projectId/stage-1/initiation',
        destination: '/projects/:projectId/stage-1?step=1',
        permanent: false,
      },
      {
        source: '/projects/:projectId/stage-1/survey',
        destination: '/projects/:projectId/stage-1?step=2',
        permanent: false,
      },
      {
        source: '/projects/:projectId/stage-1/requirements',
        destination: '/projects/:projectId/stage-1?step=3',
        permanent: false,
      },
      {
        source: '/projects/:projectId/stage-1/approval',
        destination: '/projects/:projectId/stage-1?step=5',
        permanent: false,
      },
      {
        source: '/projects/:projectId/design-products/products',
        destination: '/projects/:projectId/products',
        permanent: false,
      },
      {
        source: '/projects/:projectId/design-products/products/new',
        destination: '/projects/:projectId/products/new',
        permanent: false,
      },
      {
        source: '/projects/:projectId/design-products/products/:lineId/edit',
        destination: '/projects/:projectId/products/:lineId/edit',
        permanent: false,
      },
      {
        source:
          '/projects/:projectId/design-products/products/:lineId/revisions/:revisionId',
        destination: '/projects/:projectId/products/:lineId',
        permanent: false,
      },
      {
        source: '/projects/:projectId/design-products/products/:lineId',
        destination: '/projects/:projectId/products/:lineId',
        permanent: false,
      },
    ];
  },
};

export default config;
