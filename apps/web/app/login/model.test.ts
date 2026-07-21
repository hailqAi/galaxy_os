import { describe, expect, it } from 'vitest';
import { permittedReturnTo, safeReturnTo } from './model';

describe('safeReturnTo', () => {
  it('preserves relative paths and rejects external redirects', () => {
    expect(safeReturnTo('/settings/users?tab=roles')).toBe(
      '/settings/users?tab=roles',
    );
    expect(safeReturnTo('https://evil.example')).toBeNull();
    expect(safeReturnTo('//evil.example')).toBeNull();
    expect(safeReturnTo('/\\evil.example')).toBeNull();
  });
  it('uses an administrative return path only when permitted', () => {
    expect(permittedReturnTo('/settings/users', ['user.read'])).toBe(
      '/settings/users',
    );
    expect(permittedReturnTo('/settings/users', [])).toBeNull();
  });
});
