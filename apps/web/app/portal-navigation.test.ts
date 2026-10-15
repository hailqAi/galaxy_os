import { describe, expect, it } from 'vitest';
import {
  isNavigationActive,
  navigation,
  routePermissions,
  visibleNavigation,
} from './portal-navigation';

describe('permission-aware portal navigation', () => {
  it('shows ChatGPT connection to AI users and to system administrators with read permission', () => {
    const hrefs = (
      scope: 'SYSTEM' | 'ORGANIZATION' | 'MANAGED_DEPARTMENTS' | 'SELF',
      permissions = ['system.settings.read'],
    ) =>
      visibleNavigation(permissions, scope)
        .flatMap((group) => group.children ?? [])
        .map((item) => item.href);
    expect(hrefs('SYSTEM')).toContain('/settings/chatgpt-connection');
    for (const scope of [
      'ORGANIZATION',
      'MANAGED_DEPARTMENTS',
      'SELF',
    ] as const)
      expect(hrefs(scope)).not.toContain('/settings/chatgpt-connection');
    expect(hrefs('SYSTEM', [])).not.toContain('/settings/chatgpt-connection');
    expect(hrefs('SELF', ['ai.invoke'])).toContain(
      '/settings/chatgpt-connection',
    );
  });
  it.each([
    '/installations',
    '/installations/work-orders/ee41927b-82bf-4ba4-af50-c66e6dbe8e94',
  ])(
    'gates %s by installation read without borrowing dashboard permission',
    (path) => {
      // Exercise the same first-prefix match used by proxy.ts.
      const required = routePermissions.find(([prefix]) =>
        path.startsWith(prefix),
      )?.[1];
      expect(required).toBe('installation.read');
      expect(['installation.read'].includes(required!)).toBe(true);
      expect(['dashboard.read'].includes(required!)).toBe(false);
      expect(
        routePermissions.find(([prefix]) => '/'.startsWith(prefix))?.[1],
      ).toBe('dashboard.read');
      expect(navigation.some(({ href }) => href === '/installations')).toBe(
        false,
      );
    },
  );
  it('groups only permitted operational links and never exposes Marketing', () => {
    const groups = visibleNavigation(
      ['project.read', 'warehouse.read', 'inventory.read'],
      'ORGANIZATION',
    );
    expect(groups.map(({ key }) => key)).toEqual(['projects', 'warehouse']);
    expect(
      groups.flatMap(({ children }) => children ?? []).map(({ href }) => href),
    ).toEqual(
      expect.arrayContaining(['/projects', '/projects/mine', '/warehouses']),
    );
    expect(JSON.stringify(groups)).not.toContain('/marketing');
  });

  it('hides account administration from self-scoped actors', () => {
    expect(visibleNavigation(['user.read'], 'SELF')).toEqual([]);
    expect(
      visibleNavigation(['user.read'], 'ORGANIZATION').map(({ key }) => key),
    ).toContain('users');
  });

  it.each([
    ['Users', ['department.read'], '/settings/departments'],
    ['Warehouse', ['inventory.read'], '/inventory/items'],
    ['System', ['system.settings.read'], '/settings/system'],
  ])(
    'routes a child-only %s actor to its first visible destination',
    (_label, permissions, href) => {
      const group = visibleNavigation(permissions, 'ORGANIZATION')[0];
      expect(group?.href).toBe(href);
    },
  );

  it('matches active top-level routes', () => {
    const projects = navigation.find(({ key }) => key === 'projects')!;
    const children = projects.children ?? [];
    expect(isNavigationActive(projects, '/projects/id/estimates')).toBe(true);
    expect(isNavigationActive(projects, '/inventory/items')).toBe(false);
    expect(
      children
        .filter((item) => isNavigationActive(item, '/projects/actions'))
        .map(({ key }) => key),
    ).toEqual(['project-actions']);
    expect(
      children
        .filter((item) => isNavigationActive(item, '/projects/alerts'))
        .map(({ key }) => key),
    ).toEqual(['project-alerts']);
    expect(
      children
        .filter((item) => isNavigationActive(item, '/projects/'))
        .map(({ key }) => key),
    ).toEqual(['all-projects']);
  });

  it('exposes only the four permitted Project destinations to project readers', () => {
    const projects = visibleNavigation(['project.read'], 'ORGANIZATION').find(
      ({ key }) => key === 'projects',
    );
    expect(projects?.children?.map(({ href }) => href)).toEqual([
      '/projects',
      '/projects/mine',
      '/projects/actions',
      '/projects/alerts',
    ]);
    expect(visibleNavigation([], 'ORGANIZATION')).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'projects' })]),
    );
    expect(
      navigation
        .find(({ key }) => key === 'projects')!
        .children?.every(
          ({ requiredPermission }) => requiredPermission === 'project.read',
        ),
    ).toBe(true);
  });

  it('keeps Project workstreams out of global navigation', () => {
    const hrefs = navigation
      .find(({ key }) => key === 'projects')!
      .children?.map(({ href }) => href);
    expect(hrefs).toEqual([
      '/projects',
      '/projects/mine',
      '/projects/actions',
      '/projects/alerts',
    ]);
  });
});
