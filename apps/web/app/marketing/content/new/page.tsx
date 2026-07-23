'use client';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../../lib/api';
export default function NewContentPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const item = await api<{ id: string }>('/content', {
        method: 'POST',
        body: JSON.stringify(Object.fromEntries(form)),
      });
      router.push(`/marketing/content/${item.id}`);
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  return (
    <div className="grid gap-5">
      <p>Marketing / Nội dung / Tạo mới</p>
      <h1 className="text-2xl font-semibold">Tạo nội dung</h1>
      <form className="panel grid gap-3" onSubmit={submit}>
        <label>
          Tiêu đề
          <input name="title" required minLength={2} />
        </label>
        <label>
          Hệ sinh thái
          <select name="brandEcosystem">
            <option>Galaxycentre.vn</option>
            <option>Galaxylink.vn</option>
          </select>
        </label>
        <label>
          Nội dung gốc
          <textarea name="originalContent" required rows={10} />
        </label>
        <button className="primary">Lưu bản nháp</button>
        {error && <p role="alert">{error}</p>}
      </form>
    </div>
  );
}
