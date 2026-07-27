'use client';
import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { api } from '../../lib/api';

type Comparison = {
  id: string;
  baseCurrency: string;
  exchangeRateDate: string;
  status: string;
  rfq: { rfqNumber: string };
  _count: { lines: number; selections: number };
};
type RFQ = { id: string; rfqNumber: string; status: string };

export default function ComparisonsPage() {
  const [items, setItems] = useState<Comparison[]>([]);
  const [rfqs, setRfqs] = useState<RFQ[]>([]);
  const [error, setError] = useState('');
  async function load() {
    const [comparisons, rfqResult] = await Promise.all([
      api<Comparison[]>('/supplier-comparisons'),
      api<{ items: RFQ[] }>('/rfqs?pageSize=100'),
    ]);
    setItems(comparisons);
    setRfqs(
      rfqResult.items.filter((item) =>
        ['PARTIALLY_RESPONDED', 'RESPONDED'].includes(item.status),
      ),
    );
  }
  useEffect(() => {
    void load().catch((e: Error) => setError(e.message));
  }, []);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api('/supplier-comparisons', {
        method: 'POST',
        body: JSON.stringify({
          rfqId: form.get('rfqId'),
          baseCurrency: form.get('baseCurrency'),
          exchangeRateDate: form.get('exchangeRateDate'),
        }),
      });
      await load();
      event.currentTarget.reset();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold">So sánh nhà cung cấp</h1>
        <p>
          So sánh giá quy đổi, lead time, kỹ thuật và rủi ro; hệ thống không tự
          chọn giá thấp nhất.
        </p>
      </header>
      {error && <p role="alert">{error}</p>}
      <form className="panel flex flex-wrap items-end gap-3" onSubmit={create}>
        <label>
          RFQ
          <select name="rfqId" required>
            <option value="">Chọn RFQ</option>
            {rfqs.map((rfq) => (
              <option key={rfq.id} value={rfq.id}>
                {rfq.rfqNumber}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tiền tệ cơ sở
          <input defaultValue="VND" name="baseCurrency" required />
        </label>
        <label>
          Ngày tỷ giá
          <input name="exchangeRateDate" type="date" required />
        </label>
        <button className="primary rounded px-3 py-2" type="submit">
          Tạo bảng so sánh
        </button>
      </form>
      <section className="panel overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr>
              <th>RFQ</th>
              <th>Tiền tệ</th>
              <th>Phương án</th>
              <th>Lựa chọn</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr className="border-t" key={item.id}>
                <td className="py-3">
                  <Link href={`/procurement/comparisons/${item.id}`}>
                    {item.rfq.rfqNumber}
                  </Link>
                </td>
                <td>{item.baseCurrency}</td>
                <td>{item._count.lines}</td>
                <td>{item._count.selections}</td>
                <td>{item.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!items.length && <p className="py-5">Chưa có bảng so sánh.</p>}
      </section>
    </div>
  );
}
