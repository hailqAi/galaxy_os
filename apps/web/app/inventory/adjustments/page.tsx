'use client';
import { FormEvent } from 'react';
import { api } from '../../lib/api';
import { OperationList } from '../operation-list';
export default function AdjustmentsPage() {
  async function create(
    event: FormEvent<HTMLFormElement>,
    reload: () => Promise<void>,
  ) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    await api('/inventory/adjustments', {
      method: 'POST',
      body: JSON.stringify({
        adjustmentNumber: f.get('number'),
        projectId: f.get('projectId') || undefined,
        warehouseId: f.get('warehouseId'),
        reason: f.get('reason'),
        explanation: f.get('explanation'),
        lines: [
          {
            inventoryItemId: f.get('inventoryItemId'),
            storageLocationId: f.get('locationId') || undefined,
            expectedQuantity: f.get('expectedQuantity'),
            actualQuantity: f.get('actualQuantity'),
          },
        ],
      }),
    });
    event.currentTarget.reset();
    await reload();
  }
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">Điều chỉnh tồn kho</h1>
      <OperationList
        endpoint="/inventory/adjustments"
        numberField="adjustmentNumber"
        actions={(item, reload) => (
          <span>
            {item.status === 'DRAFT' && (
              <button
                onClick={async () => {
                  await api(`/inventory/adjustments/${item.id}/approve`, {
                    method: 'POST',
                  });
                  await reload();
                }}
              >
                Duyệt
              </button>
            )}
            {item.status === 'APPROVED' && (
              <button
                onClick={async () => {
                  await api(`/inventory/adjustments/${item.id}/post`, {
                    method: 'POST',
                  });
                  await reload();
                }}
              >
                Post
              </button>
            )}
          </span>
        )}
      >
        {(reload) => (
          <form
            className="panel grid gap-3 md:grid-cols-3"
            onSubmit={(event) => create(event, reload)}
          >
            <input name="number" placeholder="Số adjustment" required />
            <input name="projectId" placeholder="Project ID" />
            <input name="warehouseId" placeholder="Warehouse ID" required />
            <select name="reason">
              <option>COUNT_VARIANCE</option>
              <option>DAMAGE</option>
              <option>LOSS</option>
              <option>FOUND</option>
              <option>DATA_CORRECTION</option>
              <option>OTHER</option>
            </select>
            <input name="explanation" placeholder="Giải trình" required />
            <input
              name="inventoryItemId"
              placeholder="Inventory Item ID"
              required
            />
            <input name="locationId" placeholder="Location ID" />
            <input name="expectedQuantity" placeholder="Số dự kiến" required />
            <input name="actualQuantity" placeholder="Số thực tế" required />
            <button className="primary rounded px-3 py-2">
              Tạo adjustment
            </button>
          </form>
        )}
      </OperationList>
    </div>
  );
}
