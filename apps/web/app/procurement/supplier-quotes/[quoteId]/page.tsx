'use client';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';

type Quote = {
  id: string;
  quotationNumber: string;
  status: string;
  revision: number;
  currency: string;
  exchangeRateSnapshot: string;
  totalAmount: string;
  shippingCost: string;
  insuranceCost: string;
  taxAmount: string;
  paymentTerms: string | null;
  rfq: { rfqNumber: string };
  lines: {
    id: string;
    description: string;
    quantity: string;
    unit: string;
    listPrice: string;
    discountPercent: string;
    netTotal: string;
    technicalCompliance: string;
  }[];
  statusHistory: { id: string; toStatus: string; createdAt: string }[];
};

export default function SupplierQuoteDetailPage() {
  const id = useParams<{ quoteId: string }>().quoteId;
  const router = useRouter();
  const [item, setItem] = useState<Quote | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(
    () =>
      api<Quote>(`/supplier-quotations/${id}`)
        .then(setItem)
        .catch((e: Error) => setError(e.message)),
    [id],
  );
  useEffect(() => {
    void load();
  }, [load]);
  async function action(name: string) {
    try {
      const result = await api<{ id?: string }>(
        `/supplier-quotations/${id}/${name}`,
        { method: 'POST', body: '{}' },
      );
      if (name === 'create-revision' && result.id)
        router.push(`/procurement/supplier-quotes/${result.id}`);
      else await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (!item)
    return (
      <p role={error ? 'alert' : undefined}>{error || 'Đang tải báo giá…'}</p>
    );
  const money = (value: string) =>
    `${new Intl.NumberFormat('vi-VN').format(Number(value))} ${item.currency}`;
  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold">
          {item.quotationNumber} · R{item.revision}
        </h1>
        <p>
          {item.rfq.rfqNumber} · {item.status}
        </p>
      </header>
      {error && <p role="alert">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {item.status === 'RECEIVED' && (
          <button onClick={() => void action('submit-review')}>
            Gửi thẩm định
          </button>
        )}
        {item.status === 'UNDER_REVIEW' && (
          <>
            <button onClick={() => void action('mark-compliant')}>
              Đạt kỹ thuật
            </button>
            <button onClick={() => void action('mark-partially-compliant')}>
              Đạt một phần
            </button>
            <button onClick={() => void action('mark-non-compliant')}>
              Không đạt
            </button>
          </>
        )}
        {['COMPLIANT', 'PARTIALLY_COMPLIANT'].includes(item.status) && (
          <button
            className="primary rounded px-3 py-2"
            onClick={() => void action('shortlist')}
          >
            Đưa vào shortlist
          </button>
        )}
        {!['SELECTED', 'SUPERSEDED'].includes(item.status) && (
          <button onClick={() => void action('create-revision')}>
            Tạo revision
          </button>
        )}
      </div>
      <section className="panel">
        <h2 className="font-semibold">Tổng quan thương mại</h2>
        <p>Tổng giá trị: {money(item.totalAmount)}</p>
        <p>Tỷ giá snapshot: {item.exchangeRateSnapshot}</p>
        <p>
          Vận chuyển: {money(item.shippingCost)} · Bảo hiểm:{' '}
          {money(item.insuranceCost)} · Thuế: {money(item.taxAmount)}
        </p>
        <p>Thanh toán: {item.paymentTerms || 'Chưa ghi nhận'}</p>
      </section>
      <section className="panel overflow-x-auto">
        <h2 className="font-semibold">Line items</h2>
        <table className="w-full text-left">
          <thead>
            <tr>
              <th>Mô tả</th>
              <th>Số lượng</th>
              <th>Giá niêm yết</th>
              <th>Chiết khấu</th>
              <th>Thành tiền</th>
              <th>Kỹ thuật</th>
            </tr>
          </thead>
          <tbody>
            {item.lines.map((line) => (
              <tr className="border-t" key={line.id}>
                <td>{line.description}</td>
                <td>
                  {line.quantity} {line.unit}
                </td>
                <td>{money(line.listPrice)}</td>
                <td>{line.discountPercent}%</td>
                <td>{money(line.netTotal)}</td>
                <td>{line.technicalCompliance}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="panel">
        <h2 className="font-semibold">Lịch sử</h2>
        {item.statusHistory.map((history) => (
          <p key={history.id}>
            {history.toStatus} ·{' '}
            {new Date(history.createdAt).toLocaleString('vi-VN')}
          </p>
        ))}
      </section>
    </div>
  );
}
