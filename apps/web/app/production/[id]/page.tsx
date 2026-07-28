'use client';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '../../lib/api';

type Order = {
  id: string;
  status: string;
  progressPercentage: string;
  purchaseOrder: { poNumber: string };
  milestones: { id: string; name: string; status: string }[];
  technicalApprovals: {
    id: string;
    title: string;
    status: string;
    currentRevision: number;
  }[];
  sampleApprovals: { id: string; name: string; status: string }[];
  qualityReports: { id: string; reportNumber: string; result: string }[];
  packingRecords: { id: string; packingNumber: string; packageCount: number }[];
  updates: { id: string; summary: string; progressPercentage: string }[];
  statusHistory: { id: string; toStatus: string; createdAt: string }[];
};
export default function ProductionDetailPage() {
  const id = useParams<{ id: string }>().id;
  const [item, setItem] = useState<Order | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(
    () =>
      api<Order>(`/production-orders/${id}`)
        .then(setItem)
        .catch((cause: Error) => setError(cause.message)),
    [id],
  );
  useEffect(() => void load(), [load]);
  async function status(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api(`/production-orders/${id}/change-status`, {
        method: 'POST',
        body: JSON.stringify({
          status: form.get('status'),
          reason: form.get('reason') || undefined,
        }),
      });
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  async function decideSample(sampleId: string, decision: string) {
    try {
      await api(`/production-orders/sample-approvals/${sampleId}/decision`, {
        method: 'POST',
        body: JSON.stringify({ decision }),
      });
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  if (!item)
    return (
      <p role={error ? 'alert' : undefined}>{error || 'Đang tải sản xuất…'}</p>
    );
  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold">
          Sản xuất PO {item.purchaseOrder.poNumber}
        </h1>
        <p>
          {item.status} · {item.progressPercentage}%
        </p>
      </header>
      {error && <p role="alert">{error}</p>}
      <form className="panel flex flex-wrap gap-3" onSubmit={status}>
        <label>
          Trạng thái
          <select name="status">
            {[
              'TECHNICAL_APPROVAL',
              'MATERIAL_PREPARATION',
              'IN_PRODUCTION',
              'QUALITY_CHECK',
              'PACKING',
              'READY_FOR_SHIPMENT',
              'DELAYED',
              'CANCELLED',
            ].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          Lý do
          <input name="reason" />
        </label>
        <button type="submit">Cập nhật</button>
      </form>
      <section className="panel">
        <h2 className="font-semibold">Milestones</h2>
        {item.milestones.map((x) => (
          <p key={x.id}>
            {x.name} · {x.status}
          </p>
        ))}
      </section>
      <section className="panel">
        <h2 className="font-semibold">Phê duyệt kỹ thuật</h2>
        {item.technicalApprovals.map((x) => (
          <p key={x.id}>
            {x.title} · R{x.currentRevision} · {x.status}
          </p>
        ))}
      </section>
      <section className="panel">
        <h2 className="font-semibold">Mẫu vật liệu</h2>
        {item.sampleApprovals.map((x) => (
          <div className="flex gap-2" key={x.id}>
            <span>
              {x.name} · {x.status}
            </span>
            {x.status === 'PENDING' && (
              <>
                <button onClick={() => void decideSample(x.id, 'APPROVED')}>
                  Approve
                </button>
                <button onClick={() => void decideSample(x.id, 'REJECTED')}>
                  Reject
                </button>
              </>
            )}
          </div>
        ))}
      </section>
      <section className="panel">
        <h2 className="font-semibold">Chất lượng & đóng gói</h2>
        {item.qualityReports.map((x) => (
          <p key={x.id}>
            {x.reportNumber} · {x.result}
          </p>
        ))}
        {item.packingRecords.map((x) => (
          <p key={x.id}>
            {x.packingNumber} · {x.packageCount} kiện
          </p>
        ))}
      </section>
      <section className="panel">
        <h2 className="font-semibold">Timeline & hoạt động</h2>
        {item.statusHistory.map((x) => (
          <p key={x.id}>
            {x.toStatus} · {new Date(x.createdAt).toLocaleString('vi-VN')}
          </p>
        ))}
      </section>
    </div>
  );
}
