'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';

type Department = {
  id: string;
  code: string;
  name: string;
  description?: string;
  status: string;
};

export default function DepartmentsPage() {
  const [items, setItems] = useState<Department[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [message, setMessage] = useState('Đang tải…');
  const load = useCallback(
    () =>
      Promise.all([
        api<{ items: Department[] }>('/departments?pageSize=100'),
        api<{ permissions: string[] }>('/me/permissions'),
      ])
        .then(([data, current]) => {
          setItems(data.items);
          setPermissions(current.permissions);
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
      await api('/departments', {
        method: 'POST',
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      form.reset();
      await load();
      setMessage('Đã tạo phòng ban.');
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  async function archive(id: string) {
    if (!confirm('Lưu trữ phòng ban này?')) return;
    try {
      await api(`/departments/${id}/archive`, { method: 'POST' });
      await load();
      setMessage('Đã lưu trữ phòng ban.');
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  async function edit(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    try {
      await api(`/departments/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(
          Object.fromEntries(new FormData(event.currentTarget)),
        ),
      });
      await load();
      setMessage('Đã cập nhật phòng ban.');
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
      <div className="panel overflow-x-auto">
        <h2 className="text-xl font-semibold">Phòng ban</h2>
        {!items.length && !message ? (
          <p className="mt-4">Chưa có phòng ban.</p>
        ) : (
          <table className="mt-4">
            <thead>
              <tr>
                <th>Mã</th>
                <th>Tên</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.code}</td>
                  <td>
                    {permissions.includes('department.update') ? (
                      <form
                        className="flex gap-2"
                        onSubmit={(event) => void edit(event, item.id)}
                      >
                        <label
                          className="sr-only"
                          htmlFor={`department-${item.id}`}
                        >
                          Tên phòng ban
                        </label>
                        <input
                          defaultValue={item.name}
                          id={`department-${item.id}`}
                          name="name"
                          required
                        />
                        <button type="submit">Lưu</button>
                      </form>
                    ) : (
                      item.name
                    )}
                  </td>
                  <td>
                    {item.status === 'active' ? 'Hoạt động' : 'Đã lưu trữ'}
                  </td>
                  <td>
                    {item.status === 'active' &&
                      permissions.includes('department.archive') && (
                        <button onClick={() => void archive(item.id)}>
                          Lưu trữ
                        </button>
                      )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-4" role="status">
          {message}
        </p>
      </div>
      {permissions.includes('department.create') && (
        <form className="panel grid content-start gap-4" onSubmit={create}>
          <h2 className="text-xl font-semibold">Thêm phòng ban</h2>
          <label>
            Mã
            <input name="code" pattern="[A-Za-z0-9_-]+" required />
          </label>
          <label>
            Tên
            <input name="name" required />
          </label>
          <label>
            Mô tả
            <textarea name="description" />
          </label>
          <button className="primary" type="submit">
            Tạo phòng ban
          </button>
        </form>
      )}
    </div>
  );
}
