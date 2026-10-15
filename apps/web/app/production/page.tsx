'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { type Actor, api } from '../lib/api';

type Order = {
  id: string;
  status: string;
  progressPercentage: string;
  plannedReadyDate: string | null;
  purchaseOrder: { poNumber: string };
};

const productionStatuses: Record<string, string> = {
  ORDER_CONFIRMED: 'Đã xác nhận đơn hàng',
  TECHNICAL_APPROVAL: 'Đang duyệt kỹ thuật',
  MATERIAL_PREPARATION: 'Đang chuẩn bị vật tư',
  IN_PRODUCTION: 'Đang sản xuất',
  QUALITY_CHECK: 'Đang kiểm tra chất lượng',
  PACKING: 'Đang đóng gói',
  READY_FOR_SHIPMENT: 'Sẵn sàng vận chuyển',
  DELAYED: 'Chậm tiến độ',
  CANCELLED: 'Đã hủy',
};

export const productionOrdersPath = (projectId: string | null) =>
  projectId
    ? `/production-orders?projectId=${encodeURIComponent(projectId)}`
    : '/production-orders';

export function productionStatusLabel(status: string) {
  const known = productionStatuses[status];
  if (known) return known;
  const words = status.toLowerCase().replaceAll('_', ' ');
  return `Không xác định: ${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

export const canCreateProduction = (
  projectId: string | null,
  permissions: string[],
) => !projectId && permissions.includes('production.create');

export default function ProductionPage() {
  const projectId = useSearchParams().get('projectId');
  const [items, setItems] = useState<Order[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [error, setError] = useState('');
  const load = useCallback(
    () =>
      api<Order[]>(productionOrdersPath(projectId))
        .then(setItems)
        .catch((cause: Error) => setError(cause.message)),
    [projectId],
  );
  useEffect(() => {
    void load();
    if (!projectId)
      void api<Pick<Actor, 'permissions'>>('/me')
        .then((actor) => setPermissions(actor.permissions))
        .catch((cause: Error) => setError(cause.message));
  }, [load, projectId]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api('/production-orders', {
        method: 'POST',
        body: JSON.stringify({ purchaseOrderId: form.get('purchaseOrderId') }),
      });
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Theo dõi sản xuất</h1>
      </header>
      {error && <p role="alert">{error}</p>}
      {canCreateProduction(projectId, permissions) && (
        <form className="panel flex flex-wrap gap-3" onSubmit={create}>
          <label>
            PO đã xác nhận
            <input name="purchaseOrderId" required />
          </label>
          <button className="primary self-end rounded px-3 py-2" type="submit">
            Tạo Production Order
          </button>
        </form>
      )}
      <section className="panel overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr>
              <th>PO</th>
              <th>Tiến độ</th>
              <th>Sẵn sàng dự kiến</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr className="border-t" key={item.id}>
                <td className="py-3">
                  <Link href={`/production/${item.id}`}>
                    {item.purchaseOrder.poNumber}
                  </Link>
                </td>
                <td>{item.progressPercentage}%</td>
                <td>
                  {item.plannedReadyDate
                    ? new Date(item.plannedReadyDate).toLocaleDateString(
                        'vi-VN',
                      )
                    : '—'}
                </td>
                <td>{productionStatusLabel(item.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
