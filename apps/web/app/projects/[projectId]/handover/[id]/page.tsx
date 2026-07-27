'use client';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '../../../../lib/api';
type Handover = {
  handoverNumber: string;
  status: string;
  checklist: { id: string; title: string; completedAt: string | null }[];
  items: { id: string; description: string }[];
};
export default function HandoverDetail() {
  const id = String(useParams().id);
  const [item, setItem] = useState<Handover>();
  const [error, setError] = useState('');
  const load = useCallback(
    () =>
      api<Handover>(`/handovers/${id}`)
        .then(setItem)
        .catch((e: Error) => setError(e.message)),
    [id],
  );
  useEffect(() => void load(), [load]);
  async function completeChecklist(checklistId: string) {
    try {
      await api(`/handovers/${id}/checklist/${checklistId}/complete`, {
        method: 'POST',
      });
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  async function complete(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api(`/handovers/${id}/complete`, {
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
  if (!item)
    return <p role={error ? 'alert' : 'status'}>{error || 'Đang tải…'}</p>;
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">
        {item.handoverNumber} · {item.status}
      </h1>
      {error && <p role="alert">{error}</p>}
      <section className="panel">
        <h2>Checklist</h2>
        <ul>
          {item.checklist.map((line) => (
            <li key={line.id}>
              {line.completedAt ? '✓' : '○'} {line.title}{' '}
              {!line.completedAt && (
                <button onClick={() => completeChecklist(line.id)}>
                  Hoàn thành
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
      <section className="panel">
        <h2>Sản phẩm bàn giao</h2>
        <ul>
          {item.items.map((line) => (
            <li key={line.id}>{line.description}</li>
          ))}
        </ul>
      </section>
      <form className="panel" onSubmit={complete}>
        <label>
          Lý do override
          <input name="overrideReason" />
        </label>
        <button className="primary">Hoàn tất bàn giao</button>
      </form>
    </div>
  );
}
