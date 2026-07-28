'use client';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
type Forwarder = {
  id: string;
  code: string;
  legalName: string;
  contactName: string | null;
  phone: string | null;
};
export default function ForwardersPage() {
  const [items, setItems] = useState<Forwarder[]>([]);
  const [error, setError] = useState('');
  const load = useCallback(
    () =>
      api<Forwarder[]>('/forwarders')
        .then(setItems)
        .catch((cause: Error) => setError(cause.message)),
    [],
  );
  useEffect(() => void load(), [load]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api('/forwarders', {
        method: 'POST',
        body: JSON.stringify({
          code: form.get('code'),
          legalName: form.get('legalName'),
          contactName: form.get('contactName'),
          phone: form.get('phone'),
        }),
      });
      event.currentTarget.reset();
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">Forwarder</h1>
      {error && <p role="alert">{error}</p>}
      <form className="panel flex flex-wrap gap-3" onSubmit={submit}>
        <label>
          Mã
          <input name="code" required />
        </label>
        <label>
          Tên pháp lý
          <input name="legalName" required />
        </label>
        <label>
          Liên hệ
          <input name="contactName" />
        </label>
        <label>
          Điện thoại
          <input name="phone" />
        </label>
        <button className="primary self-end rounded px-3 py-2" type="submit">
          Thêm
        </button>
      </form>
      <section className="panel overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr>
              <th>Mã</th>
              <th>Tên</th>
              <th>Liên hệ</th>
              <th>Điện thoại</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr className="border-t" key={item.id}>
                <td>{item.code}</td>
                <td>{item.legalName}</td>
                <td>{item.contactName || '—'}</td>
                <td>{item.phone || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
