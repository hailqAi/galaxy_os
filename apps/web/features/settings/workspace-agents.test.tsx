import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import WorkspaceAgentsPage, {
  WorkspaceConfigurationForm,
} from './workspace-agents';
it('uses a password field without echoing the stored credential, and never marks entered names verified', () => {
  const html = renderToStaticMarkup(
    createElement(WorkspaceConfigurationForm, {
      metadata: {
        status: 'MODEL_BINDING_UNVERIFIED',
        revision: null,
        hasCredential: true,
        workspaceId: 'synthetic',
        bindings: [],
      },
      onSave: async () => {},
      busy: false,
    }),
  );
  expect(html).toContain('type="password"');
  expect(html).toContain('autoComplete="new-password"');
  expect(html).toContain('Chưa xác minh cấu hình published');
  expect(html).not.toContain('CONFIG_VERIFIED');
  expect(html).not.toContain('localStorage');
});

it('shows user deferral without requesting Workspace IDs or credentials', () => {
  const html = renderToStaticMarkup(createElement(WorkspaceAgentsPage));
  expect(html).toContain('WORKSPACE_DEFERRED_BY_USER');
  expect(html).toContain('/settings/chatgpt-connection');
  expect(html).not.toContain('<form');
  expect(html).not.toContain('Đang tải');
});
