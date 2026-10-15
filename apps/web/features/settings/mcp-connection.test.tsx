import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { McpConnectionDetails } from './mcp-connection';
it('separates endpoint evidence, personal OAuth and Events and gives the actual DCR fields', () => {
  const html = renderToStaticMarkup(
    createElement(McpConnectionDetails, {
      connection: {
        configuration: {
          serverUrl: 'https://galaxy.example/mcp',
          authentication: 'OAuth',
          registrationMethod: 'DCR',
          tokenEndpointAuthMethod: 'none',
          baseScopes: 'galaxy.jobs.read galaxy.jobs.write galaxy.events',
          authUrl: 'https://galaxy.example/mcp/oauth/authorize',
          tokenUrl: 'https://galaxy.example/mcp/oauth/token',
          registrationUrl: 'https://galaxy.example/mcp/oauth/register',
          authorizationServerBase: 'https://galaxy.example',
          resource: 'https://galaxy.example/mcp',
        },
        account: {
          oauthAuthorized: true,
          eventsSubscribed: false,
          canConnect: true,
        },
        subscriptions: [],
        publicCheck: {
          origin: 'https://galaxy.example',
          at: '2026-10-13',
          passed: true,
          checks: [],
        },
      },
    }),
  );
  expect(html).toContain('Đã cấp quyền tại Galaxy');
  expect(html).toContain('Chưa đăng ký theo dõi');
  expect(html).toContain('Không nhập thủ công');
  expect(html).toContain('Retry discovery');
  expect(html).not.toContain('Đã kết nối');
  expect(html).not.toContain('Tự động hoạt động');
});
