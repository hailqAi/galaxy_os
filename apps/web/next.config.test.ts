import { expect, it } from 'vitest';
import config from './next.config';

it('allows same-origin embedding only for the scoped Project file preview route', async () => {
  const rules = await config.headers!();
  expect(rules.find((r) => r.source === '/(.*)')?.headers).toContainEqual({
    key: 'X-Frame-Options',
    value: 'DENY',
  });
  const preview = rules.find(
    (r) =>
      r.source ===
      '/api/v1/project-chat/projects/:projectId/ai/files/:sourceId/preview',
  );
  expect(preview).toBeDefined();
  expect(preview!.headers).toContainEqual({
    key: 'X-Frame-Options',
    value: 'SAMEORIGIN',
  });
});
