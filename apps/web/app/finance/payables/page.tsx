'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type Payable = {
  id: string;
  supplierId: string;
  projectId: string;
  purchaseOrderId: string;
  amount: string;
  paidAmount: string;
  outstandingAmount: string;
  currency: string;
  status: string;
  proformaInvoice: { piNumber: string; dueDate: string | null };
  schedules: { status: string; dueDate: string }[];
};

export default function SupplierPayablesPage() {
  const [items, setItems] = useState<Payable[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    void api<Payable[]>('/supplier-payables')
      .then(setItems)
      .catch((cause: Error) => setError(cause.message));
  }, []);
  const totals = useMemo(
    () => ({
      due: items
        .flatMap((item) => item.schedules)
        .filter((s) => s.status === 'DUE').length,
      overdue: items
        .flatMap((item) => item.schedules)
        .filter((s) => s.status === 'OVERDUE').length,
      paid: items.reduce((sum, item) => sum + Number(item.paidAmount), 0),
      outstanding: items.reduce(
        (sum, item) => sum + Number(item.outstandingAmount),
        0,
      ),
    }),
    [items],
  );
  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Công nợ nhà cung cấp</h1>
        <p>Công nợ vận hành từ PI đã duyệt, không phải sổ cái pháp định.</p>
      </header>
      {error && <p role="alert">{error}</p>}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="panel">Đến hạn: {totals.due}</div>
        <div className="panel">Quá hạn: {totals.overdue}</div>
        <div className="panel">
          Đã thanh toán: {new Intl.NumberFormat('vi-VN').format(totals.paid)}
        </div>
        <div className="panel">
          Còn phải trả:{' '}
          {new Intl.NumberFormat('vi-VN').format(totals.outstanding)}
        </div>
      </section>
      <section className="panel overflow-x-auto">
        <table className="w-full min-w-[820px] text-left">
          <thead>
            <tr>
              <th>PI</th>
              <th>Nhà cung cấp</th>
              <th>Dự án</th>
              <th>Giá trị</th>
              <th>Đã trả</th>
              <th>Còn lại</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr className="border-t" key={item.id}>
                <td className="py-3">
                  <Link href={`/finance/payables/${item.id}`}>
                    {item.proformaInvoice.piNumber}
                  </Link>
                </td>
                <td>{item.supplierId}</td>
                <td>{item.projectId}</td>
                <td>
                  {item.amount} {item.currency}
                </td>
                <td>
                  {item.paidAmount} {item.currency}
                </td>
                <td>
                  {item.outstandingAmount} {item.currency}
                </td>
                <td>{item.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!items.length && <p className="py-5">Chưa có công nợ.</p>}
      </section>
    </div>
  );
}
