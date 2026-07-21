import { describe, expect, it } from 'vitest';
import { can, departmentAssignments, organizationInput } from './model';

describe('settings behavior', () => {
  it('shows actions only with their permission', () =>
    expect(can(['user.read'], 'user.create')).toBe(false));
  it('rejects an invalid organization currency', () =>
    expect(() =>
      organizationInput({
        name: 'Galaxy',
        timezone: 'UTC',
        defaultCurrency: 'vnd',
      }),
    ).toThrow());
  it('creates one selected primary department', () =>
    expect(departmentAssignments(['a', 'b'], 'b')).toEqual([
      { departmentId: 'a', isPrimary: false },
      { departmentId: 'b', isPrimary: true },
    ]));
});
