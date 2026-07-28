'use client';
import { FormEvent, use, useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
type Receipt = {
  receiptNumber: string;
  status: string;
  lines: {
    id: string;
    expectedQuantity: string;
    receivedQuantity: string;
    shortageQuantity: string;
    excessQuantity: string;
    damagedQuantity: string;
    unit: string;
  }[];
  inspections: { id: string; inspectionNumber: string; status: string }[];
  damageRecords: { id: string; quantity: string; reason: string }[];
};
export default function ReceiptDetail({
  params,
}: {
  params: Promise<{ receiptId: string }>;
}) {
  const { receiptId } = use(params);
  const [item, setItem] = useState<Receipt>();
  const [error, setError] = useState('');
  const load = useCallback(
    () =>
      api<Receipt>(`/inventory/receipts/${receiptId}`)
        .then(setItem)
        .catch((cause: Error) => setError(cause.message)),
    [receiptId],
  );
  useEffect(() => void load(), [load]);
  async function receive() {
    try {
      await api(`/inventory/receipts/${receiptId}/receive`, { method: 'POST' });
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  async function inspect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api(`/inventory/receipts/${receiptId}/inspections`, {
        method: 'POST',
        body: JSON.stringify({
          inspectionNumber: form.get('inspectionNumber'),
          lines: [
            {
              goodsReceiptLineId: form.get('goodsReceiptLineId'),
              inspectedQuantity: form.get('inspectedQuantity'),
              passedQuantity: form.get('passedQuantity'),
              failedQuantity: form.get('failedQuantity'),
              quarantinedQuantity: form.get('quarantinedQuantity'),
              reason: form.get('reason') || undefined,
            },
          ],
        }),
      });
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  async function completeInspection(id: string) {
    try {
      await api(`/inventory/inspections/${id}/complete`, { method: 'POST' });
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  if (!item)
    return (
      <p role={error ? 'alert' : undefined}>
        {error || 'Đang tải phiếu nhập…'}
      </p>
    );
  return (
    <div className="grid gap-6">
      <header className="flex justify-between">
        <h1 className="text-2xl font-semibold">{item.receiptNumber}</h1>
        {item.status === 'DRAFT' && (
          <button className="primary rounded px-3 py-2" onClick={receive}>
            Post receipt
          </button>
        )}
      </header>
      {error && <p role="alert">{error}</p>}
      <section className="panel overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr>
              <th>Dự kiến</th>
              <th>Thực nhận</th>
              <th>Thiếu</th>
              <th>Thừa</th>
              <th>Hư hỏng</th>
            </tr>
          </thead>
          <tbody>
            {item.lines.map((line) => (
              <tr className="border-t" key={line.id}>
                <td>{line.expectedQuantity}</td>
                <td>{line.receivedQuantity}</td>
                <td>{line.shortageQuantity}</td>
                <td>{line.excessQuantity}</td>
                <td>{line.damagedQuantity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {item.status === 'RECEIVED' && (
        <form className="panel grid gap-3 md:grid-cols-3" onSubmit={inspect}>
          <input name="inspectionNumber" placeholder="Số QC" required />
          <select name="goodsReceiptLineId">
            {item.lines.map((line) => (
              <option key={line.id} value={line.id}>
                {line.id}
              </option>
            ))}
          </select>
          <input name="inspectedQuantity" placeholder="Số kiểm" required />
          <input name="passedQuantity" placeholder="Đạt" required />
          <input
            name="failedQuantity"
            placeholder="Không đạt"
            defaultValue="0"
            required
          />
          <input
            name="quarantinedQuantity"
            placeholder="Cách ly"
            defaultValue="0"
            required
          />
          <input name="reason" placeholder="Lý do" />
          <button className="primary rounded px-3 py-2">Bắt đầu QC</button>
        </form>
      )}
      <section className="panel">
        <h2 className="font-semibold">Kiểm tra chất lượng</h2>
        {item.inspections.map((x) => (
          <p key={x.id}>
            {x.inspectionNumber} · {x.status}
            {x.status === 'IN_PROGRESS' && (
              <button className="ml-3" onClick={() => completeInspection(x.id)}>
                Phê duyệt kết quả
              </button>
            )}
          </p>
        ))}
      </section>
      <section className="panel">
        <h2 className="font-semibold">Hư hỏng</h2>
        {item.damageRecords.map((x) => (
          <p key={x.id}>
            {x.quantity} · {x.reason}
          </p>
        ))}
      </section>
    </div>
  );
}
