import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { normalizeAccessPreview } from './access-preview';
import { Actor } from '../../../lib/api';
import { User, ViewTab } from './user-detail';

const user: User = {
  id: 'user',
  email: 'user@example.com',
  displayName: 'User',
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  organizationMembers: [],
  departmentMembers: [],
  roles: [],
  actions: [],
};
const actor: Actor = {
  userId: 'actor',
  email: 'actor@example.com',
  displayName: 'Actor',
  avatarUrl: null,
  status: 'active',
  lastLoginAt: null,
  mustChangePassword: false,
  organization: { id: 'organization', name: 'Organization' },
  membership: { id: 'membership', status: 'active', joinedAt: '' },
  departments: [],
  roles: [],
  permissions: [],
  administrationScope: 'ORGANIZATION',
  managedDepartmentIds: [],
  administrationTier: 1,
};

describe('access preview', () => {
  it('keeps full module data', () => {
    expect(
      normalizeAccessPreview({
        scope: 'ORGANIZATION',
        manageableUsers: 3,
        visibleModules: ['user', 'role'],
        visibleDepartmentIds: ['department'],
        effectivePermissions: ['user.read'],
        deniedPermissions: [],
        sourceRoles: [],
      }),
    ).toMatchObject({ visibleModules: ['user', 'role'] });
  });

  it('rejects an invalid response instead of rendering it', () => {
    expect(normalizeAccessPreview({ visibleModules: [] })).toBeNull();
    expect(
      normalizeAccessPreview({ scope: 'SELF', manageableUsers: 1 }),
    ).toBeNull();
    expect(normalizeAccessPreview(null)).toBeNull();
    expect(
      normalizeAccessPreview({
        scope: 'SELF',
        manageableUsers: 1,
        visibleModules: [],
        visibleDepartmentIds: [],
        effectivePermissions: [],
        deniedPermissions: [],
        sourceRoles: [{}],
      }),
    ).toBeNull();
  });

  it('renders empty collections without crashing', () => {
    const preview = normalizeAccessPreview({
      scope: 'SELF',
      manageableUsers: 1,
      visibleModules: [],
      visibleDepartmentIds: [],
      effectivePermissions: [],
      deniedPermissions: [],
      sourceRoles: [],
    });
    expect(
      renderToStaticMarkup(
        createElement(ViewTab, {
          user,
          actor,
          tab: 'access-preview',
          data: preview,
        }),
      ),
    ).toContain('Không có');
  });

  it('separates empty and invalid custom-field responses', () => {
    expect(
      renderToStaticMarkup(
        createElement(ViewTab, { user, actor, tab: 'custom-fields', data: [] }),
      ),
    ).toContain('Không có trường dữ liệu tùy chỉnh');
    expect(
      renderToStaticMarkup(
        createElement(ViewTab, {
          user,
          actor,
          tab: 'custom-fields',
          data: { scope: 'SELF' },
        }),
      ),
    ).toContain('không hợp lệ');
    expect(
      renderToStaticMarkup(
        createElement(ViewTab, {
          user,
          actor,
          tab: 'custom-fields',
          data: [{}],
        }),
      ),
    ).toContain('không hợp lệ');
  });

  it('renders loading and API errors without touching absent tab data', () => {
    expect(
      renderToStaticMarkup(
        createElement(ViewTab, {
          user,
          actor,
          tab: 'access-preview',
          data: null,
        }),
      ),
    ).toContain('Đang tải');
    expect(
      renderToStaticMarkup(
        createElement(ViewTab, {
          user,
          actor,
          tab: 'access-preview',
          data: { error: 'Forbidden' },
        }),
      ),
    ).toContain('Forbidden');
    expect(
      renderToStaticMarkup(
        createElement(ViewTab, {
          user,
          actor,
          tab: 'custom-fields',
          data: { error: 'Not found' },
        }),
      ),
    ).toContain('Not found');
  });

  it('renders every dynamic tab with valid empty collections', () => {
    for (const [tab, data] of [
      ['capabilities', { capabilities: [] }],
      ['sessions', []],
      ['activity', []],
    ] as const)
      expect(() =>
        renderToStaticMarkup(
          createElement(ViewTab, { user, actor, tab, data }),
        ),
      ).not.toThrow();
  });
});
