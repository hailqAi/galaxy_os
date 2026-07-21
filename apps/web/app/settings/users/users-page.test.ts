import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
const detail = readFileSync(
  new URL('./[userId]/user-detail.tsx', import.meta.url),
  'utf8',
);

describe('Users administration information architecture', () => {
  it('keeps the default table concise and exposes row actions to keyboard focus', () => {
    expect(source).toMatch(/name="email"[\s\S]*?Username/);
    expect(source).toMatch(/name="displayName"[\s\S]*?Tên/);
    expect(source).toMatch(/name="email"[\s\S]*?Email/);
    expect(source).toMatch(/name="role"[\s\S]*?Vai trò/);
    expect(source).toContain('group-focus-within:opacity-100');
  });

  it('uses separate view/edit routes and lazy detail requests', () => {
    expect(source).toContain('/edit`}>Sửa</Link>');
    expect(source).toContain('>Xem</Link>');
    expect(detail).toContain("tab === 'capabilities'");
    expect(detail).toContain("tab === 'sessions'");
    expect(detail).toContain("tab === 'activity'");
  });

  it('does not offer direct capability mutation or hard deletion', () => {
    expect(source).not.toContain('PUT /capabilities');
    expect(source).not.toContain('/delete');
  });
});
