import { describe, expect, it } from 'vitest';
import { visibleNavigation } from './portal-navigation';

describe('permission-aware portal navigation', () => {
  it('shows Users only with user.read while preserving personal routes', () => {
    expect(
      visibleNavigation(['user.read'], 'ORGANIZATION').map(({ href }) => href),
    ).toContain('/settings/users');
    const restricted = visibleNavigation([]).map(({ href }) => href);
    expect(restricted).not.toContain('/settings/users');
    expect(restricted).toEqual(
      expect.arrayContaining([
        '/',
        '/account/profile',
        '/account/change-password',
      ]),
    );
  });

  it('hides Marketing when its feature flag is off', () => {
    const permissions = ['marketing.campaign.read', 'marketing.content.read'];
    expect(
      visibleNavigation(permissions, 'ORGANIZATION', false).some(({ href }) =>
        href.startsWith('/marketing'),
      ),
    ).toBe(false);
    expect(
      visibleNavigation(permissions, 'ORGANIZATION', true).some(({ href }) =>
        href.startsWith('/marketing'),
      ),
    ).toBe(true);
  });
});
