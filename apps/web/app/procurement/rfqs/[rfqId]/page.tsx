'use client';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';

type RFQ = {
  id: string;
  rfqNumber: string;
  status: string;
  sendMode: string | null;
  responseDeadline: string;
  requestedCurrency: string;
  deliveryDestination: string;
  purchaseRequest: { requestNumber: string };
  recipients: { id: string; supplierId: string; deliveryStatus: string }[];
  lines: {
    id: string;
    customDescription: string | null;
    quantity: string;
    unit: string;
  }[];
  clarifications: {
    id: string;
    subject: string;
    question: string;
    answer: string | null;
  }[];
};

export default function RFQDetailPage() {
  const id = useParams<{ rfqId: string }>().rfqId;
  const [item, setItem] = useState<RFQ | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(
    () =>
      api<RFQ>(`/rfqs/${id}`)
        .then(setItem)
        .catch((e: Error) => setError(e.message)),
    [id],
  );
  useEffect(() => {
    void load();
  }, [load]);
  async function action(name: string) {
    try {
      await api(`/rfqs/${id}/${name}`, { method: 'POST', body: '{}' });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (!item)
    return <p role={error ? 'alert' : undefined}>{error || 'Đang tải RFQ…'}</p>;
  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold">{item.rfqNumber}</h1>
        <p>
          {item.purchaseRequest.requestNumber} · {item.status}
        </p>
      </header>
      {error && <p role="alert">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {item.status === 'DRAFT' && (
          <button onClick={() => void action('submit')}>Sẵn sàng gửi</button>
        )}
        {item.status === 'READY_TO_SEND' && (
          <button
            className="primary rounded px-3 py-2"
            onClick={() => void action('send')}
          >
            Đánh dấu đã gửi
          </button>
        )}
        {['SENT', 'PARTIALLY_RESPONDED', 'RESPONDED'].includes(item.status) && (
          <button onClick={() => void action('close')}>Đóng RFQ</button>
        )}
      </div>
      {item.sendMode && (
        <p>
          Phương thức gửi: {item.sendMode} (cần gửi thủ công khi chưa cấu hình
          SMTP).
        </p>
      )}
      <section className="panel">
        <h2 className="font-semibold">Tổng quan</h2>
        <p>
          Hạn phản hồi:{' '}
          {new Date(item.responseDeadline).toLocaleDateString('vi-VN')}
        </p>
        <p>Tiền tệ: {item.requestedCurrency}</p>
        <p>Giao tại: {item.deliveryDestination}</p>
      </section>
      <section className="panel">
        <h2 className="font-semibold">Danh mục sản phẩm</h2>
        {item.lines.map((line) => (
          <p key={line.id}>
            {line.customDescription || 'Sản phẩm'} — {line.quantity} {line.unit}
          </p>
        ))}
      </section>
      <section className="panel">
        <h2 className="font-semibold">Nhà cung cấp nhận RFQ</h2>
        {item.recipients.map((r) => (
          <p key={r.id}>
            {r.supplierId} · {r.deliveryStatus}
          </p>
        ))}
      </section>
      <section className="panel">
        <h2 className="font-semibold">Clarifications</h2>
        {item.clarifications.map((c) => (
          <p key={c.id}>
            {c.subject}: {c.question}
          </p>
        ))}
        {!item.clarifications.length && <p>Chưa có trao đổi làm rõ.</p>}
      </section>
    </div>
  );
}
