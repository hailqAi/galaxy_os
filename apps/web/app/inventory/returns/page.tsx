'use client';
import { FormEvent } from 'react';
import { api } from '../../lib/api';
import { OperationList } from '../operation-list';
export default function ReturnsPage() {
  async function create(
    event: FormEvent<HTMLFormElement>,
    reload: () => Promise<void>,
  ) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    await api('/inventory/returns', {
      method: 'POST',
      body: JSON.stringify({
        returnNumber: f.get('number'),
        projectId: f.get('projectId') || undefined,
        warehouseId: f.get('warehouseId'),
        reason: f.get('reason'),
        lines: [
          {
            inventoryItemId: f.get('inventoryItemId'),
            storageLocationId: f.get('locationId') || undefined,
            stockIssueLineId: f.get('stockIssueLineId') || undefined,
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
      <h1 className="text-2xl font-semibold">Hàng trả về</h1>
      <OperationList
        endpoint="/inventory/returns"
        numberField="returnNumber"
        actions={(item, reload) =>
          item.status === 'DRAFT' && (
            <button
              onClick={async () => {
                await api(`/inventory/returns/${item.id}/receive`, {
                  method: 'POST',
                });
                await reload();
              }}
            >
              Nhận vào Quality Hold
            </button>
          )
        }
      >
        {(reload) => (
          <form
            className="panel grid gap-3 md:grid-cols-3"
            onSubmit={(event) => create(event, reload)}
          >
            <input name="number" placeholder="Số return" required />
            <input name="projectId" placeholder="Project ID" />
            <input name="warehouseId" placeholder="Warehouse ID" required />
            <select name="reason">
              <option>SITE_RETURN</option>
              <option>CUSTOMER_RETURN</option>
              <option>WARRANTY_RETURN</option>
              <option>SUPPLIER_RETURN</option>
              <option>UNUSED_MATERIAL</option>
              <option>OTHER</option>
            </select>
            <input
              name="inventoryItemId"
              placeholder="Inventory Item ID"
              required
            />
            <input name="locationId" placeholder="Location ID" />
            <input name="stockIssueLineId" placeholder="Issue Line ID" />
            <input name="quantity" placeholder="Số lượng" required />
            <button className="primary rounded px-3 py-2">Tạo return</button>
          </form>
        )}
      </OperationList>
    </div>
  );
}
