'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '../../lib/api';

type Field = {
  id: string;
  scope: string;
  entityType: string;
  key: string;
  label: string;
  dataType: string;
  required: boolean;
  status: string;
};

export default function CustomFieldsPage() {
  const [items, setItems] = useState<Field[]>([]);
  const [message, setMessage] = useState('Đang tải…');
  const load = () =>
    api<Field[]>('/custom-fields')
      .then(setItems)
      .then(() => setMessage(''))
      .catch((error: Error) => setMessage(error.message));
  useEffect(() => {
    void load();
  }, []);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    await api('/custom-fields', {
      method: 'POST',
      body: JSON.stringify({ ...data, required: data.required === 'on' }),
    })
      .then(() => {
        form.reset();
        return load();
      })
      .catch((error: Error) => setMessage(error.message));
  }
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
      <section className="panel overflow-x-auto">
        <h1 className="text-2xl font-semibold">Trường tùy chỉnh</h1>
        <p role="status">{message}</p>
        <table className="mt-4">
          <thead>
            <tr>
              <th>Nhãn</th>
              <th>Đối tượng</th>
              <th>Kiểu</th>
              <th>Phạm vi</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {items.map((field) => (
              <tr key={field.id}>
                <td>
                  {field.label}
                  <br />
                  <small>{field.key}</small>
                </td>
                <td>{field.entityType}</td>
                <td>{field.dataType}</td>
                <td>{field.scope}</td>
                <td>{field.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <form className="panel grid content-start gap-3" onSubmit={create}>
        <h2 className="text-xl font-semibold">Thêm trường</h2>
        <label>
          Phạm vi
          <select name="scope">
            <option>ORGANIZATION</option>
            <option>SYSTEM</option>
          </select>
        </label>
        <label>
          Đối tượng
          <select name="entityType">
            {['USER', 'ORGANIZATION_MEMBER', 'DEPARTMENT', 'ROLE'].map(
              (value) => (
                <option key={value}>{value}</option>
              ),
            )}
          </select>
        </label>
        <label>
          Khóa
          <input name="key" pattern="[a-z][a-z0-9_]*" required />
        </label>
        <label>
          Nhãn
          <input name="label" required />
        </label>
        <label>
          Kiểu
          <select name="dataType">
            {[
              'TEXT',
              'LONG_TEXT',
              'NUMBER',
              'BOOLEAN',
              'DATE',
              'DATETIME',
              'SINGLE_SELECT',
              'MULTI_SELECT',
              'EMAIL',
              'PHONE',
              'URL',
            ].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label className="flex grid-cols-none items-center gap-2">
          <input name="required" type="checkbox" />
          Bắt buộc
        </label>
        <button className="primary">Tạo trường</button>
      </form>
    </div>
  );
}
