'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';

type Permission = { id: string; code: string; description: string };
type Role = {
  id: string;
  code: string;
  name: string;
  description?: string;
  isSystem: boolean;
  category: string;
  maximumScope: string;
  administrationTier: number;
  isProtected: boolean;
  isDelegable: boolean;
  status: string;
  permissions: { permissionId: string }[];
  users: {
    user: { id: string; displayName: string; email: string };
  }[];
};

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [catalog, setCatalog] = useState<Permission[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [message, setMessage] = useState('Đang tải…');
  const [permissionSearch, setPermissionSearch] = useState('');
  const load = useCallback(
    () =>
      api<{ permissions: string[] }>('/me/permissions')
        .then(async (actor) => {
          const [roleData, permissionData] = await Promise.all([
            api<{ items: Role[] }>('/roles?pageSize=100'),
            actor.permissions.includes('permission.read')
              ? api<Permission[]>('/permissions')
              : Promise.resolve([]),
          ]);
          setRoles(roleData.items);
          setCatalog(permissionData);
          setPermissions(actor.permissions);
          setMessage('');
        })
        .catch((error: Error) => setMessage(error.message)),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      await api('/roles', {
        method: 'POST',
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      form.reset();
      await load();
      setMessage('Đã tạo vai trò.');
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  async function save(event: FormEvent<HTMLFormElement>, role: Role) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await api(`/roles/${role.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: data.get('name'),
          description: data.get('description') || undefined,
        }),
      });
      if (
        role.code !== 'system_admin' &&
        permissions.includes('permission.assign')
      ) {
        await api(`/roles/${role.id}/permissions`, {
          method: 'PUT',
          body: JSON.stringify({ permissionIds: data.getAll('permissionId') }),
        });
      }
      await load();
      setMessage('Đã cập nhật vai trò.');
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  async function archive(id: string) {
    if (!confirm('Lưu trữ vai trò này?')) return;
    try {
      await api(`/roles/${id}/archive`, { method: 'POST' });
      await load();
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  return (
    <div className="grid gap-6">
      <div className="panel">
        <h2 className="text-xl font-semibold">Vai trò và quyền</h2>
        <p className="mt-2 text-sm text-black/60">
          Vai trò hệ thống được bảo vệ. Quyền được nhóm theo mô-đun và luôn bị
          giới hạn bởi phạm vi cùng trần ủy quyền.
        </p>
        <p className="mt-3" role="status">
          {message}
        </p>
        {permissions.includes('role.create') && (
          <form
            className="mt-4 flex flex-wrap items-end gap-3"
            onSubmit={create}
          >
            <label>
              Mã vai trò
              <input name="code" pattern="[a-z0-9_]+" required />
            </label>
            <label>
              Tên vai trò
              <input name="name" required />
            </label>
            <label>
              Phân loại
              <select name="category" defaultValue="CUSTOM">
                <option>CUSTOM</option>
                <option>DEPARTMENT</option>
                <option>STANDARD</option>
                <option>EXECUTIVE</option>
              </select>
            </label>
            <label>
              Phạm vi tối đa
              <select name="maximumScope" defaultValue="DEPARTMENT">
                <option>SELF</option>
                <option>DEPARTMENT</option>
                <option>ORGANIZATION</option>
              </select>
            </label>
            <button className="primary" type="submit">
              Tạo vai trò
            </button>
          </form>
        )}
      </div>
      {roles.map((role) => (
        <form
          className="panel"
          key={role.id}
          onSubmit={(event) => void save(event, role)}
        >
          <div className="flex justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-brass">
                {role.isSystem ? 'Vai trò hệ thống' : 'Vai trò tùy chỉnh'}
              </p>
              <p className="text-sm text-black/60">
                {role.code} · {role.category} · {role.maximumScope} · cấp{' '}
                {role.administrationTier} ·{' '}
                {role.isDelegable ? 'có thể ủy quyền' : 'không ủy quyền'} ·{' '}
                {role.status}
              </p>
            </div>
            {!role.isSystem &&
              role.status === 'active' &&
              permissions.includes('role.archive') && (
                <button onClick={() => void archive(role.id)} type="button">
                  Lưu trữ
                </button>
              )}
          </div>
          <div className="mt-4 grid gap-4">
            <label>
              Tên
              <input
                defaultValue={role.name}
                disabled={!permissions.includes('role.update')}
                name="name"
                required
              />
            </label>
            <label>
              Mô tả
              <textarea
                defaultValue={role.description}
                disabled={!permissions.includes('role.update')}
                name="description"
              />
            </label>
            <fieldset
              disabled={
                !permissions.includes('permission.assign') ||
                role.code === 'system_admin'
              }
            >
              <legend className="font-medium">Quyền hiện tại</legend>
              <label className="mt-2 block">
                Tìm quyền
                <input
                  type="search"
                  value={permissionSearch}
                  onChange={(event) => setPermissionSearch(event.target.value)}
                />
              </label>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                {catalog
                  .filter((permission) =>
                    permission.code.includes(
                      permissionSearch.trim().toLowerCase(),
                    ),
                  )
                  .map((permission) => (
                    <label
                      className="flex grid-cols-none items-center gap-2 font-normal"
                      key={permission.id}
                    >
                      <input
                        defaultChecked={role.permissions.some(
                          ({ permissionId }) => permissionId === permission.id,
                        )}
                        name="permissionId"
                        type="checkbox"
                        value={permission.id}
                      />
                      <span>
                        <strong>{permission.code.split('.')[0]}</strong> ·{' '}
                        {permission.code}
                      </span>
                    </label>
                  ))}
              </div>
            </fieldset>
            <div>
              <h4 className="font-medium">Thành viên được gán</h4>
              <p className="mt-1 text-sm text-black/60">
                {role.users.map(({ user }) => user.displayName).join(', ') ||
                  'Chưa có thành viên'}
              </p>
            </div>
            {permissions.includes('role.update') && (
              <button className="primary" type="submit">
                Lưu vai trò
              </button>
            )}
          </div>
        </form>
      ))}
    </div>
  );
}
