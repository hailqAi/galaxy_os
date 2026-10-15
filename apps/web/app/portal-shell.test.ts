import { describe, expect, it } from 'vitest';
import { canReadNotifications } from './portal-shell';

describe('PortalShell password-change boundary', () => {
  it('does not load notifications while the actor must change password', () => {
    expect(
      canReadNotifications({
        mustChangePassword: true,
        permissions: ['notification.read'],
      }),
    ).toBe(false);
  });
});
