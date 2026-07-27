'use client';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '../../../../lib/api';
type Inspection = {
  inspectionNumber: string;
  status: string;
  items: { id: string; scope: string; result: string }[];
  acceptances: unknown[];
};
export default function InspectionDetail() {
  const id = String(useParams().id);
  const [item, setItem] = useState<Inspection>();
  const [error, setError] = useState('');
  const load = useCallback(
    () =>
      api<Inspection>(`/inspections/${id}`)
        .then(setItem)
        .catch((e: Error) => setError(e.message)),
    [id],
  );
  useEffect(() => void load(), [load]);
  async function decide(lineId: string, result: string) {
    try {
      await api(`/inspection-items/${lineId}/decide`, {
        method: 'POST',
        body: JSON.stringify({ result }),
      });
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  async function accept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api(`/inspections/${id}/acceptance`, {
        method: 'POST',
        body: JSON.stringify({
          participants: [
            {
              name: form.get('name'),
              role: form.get('role'),
              signingStatus: form.get('signingStatus'),
            },
          ],
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
        {item.inspectionNumber} · {item.status}
      </h1>
      {error && <p role="alert">{error}</p>}
      <section className="panel">
        <ul>
          {item.items.map((line) => (
            <li key={line.id}>
              {line.scope} · {line.result}{' '}
              <button onClick={() => decide(line.id, 'PASSED')}>Đạt</button>{' '}
              <button onClick={() => decide(line.id, 'FAILED')}>
                Không đạt
              </button>
            </li>
          ))}
        </ul>
      </section>
      <form className="panel grid gap-3" onSubmit={accept}>
        <h2 className="font-semibold">Acceptance participant</h2>
        <input name="name" placeholder="Tên" required />
        <input name="role" placeholder="Vai trò" required />
        <select name="signingStatus">
          <option>PENDING</option>
          <option>SIGNED</option>
          <option>DECLINED</option>
        </select>
        <button className="primary">Ghi nhận acceptance</button>
      </form>
    </div>
  );
}
