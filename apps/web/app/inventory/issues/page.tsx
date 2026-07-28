'use client';
import { FormEvent } from 'react';
import { api } from '../../lib/api';
import { OperationList } from '../operation-list';
export default function IssuesPage() {
  async function create(
    event: FormEvent<HTMLFormElement>,
    reload: () => Promise<void>,
  ) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    await api('/inventory/issues', {
      method: 'POST',
      body: JSON.stringify({
        issueNumber: f.get('number'),
        projectId: f.get('projectId') || undefined,
        warehouseId: f.get('warehouseId'),
        reason: f.get('reason'),
        recipient: f.get('recipient'),
        lines: [
          {
            inventoryItemId: f.get('inventoryItemId'),
            storageLocationId: f.get('locationId') || undefined,
            reservationLineId: f.get('reservationLineId') || undefined,
            quantity: f.get('quantity'),
          },
        ],
      }),
    });
    event.currentTarget.reset();
    await reload();
  }
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">Xuất kho</h1>
      <OperationList
        endpoint="/inventory/issues"
        numberField="issueNumber"
        actions={(item, reload) => (
          <span>
            {item.status === 'DRAFT' && (
              <button
                onClick={async () => {
                  await api(`/inventory/issues/${item.id}/approve`, {
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
                  await api(`/inventory/issues/${item.id}/post`, {
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
            <input name="number" placeholder="Số issue" required />
            <input name="projectId" placeholder="Project ID" />
            <input name="warehouseId" placeholder="Warehouse ID" required />
            <select name="reason">
              <option>INSTALLATION</option>
              <option>PROJECT_SITE</option>
              <option>SHOWROOM</option>
              <option>SAMPLE</option>
              <option>INTERNAL_USE</option>
              <option>WARRANTY_REPLACEMENT</option>
              <option>RETURN_TO_SUPPLIER</option>
              <option>OTHER</option>
            </select>
            <input name="recipient" placeholder="Người nhận" required />
            <input
              name="inventoryItemId"
              placeholder="Inventory Item ID"
              required
            />
            <input name="locationId" placeholder="Location ID" />
            <input name="reservationLineId" placeholder="Reservation Line ID" />
            <input name="quantity" placeholder="Số lượng" required />
            <button className="primary rounded px-3 py-2">Tạo issue</button>
          </form>
        )}
      </OperationList>
    </div>
  );
}
