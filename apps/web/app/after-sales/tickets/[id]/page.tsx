'use client';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '../../../lib/api';
type Ticket = {
  ticketNumber: string;
  status: string;
  priority: string;
  description: string;
  resolutions: { id: string; summary: string }[];
  confirmations: { id: string; customerName: string; confirmed: boolean }[];
  visits: {
    id: string;
    scheduledAt: string;
    visitType: string;
    status: string;
  }[];
  claims: {
    id: string;
    claimNumber: string | null;
    claimType: string;
    status: string;
  }[];
};
export default function TicketDetail() {
  const id = String(useParams().id);
  const [item, setItem] = useState<Ticket>();
  const [error, setError] = useState('');
  const load = useCallback(
    () =>
      api<Ticket>(`/service-tickets/${id}`)
        .then(setItem)
        .catch((e: Error) => setError(e.message)),
    [id],
  );
  useEffect(() => void load(), [load]);
  async function status(value: string) {
    try {
      await api(`/service-tickets/${id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: value }),
      });
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  async function resolve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api(`/service-tickets/${id}/resolve`, {
        method: 'POST',
        body: JSON.stringify({
          summary: form.get('summary'),
          evidenceFileId: form.get('evidenceFileId'),
        }),
      });
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api(`/service-tickets/${id}/confirm`, {
        method: 'POST',
        body: JSON.stringify({
          customerName: form.get('customerName'),
          confirmed: true,
        }),
      });
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  async function scheduleVisit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api(`/service-tickets/${id}/visits`, {
        method: 'POST',
        body: JSON.stringify({
          scheduledAt: form.get('scheduledAt'),
          visitType: form.get('visitType'),
          technicianId: form.get('technicianId') || undefined,
        }),
      });
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  async function createClaim(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api(`/service-tickets/${id}/claims`, {
        method: 'POST',
        body: JSON.stringify({
          claimNumber: form.get('claimNumber'),
          warrantyAssetId: form.get('warrantyAssetId') || undefined,
          claimType: form.get('claimType'),
          issueDescription: form.get('issueDescription'),
          submissionMode: 'MANUAL',
        }),
      });
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  if (!item)
    return <p role={error ? 'alert' : 'status'}>{error || 'Đang tải…'}</p>;
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">
        {item.ticketNumber} · {item.status}
      </h1>
      {error && <p role="alert">{error}</p>}
      <section className="panel">
        <p>
          {item.priority} · {item.description}
        </p>
        <div className="flex flex-wrap gap-2">
          {[
            'TRIAGED',
            'SCHEDULED',
            'IN_PROGRESS',
            'WAITING_PARTS',
            'WAITING_SUPPLIER',
          ].map((value) => (
            <button key={value} onClick={() => status(value)}>
              {value}
            </button>
          ))}
        </div>
      </section>
      <form className="panel grid gap-3" onSubmit={resolve}>
        <input name="summary" placeholder="Kết quả xử lý" required />
        <input name="evidenceFileId" placeholder="Evidence File ID" required />
        <button className="primary">Resolve</button>
      </form>
      <form className="panel grid gap-3" onSubmit={scheduleVisit}>
        <h2>Service Visit</h2>
        <input name="scheduledAt" type="datetime-local" required />
        <select name="visitType">
          <option>INSPECTION</option>
          <option>DIAGNOSIS</option>
          <option>REPAIR</option>
          <option>REPLACEMENT</option>
        </select>
        <input name="technicianId" placeholder="Technician ID" />
        <button>Lên lịch</button>
        <ul>
          {item.visits.map((visit) => (
            <li key={visit.id}>
              {visit.visitType} · {visit.status}
            </li>
          ))}
        </ul>
      </form>
      <form className="panel grid gap-3" onSubmit={createClaim}>
        <h2>Warranty Claim</h2>
        <input name="claimNumber" placeholder="Số claim" required />
        <input name="warrantyAssetId" placeholder="Warranty Asset ID" />
        <select name="claimType">
          <option>CUSTOMER_WARRANTY</option>
          <option>SUPPLIER_WARRANTY</option>
          <option>GOODWILL</option>
        </select>
        <textarea name="issueDescription" placeholder="Mô tả" required />
        <button>Tạo claim thủ công</button>
        <ul>
          {item.claims.map((claim) => (
            <li key={claim.id}>
              {claim.claimNumber} · {claim.claimType} · {claim.status}
            </li>
          ))}
        </ul>
      </form>
      <form className="panel flex gap-3" onSubmit={confirm}>
        <input name="customerName" placeholder="Người xác nhận" required />
        <button>Xác nhận khách hàng</button>
      </form>
      <button
        onClick={() =>
          api(`/service-tickets/${id}/close`, { method: 'POST' })
            .then(load)
            .catch((e: Error) => setError(e.message))
        }
      >
        Đóng ticket
      </button>
    </div>
  );
}
