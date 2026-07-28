'use client';

import Link from 'next/link';
import * as React from 'react';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Actor, api } from '../../../lib/api';
import { normalizeAccessPreview } from './access-preview';

export type User = {
  id: string;
  email: string;
  displayName: string;
  phone?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
  credential?: { mustChangePassword: boolean; passwordChangedAt?: string };
  organizationMembers: {
    status: string;
    joinedAt: string;
    administrationScope: Actor['administrationScope'];
    managedDepartments: {
      departmentId: string;
      department: { name: string };
    }[];
  }[];
  departmentMembers: {
    departmentId: string;
    isPrimary: boolean;
    department: { id: string; name: string };
  }[];
  roles: {
    roleId: string;
    createdAt: string;
    role: {
      id: string;
      name: string;
      description?: string;
      isProtected: boolean;
    };
  }[];
  actions: string[];
};
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
const tabs = [
  ['overview', 'Tổng quan'],
  ['account', 'Tài khoản'],
  ['membership', 'Tổ chức'],
  ['departments', 'Phòng ban'],
  ['roles', 'Vai trò'],
  ['capabilities', 'Quyền hạn'],
  ['security', 'Bảo mật'],
  ['sessions', 'Phiên'],
  ['managed-scope', 'Phạm vi quản lý'],
  ['access-preview', 'Xem trước truy cập'],
  ['custom-fields', 'Trường tùy chỉnh'],
  ['activity', 'Hoạt động'],
] as const;

