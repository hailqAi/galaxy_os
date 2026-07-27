'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
type Project = { id: string; code: string; name: string };
export default function NewRequest() {
  const router = useRouter();
  const selected = useSearchParams().get('projectId') || '';
  const [projects, setProjects] = useState<Project[]>([]);
  const [message, setMessage] = useState('');
  useEffect(() => {
    api<{ items: Project[] }>('/projects?pageSize=100')
      .then((r) => setProjects(r.items))
      .catch((e: Error) => setMessage(e.message));
  }, []);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const v = Object.fromEntries(
      [...new FormData(event.currentTarget)].filter(
        ([, value]) => value !== '',
      ),
    );
    try {
      const item = await api<{ id: string }>('/purchase-requests', {
        method: 'POST',
        body: JSON.stringify({
          requestNumber: v.requestNumber,
          projectId: v.projectId,
          sourceType: v.sourceType,
          sourceId: v.sourceId,
          requiredDate: v.requiredDate,
          priority: v.priority,
          notes: v.notes,
          lines: [
            {
              productId: v.productId || undefined,
              customDescription: v.customDescription,
              quantity: v.quantity,
              unit: v.unit,
              preferredSupplierId: v.preferredSupplierId || undefined,
              targetPrice: v.targetPrice || undefined,
              currency: v.currency,
              requiredDate: v.requiredDate,
              projectArea: v.projectArea,
              technicalRequirements: v.technicalRequirements,
            },
          ],
        }),
      });
      router.push(`/procurement/requests/${item.id}`);
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  return (
    <div className="grid gap-6">
      <p>
        <Link href="/procurement/requests">Yêu cầu mua hàng</Link> → Tạo mới
      </p>
      <h1 className="text-2xl font-semibold">Tạo yêu cầu mua hàng</h1>
      {message && <p role="alert">{message}</p>}
      <form className="panel grid gap-5" onSubmit={(e) => void create(e)}>
        <section className="grid gap-3 md:grid-cols-3">
          <h2 className="font-semibold md:col-span-3">Thông tin yêu cầu</h2>
          <input name="requestNumber" placeholder="Số yêu cầu" required />
          <select name="projectId" defaultValue={selected} required>
            <option value="">Chọn dự án</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} · {p.name}
              </option>
            ))}
          </select>
          <select name="sourceType">
            <option value="MANUAL">Thủ công</option>
            <option value="SIGNED_CONTRACT">Hợp đồng đã ký</option>
            <option value="APPROVED_ESTIMATE">Dự toán đã duyệt</option>
            <option value="ACCEPTED_QUOTATION">Báo giá đã chấp nhận</option>
          </select>
          <input name="sourceId" placeholder="ID nguồn (nếu có)" />
          <input name="requiredDate" type="date" />
          <select name="priority" defaultValue="NORMAL">
            <option>LOW</option>
            <option>NORMAL</option>
            <option>HIGH</option>
            <option>URGENT</option>
          </select>
        </section>
        <section className="grid gap-3 md:grid-cols-3">
          <h2 className="font-semibold md:col-span-3">Hạng mục đầu tiên</h2>
          <input
            name="customDescription"
            placeholder="Mô tả sản phẩm"
            required
          />
          <input
            name="quantity"
            type="number"
            min="0.001"
            step="0.001"
            required
          />
          <input name="unit" defaultValue="cái" required />
          <input
            name="targetPrice"
            type="number"
            min="0"
            step="0.01"
            placeholder="Giá mục tiêu"
          />
          <input name="currency" defaultValue="VND" required />
          <input name="projectArea" placeholder="Khu vực dự án" />
          <textarea
            className="md:col-span-3"
            name="technicalRequirements"
            placeholder="Yêu cầu kỹ thuật"
          />
        </section>
        <button className="primary justify-self-start">Lưu bản nháp</button>
      </form>
    </div>
  );
}
