'use client';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../lib/api';
type Project = {
  id: string;
  code: string;
  name: string;
  customerId: string;
  projectType: string | null;
  propertyType: string | null;
  location: string | null;
  address: string | null;
  status: string;
  phase: string;
  priority: string;
  estimatedValue: string | null;
  contractedValue: string | null;
  description: string | null;
  healthStatus: string;
  progressPercentage: number;
  expectedCompletionDate: string | null;
};
type Customer = { id: string; displayName: string };
export function ProjectForm({ project }: { project?: Project }) {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    api<{ items: Customer[] }>('/customers?pageSize=100')
      .then((result) => setCustomers(result.items))
      .catch((error: Error) => setMessage(error.message));
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    const entries = Object.fromEntries(new FormData(event.currentTarget));
    const body = Object.fromEntries(
      Object.entries(entries).filter(([, value]) => value !== ''),
    );
    try {
      const saved = await api<{ id: string }>(
        project ? `/projects/${project.id}` : '/projects',
        {
          method: project ? 'PATCH' : 'POST',
          body: JSON.stringify({
            ...body,
            estimatedValue: body.estimatedValue
              ? Number(body.estimatedValue)
              : undefined,
            contractedValue: body.contractedValue
              ? Number(body.contractedValue)
              : undefined,
            progressPercentage: body.progressPercentage
              ? Number(body.progressPercentage)
              : undefined,
          }),
        },
      );
      router.push(`/projects/${saved.id}`);
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
        Mã dự án
        <input
          name="code"
          required
          maxLength={50}
          defaultValue={project?.code}
        />
      </label>
      <label>
        Tên dự án
        <input
          name="name"
          required
          maxLength={200}
          defaultValue={project?.name}
        />
      </label>
      <label>
        Khách hàng
        <select
          name="customerId"
          required
          defaultValue={project?.customerId ?? ''}
        >
          <option value="">Chọn khách hàng</option>
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.displayName}
            </option>
          ))}
        </select>
      </label>
      <label>
        Loại dự án
        <input name="projectType" defaultValue={project?.projectType ?? ''} />
      </label>
      <label>
        Loại công trình
        <input name="propertyType" defaultValue={project?.propertyType ?? ''} />
      </label>
      <label>
        Địa điểm
        <input name="location" defaultValue={project?.location ?? ''} />
      </label>
      <label className="sm:col-span-2">
        Địa chỉ
        <input name="address" defaultValue={project?.address ?? ''} />
      </label>
      <label>
        Trạng thái
        <select name="status" defaultValue={project?.status ?? 'PLANNING'}>
          {['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'].map(
            (value) => (
              <option key={value}>{value}</option>
            ),
          )}
        </select>
      </label>
      <label>
        Giai đoạn
        <select name="phase" defaultValue={project?.phase ?? 'SURVEY'}>
          {['SURVEY', 'REQUIREMENT', 'DESIGN'].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </label>
      <label>
        Ưu tiên
        <select name="priority" defaultValue={project?.priority ?? 'NORMAL'}>
          {['LOW', 'NORMAL', 'HIGH', 'URGENT'].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </label>
      <label>
        Sức khỏe
        <select
          name="healthStatus"
          defaultValue={project?.healthStatus ?? 'ON_TRACK'}
        >
          {['ON_TRACK', 'AT_RISK', 'OFF_TRACK'].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </label>
      <label>
        Tiến độ %
        <input
          name="progressPercentage"
          type="number"
          min="0"
          max="100"
          defaultValue={project?.progressPercentage ?? 0}
        />
      </label>
      <label>
        Hoàn thành dự kiến
        <input
          name="expectedCompletionDate"
          type="date"
          defaultValue={project?.expectedCompletionDate?.slice(0, 10) ?? ''}
        />
      </label>
      <label>
        Giá trị dự kiến
        <input
          name="estimatedValue"
          type="number"
          min="0"
          defaultValue={project?.estimatedValue ?? ''}
        />
      </label>
      <label>
        Giá trị hợp đồng
        <input
          name="contractedValue"
          type="number"
          min="0"
          defaultValue={project?.contractedValue ?? ''}
        />
      </label>
      <label className="sm:col-span-2">
        Mô tả
        <textarea
          name="description"
          maxLength={5000}
          defaultValue={project?.description ?? ''}
        />
      </label>
      {message && (
        <p className="sm:col-span-2" role="alert">
          {message}
        </p>
      )}
      <button className="primary sm:col-span-2" disabled={submitting}>
        {submitting ? 'Đang lưu…' : project ? 'Lưu dự án' : 'Tạo dự án'}
      </button>
    </form>
  );
}
