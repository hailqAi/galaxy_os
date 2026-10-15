'use client';
import { createCommandKey } from '../../../lib/create-command-key';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../../lib/api';

export default function NewShipmentPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const shipment = await api<{ id: string }>('/shipments', {
        method: 'POST',
        body: JSON.stringify({
          shipmentNumber: form.get('shipmentNumber'),
          purchaseOrderId: form.get('purchaseOrderId'),
          idempotencyKey: createCommandKey(),
          mode: form.get('mode'),
          originCountry: form.get('originCountry'),
          originLocation: form.get('originLocation'),
          destinationCountry: form.get('destinationCountry'),
          destinationLocation: form.get('destinationLocation'),
          items: [
            {
              purchaseOrderLineId: form.get('purchaseOrderLineId'),
              quantity: form.get('quantity'),
            },
          ],
        }),
      });
      router.push(`/logistics/shipments/${shipment.id}`);
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">Tạo Shipment</h1>
      {error && <p role="alert">{error}</p>}
      <form className="panel grid gap-4 md:grid-cols-2" onSubmit={submit}>
        <label>
          Số Shipment
          <input name="shipmentNumber" required />
        </label>
        <label>
          PO ID
          <input name="purchaseOrderId" required />
        </label>
        <label>
          PO Line ID
          <input name="purchaseOrderLineId" required />
        </label>
        <label>
          Số lượng
          <input name="quantity" inputMode="decimal" required />
        </label>
        <label>
          Phương thức
          <select name="mode">
            <option>SEA</option>
            <option>AIR</option>
            <option>ROAD</option>
            <option>RAIL</option>
            <option>COURIER</option>
            <option>MULTIMODAL</option>
          </select>
        </label>
        <label>
          Quốc gia đi
          <input name="originCountry" required />
        </label>
        <label>
          Điểm đi
          <input name="originLocation" required />
        </label>
        <label>
          Quốc gia đến
          <input name="destinationCountry" required />
        </label>
        <label>
          Điểm đến
          <input name="destinationLocation" required />
        </label>
        <button
          className="primary rounded px-3 py-2 md:col-span-2"
          type="submit"
        >
          Tạo Shipment
        </button>
      </form>
    </div>
  );
}
