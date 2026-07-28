'use client';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
type PO = {
  id: string;
  poNumber: string;
  status: string;
  revision: number;
  currency: string;
  subtotal: string;
  totalAmount: string;
  shippingAmount: string;
  insuranceAmount: string;
  taxAmount: string;
  supplierId: string;
  deliveryAddress: string;
  lines: {
    id: string;
    customDescription: string | null;
    quantity: string;
    unit: string;
    netUnitPrice: string;
    lineTotal: string;
  }[];
  statusHistory: { id: string; toStatus: string; createdAt: string }[];
};
export default function PurchaseOrderDetailPage() {
  const id = useParams<{ poId: string }>().poId;
  const [item, setItem] = useState<PO | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(
    () =>
      api<PO>(`/purchase-orders/${id}`)
        .then(setItem)
        .catch((e: Error) => setError(e.message)),
    [id],
  );
  useEffect(() => {
    void load();
  }, [load]);
  async function action(name: string) {
    try {
      await api(`/purchase-orders/${id}/${name}`, {
        method: 'POST',
        body: '{}',
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (!item)
    return <p role={error ? 'alert' : undefined}>{error || 'Đang tải PO…'}</p>;
  const money = (value: string) =>
    `${new Intl.NumberFormat('vi-VN').format(Number(value))} ${item.currency}`;
  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold">
          {item.poNumber} · R{item.revision}
        </h1>
        <p>
          {item.status} · Nhà cung cấp {item.supplierId}
        </p>
      </header>
      {error && <p role="alert">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {item.status === 'DRAFT' && (
          <button onClick={() => void action('submit')}>Gửi duyệt</button>
        )}
        {item.status === 'SUBMITTED' && (
          <>
            <button onClick={() => void action('approve')}>Phê duyệt</button>
            <button onClick={() => void action('reject')}>Từ chối</button>
          </>
        )}
        {item.status === 'APPROVED' && (
          <button onClick={() => void action('send')}>Đánh dấu đã gửi</button>
        )}
        {item.status === 'SENT' && (
          <button
            className="primary rounded px-3 py-2"
            onClick={() => void action('confirm')}
          >
            Xác nhận PO
          </button>
        )}
      </div>
      <section className="panel">
        <h2 className="font-semibold">Tổng quan</h2>
        <p>Giao tại: {item.deliveryAddress}</p>
        <p>
          Tạm tính: {money(item.subtotal)} · Vận chuyển:{' '}
          {money(item.shippingAmount)} · Bảo hiểm: {money(item.insuranceAmount)}{' '}
          · Thuế: {money(item.taxAmount)}
        </p>
        <p className="font-semibold">Tổng: {money(item.totalAmount)}</p>
      </section>
      <section className="panel overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr>
              <th>Hạng mục</th>
              <th>Số lượng</th>
              <th>Đơn giá ròng</th>
              <th>Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            {item.lines.map((line) => (
              <tr className="border-t" key={line.id}>
                <td>{line.customDescription || 'Sản phẩm'}</td>
                <td>
                  {line.quantity} {line.unit}
                </td>
                <td>{money(line.netUnitPrice)}</td>
                <td>{money(line.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="panel">
        <h2 className="font-semibold">Hoạt động trạng thái</h2>
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
