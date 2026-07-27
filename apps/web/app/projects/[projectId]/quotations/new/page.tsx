'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { api } from '../../../../lib/api';

type Estimate = { id: string; number: string; title: string; status: string };
export default function NewQuotationPage() {
  const projectId = String(useParams().projectId);
  const router = useRouter();
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [message, setMessage] = useState('');
  useEffect(() => {
    api<Estimate[]>(`/projects/${projectId}/estimates`)
      .then((items) =>
        setEstimates(items.filter((item) => item.status === 'APPROVED')),
      )
      .catch((e: Error) => setMessage(e.message));
  }, [projectId]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(
      [...new FormData(event.currentTarget)].filter(
        ([, value]) => value !== '',
      ),
    );
    try {
      const item = await api<{ id: string }>(
        `/projects/${projectId}/quotations`,
        { method: 'POST', body: JSON.stringify(values) },
      );
      router.push(`/projects/${projectId}/quotations/${item.id}`);
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  return (
    <div className="grid gap-6">
      <p>
        <Link href={`/projects/${projectId}/quotations`}>Báo giá</Link> → Tạo
        mới
      </p>
      <header>
        <h1 className="text-2xl font-semibold">Tạo báo giá từ dự toán</h1>
        <p>Giá mua và margin không được đưa vào báo giá khách hàng.</p>
      </header>
      {message && <p role="alert">{message}</p>}
      <form className="panel grid gap-5" onSubmit={(e) => void create(e)}>
        <section className="grid gap-3 md:grid-cols-3">
          <h2 className="font-semibold md:col-span-3">Thông tin chung</h2>
          <select name="estimateId" required>
            <option value="">Chọn dự toán đã duyệt</option>
            {estimates.map((item) => (
              <option key={item.id} value={item.id}>
                {item.number} · {item.title}
              </option>
            ))}
          </select>
          <input name="number" placeholder="Số báo giá" required />
          <label>
            Hiệu lực đến
            <input className="block w-full" name="validityDate" type="date" />
          </label>
        </section>
        <section className="grid gap-3 md:grid-cols-3">
          <h2 className="font-semibold md:col-span-3">Giá trị bổ sung</h2>
          <input
            name="discount"
            type="number"
            min="0"
            step="0.01"
            defaultValue="0"
            placeholder="Giảm giá"
          />
          <input
            name="tax"
            type="number"
            min="0"
            step="0.01"
            defaultValue="0"
            placeholder="Thuế"
          />
          <input
            name="shipping"
            type="number"
            min="0"
            step="0.01"
            defaultValue="0"
            placeholder="Vận chuyển"
          />
          <input
            name="installation"
            type="number"
            min="0"
            step="0.01"
            defaultValue="0"
            placeholder="Lắp đặt"
          />
          <input
            name="warranty"
            type="number"
            min="0"
            step="0.01"
            defaultValue="0"
            placeholder="Bảo hành"
          />
        </section>
        <section className="grid gap-3 md:grid-cols-2">
          <h2 className="font-semibold md:col-span-2">Điều khoản</h2>
          <textarea name="paymentTerms" placeholder="Điều khoản thanh toán" />
          <textarea name="deliveryTerms" placeholder="Điều khoản giao hàng" />
          <textarea name="installationTerms" placeholder="Điều khoản lắp đặt" />
          <textarea name="warrantyTerms" placeholder="Điều khoản bảo hành" />
          <textarea
            className="md:col-span-2"
            name="notes"
            placeholder="Ghi chú"
          />
        </section>
        <button className="primary justify-self-start">Tạo báo giá V1</button>
      </form>
    </div>
  );
}