export function UserDetail({
  userId,
  edit = false,
}: {
  userId: string;
  edit?: boolean;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [actor, setActor] = useState<Actor | null>(null);
  const [catalog, setCatalog] = useState<Catalog>({
    departments: [],
    roles: [],
  });
  const [tab, setTab] = useState('overview');
  const [lazy, setLazy] = useState<unknown>(null);
  const [message, setMessage] = useState('Đang tải…');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const load = useCallback(async () => {
    try {
      const [current, target] = await Promise.all([
        api<Actor>('/me'),
        api<User>(`/users/${userId}`),
      ]);
      setActor(current);
      setUser(target);
      setMessage('');
      if (edit) {
        const [departments, roles] = await Promise.all([
          current.permissions.includes('department.read')
            ? api<{ items: Catalog['departments'] }>(
                '/departments?pageSize=100',
              )
            : Promise.resolve({ items: [] }),
          current.permissions.includes('role.read')
            ? api<{ items: Catalog['roles'] }>('/roles?pageSize=100')
            : Promise.resolve({ items: [] }),
        ]);
        setCatalog({ departments: departments.items, roles: roles.items });
      }
    } catch (error) {
      setMessage((error as Error).message);
    }
  }, [edit, userId]);
  useEffect(() => {
    const timeout = setTimeout(() => void load(), 0);
    return () => clearTimeout(timeout);
  }, [load]);
  useEffect(() => {
    const timeout = setTimeout(() => setLazy(null), 0);
    const path =
      tab === 'capabilities'
        ? 'capabilities'
        : tab === 'sessions'
          ? 'sessions'
          : tab === 'access-preview'
            ? 'access-preview'
            : tab === 'activity'
              ? 'audit'
              : tab === 'custom-fields'
                ? null
                : null;
    const request = path
      ? api(`/users/${userId}/${path}`)
      : tab === 'custom-fields'
        ? api('/custom-fields?entityType=USER')
        : null;
    let current = true;
    void request
      ?.then((value) => current && setLazy(value))
      .catch((error: Error) => current && setLazy({ error: error.message }));
    return () => {
      clearTimeout(timeout);
      current = false;
    };
  }, [tab, userId]);
  if (!user)
    return (
      <div className="panel" role="status">
        {message}
      </div>
    );
  const membership = user.organizationMembers[0];
  return (
    <div className="grid gap-5">
      <div>
        <Link className="text-sm text-black/60" href="/settings/users">
          ← Người dùng
        </Link>
      </div>
      <header className="panel flex flex-wrap items-start justify-between gap-5">
        <div className="flex gap-4">
          <span
            aria-hidden
            className="grid h-16 w-16 place-items-center rounded-full bg-brass/15 text-2xl font-semibold text-brass"
          >
            {user.displayName.charAt(0)}
          </span>
          <div>
            <h1 className="text-2xl font-semibold">{user.displayName}</h1>
            <p className="text-sm text-black/60">{user.email}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge>{user.status}</Badge>
              <Badge>{membership?.status ?? 'Không có thành viên'}</Badge>
              {user.roles.slice(0, 3).map(({ role }) => (
                <Badge key={role.id}>{role.name}</Badge>
              ))}
            </div>
            <p className="mt-2 text-xs text-black/55">
              Đăng nhập gần nhất:{' '}
              {user.lastLoginAt
                ? new Date(user.lastLoginAt).toLocaleString('vi-VN')
                : 'Chưa có'}{' '}
              · Phạm vi: {membership?.administrationScope}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {user.actions.includes('resetPassword') && (
            <button
              onClick={() => {
                if (
                  confirm(
                    'Tạo mật khẩu tạm thời và thu hồi mọi phiên của người dùng này?',
                  )
                )
                  void api<{ temporaryPassword: string }>(
                    `/auth/users/${user.id}/reset-password`,
                    { method: 'POST' },
                  )
                    .then((result) =>
                      setTemporaryPassword(result.temporaryPassword),
                    )
                    .catch((error: Error) => setMessage(error.message));
              }}
            >
              Mật khẩu tạm thời
            </button>
          )}
          {!edit && user.actions.includes('update') && (
            <Link
              className="primary rounded px-4 py-2"
              href={`/settings/users/${user.id}/edit`}
            >
              Sửa
            </Link>
          )}
          {edit && (
            <Link
              className="rounded border px-4 py-2"
              href={`/settings/users/${user.id}`}
            >
              Hủy
            </Link>
          )}
        </div>
      </header>
      {message && (
        <p className="rounded bg-amber-50 p-3" role="status">
          {message}
        </p>
      )}
      {temporaryPassword && (
        <div
          className="rounded border border-amber-300 bg-amber-50 p-4"
          role="status"
        >
          <strong>Chỉ hiển thị một lần:</strong>{' '}
          <code>{temporaryPassword}</code>
          <button className="ml-3" onClick={() => setTemporaryPassword('')}>
            Đã lưu an toàn
          </button>
        </div>
      )}
      <nav
        aria-label="Chi tiết người dùng"
        className="flex gap-1 overflow-x-auto border-b"
      >
        {tabs
          .filter(
            ([key]) =>
              !edit ||
              ['account', 'membership', 'departments', 'roles'].includes(key),
          )
          .map(([key, label]) => (
            <button
              aria-current={tab === key ? 'page' : undefined}
              className={`shrink-0 rounded-b-none border-0 px-4 py-3 ${tab === key ? 'border-b-2 !border-brass font-semibold' : ''}`}
              key={key}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
      </nav>
      <section className="panel min-h-64">
        {edit ? (
          <EditTab
            actor={actor!}
            catalog={catalog}
            onDone={load}
            setMessage={setMessage}
            tab={tab}
            user={user}
          />
        ) : (
          <ViewTab actor={actor!} data={lazy} tab={tab} user={user} />
        )}
      </section>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-stone-100 px-2 py-1 text-xs">
      {children}
    </span>
  );
}
function Item({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-black/50">{label}</dt>
      <dd className="mt-1">{children || '—'}</dd>
    </div>
  );
}

export function ViewTab({
  user,
  tab,
  data,
  actor,
}: {
  user: User;
  tab: string;
  data: unknown;
  actor: Actor;
}) {
  const membership = user.organizationMembers[0];
  if (tab === 'overview')
    return (
      <>
        <h2 className="text-lg font-semibold">Tổng quan</h2>
        <dl className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Item label="Tài khoản">{user.status}</Item>
          <Item label="Email đăng nhập">{user.email}</Item>
          <Item label="Thành viên">{membership?.status}</Item>
          <Item label="Phòng ban chính">
            {
              user.departmentMembers.find(({ isPrimary }) => isPrimary)
                ?.department.name
            }
          </Item>
          <Item label="Vai trò">
            {user.roles.map(({ role }) => role.name).join(', ')}
          </Item>
          <Item label="Đổi mật khẩu">
            {user.credential?.mustChangePassword ? 'Bắt buộc' : 'Không'}
          </Item>
        </dl>
      </>
    );
  if (tab === 'account')
    return (
      <>
        <h2 className="text-lg font-semibold">Tài khoản</h2>
        <dl className="mt-5 grid gap-5 sm:grid-cols-2">
          <Item label="ID người dùng">{user.id}</Item>
          <Item label="Tên hiển thị">{user.displayName}</Item>
          <Item label="Username / email">{user.email}</Item>
          <Item label="Điện thoại">{user.phone}</Item>
          <Item label="Ngày tạo">
            {new Date(user.createdAt).toLocaleString('vi-VN')}
          </Item>
          <Item label="Cập nhật">
            {new Date(user.updatedAt).toLocaleString('vi-VN')}
          </Item>
        </dl>
      </>
    );
  if (tab === 'membership')
    return (
      <>
        <h2 className="text-lg font-semibold">Thành viên tổ chức</h2>
        <dl className="mt-5 grid gap-5 sm:grid-cols-2">
          <Item label="Trạng thái">{membership?.status}</Item>
          <Item label="Phạm vi quản trị">
            {membership?.administrationScope}
          </Item>
          <Item label="Ngày tham gia">
            {membership?.joinedAt &&
              new Date(membership.joinedAt).toLocaleString('vi-VN')}
          </Item>
        </dl>
      </>
    );
  if (tab === 'departments')
    return (
      <>
        <h2 className="text-lg font-semibold">Phòng ban</h2>
        <ul className="mt-4 divide-y">
          {user.departmentMembers.map(({ department, isPrimary }) => (
            <li className="py-3" key={department.id}>
              {department.name}
              {isPrimary && <Badge>Chính</Badge>}
            </li>
          ))}
        </ul>
        <h3 className="mt-6 font-semibold">Phòng ban được quản lý</h3>
        <p className="mt-2">
          {membership?.managedDepartments
            .map(({ department }) => department.name)
            .join(', ') || 'Không có'}
        </p>
      </>
    );
  if (tab === 'roles')
    return (
      <>
        <h2 className="text-lg font-semibold">Vai trò</h2>
        <ul className="mt-4 grid gap-3">
          {user.roles.map(({ role, createdAt }) => (
            <li className="rounded border p-3" key={role.id}>
              <strong>{role.name}</strong>
              {role.isProtected && <Badge>Được bảo vệ</Badge>}
              <p className="text-sm text-black/60">
                {role.description || 'Không có mô tả'} · Gán{' '}
                {new Date(createdAt).toLocaleDateString('vi-VN')}
              </p>
            </li>
          ))}
        </ul>
      </>
    );
  if (tab === 'managed-scope')
    return (
      <>
        <h2 className="text-lg font-semibold">Phạm vi quản lý</h2>
        <p className="mt-3">
          {membership?.managedDepartments
            .map(({ department }) => department.name)
            .join(', ') || 'Không có đơn vị được giao.'}
        </p>
        <p className="mt-2 text-sm text-black/60">
          Quyền quản lý chỉ có hiệu lực khi người dùng đồng thời có vai trò gán
          ở phạm vi phòng ban.
        </p>
      </>
    );
  if (tab === 'security')
    return (
      <>
        <h2 className="text-lg font-semibold">Bảo mật</h2>
        <dl className="mt-5 grid gap-5 sm:grid-cols-2">
          <Item label="Bắt buộc đổi mật khẩu">
            {user.credential?.mustChangePassword ? 'Có' : 'Không'}
          </Item>
          <Item label="Đổi mật khẩu gần nhất">
            {user.credential?.passwordChangedAt
              ? new Date(user.credential.passwordChangedAt).toLocaleString(
                  'vi-VN',
                )
              : 'Chưa có'}
          </Item>
        </dl>
        <p className="mt-5 text-sm text-black/60">
          Mật khẩu, mã đặt lại và token phiên không bao giờ được hiển thị.
        </p>
      </>
    );
  if (!data) return <p role="status">Đang tải dữ liệu riêng cho tab này…</p>;
  if (typeof data !== 'object')
    return <p role="alert">Dữ liệu của tab không hợp lệ.</p>;
  if ('error' in data) return <p role="alert">{String(data.error)}</p>;
  if (tab === 'capabilities') {
    const capabilities = (data as { capabilities?: unknown }).capabilities;
    if (
      !Array.isArray(capabilities) ||
      capabilities.some(
        (item) =>
          !item ||
          typeof item !== 'object' ||
          !Array.isArray((item as { sourceRoles?: unknown }).sourceRoles),
      )
    )
      return <p role="alert">Dữ liệu quyền hạn không hợp lệ.</p>;
    const items = capabilities as {
      key: string;
      module: string;
      sourceRoles: { name: string }[];
      scope: string;
    }[];
    return (
      <>
        <h2 className="text-lg font-semibold">Quyền hạn hiệu lực</h2>
        <table className="mt-4">
          <thead>
            <tr>
              <th>Quyền</th>
              <th>Mô-đun</th>
              <th>Cấp bởi</th>
              <th>Phạm vi</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.key}>
                <td>
                  <code>{item.key}</code>
                </td>
                <td>{item.module}</td>
                <td>{item.sourceRoles.map(({ name }) => name).join(', ')}</td>
                <td>{item.scope}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {user.actions.includes('assignRoles') &&
          actor.permissions.includes('permission.assign') && (
            <AccessProfileEditor actor={actor} userId={user.id} />
          )}
      </>
    );
  }
  if (tab === 'access-preview') {
    const preview = normalizeAccessPreview(data);
    return preview ? (
      <>
        <h2 className="text-lg font-semibold">Xem trước truy cập</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <Item label="Phạm vi">{preview.scope}</Item>
          <Item label="Người dùng có thể quản lý">
            {preview.manageableUsers}
          </Item>
          <Item label="Mô-đun">
            {preview.visibleModules.join(', ') || 'Không có'}
          </Item>
          <Item label="Đơn vị hiển thị">
            {preview.visibleDepartmentIds.length || 'Không có'}
          </Item>
        </dl>
        <h3 className="mt-5 font-semibold">Quyền hiệu lực</h3>
        <p className="mt-2 text-sm">
          {preview.effectivePermissions.join(', ') || 'Không có'}
        </p>
        <h3 className="mt-5 font-semibold">Quyền không được cấp</h3>
        <p className="mt-2 text-sm text-black/60">
          {preview.deniedPermissions.join(', ') || 'Không có'}
        </p>
      </>
    ) : (
      <p role="alert">Dữ liệu xem trước truy cập không hợp lệ.</p>
    );
  }
  if (tab === 'custom-fields') {
    if (
      !Array.isArray(data) ||
      data.some(
        (field) =>
          !field ||
          typeof field !== 'object' ||
          typeof (field as { id?: unknown }).id !== 'string' ||
          typeof (field as { label?: unknown }).label !== 'string' ||
          typeof (field as { key?: unknown }).key !== 'string' ||
          typeof (field as { dataType?: unknown }).dataType !== 'string' ||
          typeof (field as { required?: unknown }).required !== 'boolean',
      )
    )
      return <p role="alert">Dữ liệu trường tùy chỉnh không hợp lệ.</p>;
    const fields = data as {
      id: string;
      label: string;
      key: string;
      dataType: string;
      required: boolean;
    }[];
    return (
      <>
        <h2 className="text-lg font-semibold">Trường tùy chỉnh</h2>
        <ul className="mt-4 grid gap-2">
          {fields.length ? (
            fields.map((field) => (
              <li className="rounded border p-3" key={field.id}>
                <strong>{field.label}</strong> · {field.dataType}
                {field.required ? ' · Bắt buộc' : ''}
                <br />
                <small>{field.key}</small>
              </li>
            ))
          ) : (
            <li>Không có trường dữ liệu tùy chỉnh</li>
          )}
        </ul>
      </>
    );
  }
  if (tab === 'sessions') {
    if (!Array.isArray(data))
      return <p role="alert">Dữ liệu phiên đăng nhập không hợp lệ.</p>;
    const sessions = data as {
      id: string;
      createdAt: string;
      lastSeenAt: string;
      expiresAt: string;
      revokedAt?: string;
    }[];
    return (
      <>
        <h2 className="text-lg font-semibold">Phiên đăng nhập</h2>
        <ul className="mt-4 divide-y">
          {sessions.map((session) => (
            <li className="py-3" key={session.id}>
              Hoạt động {new Date(session.lastSeenAt).toLocaleString('vi-VN')} ·
              Hết hạn {new Date(session.expiresAt).toLocaleString('vi-VN')} ·{' '}
              {session.revokedAt ? 'Đã thu hồi' : 'Đang hoạt động'}
            </li>
          ))}
        </ul>
      </>
    );
  }
  if (!Array.isArray(data))
    return <p role="alert">Dữ liệu hoạt động không hợp lệ.</p>;
  const logs = data as { id: string; action: string; createdAt: string }[];
  return (
    <>
      <h2 className="text-lg font-semibold">Hoạt động</h2>
      <ul className="mt-4 divide-y">
        {logs.map((log) => (
          <li className="py-3" key={log.id}>
            <code>{log.action}</code> ·{' '}
            {new Date(log.createdAt).toLocaleString('vi-VN')}
          </li>
        ))}
      </ul>
    </>
  );
}

function AccessProfileEditor({
  actor,
  userId,
}: {
  actor: Actor;
  userId: string;
}) {
  const [permissions, setPermissions] = useState<
    { id: string; code: string }[]
  >([]);
  const [departments, setDepartments] = useState<
    { id: string; name: string }[]
  >([]);
  const [message, setMessage] = useState('');
  useEffect(() => {
    void Promise.all([
      api<{ id: string; code: string }[]>('/permissions'),
      api<{ items: { id: string; name: string }[] }>(
        '/departments?pageSize=100',
      ),
    ])
      .then(([catalog, units]) => {
        setPermissions(
          catalog.filter(({ code }) => actor.permissions.includes(code)),
        );
        setDepartments(units.items);
      })
      .catch((error: Error) => setMessage(error.message));
  }, [actor.permissions]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const maximumScope = String(data.get('maximumScope'));
    const departmentId = String(data.get('departmentId') ?? '');
    await api(`/users/${userId}/access-profile`, {
      method: 'PUT',
      body: JSON.stringify({
        name: data.get('name'),
        maximumScope,
        departmentId: maximumScope === 'DEPARTMENT' ? departmentId : undefined,
        permissionIds: data.getAll('permissionId'),
      }),
    })
      .then(() =>
        setMessage('Đã lưu access profile có tên và nhật ký kiểm toán.'),
      )
      .catch((error: Error) => setMessage(error.message));
  }
  return (
    <form className="mt-8 grid gap-3 border-t pt-5" onSubmit={save}>
      <h3 className="font-semibold">
        Tùy chỉnh theo người dùng bằng access profile
      </h3>
      <p className="text-sm text-black/60">
        Profile là vai trò tùy chỉnh hiển thị công khai, có vòng đời và audit;
        quyền từ các vai trò khác vẫn được giữ.
      </p>
      <label>
        Tên profile
        <input name="name" defaultValue="Access profile cá nhân" required />
      </label>
      <label>
        Phạm vi
        <select name="maximumScope" defaultValue="SELF">
          <option>SELF</option>
          <option>DEPARTMENT</option>
          {actor.administrationScope === 'ORGANIZATION' ||
          actor.administrationScope === 'SYSTEM' ? (
            <option>ORGANIZATION</option>
          ) : null}
        </select>
      </label>
      <label>
        Phòng ban
        <select name="departmentId">
          <option value="">Chọn khi dùng DEPARTMENT</option>
          {departments.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend>Quyền được phép ủy quyền</legend>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          {permissions.map((permission) => (
            <label
              className="flex grid-cols-none items-center gap-2"
              key={permission.id}
            >
              <input
                name="permissionId"
                type="checkbox"
                value={permission.id}
              />
              {permission.code}
            </label>
          ))}
        </div>
      </fieldset>
      <button className="primary">Lưu access profile</button>
      <p role="status">{message}</p>
    </form>
  );
}

function EditTab({
  user,
  actor,
  catalog,
  tab,
  onDone,
  setMessage,
}: {
  user: User;
  actor: Actor;
  catalog: Catalog;
  tab: string;
  onDone: () => Promise<void>;
  setMessage: (value: string) => void;
}) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    try {
      if (tab === 'account')
        await api(`/users/${user.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            displayName: values.get('displayName'),
            phone: values.get('phone') || undefined,
          }),
        });
      if (tab === 'membership')
        await api(`/users/${user.id}/membership`, {
          method: 'PATCH',
          body: JSON.stringify({
            status: values.get('status'),
            administrationScope: values.get('administrationScope'),
          }),
        });
      if (tab === 'departments') {
        const ids = values.getAll('departmentId').map(String);
        await api(`/users/${user.id}/departments`, {
          method: 'PUT',
          body: JSON.stringify({
            departments: ids.map((departmentId) => ({
              departmentId,
              isPrimary: departmentId === values.get('primary'),
            })),
          }),
        });
      }
      if (tab === 'roles')
        await api(`/users/${user.id}/roles`, {
          method: 'PUT',
          body: JSON.stringify({ roleIds: values.getAll('roleId') }),
        });
      setMessage('Đã lưu thay đổi.');
      await onDone();
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  if (tab === 'account')
    return (
      <form className="grid gap-4" onSubmit={submit}>
        <h2 className="text-lg font-semibold">Sửa tài khoản</h2>
        <label>
          Tên hiển thị
          <input defaultValue={user.displayName} name="displayName" required />
        </label>
        <label>
          Email đăng nhập (không thể thay đổi)
          <input defaultValue={user.email} disabled readOnly />
        </label>
        <label>
          Điện thoại
          <input defaultValue={user.phone} name="phone" />
        </label>
        <Save />
      </form>
    );
  if (tab === 'membership')
    return (
      <form className="grid gap-4" onSubmit={submit}>
        <h2 className="text-lg font-semibold">Sửa thành viên tổ chức</h2>
        <label>
          Trạng thái
          <select
            defaultValue={user.organizationMembers[0]?.status}
            name="status"
          >
            <option value="active">Hoạt động</option>
            <option value="disabled">Vô hiệu</option>
          </select>
        </label>
        <label>
          Phạm vi
          <select
            defaultValue={user.organizationMembers[0]?.administrationScope}
            disabled={actor.administrationScope !== 'ORGANIZATION'}
            name="administrationScope"
          >
            <option value="SELF">Bản thân</option>
            <option value="MANAGED_DEPARTMENTS">Phòng ban quản lý</option>
            <option value="ORGANIZATION">Toàn tổ chức</option>
          </select>
        </label>
        <Save />
      </form>
    );
  if (tab === 'departments')
    return (
      <form onSubmit={submit}>
        <h2 className="text-lg font-semibold">Sửa phòng ban</h2>
        <fieldset className="mt-4 grid gap-3">
          {catalog.departments.map((department) => (
            <label
              className="flex grid-cols-none items-center gap-2"
              key={department.id}
            >
              <input
                defaultChecked={user.departmentMembers.some(
                  ({ departmentId }) => departmentId === department.id,
                )}
                name="departmentId"
                type="checkbox"
                value={department.id}
              />
              {department.name}
              <input
                aria-label={`Phòng chính ${department.name}`}
                defaultChecked={user.departmentMembers.some(
                  ({ departmentId, isPrimary }) =>
                    departmentId === department.id && isPrimary,
                )}
                name="primary"
                type="radio"
                value={department.id}
              />
            </label>
          ))}
        </fieldset>
        <Save />
      </form>
    );
  if (tab === 'roles')
    return (
      <form onSubmit={submit}>
        <h2 className="text-lg font-semibold">Sửa vai trò</h2>
        <fieldset className="mt-4 grid gap-3">
          {catalog.roles
            .filter(
              (role) =>
                role.isDelegable &&
                !role.isProtected &&
                role.administrationTier < actor.administrationTier &&
                role.permissions.every(({ permission }) =>
                  actor.permissions.includes(permission.code),
                ),
            )
            .map((role) => (
              <label
                className="flex grid-cols-none items-center gap-2"
                key={role.id}
              >
                <input
                  defaultChecked={user.roles.some(
                    ({ roleId }) => roleId === role.id,
                  )}
                  name="roleId"
                  type="checkbox"
                  value={role.id}
                />
                {role.name}
              </label>
            ))}
        </fieldset>
        <Save />
      </form>
    );
  return <p>Chọn một phần có thể chỉnh sửa.</p>;
}
function Save() {
  return (
    <div className="sticky bottom-0 mt-5 flex justify-end border-t bg-white pt-4">
      <button className="primary" type="submit">
        Lưu thay đổi
      </button>
    </div>
  );
}
