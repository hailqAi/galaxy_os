'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';

type Department = { id: string; name: string };
type Role = { id: string; name: string };
type User = {
  id: string;
  email: string;
  displayName: string;
  phone?: string;
  status: string;
  organizationMembers: { id: string; status: string }[];
  departmentMembers: {
    departmentId: string;
    isPrimary: boolean;
    department: Department;
  }[];
  roles: { roleId: string; role: Role }[];
  effectivePermissions: string[];
};

export default function UsersPage() {
  const [items, setItems] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [message, setMessage] = useState('Đang tải…');
  const [search, setSearch] = useState('');
  const load = useCallback(
    () =>
      Promise.all([
        api<{ items: User[] }>(
          `/users?pageSize=100&search=${encodeURIComponent(search)}`,
        ),
        api<{ items: Department[] }>('/departments?pageSize=100'),
        api<{ items: Role[] }>('/roles?pageSize=100'),
        api<{ permissions: string[] }>('/me/permissions'),
      ])
        .then(([users, departmentData, roleData, current]) => {
          setItems(users.items);
          setDepartments(departmentData.items);
          setRoles(roleData.items);
          setPermissions(current.permissions);
          setMessage('');
        })
        .catch((error: Error) => setMessage(error.message)),
    [search],
  );
  useEffect(() => {
    void load();
  }, [load]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    try {
      await api('/users', {
        method: 'POST',
        body: JSON.stringify({ ...values, status: 'active' }),
      });
      form.reset();
      await load();
      setMessage('Đã tạo người dùng.');
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  async function saveAssignments(
    event: FormEvent<HTMLFormElement>,
    user: User,
  ) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const departmentIds = data.getAll('departmentId').map(String);
    const primary = String(data.get('primary') ?? '');
    try {
      const updates: Promise<unknown>[] = [];
      if (permissions.includes('user.update'))
        updates.push(
          api(`/users/${user.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
              displayName: data.get('displayName'),
              email: data.get('email'),
              phone: data.get('phone') || undefined,
            }),
          }),
        );
      if (permissions.includes('membership.update'))
        updates.push(
          api(`/users/${user.id}/departments`, {
            method: 'PUT',
            body: JSON.stringify({
              departments: departmentIds.map((departmentId) => ({
                departmentId,
                isPrimary: departmentId === primary,
              })),
            }),
          }),
        );
      if (permissions.includes('role.assign'))
        updates.push(
          api(`/users/${user.id}/roles`, {
            method: 'PUT',
            body: JSON.stringify({
              roleIds: data.getAll('roleId').map(String),
            }),
          }),
        );
      await Promise.all(updates);
      await load();
      setMessage('Đã cập nhật phân công.');
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  async function disable(id: string) {
    if (!confirm('Vô hiệu hóa người dùng này?')) return;
    try {
      await api(`/users/${id}/disable`, { method: 'POST' });
      await load();
      setMessage('Đã vô hiệu hóa người dùng.');
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  async function setMembership(user: User) {
    const status = user.organizationMembers[0]?.status;
    try {
      await api(`/users/${user.id}/membership`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: status === 'active' ? 'disabled' : 'active',
        }),
      });
      await load();
      setMessage('Đã cập nhật tư cách thành viên tổ chức.');
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  return (
    <div className="grid gap-6">
      <div className="panel">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Người dùng</h2>
            <label className="mt-3">
              Tìm kiếm
              <input
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Tên hoặc email"
                type="search"
                value={search}
              />
            </label>
          </div>
          {permissions.includes('user.create') && (
            <form className="flex flex-wrap items-end gap-2" onSubmit={create}>
              <label>
                Họ tên
                <input name="displayName" required />
              </label>
              <label>
                Email
                <input name="email" required type="email" />
              </label>
              <button className="primary" type="submit">
                Tạo người dùng
              </button>
            </form>
          )}
        </div>
        <p className="mt-4" role="status">
          {message}
        </p>
      </div>
      {!items.length && !message ? (
        <p className="panel">Không có người dùng phù hợp.</p>
      ) : (
        items.map((user) => (
          <form
            className="panel"
            key={user.id}
            onSubmit={(event) => void saveAssignments(event, user)}
          >
            <div className="flex flex-wrap justify-between gap-3">
              <div>
                <h3 className="font-semibold">{user.displayName}</h3>
                <p className="text-sm text-black/60">Danh tính: {user.email}</p>
                <p className="text-sm text-black/60">
                  Tài khoản: {user.status} · Thành viên tổ chức:{' '}
                  {user.organizationMembers[0]?.status ?? 'Không có'}
                </p>
                <p className="mt-1 text-sm">
                  Phòng chính:{' '}
                  {user.departmentMembers.find((member) => member.isPrimary)
                    ?.department.name ?? 'Chưa có'}
                </p>
              </div>
              {user.status !== 'disabled' &&
                permissions.includes('user.disable') && (
                  <button onClick={() => void disable(user.id)} type="button">
                    Vô hiệu hóa
                  </button>
                )}
              {permissions.includes('membership.update') && (
                <button onClick={() => void setMembership(user)} type="button">
                  {user.organizationMembers[0]?.status === 'active'
                    ? 'Vô hiệu hóa thành viên'
                    : 'Kích hoạt thành viên'}
                </button>
              )}
            </div>
            <div className="mt-4">
              <h4 className="font-medium">Quyền hiệu lực (chỉ đọc)</h4>
              <p className="mt-1 text-sm text-black/60">
                {user.effectivePermissions.join(', ') || 'Không có quyền'}
              </p>
            </div>
            {(permissions.includes('user.update') ||
              permissions.includes('membership.update') ||
              permissions.includes('role.assign')) && (
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label hidden={!permissions.includes('user.update')}>
                  Họ tên
                  <input
                    defaultValue={user.displayName}
                    name="displayName"
                    required
                  />
                </label>
                <label hidden={!permissions.includes('user.update')}>
                  Email
                  <input
                    defaultValue={user.email}
                    name="email"
                    required
                    type="email"
                  />
                </label>
                <label hidden={!permissions.includes('user.update')}>
                  Số điện thoại
                  <input defaultValue={user.phone} name="phone" />
                </label>
                <fieldset disabled={!permissions.includes('membership.update')}>
                  <legend className="font-medium">Phòng ban</legend>
                  {departments.map((department) => (
                    <div
                      className="mt-2 flex items-center gap-2"
                      key={department.id}
                    >
                      <input
                        defaultChecked={user.departmentMembers.some(
                          (member) => member.departmentId === department.id,
                        )}
                        id={`${user.id}-d-${department.id}`}
                        name="departmentId"
                        type="checkbox"
                        value={department.id}
                      />
                      <label
                        className="inline"
                        htmlFor={`${user.id}-d-${department.id}`}
                      >
                        {department.name}
                      </label>
                      <input
                        aria-label={`Phòng chính ${department.name}`}
                        defaultChecked={user.departmentMembers.some(
                          (member) =>
                            member.departmentId === department.id &&
                            member.isPrimary,
                        )}
                        name="primary"
                        type="radio"
                        value={department.id}
                      />
                    </div>
                  ))}
                </fieldset>
                <fieldset disabled={!permissions.includes('role.assign')}>
                  <legend className="font-medium">Vai trò</legend>
                  {roles.map((role) => (
                    <label
                      className="mt-2 flex grid-cols-none items-center gap-2"
                      key={role.id}
                    >
                      <input
                        defaultChecked={user.roles.some(
                          (assignment) => assignment.roleId === role.id,
                        )}
                        name="roleId"
                        type="checkbox"
                        value={role.id}
                      />
                      {role.name}
                    </label>
                  ))}
                </fieldset>
                <button className="primary md:col-span-2" type="submit">
                  Lưu phân công
                </button>
              </div>
            )}
          </form>
        ))
      )}
    </div>
  );
}
