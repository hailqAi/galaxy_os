'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';

type Lead = {
  id: string;
  name: string;
  companyName: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  sourceId: string | null;
  priority: string;
  estimatedValue: string | null;
  currency: string;
  expectedCloseDate: string | null;
  notes: string | null;
};
type Source = { id: string; name: string };

export function LeadForm({ lead }: { lead?: Lead }) {
  const router = useRouter();
  const [sources, setSources] = useState<Source[]>([]);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    api<Source[]>('/lead-sources')
      .then(setSources)
      .catch((error: Error) => setMessage(error.message));
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage('');
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const body = Object.fromEntries(
      Object.entries(values).filter(([, value]) => value !== ''),
    );
    try {
      const saved = await api<{ id: string }>(
        lead ? `/leads/${lead.id}` : '/leads',
        {
          method: lead ? 'PATCH' : 'POST',
          body: JSON.stringify({
            ...body,
            estimatedValue: body.estimatedValue
              ? Number(body.estimatedValue)
              : undefined,
          }),
        },
      );
      router.push(`/crm/leads/${saved.id}`);
      router.refresh();
    } catch (error) {
      setMessage((error as Error).message);
      setSubmitting(false);
    }
  }
  return (
    <form
      className="panel grid gap-4 sm:grid-cols-2"
      onSubmit={(event) => void submit(event)}
    >
      <label>
        Tên Lead
        <input name="name" required maxLength={200} defaultValue={lead?.name} />
      </label>
      <label>
        Công ty
        <input
          name="companyName"
          maxLength={200}
          defaultValue={lead?.companyName ?? ''}
        />
      </label>
      <label>
        Người liên hệ
        <input
          name="contactName"
          maxLength={200}
          defaultValue={lead?.contactName ?? ''}
        />
      </label>
      <label>
        Điện thoại
        <input
          name="phone"
          minLength={5}
          maxLength={30}
          defaultValue={lead?.phone ?? ''}
        />
      </label>
      <label>
        Email
        <input name="email" type="email" defaultValue={lead?.email ?? ''} />
      </label>
      <label>
        Nguồn
        <select name="sourceId" defaultValue={lead?.sourceId ?? ''}>
          <option value="">Chưa chọn</option>
          {sources.map((source) => (
            <option key={source.id} value={source.id}>
              {source.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Ưu tiên
        <select name="priority" defaultValue={lead?.priority ?? 'NORMAL'}>
          <option value="LOW">Thấp</option>
          <option value="NORMAL">Bình thường</option>
          <option value="HIGH">Cao</option>
          <option value="URGENT">Khẩn cấp</option>
        </select>
      </label>
      <label>
        Giá trị dự kiến
        <input
          name="estimatedValue"
          type="number"
          min="0"
          step="1"
          defaultValue={lead?.estimatedValue ?? ''}
        />
      </label>
      <label>
        Tiền tệ
        <input
          name="currency"
          minLength={3}
          maxLength={3}
          defaultValue={lead?.currency ?? 'VND'}
        />
      </label>
      <label>
        Ngày chốt dự kiến
        <input
          name="expectedCloseDate"
          type="date"
          defaultValue={lead?.expectedCloseDate?.slice(0, 10) ?? ''}
        />
      </label>
      <label className="sm:col-span-2">
        Ghi chú
        <textarea
          name="notes"
          maxLength={5000}
          defaultValue={lead?.notes ?? ''}
        />
      </label>
      {message && (
        <p className="sm:col-span-2" role="alert">
          {message}
        </p>
      )}
      <button
        className="primary sm:col-span-2"
        disabled={submitting}
        type="submit"
      >
        {submitting ? 'Đang lưu…' : lead ? 'Lưu thay đổi' : 'Tạo Lead'}
      </button>
    </form>
  );
}
