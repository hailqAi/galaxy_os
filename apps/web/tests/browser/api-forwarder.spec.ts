import { expect, test } from '@playwright/test';

test('apps/web dev forwards upload initiation to the internal API', async ({
  page,
}) => {
  const response = await page.request.post('/api/v1/uploads/initiate', {
    data: { projectId: 'project-1' },
    headers: {
      cookie: 'galaxy_session=fixture-session',
      origin: 'http://127.0.0.1:3000',
      'x-csrf-token': 'csrf-value',
    },
  });

  expect(response.status()).toBe(201);
  expect(response.headers()['location']).toBe(
    '/api/v1/uploads/fixture-session',
  );
  expect(response.headers()['upload-offset']).toBe('0');
  expect(await response.json()).toEqual({
    method: 'POST',
    body: { projectId: 'project-1' },
    cookie: 'galaxy_session=fixture-session',
    csrf: 'csrf-value',
  });
});
