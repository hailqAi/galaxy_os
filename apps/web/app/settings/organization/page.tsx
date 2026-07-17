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
  useEffect(() => {
    Promise.all([
      api<Organization>('/organization'),
      api<{ permissions: string[] }>('/me/permissions'),
    ])
      .then(([data, actor]) => {
        setOrganization(data);
        setCanEdit(actor.permissions.includes('organization.update'));
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
    <div className="panel max-w-2xl">
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
  );
}
