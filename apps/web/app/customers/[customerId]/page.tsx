'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '../../lib/api';
import { EntityFiles } from '../../entity-files';
import { EntityComments } from '../../entity-comments';
import { EntityActivity } from '../../entity-activity';

type Contact = {
  id: string;
  displayName: string;
  jobTitle: string | null;
  phone: string | null;
  email: string | null;
  isPrimary: boolean;
};
type Customer = {
  id: string;
  displayName: string;
  type: string;
  status: string;
  phone: string | null;
  email: string | null;
  billingAddress: string | null;
  projectAddress: string | null;
  notes: string | null;
  owner: { displayName: string } | null;
  contacts: Contact[];
};

export default function CustomerDetailPage() {
  const id = String(useParams().customerId);
  const [customer, setCustomer] = useState<Customer>();
  const [message, setMessage] = useState('');
  const load = useCallback(
    () =>
      api<Customer>(`/customers/${id}`)
        .then(setCustomer)
        .catch((error: Error) => setMessage(error.message)),
    [id],
  );
  useEffect(() => {
    void load();
  }, [load]);
  async function addContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    try {
      await api(`/customers/${id}/contacts`, {
        method: 'POST',
        body: JSON.stringify({
          ...values,
          isPrimary: values.isPrimary === 'on',
        }),
      });
      form.reset();
      await load();
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  if (message && !customer) return <p role="alert">{message}</p>;
  if (!customer) return <p role="status">Đang tải khách hàng…</p>;
  return (
    <div className="grid gap-5">
      <p className="text-sm">
        <Link href="/customers">Khách hàng</Link> / {customer.displayName}
      </p>
      <header className="flex flex-wrap justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{customer.displayName}</h1>
          <p>
            {customer.type} · {customer.status} ·{' '}
            {customer.owner?.displayName ?? 'Chưa gán'}
          </p>
        </div>
        <button>Chỉnh sửa</button>
      </header>
      <section className="panel">
        <h2 className="font-semibold">Tổng quan</h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <dt>Điện thoại</dt>
            <dd>{customer.phone ?? '—'}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{customer.email ?? '—'}</dd>
          </div>
          <div>
            <dt>Địa chỉ hóa đơn</dt>
            <dd>{customer.billingAddress ?? '—'}</dd>
          </div>
          <div>
            <dt>Địa chỉ dự án</dt>
            <dd>{customer.projectAddress ?? '—'}</dd>
          </div>
        </dl>
      </section>
      <section className="panel grid gap-4">
        <h2 className="font-semibold">Người liên hệ</h2>
        {customer.contacts.length ? (
          <table>
            <thead>
              <tr>
                <th>Họ tên</th>
                <th>Chức danh</th>
                <th>Điện thoại</th>
                <th>Email</th>
                <th>Vai trò</th>
              </tr>
            </thead>
            <tbody>
              {customer.contacts.map((contact) => (
                <tr key={contact.id}>
                  <td>{contact.displayName}</td>
                  <td>{contact.jobTitle ?? '—'}</td>
                  <td>{contact.phone ?? '—'}</td>
                  <td>{contact.email ?? '—'}</td>
                  <td>{contact.isPrimary ? 'Chính' : 'Khác'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>Chưa có người liên hệ.</p>
        )}
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(event) => void addContact(event)}
        >
          <label>
            Họ và tên
            <input name="firstName" required />
          </label>
          <label>
            Email
            <input name="email" type="email" />
          </label>
          <label>
            Điện thoại
            <input name="phone" minLength={5} />
          </label>
          <label className="flex items-center gap-2">
            <input name="isPrimary" type="checkbox" /> Liên hệ chính
          </label>
          <button className="primary sm:col-span-2" type="submit">
            Thêm người liên hệ
          </button>
        </form>
        {message && <p role="alert">{message}</p>}
      </section>
      <EntityFiles entityType="Customer" entityId={id} />
      <EntityComments entityType="Customer" entityId={id} />
      <EntityActivity entityType="Customer" entityId={id} />
    </div>
  );
}
