import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { WorkReadiness, workReadiness } from './mcp-readiness';

const connection = {
  account: { oauthAuthorized: true, canConnect: true },
  subscriptions: [
    {
      name: 'galaxy.ai_job.created',
      arguments: { project_id: 'other' },
      refreshBefore: '2026-10-15T00:00:00Z',
      verifiedUntil: '2026-10-13T00:00:00Z',
    },
  ],
};
const now = new Date('2026-10-14T00:00:00Z');
it('requires a current owner subscription matching this Project, not just OAuth', () => {
  expect(workReadiness(connection, 'project', now).state).toBe(
    'NO_SUBSCRIPTION',
  );
  expect(
    workReadiness({ ...connection, subscriptions: [] }, 'project', now).state,
  ).toBe('NO_SUBSCRIPTION');
  expect(
    workReadiness(
      {
        ...connection,
        account: { ...connection.account, oauthAuthorized: false },
      },
      'project',
      now,
    ).state,
  ).toBe('DISCONNECTED');
});
it('treats expired verification cache as revalidation, not subscription expiry', () => {
  const subscribed = {
    ...connection,
    subscriptions: [{ ...connection.subscriptions[0]!, arguments: {} }],
  };
  const state = workReadiness(subscribed, 'project', now);
  expect(state.state).toBe('READY');
  expect(state.callbackRevalidation).toBe(true);
  expect(
    workReadiness(
      {
        ...subscribed,
        subscriptions: [
          {
            ...subscribed.subscriptions[0]!,
            refreshBefore: '2026-10-13T00:00:00Z',
          },
        ],
      },
      'project',
      now,
    ).state,
  ).toBe('NO_SUBSCRIPTION');
});
it('shows a concrete subscribe action immediately without claiming inference has started', () => {
  const html = renderToStaticMarkup(
    createElement(WorkReadiness, {
      value: workReadiness(connection, 'project', now),
    }),
  );
  expect(html).toContain('Đã kết nối, chưa đăng ký nhận việc cho Project này');
  expect(html).toContain('Đăng ký nhận việc');
  expect(html).not.toContain('đang suy nghĩ');
});
