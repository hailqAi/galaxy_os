'use client';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '../../../lib/api';

type PurchaseOrder = {
  id: string;
  poNumber: string;
  currency: string;
  exchangeRateSnapshot: string;
  paymentTerms: string | null;
  lines: {
    id: string;
    customDescription: string | null;
    quantity: string;
    unit: string;
    netUnitPrice: string;
  }[];
};

export default function NewProformaInvoicePage() {
  const initialPoId = useSearchParams().get('poId') ?? '';
  const router = useRouter();
  const [poId, setPoId] = useState(initialPoId);
  const [po, setPo] = useState<PurchaseOrder | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!poId) return;
    void api<PurchaseOrder>(`/purchase-orders/${poId}`)
      .then(setPo)
      .catch((cause: Error) => {
        setPo(null);
        setError(cause.message);
      });
  }, [poId]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!po) return;
    const form = new FormData(event.currentTarget);
    try {
      const invoice = await api<{ id: string }>('/proforma-invoices', {
        method: 'POST',
        body: JSON.stringify({
          piNumber: form.get('piNumber'),
          purchaseOrderId: po.id,
          piDate: form.get('piDate'),
          receivedDate: form.get('receivedDate') || undefined,
          dueDate: form.get('dueDate') || undefined,
          currency: po.currency,
          exchangeRateSnapshot: form.get('exchangeRateSnapshot'),
          shippingAmount: form.get('shippingAmount') || '0',
          insuranceAmount: form.get('insuranceAmount') || '0',
          taxAmount: form.get('taxAmount') || '0',
          otherAmount: form.get('otherAmount') || '0',
          paymentTerms: form.get('paymentTerms') || undefined,
          bankReferenceProtected:
            form.get('bankReferenceProtected') || undefined,
          notes: form.get('notes') || undefined,
          lines: po.lines.map((line) => ({
            purchaseOrderLineId: line.id,
            description: form.get(`description-${line.id}`),
            quantity: form.get(`quantity-${line.id}`),
            unit: line.unit,
            unitPrice: form.get(`unitPrice-${line.id}`),
          })),
        }),
      });
      router.push(`/procurement/proforma-invoices/${invoice.id}`);
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Tạo Proforma Invoice</h1>
        <p>Chọn PO đã duyệt; backend sẽ tính và đối chiếu toàn bộ giá trị.</p>
      </header>
      {error && <p role="alert">{error}</p>}
      <label className="max-w-3xl">
        ID đơn mua hàng
        <input
          onChange={(event) => {
            setPoId(event.target.value);
            if (!event.target.value) setPo(null);
          }}
          required
          value={poId}
        />
      </label>
      {po && (
        <form className="grid max-w-5xl gap-5" onSubmit={submit}>
          <section className="panel grid gap-4 md:grid-cols-2">
            <label>
              Số PI
              <input name="piNumber" required />
            </label>
            <label>
              PO
              <input disabled value={po.poNumber} />
            </label>
            <label>
              Ngày PI
              <input name="piDate" required type="date" />
            </label>
            <label>
              Ngày nhận
              <input name="receivedDate" type="date" />
            </label>
            <label>
              Ngày đến hạn
              <input name="dueDate" type="date" />
            </label>
            <label>
              Tỷ giá snapshot
              <input
                defaultValue={po.exchangeRateSnapshot}
                inputMode="decimal"
                name="exchangeRateSnapshot"
                required
              />
            </label>
          </section>
          <section className="panel overflow-x-auto">
            <h2 className="font-semibold">Line items</h2>
            <table className="w-full min-w-[760px] text-left">
              <thead>
                <tr>
                  <th>Mô tả</th>
                  <th>Số lượng PI</th>
                  <th>Đơn vị</th>
                  <th>Đơn giá</th>
                </tr>
              </thead>
              <tbody>
                {po.lines.map((line) => (
                  <tr className="border-t" key={line.id}>
                    <td>
                      <input
                        defaultValue={line.customDescription ?? 'Sản phẩm'}
                        name={`description-${line.id}`}
                        required
                      />
                    </td>
                    <td>
                      <input
                        defaultValue={line.quantity}
                        inputMode="decimal"
                        name={`quantity-${line.id}`}
                        required
                      />
                    </td>
                    <td>{line.unit}</td>
                    <td>
                      <input
                        defaultValue={line.netUnitPrice}
                        inputMode="decimal"
                        name={`unitPrice-${line.id}`}
                        required
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section className="panel grid gap-4 md:grid-cols-2">
            {[
              'shippingAmount',
              'insuranceAmount',
              'taxAmount',
              'otherAmount',
            ].map((name) => (
              <label key={name}>
                {name}
                <input defaultValue="0" inputMode="decimal" name={name} />
              </label>
            ))}
            <label>
              Điều khoản thanh toán
              <textarea
                defaultValue={po.paymentTerms ?? ''}
                name="paymentTerms"
              />
            </label>
            <label>
              Tham chiếu ngân hàng
              <input name="bankReferenceProtected" />
            </label>
            <label className="md:col-span-2">
              Ghi chú
              <textarea name="notes" />
            </label>
          </section>
          <button className="primary w-fit rounded px-3 py-2" type="submit">
            Tạo PI
          </button>
        </form>
      )}
    </div>
  );
}
