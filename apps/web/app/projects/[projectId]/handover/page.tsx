'use client';
import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '../../../lib/api';
type Handover = { id: string; handoverNumber: string; status: string };
export default function HandoverPage() {
  const projectId = String(useParams().projectId);
  const [items, setItems] = useState<Handover[]>([]);
  const [error, setError] = useState('');
  const load = useCallback(
    () =>
      api<Handover[]>(`/handovers?projectId=${projectId}`)
        .then(setItems)
        .catch((e: Error) => setError(e.message)),
    [projectId],
  );
  useEffect(() => void load(), [load]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api('/handovers', {
        method: 'POST',
        body: JSON.stringify({
          projectId,
          handoverNumber: form.get('handoverNumber'),
          items: [
            {
              installationItemId: form.get('installationItemId'),
              description: form.get('description'),
            },
          ],
          checklist: [
            { title: 'Biên bản và tài liệu bắt buộc', required: true },
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
      <h1 className="text-2xl font-semibold">Bàn giao dự án</h1>
      {error && <p role="alert">{error}</p>}
      <form className="panel grid gap-3" onSubmit={create}>
        <input name="handoverNumber" placeholder="Số bàn giao" required />
        <input
          name="installationItemId"
          placeholder="Installation Item ID"
          required
        />
        <input name="description" placeholder="Mô tả sản phẩm" required />
        <button className="primary">Tạo hồ sơ bàn giao</button>
      </form>
      <section className="panel">
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <Link href={`/projects/${projectId}/handover/${item.id}`}>
                {item.handoverNumber} · {item.status}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
