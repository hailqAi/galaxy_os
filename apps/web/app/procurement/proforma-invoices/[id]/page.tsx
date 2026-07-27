'use client';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';

type Invoice = {
  id: string;
  piNumber: string;
  version: number;
  status: string;
  currency: string;
  subtotal: string;
  shippingAmount: string;
  insuranceAmount: string;
  taxAmount: string;
  otherAmount: string;
  totalAmount: string;
  exceedsCommitment: boolean;
  bankReferenceProtected?: string;
  supplier: { legalName: string };
  purchaseOrder: { poNumber: string };
  payable: { paidAmount: string; outstandingAmount: string } | null;
  lines: {
    id: string;
    description: string;
    quantity: string;
    unit: string;
    unitPrice: string;
    lineTotal: string;
  }[];
  documents: { id: string; version: number; checksum: string }[];
  statusHistory: { id: string; toStatus: string; createdAt: string }[];
};

export default function ProformaInvoiceDetailPage() {
  const id = useParams<{ id: string }>().id;
  const [item, setItem] = useState<Invoice | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(
    () =>
      api<Invoice>(`/proforma-invoices/${id}`)
        .then(setItem)
        .catch((cause: Error) => setError(cause.message)),
    [id],
  );
  useEffect(() => void load(), [load]);
  async function action(name: string) {
    try {
      await api(`/proforma-invoices/${id}/${name}`, {
        method: 'POST',
        body: '{}',
      });
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  if (!item)
    return <p role={error ? 'alert' : undefined}>{error || 'Đang tải PI…'}</p>;
  const money = (value: string) =>
    `${new Intl.NumberFormat('vi-VN').format(Number(value))} ${item.currency}`;
  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold">
          {item.piNumber} · V{item.version}
        </h1>
        <p>
          {item.supplier.legalName} · PO {item.purchaseOrder.poNumber} ·{' '}
          {item.status}
        </p>
      </header>
      {error && <p role="alert">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {['DRAFT', 'RECEIVED'].includes(item.status) && (
          <button onClick={() => void action('verify')}>Verify</button>
        )}
        {item.status === 'VERIFIED' && (
          <>
            <button
              className="primary rounded px-3 py-2"
              onClick={() => void action('approve')}
            >
              Approve
            </button>
            <button onClick={() => void action('reject')}>Reject</button>
          </>
        )}
        {item.status === 'APPROVED' && (
          <>
            <button onClick={() => void action('create-revision')}>
              Create revision
            </button>
            <button onClick={() => void action('create-payable')}>
              Create payable schedule
            </button>
          </>
        )}
        {!['SUPERSEDED', 'CANCELLED'].includes(item.status) && (
          <button onClick={() => void action('cancel')}>Cancel</button>
        )}
      </div>
      <section className="panel">
        <h2 className="font-semibold">Tổng quan</h2>
        <p>
          Tạm tính {money(item.subtotal)} · Vận chuyển{' '}
          {money(item.shippingAmount)} · Bảo hiểm {money(item.insuranceAmount)}{' '}
          · Thuế {money(item.taxAmount)} · Khác {money(item.otherAmount)}
        </p>
        <p className="font-semibold">Tổng {money(item.totalAmount)}</p>
        {item.exceedsCommitment && (
          <p role="alert">PI vượt cam kết PO và cần phê duyệt đặc biệt.</p>
        )}
        {item.bankReferenceProtected && (
          <p>Tham chiếu ngân hàng: {item.bankReferenceProtected}</p>
        )}
      </section>
      <section className="panel overflow-x-auto">
        <h2 className="font-semibold">Line items & đối chiếu PO</h2>
        <table className="w-full min-w-[680px] text-left">
          <thead>
            <tr>
              <th>Mô tả</th>
              <th>Số lượng</th>
              <th>Đơn giá</th>
              <th>Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            {item.lines.map((line) => (
              <tr className="border-t" key={line.id}>
                <td>{line.description}</td>
                <td>
                  {line.quantity} {line.unit}
                </td>
                <td>{money(line.unitPrice)}</td>
                <td>{money(line.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="panel">
        <h2 className="font-semibold">Thanh toán</h2>
        <p>
          Đã trả {money(item.payable?.paidAmount ?? '0')} · Còn phải trả{' '}
          {money(item.payable?.outstandingAmount ?? item.totalAmount)}
        </p>
      </section>
      <section className="panel">
        <h2 className="font-semibold">Tài liệu</h2>
        {item.documents.map((document) => (
          <p key={document.id}>
            V{document.version} · SHA-256 {document.checksum}
          </p>
        ))}
        {!item.documents.length && <p>Chưa có tài liệu.</p>}
      </section>
      <section className="panel">
        <h2 className="font-semibold">Phê duyệt & hoạt động</h2>
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
