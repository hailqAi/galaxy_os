'use client';
import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '../lib/api';

type Plan = {
  id: string;
  planNumber: string;
  name: string;
  status: string;
  siteReady: boolean;
  customerCoordination: boolean;
  workOrders: {
    id: string;
    workOrderNumber: string;
    title: string;
    status: string;
  }[];
};

export default function InstallationsPage() {
  const initialProject = useSearchParams().get('projectId') ?? '';
  const [projectId, setProjectId] = useState(initialProject);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!projectId) return setPlans([]);
    try {
      setPlans(await api<Plan[]>(`/installation/plans?projectId=${projectId}`));
      setError('');
    } catch (cause) {
      setError((cause as Error).message);
    }
  }, [projectId]);
  useEffect(() => {
    const timeout = setTimeout(() => void load(), 0);
    return () => clearTimeout(timeout);
  }, [load]);

  async function createPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api('/installation/plans', {
        method: 'POST',
        body: JSON.stringify({
          projectId,
          planNumber: form.get('planNumber'),
          name: form.get('name'),
          siteReady: form.get('siteReady') === 'on',
          customerCoordination: form.get('customerCoordination') === 'on',
        }),
      });
      event.currentTarget.reset();
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  async function createWorkOrder(
    event: FormEvent<HTMLFormElement>,
    planId: string,
  ) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api(`/installation/plans/${planId}/work-orders`, {
        method: 'POST',
        body: JSON.stringify({
          workOrderNumber: form.get('workOrderNumber'),
          title: form.get('title'),
          area: form.get('area') || undefined,
          teamId: form.get('teamId') || undefined,
          requiredInventory: form.get('requiredInventory') === 'on',
          approvedDrawing: form.get('approvedDrawing') === 'on',
          checklist: [{ title: 'Kiểm tra khu vực và vật tư', required: true }],
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
      <h1 className="text-2xl font-semibold">Kế hoạch lắp đặt</h1>
      {error && <p role="alert">{error}</p>}
      <label className="panel">
        Project ID
        <input
          value={projectId}
          onChange={(event) => setProjectId(event.target.value)}
          required
        />
      </label>
      <form className="panel grid gap-3 md:grid-cols-2" onSubmit={createPlan}>
        <label>
          Số kế hoạch
          <input name="planNumber" required />
        </label>
        <label>
          Tên kế hoạch
          <input name="name" required />
        </label>
        <label>
          <input name="siteReady" type="checkbox" /> Site sẵn sàng
        </label>
        <label>
          <input name="customerCoordination" type="checkbox" /> Đã phối hợp
          khách hàng
        </label>
        <button
          className="primary rounded px-3 py-2 md:col-span-2"
          disabled={!projectId}
        >
          Tạo kế hoạch
        </button>
      </form>
      {plans.map((plan) => (
        <section className="panel grid gap-3" key={plan.id}>
          <h2 className="font-semibold">
            {plan.planNumber} · {plan.name}
          </h2>
          <p>
            {plan.status} · Site:{' '}
            {plan.siteReady ? 'Sẵn sàng' : 'Chưa sẵn sàng'}
          </p>
          <ul>
            {plan.workOrders.map((item) => (
              <li key={item.id}>
                <Link href={`/installations/work-orders/${item.id}`}>
                  {item.workOrderNumber} · {item.title} · {item.status}
                </Link>
              </li>
            ))}
          </ul>
          <form
            className="grid gap-2 md:grid-cols-2"
            onSubmit={(event) => createWorkOrder(event, plan.id)}
          >
            <label>
              Số lệnh
              <input name="workOrderNumber" required />
            </label>
            <label>
              Tiêu đề
              <input name="title" required />
            </label>
            <label>
              Khu vực
              <input name="area" />
            </label>
            <label>
              Team ID
              <input name="teamId" />
            </label>
            <label>
              <input defaultChecked name="requiredInventory" type="checkbox" />{' '}
              Yêu cầu vật tư đã giữ
            </label>
            <label>
              <input name="approvedDrawing" type="checkbox" /> Bản vẽ đã duyệt
            </label>
            <button className="rounded border px-3 py-2 md:col-span-2">
              Tạo lệnh lắp đặt
            </button>
          </form>
        </section>
      ))}
    </div>
  );
}
