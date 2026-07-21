'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { Actor, api } from '../../../lib/api';

type Catalog = {
  departments: { id: string; name: string }[];
  roles: {
    id: string;
    name: string;
    isProtected: boolean;
    isDelegable: boolean;
    administrationTier: number;
    permissions: { permission: { code: string } }[];
  }[];
};

export default function NewUserPage() {
  const router = useRouter();
  const [actor, setActor] = useState<Actor | null>(null);
  const [catalog, setCatalog] = useState<Catalog>({
    departments: [],
    roles: [],
  });
  const [message, setMessage] = useState('Đang tải…');
  useEffect(() => {
    api<Actor>('/me')
      .then(async (current) => {
        if (
          !current.permissions.includes('user.create') ||
          current.administrationScope !== 'ORGANIZATION'
        )
          throw new Error('Bạn không có quyền tạo người dùng.');
        const [departments, roles] = await Promise.all([
          api<{ items: Catalog['departments'] }>('/departments?pageSize=100'),
          api<{ items: Catalog['roles'] }>('/roles?pageSize=100'),
        ]);
        setActor(current);
        setCatalog({ departments: departments.items, roles: roles.items });
        setMessage('');
      })
      .catch((error: Error) => setMessage(error.message));
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const departmentId = String(data.get('departmentId') ?? '');
    try {
      const created = await api<{ id: string; temporaryPassword: string }>(
        '/users',
        {
          method: 'POST',
          body: JSON.stringify({
            email: data.get('email'),
            displayName: data.get('displayName'),
            phone: data.get('phone') || undefined,
            status: data.get('status'),
            temporaryPassword: data.get('temporaryPassword') || undefined,
            roleIds: data.getAll('roleId'),
            departments: departmentId
              ? [{ departmentId, isPrimary: true }]
              : [],
          }),
        },
      );
      alert(
        `Người dùng đã được tạo. Mật khẩu tạm thời chỉ hiển thị lần này:\n${created.temporaryPassword}`,
      );
      router.push(`/settings/users/${created.id}`);
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  const roles = catalog.roles.filter(
    (role) =>
      actor &&
      role.isDelegable &&
      !role.isProtected &&
      role.administrationTier < actor.administrationTier &&
      role.permissions.every(({ permission }) =>
        actor.permissions.includes(permission.code),
      ),
  );
  return (
    <div className="mx-auto grid max-w-3xl gap-5">
      <Link className="text-sm text-black/60" href="/settings/users">
        ← Người dùng
      </Link>
      <header>
        <h1 className="text-2xl font-semibold">Thêm người dùng</h1>
        <p className="mt-1 text-sm text-black/60">
          Tạo tài khoản, thành viên tổ chức và phân công ban đầu trong một giao
          dịch.
        </p>
      </header>
      {message && (
        <p className="rounded bg-amber-50 p-3" role="status">
          {message}
        </p>
      )}
      {actor && (
        <form className="grid gap-5" onSubmit={submit}>
          <section className="panel grid gap-4">
            <h2 className="text-lg font-semibold">1. Tài khoản</h2>
            <label>
              Email đăng nhập
              <input autoComplete="off" name="email" required type="email" />
            </label>
            <label>
              Tên hiển thị
              <input name="displayName" required />
            </label>
            <label>
              Điện thoại
              <input name="phone" />
            </label>
            <label>
              Trạng thái
              <select defaultValue="active" name="status">
                <option value="active">Hoạt động</option>
                <option value="invited">Đã mời</option>
              </select>
            </label>
          </section>
          <section className="panel grid gap-4">
            <h2 className="text-lg font-semibold">2. Tổ chức và phòng ban</h2>
            <label>
              Phòng ban chính
              <select name="departmentId">
                <option value="">Chưa gán</option>
                {catalog.departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </label>
          </section>
          <section className="panel grid gap-4">
            <h2 className="text-lg font-semibold">3. Vai trò và bảo mật</h2>
            <fieldset>
              <legend className="font-medium">Vai trò được phép gán</legend>
              {roles.map((role) => (
                <label
                  className="mt-2 flex grid-cols-none items-center gap-2"
                  key={role.id}
                >
                  <input name="roleId" type="checkbox" value={role.id} />
                  {role.name}
                </label>
              ))}
            </fieldset>
            <label>
              Mật khẩu tạm thời
              <input
                minLength={12}
                name="temporaryPassword"
                placeholder="Để trống để tạo an toàn"
                type="password"
              />
            </label>
            <p className="text-sm text-black/60">
              Người dùng bắt buộc đổi mật khẩu trong lần đăng nhập đầu tiên.
            </p>
          </section>
          <div className="flex justify-end gap-2">
            <Link className="rounded border px-4 py-2" href="/settings/users">
              Hủy
            </Link>
            <button className="primary" type="submit">
              Tạo người dùng
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
