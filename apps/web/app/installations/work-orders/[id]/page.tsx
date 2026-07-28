'use client';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '../../../lib/api';

type WorkOrder = {
  id: string;
  workOrderNumber: string;
  title: string;
  status: string;
  plan: { name: string; siteReady: boolean; customerCoordination: boolean };
  checklist: { id: string; title: string; completedAt: string | null }[];
  items: {
    id: string;
    status: string;
    room: string | null;
    position: string | null;
  }[];
  dailyLogs: {
    id: string;
    logDate: string;
    workCompleted: string;
    peopleOnsite: number;
  }[];
  punchItems: {
    id: string;
    issue: string;
    location: string;
    severity: string;
    status: string;
  }[];
};

export default function WorkOrderPage() {
  const id = String(useParams().id);
  const [item, setItem] = useState<WorkOrder>();
  const [error, setError] = useState('');
  const load = useCallback(
    () =>
      api<WorkOrder>(`/installation/work-orders/${id}`)
        .then(setItem)
        .catch((cause: Error) => setError(cause.message)),
    [id],
  );
  useEffect(() => void load(), [load]);
  async function release(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api(`/installation/work-orders/${id}/release`, {
        method: 'POST',
        body: JSON.stringify({
          overrideReason: form.get('overrideReason') || undefined,
        }),
      });
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  async function addLog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api(`/installation/work-orders/${id}/daily-logs`, {
        method: 'POST',
        body: JSON.stringify({
          logDate: form.get('logDate'),
          siteCondition: form.get('siteCondition'),
          peopleOnsite: Number(form.get('peopleOnsite')),
          workCompleted: form.get('workCompleted'),
        }),
      });
      event.currentTarget.reset();
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  async function addPunch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api(`/installation/work-orders/${id}/punch-items`, {
        method: 'POST',
        body: JSON.stringify({
          issue: form.get('issue'),
          location: form.get('location'),
          severity: form.get('severity'),
        }),
      });
      event.currentTarget.reset();
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  if (!item)
    return (
      <p role={error ? 'alert' : 'status'}>
        {error || 'Đang tải lệnh lắp đặt…'}
      </p>
    );
  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold">
          {item.workOrderNumber} · {item.title}
        </h1>
        <p>
          {item.status} · {item.plan.name}
        </p>
      </header>
      {error && <p role="alert">{error}</p>}
      <form className="panel flex flex-wrap gap-3" onSubmit={release}>
        <label>
          Lý do override (chỉ khi thiếu readiness)
          <input name="overrideReason" />
        </label>
        <button className="primary rounded px-3 py-2">Phát hành lệnh</button>
      </form>
      <section className="panel">
        <h2 className="font-semibold">Checklist</h2>
        <ul>
          {item.checklist.map((line) => (
            <li key={line.id}>
              {line.completedAt ? '✓' : '○'} {line.title}
            </li>
          ))}
        </ul>
      </section>
      <form className="panel grid gap-3 md:grid-cols-2" onSubmit={addLog}>
        <h2 className="font-semibold md:col-span-2">Nhật ký công trường</h2>
        <label>
          Ngày
          <input name="logDate" type="date" required />
        </label>
        <label>
          Số người
          <input min="0" name="peopleOnsite" type="number" required />
        </label>
        <label>
          Điều kiện site
          <input name="siteCondition" required />
        </label>
        <label>
          Công việc hoàn thành
          <input name="workCompleted" required />
        </label>
        <button className="rounded border px-3 py-2 md:col-span-2">
          Thêm nhật ký
        </button>
        <ul className="md:col-span-2">
          {item.dailyLogs.map((log) => (
            <li key={log.id}>
              {new Date(log.logDate).toLocaleDateString('vi-VN')} ·{' '}
              {log.peopleOnsite} người · {log.workCompleted}
            </li>
          ))}
        </ul>
      </form>
      <form className="panel grid gap-3 md:grid-cols-2" onSubmit={addPunch}>
        <h2 className="font-semibold md:col-span-2">Punch list</h2>
        <label>
          Vấn đề
          <input name="issue" required />
        </label>
        <label>
          Vị trí
          <input name="location" required />
        </label>
        <label>
          Mức độ
          <select name="severity">
            <option>LOW</option>
            <option>MEDIUM</option>
            <option>HIGH</option>
            <option>CRITICAL</option>
          </select>
        </label>
        <button className="rounded border px-3 py-2">Thêm punch item</button>
        <ul className="md:col-span-2">
          {item.punchItems.map((punch) => (
            <li key={punch.id}>
              {punch.severity} · {punch.location} · {punch.issue} ·{' '}
              {punch.status}
            </li>
          ))}
        </ul>
      </form>
    </div>
  );
}
