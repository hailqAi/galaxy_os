'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '../../lib/api';

type Setting = {
  id: string;
  key: string;
  value: unknown;
  isDelegable: boolean;
};
type Organization = {
  id: string;
  name: string;
  slug: string;
  status: string;
  _count: { memberships: number; departments: number };
};

export default function SystemSettingsPage() {
  const [items, setItems] = useState<Setting[]>([]);
  const [message, setMessage] = useState('Đang tải…');
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const load = () =>
    Promise.all([
      api<Setting[]>('/system/settings'),
      api<Organization[]>('/system/organizations'),
    ])
      .then(([settings, orgs]) => {
        setItems(settings);
        setOrganizations(orgs);
        setMessage('');
      })
      .catch((error: Error) => setMessage(error.message));
  useEffect(() => {
    void load();
  }, []);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const raw = String(data.get('value'));
    let value: unknown = raw;
    try {
      value = JSON.parse(raw);
    } catch {}
    await api('/system/settings', {
      method: 'PUT',
      body: JSON.stringify({ key: data.get('key'), value }),
    })
      .then(load)
      .catch((error: Error) => setMessage(error.message));
  }
  return (
    <div className="grid gap-5">
      <section className="panel">
        <h1 className="text-2xl font-semibold">Cấu hình hệ thống</h1>
        <p className="mt-2 text-sm text-black/60">
          Chỉ System Administrator. Bí mật SMTP, token và khóa ký không được lưu
          ở đây.
        </p>
        <p role="status">{message}</p>
      </section>
      <form className="panel grid gap-3" onSubmit={save}>
        <label>
          Thiết lập
          <select name="key">
            {[
              'authentication.passwordPolicy',
              'authentication.sessionLifetimeHours',
              'features.organizationProvisioning',
              'uploads.maximumBytes',
              'audit.retentionDays',
            ].map((key) => (
              <option key={key}>{key}</option>
            ))}
          </select>
        </label>
        <label>
          Giá trị JSON hoặc văn bản
          <input name="value" required />
        </label>
        <button className="primary">Lưu</button>
      </form>
      <section className="panel">
        {items.map((item) => (
          <p key={item.id}>
            <strong>{item.key}</strong>: {JSON.stringify(item.value)}
          </p>
        ))}
      </section>
      <section className="panel overflow-x-auto">
        <h2 className="text-xl font-semibold">Tổ chức trên hệ thống</h2>
        <table className="mt-3">
          <thead>
            <tr>
              <th>Tên</th>
              <th>Mã</th>
              <th>Người dùng</th>
              <th>Đơn vị</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {organizations.map((item) => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td>{item.slug}</td>
                <td>{item._count.memberships}</td>
                <td>{item._count.departments}</td>
                <td>{item.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
