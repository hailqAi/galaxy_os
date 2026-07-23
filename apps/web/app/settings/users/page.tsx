'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Actor, api } from '../../lib/api';

type Summary = {
  userId: string;
  username: string;
  displayName: string;
  email: string;
  status: 'invited' | 'active' | 'disabled';
  membershipStatus: 'active' | 'disabled' | null;
  roles: { id: string; name: string }[];
  departments: { id: string; name: string; isPrimary: boolean }[];
  mustChangePassword: boolean;
  locked: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  actions: string[];
};
type Page = { items: Summary[]; total: number; page: number; pageSize: number };
type Capability = {
  key: string;
  name: string;
  module: string;
  sourceRoles: { id: string; name: string }[];
  scope: Actor['administrationScope'];
  managedDepartments: string[];
  delegableByActor: boolean;
};
const optionalColumns = [
  'department',
  'status',
  'lastLogin',
  'membership',
  'createdAt',
] as const;
type OptionalColumn = (typeof optionalColumns)[number];

export default function UsersPage() {
  const router = useRouter();
  const pathname = usePathname();
  const query = useSearchParams();
  const [actor, setActor] = useState<Actor | null>(null);
  const [data, setData] = useState<Page | null>(null);
  const [catalog, setCatalog] = useState<{
    departments: { id: string; name: string }[];
    roles: { id: string; name: string }[];
  }>({ departments: [], roles: [] });
  const [search, setSearch] = useState(query.get('search') ?? '');
  const [columns, setColumns] = useState<OptionalColumn[]>([]);
  const [drawer, setDrawer] = useState<{
    user: Summary;
    capabilities?: Capability[];
  } | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const params = useMemo(() => {
    const value = new URLSearchParams(query.toString());
    if (!value.has('pageSize')) value.set('pageSize', '25');
    return value;
  }, [query]);
  const update = useCallback(
    (values: Record<string, string | null>, firstPage = false) => {
      const next = new URLSearchParams(query.toString());
      for (const [key, value] of Object.entries(values)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      if (firstPage) next.set('page', '1');
      router.replace(`${pathname}?${next}`);
    },
    [pathname, query, router],
  );
  const load = useCallback(async () => {
    setLoading(true);
    setMessage('');
    try {
      const current = await api<Actor>('/me');
      const page = await api<Page>(`/users?${params}`);
      const [departments, roles] = await Promise.all([
        current.permissions.includes('department.read')
          ? api<{ items: { id: string; name: string }[] }>(
              '/departments?pageSize=100',
            )
          : Promise.resolve({ items: [] }),
        current.permissions.includes('role.read')
          ? api<{ items: { id: string; name: string }[] }>(
              '/roles?pageSize=100',
            )
          : Promise.resolve({ items: [] }),
      ]);
      setActor(current);
      setData(page);
      setCatalog({
        departments:
          current.administrationScope === 'MANAGED_DEPARTMENTS'
            ? departments.items.filter(({ id }) =>
                current.managedDepartmentIds.includes(id),
              )
            : departments.items,
        roles: roles.items,
      });
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  }, [params]);
  useEffect(() => {
    const timeout = setTimeout(() => void load(), 0);
    return () => clearTimeout(timeout);
  }, [load]);
  useEffect(() => {
    const timer = setTimeout(() => {
      const normalized = search.trim();
      if (normalized !== (query.get('search') ?? ''))
        update({ search: normalized || null }, true);
    }, 350);
    return () => clearTimeout(timer);
  }, [query, search, update]);
  async function action(
    user: Summary,
    kind: 'disable' | 'reactivate' | 'reset',
  ) {
    const prompt =
      kind === 'disable'
        ? `Vô hiệu hóa ${user.displayName}? Các phiên đang hoạt động sẽ bị thu hồi.`
        : kind === 'reset'
          ? `Gửi hướng dẫn đặt lại mật khẩu tới ${user.email}? Mật khẩu hiện tại sẽ không được hiển thị.`
          : `Kích hoạt lại ${user.displayName}?`;
    if (!confirm(prompt)) return;
    try {
      await api(
        kind === 'reset'
          ? `/auth/users/${user.userId}/send-reset-email`
          : `/users/${user.userId}/${kind}`,
        { method: 'POST' },
      );
      setMessage(
        kind === 'reset'
          ? 'Yêu cầu đặt lại mật khẩu đã được chấp nhận.'
          : 'Đã cập nhật người dùng.',
      );
      await load();
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  async function openCapabilities(user: Summary) {
    setDrawer({ user });
    try {
      const result = await api<{ capabilities: Capability[] }>(
        `/users/${user.userId}/capabilities`,
      );
      setDrawer({ user, capabilities: result.capabilities });
    } catch (error) {
      setMessage((error as Error).message);
      setDrawer(null);
    }
  }
  const scope =
    actor?.administrationScope === 'ORGANIZATION'
      ? 'Toàn bộ tổ chức'
      : actor?.departments
          .filter(({ id }) => actor.managedDepartmentIds.includes(id))
          .map(({ name }) => name)
          .join(', ') || 'Phòng ban được giao';
  const status = query.get('locked')
    ? 'locked'
    : query.get('mustChangePassword')
      ? 'password'
      : (query.get('status') ?? '');
  const pages = Math.max(
    1,
    Math.ceil((data?.total ?? 0) / Number(params.get('pageSize'))),
  );

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-baseline gap-3">
            <h1 className="text-2xl font-semibold">Người dùng</h1>
            <span className="text-sm text-black/55">
              {data?.total ?? 0} người
            </span>
          </div>
          <p className="mt-1 text-sm text-black/60">Phạm vi quản lý: {scope}</p>
        </div>
        <div className="flex gap-2">
          <button aria-label="Làm mới danh sách" onClick={() => void load()}>
            Làm mới
          </button>
          {actor?.permissions.includes('user.create') &&
            actor.administrationScope === 'ORGANIZATION' && (
              <Link
                className="primary rounded px-4 py-2"
                href="/settings/users/new"
              >
                Thêm người dùng
              </Link>
            )}
        </div>
      </header>
      <nav aria-label="Lọc trạng thái" className="flex flex-wrap gap-2">
        {[
          ['', 'Tất cả'],
          ['active', 'Đang hoạt động'],
          ['disabled', 'Đã vô hiệu hóa'],
          ['locked', 'Bị khóa'],
          ['password', 'Chờ đổi mật khẩu'],
        ].map(([value, label]) => (
          <button
            aria-pressed={status === value}
            className={status === value ? 'bg-ink text-white' : 'bg-white'}
            key={value}
            onClick={() =>
              update(
                value === 'locked'
                  ? { status: null, locked: 'true', mustChangePassword: null }
                  : value === 'password'
                    ? { status: null, locked: null, mustChangePassword: 'true' }
                    : {
                        status: value || null,
                        locked: null,
                        mustChangePassword: null,
                      },
                true,
              )
            }
          >
            {label}
          </button>
        ))}
      </nav>
      <section className="panel !p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-64 flex-1">
            Tìm kiếm
            <input
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Tên hoặc email"
              type="search"
              value={search}
            />
          </label>
          <Filter
            label="Phòng ban"
            name="departmentId"
            options={catalog.departments}
            query={query}
            update={update}
          />
          <Filter
            label="Vai trò"
            name="roleId"
            options={catalog.roles}
            query={query}
            update={update}
          />
          <label>
            Thành viên
            <select
              onChange={(event) =>
                update({ membershipStatus: event.target.value || null }, true)
              }
              value={query.get('membershipStatus') ?? ''}
            >
              <option value="">Tất cả</option>
              <option value="active">Hoạt động</option>
              <option value="disabled">Vô hiệu</option>
            </select>
          </label>
          <details className="relative">
            <summary className="cursor-pointer rounded border border-black/20 px-3 py-2 text-sm">
              Cột hiển thị
            </summary>
            <fieldset className="absolute right-0 z-10 mt-2 grid min-w-52 gap-2 rounded border bg-white p-3 shadow-lg">
              <legend className="sr-only">Cột tùy chọn</legend>
              {optionalColumns.map((column) => (
                <label
                  className="flex grid-cols-none items-center gap-2"
                  key={column}
                >
                  <input
                    checked={columns.includes(column)}
                    onChange={() =>
                      setColumns((current) =>
                        current.includes(column)
                          ? current.filter((item) => item !== column)
                          : [...current, column],
                      )
                    }
                    type="checkbox"
                  />
                  {
                    {
                      department: 'Phòng ban',
                      status: 'Trạng thái',
                      lastLogin: 'Đăng nhập gần nhất',
                      membership: 'Tư cách thành viên',
                      createdAt: 'Ngày tạo',
                    }[column]
                  }
                </label>
              ))}
            </fieldset>
          </details>
        </div>
      </section>
      {message && (
        <p
          className="rounded border border-amber-200 bg-amber-50 p-3"
          role="status"
        >
          {message}
        </p>
      )}
      {loading ? (
        <div aria-label="Đang tải người dùng" className="panel animate-pulse">
          <div className="h-5 bg-black/10" />
          <div className="mt-5 h-12 bg-black/5" />
          <div className="mt-2 h-12 bg-black/5" />
        </div>
      ) : !data?.items.length ? (
        <div className="panel text-center">
          <h2 className="font-semibold">Không có người dùng phù hợp</h2>
          <p className="mt-1 text-sm text-black/60">
            Hãy thay đổi tìm kiếm hoặc bộ lọc hiện tại.
          </p>
        </div>
      ) : (
        <UserTable
          columns={columns}
          items={data.items}
          onAction={action}
          onCapabilities={openCapabilities}
          onSort={(sort) =>
            update(
              {
                sort,
                direction:
                  query.get('sort') === sort &&
                  query.get('direction') !== 'desc'
                    ? 'desc'
                    : 'asc',
              },
              true,
            )
          }
        />
      )}
      <footer className="flex items-center justify-between text-sm">
        <label className="flex grid-cols-none items-center gap-2">
          Số dòng
          <select
            onChange={(event) => update({ pageSize: event.target.value }, true)}
            value={params.get('pageSize') ?? '25'}
          >
            <option>25</option>
            <option>50</option>
            <option>100</option>
          </select>
        </label>
        <div className="flex items-center gap-2">
          <button
            disabled={(data?.page ?? 1) <= 1}
            onClick={() => update({ page: String((data?.page ?? 1) - 1) })}
          >
            Trước
          </button>
          <span>
            Trang {data?.page ?? 1} / {pages}
          </span>
          <button
            disabled={(data?.page ?? 1) >= pages}
            onClick={() => update({ page: String((data?.page ?? 1) + 1) })}
          >
            Sau
          </button>
        </div>
      </footer>
      {drawer && (
        <CapabilitiesDrawer data={drawer} onClose={() => setDrawer(null)} />
      )}
    </div>
  );
}

function Filter({
  label,
  name,
  options,
  query,
  update,
}: {
  label: string;
  name: string;
  options: { id: string; name: string }[];
  query: URLSearchParams;
  update: (values: Record<string, string | null>, firstPage?: boolean) => void;
}) {
  return (
    <label>
      {label}
      <select
        onChange={(event) =>
          update({ [name]: event.target.value || null }, true)
        }
        value={query.get(name) ?? ''}
      >
        <option value="">Tất cả</option>
        {options.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function Sort({
  children,
  name,
  onSort,
}: {
  children: React.ReactNode;
  name: string;
  onSort: (name: string) => void;
}) {
  return (
    <button
      className="border-0 p-0 font-semibold"
      onClick={() => onSort(name)}
      type="button"
    >
      {children} ↕
    </button>
  );
}

function UserTable({
  items,
  columns,
  onAction,
  onCapabilities,
  onSort,
}: {
  items: Summary[];
  columns: OptionalColumn[];
  onAction: (user: Summary, kind: 'disable' | 'reactivate' | 'reset') => void;
  onCapabilities: (user: Summary) => void;
  onSort: (sort: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-black/10 bg-white">
      <table>
        <thead className="sticky top-0 bg-stone-50">
          <tr>
            <th>
              <Sort name="email" onSort={onSort}>
                Username
              </Sort>
            </th>
            <th>
              <Sort name="displayName" onSort={onSort}>
                Tên
              </Sort>
            </th>
            <th>
              <Sort name="email" onSort={onSort}>
                Email
              </Sort>
            </th>
            <th>
              <Sort name="role" onSort={onSort}>
                Vai trò
              </Sort>
            </th>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((user) => (
            <tr className="group" key={user.userId}>
              <td>
                <div className="flex gap-3">
                  <span
                    aria-hidden
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brass/15 font-semibold text-brass"
                  >
                    {user.displayName.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <Link
                      className="font-semibold text-ink"
                      href={`/settings/users/${user.userId}`}
                    >
                      {user.username}
                    </Link>
                    <span
                      className={`ml-2 inline-block h-2 w-2 rounded-full ${user.status === 'active' ? 'bg-emerald-500' : 'bg-stone-400'}`}
                    >
                      <span className="sr-only">{user.status}</span>
                    </span>
                    <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-black/55 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                      <RowActions
                        user={user}
                        onAction={onAction}
                        onCapabilities={onCapabilities}
                      />
                    </div>
                  </div>
                </div>
              </td>
              <td>{user.displayName || user.username}</td>
              <td>
                <span className="block max-w-64 truncate" title={user.email}>
                  {user.email}
                </span>
              </td>
              <td>
                <div className="flex flex-wrap gap-1">
                  {user.roles.slice(0, 2).map((role) => (
                    <span
                      className="rounded-full bg-indigo-50 px-2 py-1 text-xs text-indigo-800"
                      key={role.id}
                    >
                      {role.name}
                    </span>
                  ))}
                  {user.roles.length > 2 && (
                    <span className="text-xs">+{user.roles.length - 2}</span>
                  )}
                </div>
              </td>
              {columns.map((column) => (
                <td key={column}>
                  {column === 'department'
                    ? (user.departments.find(({ isPrimary }) => isPrimary)
                        ?.name ?? '—')
                    : column === 'status'
                      ? user.locked
                        ? 'Bị khóa'
                        : user.mustChangePassword
                          ? 'Chờ đổi mật khẩu'
                          : user.status
                      : column === 'lastLogin'
                        ? user.lastLoginAt
                          ? new Date(user.lastLoginAt).toLocaleString('vi-VN')
                          : 'Chưa có'
                        : column === 'membership'
                          ? (user.membershipStatus ?? '—')
                          : new Date(user.createdAt).toLocaleDateString(
                              'vi-VN',
                            )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RowActions({
  user,
  onAction,
  onCapabilities,
}: {
  user: Summary;
  onAction: (user: Summary, kind: 'disable' | 'reactivate' | 'reset') => void;
  onCapabilities: (user: Summary) => void;
}) {
  return (
    <>
      {user.actions.includes('update') && (
        <Link href={`/settings/users/${user.userId}/edit`}>Sửa</Link>
      )}
      {user.status !== 'disabled' && user.actions.includes('disable') && (
        <button
          className="border-0 p-0 text-red-700"
          onClick={() => onAction(user, 'disable')}
        >
          Vô hiệu hóa
        </button>
      )}
      {user.status === 'disabled' && user.actions.includes('reactivate') && (
        <button
          className="border-0 p-0"
          onClick={() => onAction(user, 'reactivate')}
        >
          Kích hoạt
        </button>
      )}
      {user.actions.includes('view') && (
        <Link href={`/settings/users/${user.userId}`}>Xem</Link>
      )}
      {user.actions.includes('resetPassword') && (
        <button
          className="border-0 p-0"
          onClick={() => onAction(user, 'reset')}
        >
          Đặt lại mật khẩu
        </button>
      )}
      {user.actions.includes('capabilities') && (
        <button className="border-0 p-0" onClick={() => onCapabilities(user)}>
          Quyền hạn
        </button>
      )}
    </>
  );
}

function CapabilitiesDrawer({
  data,
  onClose,
}: {
  data: { user: Summary; capabilities?: Capability[] };
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const shown = data.capabilities?.filter(({ key, name }) =>
    `${key} ${name}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div
      aria-label={`Quyền hạn của ${data.user.displayName}`}
      aria-modal="true"
      className="fixed inset-0 z-40 bg-black/30"
      role="dialog"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside className="ml-auto flex h-full w-full max-w-xl flex-col bg-white shadow-2xl">
        <header className="border-b p-5">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-semibold">{data.user.displayName}</h2>
              <p className="text-sm text-black/60">{data.user.username}</p>
            </div>
            <button autoFocus aria-label="Đóng" onClick={onClose}>
              ×
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-1">
            {data.user.roles.map((role) => (
              <span
                className="rounded-full bg-indigo-50 px-2 py-1 text-xs"
                key={role.id}
              >
                {role.name}
              </span>
            ))}
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-5">
          <label>
            Tìm quyền
            <input
              onChange={(event) => setSearch(event.target.value)}
              type="search"
              value={search}
            />
          </label>
          {!shown ? (
            <p className="mt-5">Đang tải…</p>
          ) : (
            <ul className="mt-5 grid gap-3">
              {shown.map((item) => (
                <li className="rounded border p-3" key={item.key}>
                  <div className="flex justify-between gap-2">
                    <code>{item.key}</code>
                    <span className="text-xs uppercase text-black/50">
                      {item.module}
                    </span>
                  </div>
                  <p className="mt-1 text-sm">
                    Cấp bởi:{' '}
                    {item.sourceRoles.map(({ name }) => name).join(', ')}
                  </p>
                  <p className="text-xs text-black/55">
                    Phạm vi: {item.scope} ·{' '}
                    {item.delegableByActor ? 'Có thể ủy quyền' : 'Chỉ đọc'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
        <footer className="flex justify-end gap-2 border-t p-4">
          <Link href={`/settings/users/${data.user.userId}`}>Xem đầy đủ</Link>
          <button onClick={onClose}>Đóng</button>
        </footer>
      </aside>
    </div>
  );
}
