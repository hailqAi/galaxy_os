'use client';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';

type Payable = {
  id: string;
  amount: string;
  paidAmount: string;
  outstandingAmount: string;
  currency: string;
  status: string;
  proformaInvoice: { piNumber: string };
  schedules: {
    id: string;
    sequence: number;
    milestone: string;
    dueDate: string;
    amount: string;
    paidAmount: string;
    outstandingAmount: string;
    dependencyType: string | null;
    dependencyStatus: string | null;
    status: string;
  }[];
};

export default function SupplierPayableDetailPage() {
  const id = useParams<{ id: string }>().id;
  const [item, setItem] = useState<Payable | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    void api<Payable>(`/supplier-payables/${id}`)
      .then(setItem)
      .catch((cause: Error) => setError(cause.message));
  }, [id]);
  if (!item)
    return (
      <p role={error ? 'alert' : undefined}>{error || 'Đang tải công nợ…'}</p>
    );
  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold">
          Công nợ PI {item.proformaInvoice.piNumber}
        </h1>
        <p>
          {item.status} · {item.outstandingAmount} {item.currency} còn phải trả
        </p>
      </header>
      <section className="panel overflow-x-auto">
        <h2 className="font-semibold">Lịch thanh toán</h2>
        <table className="w-full min-w-[840px] text-left">
          <thead>
            <tr>
              <th>#</th>
              <th>Milestone</th>
              <th>Đến hạn</th>
              <th>Giá trị</th>
              <th>Đã trả</th>
              <th>Còn lại</th>
              <th>Phụ thuộc</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {item.schedules.map((schedule) => (
              <tr className="border-t" key={schedule.id}>
                <td>{schedule.sequence}</td>
                <td>{schedule.milestone}</td>
                <td>
                  {new Date(schedule.dueDate).toLocaleDateString('vi-VN')}
                </td>
                <td>
                  {schedule.amount} {item.currency}
                </td>
                <td>
                  {schedule.paidAmount} {item.currency}
                </td>
                <td>
                  {schedule.outstandingAmount} {item.currency}
                </td>
                <td>
                  {schedule.dependencyType
                    ? `${schedule.dependencyType}: ${schedule.dependencyStatus}`
                    : '—'}
                </td>
                <td>{schedule.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
