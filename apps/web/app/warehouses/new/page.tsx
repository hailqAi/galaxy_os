'use client';
import { FormEvent, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '../../lib/api';
export default function NewWarehousePage() {
  const router = useRouter();
  const projectId = useSearchParams().get('projectId');
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const item = await api<{ id: string }>('/warehouses', {
        method: 'POST',
        body: JSON.stringify({
          code: form.get('code'),
          name: form.get('name'),
          type: form.get('type'),
          projectId: projectId || undefined,
          address: form.get('address') || undefined,
          allowNegativeStock: false,
        }),
      });
      router.push(`/warehouses/${item.id}`);
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">Tạo kho</h1>
      {error && <p role="alert">{error}</p>}
      <form className="panel grid gap-4 md:grid-cols-2" onSubmit={submit}>
        <label>
          Mã kho
          <input name="code" required />
        </label>
        <label>
          Tên kho
          <input name="name" required />
        </label>
        <label>
          Loại
          <select name="type">
            <option>MAIN</option>
            <option>PROJECT</option>
            <option>SHOWROOM</option>
            <option>SITE</option>
            <option>TRANSIT</option>
            <option>QUARANTINE</option>
            <option>RETURN</option>
            <option>OTHER</option>
          </select>
        </label>
        <label>
          Địa chỉ
          <input name="address" />
        </label>
        <button
          className="primary rounded px-3 py-2 md:col-span-2"
          type="submit"
        >
          Tạo kho
        </button>
      </form>
    </div>
  );
}
