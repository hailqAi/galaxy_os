'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '../../lib/api';

type Organization = {
  name: string;
  slug: string;
  timezone: string;
  defaultCurrency: string;
  status: string;
};

export default function OrganizationPage() {
  const [organization, setOrganization] = useState<Organization>();
  const [canEdit, setCanEdit] = useState(false);
  const [message, setMessage] = useState('Đang tải…');
  const [canEditSettings, setCanEditSettings] = useState(false);
  useEffect(() => {
    Promise.all([
      api<Organization>('/organization'),
      api<{ permissions: string[] }>('/me/permissions'),
    ])
      .then(([data, actor]) => {
        setOrganization(data);
        setCanEdit(actor.permissions.includes('organization.update'));
        setCanEditSettings(
          actor.permissions.includes('organization.settings.update'),
        );
        setMessage('');
      })
      .catch((error: Error) => setMessage(error.message));
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      setOrganization(
        await api('/organization', {
          method: 'PATCH',
          body: JSON.stringify(values),
        }),
      );
      setMessage('Đã lưu thông tin tổ chức.');
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  if (!organization) return <p role="status">{message}</p>;
  return (
    <div className="grid max-w-2xl gap-5">
      <div className="panel">
        <h2 className="text-xl font-semibold">Thông tin tổ chức</h2>
        <form className="mt-5 grid gap-4" onSubmit={submit}>
          <label>
            Tên tổ chức
            <input
              defaultValue={organization.name}
              disabled={!canEdit}
              name="name"
              required
            />
          </label>
          <label>
            Mã tổ chức
            <input defaultValue={organization.slug} disabled readOnly />
          </label>
          <label>
            Múi giờ
            <input
              defaultValue={organization.timezone}
              disabled={!canEdit}
              name="timezone"
              required
            />
          </label>
          <label>
            Tiền tệ mặc định
            <input
              defaultValue={organization.defaultCurrency}
              disabled={!canEdit}
              maxLength={3}
              minLength={3}
              name="defaultCurrency"
              pattern="[A-Z]{3}"
              required
            />
          </label>
          {canEdit && (
            <button className="primary" type="submit">
              Lưu thay đổi
            </button>
          )}
        </form>
        {message && (
          <p className="mt-4" role="status">
            {message}
          </p>
        )}
      </div>
      {canEditSettings && (
        <form
          className="panel grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            void api('/organization/settings', {
              method: 'PUT',
              body: JSON.stringify({
                key: data.get('key'),
                value: data.get('value'),
              }),
            })
              .then(() => setMessage('Đã lưu cấu hình tổ chức.'))
              .catch((error: Error) => setMessage(error.message));
          }}
        >
          <h2 className="text-xl font-semibold">Cấu hình tổ chức</h2>
          <label>
            Thiết lập
            <select name="key">
              <option>profile.logoUrl</option>
              <option>profile.contact</option>
              <option>structure.defaultDepartmentId</option>
              <option>users.display</option>
              <option>notifications.local</option>
            </select>
          </label>
          <label>
            Giá trị
            <input name="value" required />
          </label>
          <button className="primary">Lưu cấu hình</button>
        </form>
      )}
    </div>
  );
}
