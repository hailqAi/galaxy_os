'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';

type Customer = {
  id: string;
  displayName: string;
  type: 'INDIVIDUAL' | 'COMPANY';
  phone: string | null;
  email: string | null;
  status: string;
  updatedAt: string;
  owner: { displayName: string } | null;
  _count: { contacts: number };
};
type Page = {
  items: Customer[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export default function CustomersPage() {
  const [data, setData] = useState<Page>();
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const load = useCallback(async () => {
    setMessage('');
    try {
      setData(
        await api<Page>(
          `/customers?${new URLSearchParams({ page: String(page), pageSize: '20', ...(search && { search }), ...(type && { type }), ...(status && { status }) })}`,
        ),
      );
    } catch (error) {
      setMessage((error as Error).message);
    }
  }, [page, search, status, type]);
  useEffect(() => {
    const timeout = setTimeout(() => void load(), 0);
    return () => clearTimeout(timeout);
  }, [load]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    try {
      await api('/customers', { method: 'POST', body: JSON.stringify(values) });
      form.reset();
      setOpen(false);
      setMessage('Đã tạo khách hàng.');
      await load();
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  return (
    <div className="grid gap-5">
      <p className="text-sm text-black/55">Trang chủ / Khách hàng</p>
      <header className="flex flex-wrap justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Khách hàng</h1>
          <p className="text-sm text-black/60">
            Quản lý khách hàng cá nhân và doanh nghiệp
          </p>
        </div>
        <button className="primary" onClick={() => setOpen(true)}>
          + Thêm khách hàng
        </button>
      </header>
      <section className="grid gap-3 sm:grid-cols-3">
        {[
          ['Tổng khách hàng', data?.total ?? 0],
          [
            'Doanh nghiệp',
            data?.items.filter((item) => item.type === 'COMPANY').length ?? 0,
          ],
          [
            'Cá nhân',
            data?.items.filter((item) => item.type === 'INDIVIDUAL').length ??
              0,
          ],
        ].map(([label, value]) => (
          <div className="panel" key={label}>
            <p className="text-sm text-black/55">{label}</p>
            <strong className="text-2xl">{value}</strong>
          </div>
        ))}
      </section>
      <section className="panel grid gap-4">
        <div className="flex flex-wrap gap-3">
          <input
            aria-label="Tìm kiếm"
            placeholder="Tìm tên, điện thoại, email…"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
          <select
            aria-label="Loại khách hàng"
            value={type}
            onChange={(event) => setType(event.target.value)}
          >
            <option value="">Tất cả loại</option>
            <option value="COMPANY">Doanh nghiệp</option>
            <option value="INDIVIDUAL">Cá nhân</option>
          </select>
          <select
            aria-label="Trạng thái"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">Tất cả trạng thái</option>
            <option value="ACTIVE">Hoạt động</option>
            <option value="INACTIVE">Tạm ngưng</option>
          </select>
        </div>
        {message && <p role="alert">{message}</p>}
        {!data ? (
          <p role="status">Đang tải khách hàng…</p>
        ) : data.items.length === 0 ? (
          <p>Chưa có khách hàng phù hợp.</p>
        ) : (
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Tên khách hàng</th>
                  <th>Loại</th>
                  <th>Điện thoại</th>
                  <th>Email</th>
                  <th>Người phụ trách</th>
                  <th>Liên hệ</th>
                  <th>Cập nhật</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <Link
                        className="underline"
                        href={`/customers/${item.id}`}
                      >
                        {item.displayName}
                      </Link>
                    </td>
                    <td>
                      {item.type === 'COMPANY' ? 'Doanh nghiệp' : 'Cá nhân'}
                    </td>
                    <td>{item.phone ?? '—'}</td>
                    <td>{item.email ?? '—'}</td>
                    <td>{item.owner?.displayName ?? '—'}</td>
                    <td>{item._count.contacts}</td>
                    <td>
                      {new Date(item.updatedAt).toLocaleDateString('vi-VN')}
                    </td>
                    <td>{item.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Trước
          </button>
          <span className="px-3 py-2">
            {page}/{data?.totalPages || 1}
          </span>
          <button
            disabled={!data || page >= data.totalPages}
            onClick={() => setPage(page + 1)}
          >
            Sau
          </button>
        </div>
      </section>
      {open && (
        <div
          className="fixed inset-0 grid place-items-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Thêm khách hàng"
        >
          <form
            className="panel grid w-full max-w-xl gap-3"
            onSubmit={(event) => void create(event)}
          >
            <h2 className="text-xl font-semibold">Thêm khách hàng</h2>
            <label>
              Tên khách hàng
              <input name="displayName" required maxLength={200} />
            </label>
            <label>
              Loại
              <select name="type" required>
                <option value="COMPANY">Doanh nghiệp</option>
                <option value="INDIVIDUAL">Cá nhân</option>
              </select>
            </label>
            <label>
              Điện thoại
              <input name="phone" minLength={5} maxLength={30} />
            </label>
            <label>
              Email
              <input name="email" type="email" />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)}>
                Hủy
              </button>
              <button className="primary" type="submit">
                Tạo khách hàng
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
