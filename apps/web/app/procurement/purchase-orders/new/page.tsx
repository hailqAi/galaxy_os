'use client';
import { FormEvent, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '../../../lib/api';
export default function NewPurchaseOrderPage() {
  const selectionId = useSearchParams().get('selectionId') || '';
  const router = useRouter();
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const item = await api<{ id: string }>('/purchase-orders', {
        method: 'POST',
        body: JSON.stringify({
          supplierSelectionId: form.get('supplierSelectionId'),
          poNumber: form.get('poNumber'),
          deliveryAddress: form.get('deliveryAddress'),
          billingAddress: form.get('billingAddress') || undefined,
          expectedProductionStart:
            form.get('expectedProductionStart') || undefined,
          expectedReadyDate: form.get('expectedReadyDate') || undefined,
          notes: form.get('notes') || undefined,
        }),
      });
      router.push(`/procurement/purchase-orders/${item.id}`);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Tạo đơn mua hàng</h1>
        <p>
          Line và giá được lấy từ selection đã phê duyệt; backend tính lại tổng.
        </p>
      </header>
      {error && <p role="alert">{error}</p>}
      <form className="panel grid max-w-3xl gap-4" onSubmit={submit}>
        <label>
          Mã lựa chọn đã duyệt
          <input
            defaultValue={selectionId}
            name="supplierSelectionId"
            required
          />
        </label>
        <label>
          Số PO
          <input name="poNumber" required />
        </label>
        <label>
          Địa chỉ giao hàng
          <textarea name="deliveryAddress" required />
        </label>
        <label>
          Địa chỉ thanh toán
          <textarea name="billingAddress" />
        </label>
        <div className="grid gap-3 md:grid-cols-2">
          <label>
            Bắt đầu sản xuất dự kiến
            <input name="expectedProductionStart" type="date" />
          </label>
          <label>
            Sẵn sàng dự kiến
            <input name="expectedReadyDate" type="date" />
          </label>
        </div>
        <label>
          Ghi chú
          <textarea name="notes" />
        </label>
        <button className="primary rounded px-3 py-2" type="submit">
          Tạo PO
        </button>
      </form>
    </div>
  );
}
