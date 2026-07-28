'use client';
import { FormEvent } from 'react';
import { api } from '../../lib/api';
import { Operation, OperationList } from '../operation-list';
export default function TransfersPage() {
  async function create(
    event: FormEvent<HTMLFormElement>,
    reload: () => Promise<void>,
  ) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    await api('/inventory/transfers', {
      method: 'POST',
      body: JSON.stringify({
        transferNumber: f.get('number'),
        type: f.get('type'),
        projectId: f.get('projectId') || undefined,
        sourceWarehouseId: f.get('sourceWarehouseId'),
        destinationWarehouseId: f.get('destinationWarehouseId'),
        lines: [
          {
            inventoryItemId: f.get('inventoryItemId'),
            storageLocationId: f.get('sourceLocationId') || undefined,
            destinationLocationId: f.get('destinationLocationId') || undefined,
            quantity: f.get('quantity'),
          },
        ],
      }),
    });
    event.currentTarget.reset();
    await reload();
  }
  async function action(
    item: Operation,
    command: string,
    reload: () => Promise<void>,
  ) {
    const body =
      command === 'receive'
        ? JSON.stringify({
            idempotencyKey: crypto.randomUUID(),
            lines: item.lines.map((line) => ({
              stockTransferLineId: line.id,
              quantity: String(
                Number(line.quantity) - Number(line.receivedQuantity || 0),
              ),
            })),
          })
        : undefined;
    await api(`/inventory/transfers/${item.id}/${command}`, {
      method: 'POST',
      body,
    });
    await reload();
  }
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">Điều chuyển kho</h1>
      <OperationList
        endpoint="/inventory/transfers"
        numberField="transferNumber"
        actions={(item, reload) => (
          <span>
            {item.status === 'DRAFT' && (
              <button onClick={() => action(item, 'approve', reload)}>
                Duyệt
              </button>
            )}
            {item.status === 'APPROVED' && (
              <button onClick={() => action(item, 'dispatch', reload)}>
                Xuất kho
              </button>
            )}
            {['IN_TRANSIT', 'PARTIALLY_RECEIVED'].includes(item.status) && (
              <button onClick={() => action(item, 'receive', reload)}>
                Nhận phần còn lại
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
            <input name="number" placeholder="Số transfer" required />
            <select name="type">
              <option>WAREHOUSE_TO_WAREHOUSE</option>
              <option>LOCATION_TO_LOCATION</option>
              <option>WAREHOUSE_TO_SITE</option>
              <option>SITE_TO_WAREHOUSE</option>
            </select>
            <input name="projectId" placeholder="Project ID" />
            <input
              name="sourceWarehouseId"
              placeholder="Kho nguồn ID"
              required
            />
            <input
              name="destinationWarehouseId"
              placeholder="Kho đích ID"
              required
            />
            <input
              name="inventoryItemId"
              placeholder="Inventory Item ID"
              required
            />
            <input name="sourceLocationId" placeholder="Vị trí nguồn ID" />
            <input name="destinationLocationId" placeholder="Vị trí đích ID" />
            <input name="quantity" placeholder="Số lượng" required />
            <button className="primary rounded px-3 py-2">Tạo transfer</button>
          </form>
        )}
      </OperationList>
    </div>
  );
}
