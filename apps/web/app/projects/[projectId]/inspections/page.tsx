'use client';
import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '../../../lib/api';

type Inspection = {
  id: string;
  inspectionNumber: string;
  type: string;
  status: string;
  items: unknown[];
};
export default function InspectionsPage() {
  const projectId = String(useParams().projectId);
  const [items, setItems] = useState<Inspection[]>([]);
  const [error, setError] = useState('');
  const load = useCallback(
    () =>
      api<Inspection[]>(`/inspections?projectId=${projectId}`)
        .then(setItems)
        .catch((e: Error) => setError(e.message)),
    [projectId],
  );
  useEffect(() => void load(), [load]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api('/inspections', {
        method: 'POST',
        body: JSON.stringify({
          projectId,
          inspectionNumber: form.get('inspectionNumber'),
          type: form.get('type'),
          items: [
            {
              installationItemId: form.get('installationItemId') || undefined,
              scope: form.get('scope'),
            },
          ],
        }),
      });
      event.currentTarget.reset();
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">Nghiệm thu dự án</h1>
      {error && <p role="alert">{error}</p>}
      <form className="panel grid gap-3 md:grid-cols-2" onSubmit={create}>
        <label>
          Số biên bản
          <input name="inspectionNumber" required />
        </label>
        <label>
          Loại
          <select name="type">
            <option>INTERNAL</option>
            <option>CUSTOMER</option>
            <option>CONSULTANT</option>
            <option>SUPPLIER</option>
          </select>
        </label>
        <label>
          Installation Item ID
          <input name="installationItemId" />
        </label>
        <label>
          Phạm vi
          <input name="scope" required />
        </label>
        <button className="primary rounded px-3 py-2 md:col-span-2">
          Tạo kiểm tra
        </button>
      </form>
      <section className="panel">
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <Link href={`/projects/${projectId}/inspections/${item.id}`}>
                {item.inspectionNumber} · {item.type} · {item.status}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
