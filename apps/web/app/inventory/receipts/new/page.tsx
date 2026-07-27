'use client';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../../lib/api';
export default function NewReceiptPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const source = String(form.get('sourceType'));
    try {
      const item = await api<{ id: string }>('/inventory/receipts', {
        method: 'POST',
        body: JSON.stringify({
          receiptNumber: form.get('receiptNumber'),
          warehouseId: form.get('warehouseId'),
          [source === 'shipment' ? 'shipmentId' : 'purchaseOrderId']:
            form.get('sourceId'),
          lines: [
            {
              purchaseOrderLineId: form.get('purchaseOrderLineId'),
              shipmentItemId: form.get('shipmentItemId') || undefined,
              storageLocationId: form.get('storageLocationId'),
              receivedQuantity: form.get('receivedQuantity'),
              damagedQuantity: form.get('damagedQuantity') || undefined,
              lotNumber: form.get('lotNumber') || undefined,
              serialNumbers: String(form.get('serialNumbers') || '')
                .split(',')
                .map((value) => value.trim())
                .filter(Boolean),
            },
          ],
        }),
      });
      router.push(`/inventory/receipts/${item.id}`);
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">Tạo phiếu nhập kho</h1>
      {error && <p role="alert">{error}</p>}
      <form className="panel grid gap-4 md:grid-cols-2" onSubmit={submit}>
        <label>
          Số phiếu
          <input name="receiptNumber" required />
        </label>
        <label>
          Kho ID
          <input name="warehouseId" required />
        </label>
        <label>
          Nguồn
          <select name="sourceType">
            <option value="shipment">Shipment đã giao kho</option>
            <option value="purchaseOrder">PO đã xác nhận</option>
          </select>
        </label>
        <label>
          Source ID
          <input name="sourceId" required />
        </label>
        <label>
          PO Line ID
          <input name="purchaseOrderLineId" required />
        </label>
        <label>
          Shipment Item ID
          <input name="shipmentItemId" />
        </label>
        <label>
          Vị trí lưu ID
          <input name="storageLocationId" required />
        </label>
        <label>
          Số thực nhận
          <input name="receivedQuantity" inputMode="decimal" required />
        </label>
        <label>
          Số hư hỏng
          <input name="damagedQuantity" inputMode="decimal" />
        </label>
        <label>
          Lot
          <input name="lotNumber" />
        </label>
        <label>
          Serial, cách nhau dấu phẩy
          <input name="serialNumbers" />
        </label>
        <button className="primary rounded px-3 py-2 md:col-span-2">
          Tạo phiếu
        </button>
      </form>
    </div>
  );
}
