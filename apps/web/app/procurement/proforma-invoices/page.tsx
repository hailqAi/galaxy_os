'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

type Invoice = {
  id: string;
  piNumber: string;
  piDate: string;
  dueDate: string | null;
  currency: string;
  totalAmount: string;
  status: string;
  supplier: { legalName: string };
  purchaseOrder: {
    id: string;
    poNumber: string;
    purchaseRequest: { project: { name: string } };
  };
  payable: { paidAmount: string; outstandingAmount: string } | null;
};

export default function ProformaInvoicesPage() {
  const projectId = useSearchParams().get('projectId');
  const [items, setItems] = useState<Invoice[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    const query = new URLSearchParams();
    if (projectId) query.set('projectId', projectId);
    void api<{ items: Invoice[] }>(
      `/proforma-invoices${query.size ? `?${query}` : ''}`,
    )
      .then((result) => setItems(result.items))
      .catch((cause: Error) => setError(cause.message));
  }, [projectId]);
  const money = (value: string, currency: string) =>
    `${new Intl.NumberFormat('vi-VN').format(Number(value))} ${currency}`;
  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Proforma Invoice</h1>
          <p>Đối chiếu PI với cam kết của đơn mua hàng.</p>
        </div>
        <Link
          className="primary rounded px-3 py-2"
          href="/procurement/proforma-invoices/new"
        >
          Tạo PI
        </Link>
      </header>
      {error && <p role="alert">{error}</p>}
      <section className="panel overflow-x-auto">
        <table className="w-full min-w-[960px] text-left">
          <thead>
            <tr>
              <th>Số PI</th>
              <th>Nhà cung cấp</th>
              <th>PO</th>
              <th>Dự án</th>
              <th>Ngày PI</th>
              <th>Đến hạn</th>
              <th>Giá trị</th>
              <th>Đã trả</th>
              <th>Còn phải trả</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr className="border-t" key={item.id}>
                <td className="py-3">
                  <Link href={`/procurement/proforma-invoices/${item.id}`}>
                    {item.piNumber}
                  </Link>
                </td>
                <td>{item.supplier.legalName}</td>
                <td>{item.purchaseOrder.poNumber}</td>
                <td>{item.purchaseOrder.purchaseRequest.project.name}</td>
                <td>{new Date(item.piDate).toLocaleDateString('vi-VN')}</td>
                <td>
                  {item.dueDate
                    ? new Date(item.dueDate).toLocaleDateString('vi-VN')
                    : '—'}
                </td>
                <td>{money(item.totalAmount, item.currency)}</td>
                <td>{money(item.payable?.paidAmount ?? '0', item.currency)}</td>
                <td>
                  {money(
                    item.payable?.outstandingAmount ?? item.totalAmount,
                    item.currency,
                  )}
                </td>
                <td>{item.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!items.length && <p className="py-5">Chưa có Proforma Invoice.</p>}
      </section>
    </div>
  );
}
