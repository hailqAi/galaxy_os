'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
type Contract = {
  id: string;
  contractNumber: string;
  status: string;
  currentValue: string;
  currency: string;
  updatedAt: string;
};
type Quotation = { id: string; number: string; status: string };
export default function ContractsPage() {
  const projectId = String(useParams().projectId);
  const [items, setItems] = useState<Contract[]>([]);
  const [quotes, setQuotes] = useState<Quotation[]>([]);
  const [message, setMessage] = useState('');
  const load = useCallback(
    () =>
      Promise.all([
        api<Contract[]>(`/projects/${projectId}/contracts`),
        api<Quotation[]>(`/projects/${projectId}/quotations`),
      ])
        .then(([contracts, quotations]) => {
          setItems(contracts);
          setQuotes(quotations.filter(({ status }) => status === 'ACCEPTED'));
        })
        .catch((e: Error) => setMessage(e.message)),
    [projectId],
  );
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(
      [...new FormData(event.currentTarget)].filter(([, v]) => v !== ''),
    );
    try {
      await api(`/projects/${projectId}/contracts`, {
        method: 'POST',
        body: JSON.stringify(values),
      });
      event.currentTarget.reset();
      await load();
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  return (
    <div className="grid gap-6">
      <p>
        <Link href={`/projects/${projectId}?workspace=contracts`}>
          Không gian dự án
        </Link>{' '}
        → Hợp đồng
      </p>
      <header>
        <h1 className="text-2xl font-semibold">Hợp đồng</h1>
        <p>Chỉ tạo từ báo giá khách hàng đã chấp nhận.</p>
      </header>
      {message && <p role="alert">{message}</p>}
      <form
        className="panel grid gap-3 md:grid-cols-3"
        onSubmit={(e) => void create(e)}
      >
        <h2 className="font-semibold md:col-span-3">Tạo hợp đồng</h2>
        <select name="quotationId" required>
          <option value="">Chọn báo giá đã chấp nhận</option>
          {quotes.map((q) => (
            <option key={q.id} value={q.id}>
              {q.number}
            </option>
          ))}
        </select>
        <input name="contractNumber" placeholder="Số hợp đồng" required />
        <input
          name="sellerLegalEntity"
          placeholder="Pháp nhân bên bán"
          required
        />
        <input
          name="buyerLegalEntity"
          placeholder="Pháp nhân bên mua"
          required
        />
        <input name="sellerRepresentative" placeholder="Đại diện bên bán" />
        <input name="buyerRepresentative" placeholder="Đại diện bên mua" />
        <input
          name="retentionPercent"
          type="number"
          min="0"
          max="100"
          step="0.01"
          placeholder="% giữ lại"
        />
        <input
          name="warrantyRetentionPercent"
          type="number"
          min="0"
          max="100"
          step="0.01"
          placeholder="% giữ lại bảo hành"
        />
        <button className="primary">Tạo hợp đồng</button>
      </form>
      <section className="panel overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr>
              <th>Số hợp đồng</th>
              <th>Trạng thái</th>
              <th>Giá trị hiện tại</th>
              <th>Cập nhật</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr className="border-t" key={item.id}>
                <td className="py-3">
                  <Link href={`/projects/${projectId}/contracts/${item.id}`}>
                    {item.contractNumber}
                  </Link>
                </td>
                <td>{item.status}</td>
                <td>
                  {new Intl.NumberFormat('vi-VN').format(
                    Number(item.currentValue),
                  )}{' '}
                  {item.currency}
                </td>
                <td>{new Date(item.updatedAt).toLocaleDateString('vi-VN')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!items.length && <p className="py-5">Chưa có hợp đồng.</p>}
      </section>
    </div>
  );
}
