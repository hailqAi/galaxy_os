'use client';
import { createCommandKey } from '../../lib/create-command-key';
import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';

type Payment = {
  id: string;
  supplierId: string;
  projectId: string;
  paymentDate: string;
  amount: string;
  currency: string;
  paymentMethod: string;
  transactionReference: string | null;
  status: string;
};

export default function SupplierPaymentsPage() {
  const [items, setItems] = useState<Payment[]>([]);
  const [error, setError] = useState('');
  const load = useCallback(
    () =>
      api<Payment[]>('/supplier-payments')
        .then(setItems)
        .catch((cause: Error) => setError(cause.message)),
    [],
  );
  useEffect(() => void load(), [load]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api('/supplier-payments', {
        method: 'POST',
        body: JSON.stringify({
          supplierId: form.get('supplierId'),
          projectId: form.get('projectId'),
          paymentDate: form.get('paymentDate'),
          amount: form.get('amount'),
          currency: form.get('currency'),
          exchangeRateSnapshot: form.get('exchangeRateSnapshot'),
          paymentMethod: form.get('paymentMethod'),
          bankReferenceProtected:
            form.get('bankReferenceProtected') || undefined,
          transactionReference: form.get('transactionReference') || undefined,
          idempotencyKey: createCommandKey(),
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
      <header>
        <h1 className="text-2xl font-semibold">Thanh toán nhà cung cấp</h1>
      </header>
      {error && <p role="alert">{error}</p>}
      <form className="panel grid gap-3 md:grid-cols-3" onSubmit={submit}>
        <label>
          Supplier ID
          <input name="supplierId" required />
        </label>
        <label>
          Project ID
          <input name="projectId" required />
        </label>
        <label>
          Ngày thanh toán
          <input name="paymentDate" required type="date" />
        </label>
        <label>
          Số tiền
          <input inputMode="decimal" name="amount" required />
        </label>
        <label>
          Tiền tệ
          <input defaultValue="VND" maxLength={3} name="currency" required />
        </label>
        <label>
          Tỷ giá
          <input
            defaultValue="1"
            inputMode="decimal"
            name="exchangeRateSnapshot"
            required
          />
        </label>
        <label>
          Phương thức
          <select name="paymentMethod">
            <option>BANK_TRANSFER</option>
            <option>LETTER_OF_CREDIT</option>
            <option>OFFSET</option>
            <option>RETENTION_RELEASE</option>
            <option>OTHER</option>
          </select>
        </label>
        <label>
          Tham chiếu ngân hàng
          <input name="bankReferenceProtected" />
        </label>
        <label>
          Mã giao dịch
          <input name="transactionReference" />
        </label>
        <button className="primary w-fit rounded px-3 py-2" type="submit">
          Ghi nhận
        </button>
      </form>
      <section className="panel overflow-x-auto">
        <table className="w-full min-w-[760px] text-left">
          <thead>
            <tr>
              <th>Ngày</th>
              <th>Nhà cung cấp</th>
              <th>Giá trị</th>
              <th>Phương thức</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr className="border-t" key={item.id}>
                <td className="py-3">
                  <Link href={`/finance/supplier-payments/${item.id}`}>
                    {new Date(item.paymentDate).toLocaleDateString('vi-VN')}
                  </Link>
                </td>
                <td>{item.supplierId}</td>
                <td>
                  {item.amount} {item.currency}
                </td>
                <td>{item.paymentMethod}</td>
                <td>{item.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
