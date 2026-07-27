'use client';
import { FormEvent } from 'react';
import { api } from '../../lib/api';
import { Operation, OperationList } from '../operation-list';
function CountActions({
  item,
  reload,
}: {
  item: Operation;
  reload: () => Promise<void>;
}) {
  async function command(name: string) {
    await api(`/inventory/counts/${item.id}/${name}`, { method: 'POST' });
    await reload();
  }
  async function record(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await api(`/inventory/counts/${item.id}/record`, {
      method: 'POST',
      body: JSON.stringify({
        lines: item.lines.map((line) => ({
          cycleCountLineId: line.id,
          countedQuantity: form.get(line.id),
        })),
      }),
    });
    await reload();
  }
  if (item.status === 'FROZEN')
    return (
      <form className="flex flex-wrap gap-2" onSubmit={record}>
        {item.lines.map((line) => (
          <input
            className="w-24"
            key={line.id}
            name={line.id}
            aria-label={`Số đếm ${line.id}`}
            placeholder={line.expectedQuantity}
            required
          />
        ))}
        <button>Ghi nhận</button>
      </form>
    );
  if (item.status === 'DRAFT')
    return <button onClick={() => command('freeze')}>Freeze snapshot</button>;
  if (item.status === 'REVIEW')
    return <button onClick={() => command('approve')}>Duyệt</button>;
  if (item.status === 'APPROVED')
    return <button onClick={() => command('post')}>Post variance</button>;
  return null;
}
export default function CountsPage() {
  async function create(
    event: FormEvent<HTMLFormElement>,
    reload: () => Promise<void>,
  ) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    await api('/inventory/counts', {
      method: 'POST',
      body: JSON.stringify({
        countNumber: f.get('number'),
        projectId: f.get('projectId') || undefined,
        warehouseId: f.get('warehouseId'),
        scope: {
          storageLocationId: f.get('locationId') || undefined,
          inventoryItemId: f.get('inventoryItemId') || undefined,
        },
      }),
    });
    event.currentTarget.reset();
    await reload();
  }
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">Kiểm kê chu kỳ</h1>
      <OperationList
        endpoint="/inventory/counts"
        numberField="countNumber"
        actions={(item, reload) => <CountActions item={item} reload={reload} />}
      >
        {(reload) => (
          <form
            className="panel grid gap-3 md:grid-cols-3"
            onSubmit={(event) => create(event, reload)}
          >
            <input name="number" placeholder="Số kế hoạch" required />
            <input name="projectId" placeholder="Project ID" />
            <input name="warehouseId" placeholder="Warehouse ID" required />
            <input name="locationId" placeholder="Phạm vi Location ID" />
            <input name="inventoryItemId" placeholder="Phạm vi Item ID" />
            <button className="primary rounded px-3 py-2">Tạo kiểm kê</button>
          </form>
        )}
      </OperationList>
    </div>
  );
}
