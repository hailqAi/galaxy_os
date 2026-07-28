'use client';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';

type Supplier = {
  id: string;
  legalName: string;
  tradingName: string | null;
  country: string;
  currency: string;
  incoterms: string | null;
  typicalLeadTimeDays: number | null;
  contacts: { id: string; name: string; email: string | null }[];
};
export default function PartnersPage() {
  const [items, setItems] = useState<Supplier[]>([]);
  const [message, setMessage] = useState('');
  const load = useCallback(
    () =>
      api<{ items: Supplier[] }>('/suppliers?pageSize=100')
        .then((r) => setItems(r.items))
        .catch((e: Error) => setMessage(e.message)),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    await api('/suppliers', {
      method: 'POST',
      body: JSON.stringify({
        ...values,
        languages: String(values.languages)
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean),
        authorizedDistributorStatus:
          values.authorizedDistributorStatus === 'on',
      }),
    });
    event.currentTarget.reset();
    await load();
  }
  return (
    <div className="grid gap-6">
      <header>
        <p className="text-sm text-black/55">Đối tác nước ngoài</p>
        <h1 className="text-2xl font-semibold">Nhà cung cấp</h1>
      </header>
      {message && <p role="alert">{message}</p>}
      <section className="panel">
        <h2 className="font-semibold">Thêm nhà cung cấp</h2>
        <form
          className="mt-4 grid gap-3 md:grid-cols-3"
          onSubmit={(e) => void create(e)}
        >
          <input name="legalName" placeholder="Tên pháp lý" required />
          <input name="tradingName" placeholder="Tên giao dịch" />
          <input name="country" placeholder="Quốc gia" required />
          <input name="currency" defaultValue="EUR" maxLength={3} required />
          <input
            name="languages"
            defaultValue="English"
            placeholder="Ngôn ngữ, cách nhau dấu phẩy"
          />
          <input name="incoterms" placeholder="Incoterms" />
          <label>
            <input type="checkbox" name="authorizedDistributorStatus" /> Nhà
            phân phối ủy quyền
          </label>
          <button className="primary">Thêm nhà cung cấp</button>
        </form>
      </section>
      <section className="grid gap-4 md:grid-cols-2">
        {items.length ? (
          items.map((s) => (
            <article className="panel" key={s.id}>
              <h2 className="font-semibold">{s.tradingName || s.legalName}</h2>
              <p>
                {s.legalName} · {s.country}
              </p>
              <p>
                {s.currency} · {s.incoterms ?? 'Chưa có Incoterms'} ·{' '}
                {s.typicalLeadTimeDays
                  ? `${s.typicalLeadTimeDays} ngày`
                  : 'Chưa có lead time'}
              </p>
              <p className="mt-2 text-sm">
                {s.contacts.length
                  ? `${s.contacts.length} liên hệ`
                  : 'Chưa có liên hệ — thêm tại hồ sơ đối tác.'}
              </p>
            </article>
          ))
        ) : (
          <div className="panel">
            <h2 className="font-semibold">Chưa có nhà cung cấp</h2>
            <p>Điền form phía trên để bắt đầu RFQ và mua hàng.</p>
          </div>
        )}
      </section>
    </div>
  );
}
