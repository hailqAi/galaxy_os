'use client';
import { use, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
type Item = {
  declarationNumber: string;
  status: string;
  customsOffice: string;
  customsValue: string;
  dutyAmount: string;
  vatAmount: string;
  totalTaxAmount: string;
  currency: string;
  lines: {
    id: string;
    hsCode: string;
    description: string;
    quantity: string;
    customsValue: string;
  }[];
};
export default function CustomsDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [item, setItem] = useState<Item>();
  const [error, setError] = useState('');
  useEffect(() => {
    api<Item>(`/customs/${id}`)
      .then(setItem)
      .catch((cause: Error) => setError(cause.message));
  }, [id]);
  if (!item)
    return (
      <p role={error ? 'alert' : undefined}>{error || 'Đang tải tờ khai…'}</p>
    );
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">{item.declarationNumber}</h1>
      <section className="panel">
        <p>
          {item.customsOffice} · {item.status}
        </p>
        <p>
          Trị giá {item.customsValue} {item.currency} · Thuế{' '}
          {item.totalTaxAmount} {item.currency}
        </p>
      </section>
      <section className="panel overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr>
              <th>HS</th>
              <th>Mô tả</th>
              <th>Số lượng</th>
              <th>Trị giá</th>
            </tr>
          </thead>
          <tbody>
            {item.lines.map((line) => (
              <tr className="border-t" key={line.id}>
                <td>{line.hsCode}</td>
                <td>{line.description}</td>
                <td>{line.quantity}</td>
                <td>{line.customsValue}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
