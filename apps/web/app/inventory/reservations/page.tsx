'use client';
import { FormEvent } from 'react';
import { api } from '../../lib/api';
import { OperationList } from '../operation-list';
export default function ReservationsPage() {
  async function create(
    event: FormEvent<HTMLFormElement>,
    reload: () => Promise<void>,
  ) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await api('/inventory/reservations', {
      method: 'POST',
      body: JSON.stringify({
        reservationNumber: form.get('number'),
        projectId: form.get('projectId'),
        warehouseId: form.get('warehouseId'),
        requiredDate: form.get('requiredDate'),
        purpose: form.get('purpose'),
        lines: [
          {
            inventoryItemId: form.get('inventoryItemId'),
            storageLocationId: form.get('locationId') || undefined,
            quantity: form.get('quantity'),
          },
        ],
      }),
    });
    event.currentTarget.reset();
    await reload();
  }
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">Giữ hàng dự án</h1>
      <OperationList
        endpoint="/inventory/reservations"
        numberField="reservationNumber"
        actions={(item, reload) => (
          <span className="flex gap-2">
            {item.status === 'REQUESTED' && (
              <button
                onClick={async () => {
                  await api(`/inventory/reservations/${item.id}/approve`, {
                    method: 'POST',
                    body: '{}',
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
                  await api(`/inventory/reservations/${item.id}/reserve`, {
                    method: 'POST',
                  });
                  await reload();
                }}
              >
                Reserve
              </button>
            )}
            {['RESERVED', 'PARTIALLY_ISSUED'].includes(item.status) && (
              <button
                onClick={async () => {
                  await api(`/inventory/reservations/${item.id}/release`, {
                    method: 'POST',
                  });
                  await reload();
                }}
              >
                Release
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
            <input name="number" placeholder="Số reservation" required />
            <input name="projectId" placeholder="Project ID" required />
            <input name="warehouseId" placeholder="Warehouse ID" required />
            <input name="requiredDate" type="date" required />
            <input name="purpose" placeholder="Mục đích" required />
            <input
              name="inventoryItemId"
              placeholder="Inventory Item ID"
              required
            />
            <input name="locationId" placeholder="Location ID" />
            <input name="quantity" placeholder="Số lượng" required />
            <button className="primary rounded px-3 py-2">Tạo yêu cầu</button>
          </form>
        )}
      </OperationList>
    </div>
  );
}
