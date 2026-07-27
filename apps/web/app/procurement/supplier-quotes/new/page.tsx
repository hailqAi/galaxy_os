'use client';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '../../../lib/api';

type RFQList = { id: string; rfqNumber: string; status: string };
type RFQ = RFQList & {
  requestedCurrency: string;
  recipients: { supplierId: string }[];
  lines: {
    id: string;
    customDescription: string | null;
    quantity: string;
    unit: string;
  }[];
};
type Supplier = { id: string; legalName: string };

export default function NewSupplierQuotePage() {
  const router = useRouter();
  const projectId = useSearchParams().get('projectId');
  const [rfqs, setRfqs] = useState<RFQList[]>([]);
  const [rfq, setRfq] = useState<RFQ | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    void Promise.all([
      api<{ items: RFQList[] }>(
        `/rfqs?pageSize=100${projectId ? `&projectId=${projectId}` : ''}`,
      ),
      api<{ items: Supplier[] }>('/suppliers?pageSize=100'),
    ])
      .then(([r, s]) => {
        setRfqs(
          r.items.filter((item) =>
            ['SENT', 'PARTIALLY_RESPONDED', 'RESPONDED'].includes(item.status),
          ),
        );
        setSuppliers(s.items);
      })
      .catch((e: Error) => setError(e.message));
  }, [projectId]);
  async function selectRFQ(id: string) {
    setRfq(id ? await api<RFQ>(`/rfqs/${id}`) : null);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!rfq) return;
    const form = new FormData(event.currentTarget);
    try {
      const created = await api<{ id: string }>('/supplier-quotations', {
        method: 'POST',
        body: JSON.stringify({
          rfqId: rfq.id,
          supplierId: form.get('supplierId'),
          quotationNumber: form.get('quotationNumber'),
          quotationDate: form.get('quotationDate'),
          validUntil: form.get('validUntil') || undefined,
          currency: form.get('currency'),
          exchangeRateSnapshot: form.get('exchangeRateSnapshot'),
          shippingCost: form.get('shippingCost') || '0',
          insuranceCost: form.get('insuranceCost') || '0',
          discountAmount: form.get('discountAmount') || '0',
          taxAmount: form.get('taxAmount') || '0',
          paymentTerms: form.get('paymentTerms'),
          lines: rfq.lines.map((line) => ({
            rfqLineId: line.id,
            description: line.customDescription || 'Sản phẩm',
            quantity: form.get(`quantity-${line.id}`),
            unit: line.unit,
            listPrice: form.get(`price-${line.id}`),
            discountPercent: form.get(`discount-${line.id}`) || '0',
          })),
        }),
      });
      router.push(`/procurement/supplier-quotes/${created.id}`);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const supplierName = new Map(suppliers.map((s) => [s.id, s.legalName]));
  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold">
          Ghi nhận báo giá nhà cung cấp
        </h1>
        <p>Giá trị được tính lại tại backend bằng Decimal.</p>
      </header>
      {error && <p role="alert">{error}</p>}
      <form className="panel grid max-w-4xl gap-4" onSubmit={submit}>
        <label>
          RFQ
          <select required onChange={(e) => void selectRFQ(e.target.value)}>
            <option value="">Chọn RFQ đã gửi</option>
            {rfqs.map((item) => (
              <option key={item.id} value={item.id}>
                {item.rfqNumber}
              </option>
            ))}
          </select>
        </label>
        {rfq && (
          <>
            <label>
              Nhà cung cấp
              <select name="supplierId" required>
                <option value="">Chọn nhà cung cấp</option>
                {rfq.recipients.map((r) => (
                  <option key={r.supplierId} value={r.supplierId}>
                    {supplierName.get(r.supplierId) || r.supplierId}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <label>
                Số báo giá
                <input name="quotationNumber" required />
              </label>
              <label>
                Ngày báo giá
                <input name="quotationDate" type="date" required />
              </label>
              <label>
                Hiệu lực đến
                <input name="validUntil" type="date" />
              </label>
              <label>
                Tiền tệ
                <input
                  defaultValue={rfq.requestedCurrency}
                  name="currency"
                  required
                />
              </label>
              <label>
                Tỷ giá snapshot
                <input
                  defaultValue="1"
                  min="0.000001"
                  name="exchangeRateSnapshot"
                  step="0.000001"
                  type="number"
                  required
                />
              </label>
              <label>
                Điều khoản thanh toán
                <input name="paymentTerms" />
              </label>
            </div>
            <section className="grid gap-3">
              <h2 className="font-semibold">Line items</h2>
              {rfq.lines.map((line) => (
                <div
                  className="grid gap-2 border-t pt-3 md:grid-cols-4"
                  key={line.id}
                >
                  <span>{line.customDescription || 'Sản phẩm'}</span>
                  <label>
                    Số lượng
                    <input
                      defaultValue={line.quantity}
                      max={line.quantity}
                      min="0.001"
                      name={`quantity-${line.id}`}
                      step="0.001"
                      type="number"
                      required
                    />
                  </label>
                  <label>
                    Đơn giá
                    <input
                      min="0"
                      name={`price-${line.id}`}
                      step="0.01"
                      type="number"
                      required
                    />
                  </label>
                  <label>
                    Chiết khấu %
                    <input
                      defaultValue="0"
                      max="100"
                      min="0"
                      name={`discount-${line.id}`}
                      step="0.0001"
                      type="number"
                    />
                  </label>
                </div>
              ))}
            </section>
            <div className="grid gap-3 md:grid-cols-4">
              <label>
                Vận chuyển
                <input
                  defaultValue="0"
                  min="0"
                  name="shippingCost"
                  step="0.01"
                  type="number"
                />
              </label>
              <label>
                Bảo hiểm
                <input
                  defaultValue="0"
                  min="0"
                  name="insuranceCost"
                  step="0.01"
                  type="number"
                />
              </label>
              <label>
                Giảm giá chung
                <input
                  defaultValue="0"
                  min="0"
                  name="discountAmount"
                  step="0.01"
                  type="number"
                />
              </label>
              <label>
                Thuế
                <input
                  defaultValue="0"
                  min="0"
                  name="taxAmount"
                  step="0.01"
                  type="number"
                />
              </label>
            </div>
            <button className="primary rounded px-3 py-2" type="submit">
              Ghi nhận báo giá
            </button>
          </>
        )}
      </form>
    </div>
  );
}
