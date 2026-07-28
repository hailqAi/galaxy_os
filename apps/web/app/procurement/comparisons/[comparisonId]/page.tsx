'use client';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';

type Line = {
  id: string;
  supplierQuotationId: string;
  supplierQuotationLineId: string;
  rfqLineId: string;
  supplierId: string;
  originalCurrency: string;
  netProductValue: string;
  landedEstimateBase: string;
  productionLeadTimeDays: number | null;
  paymentTerms: string | null;
  warrantyTerms: string | null;
  technicalCompliance: string;
};
type Comparison = {
  id: string;
  status: string;
  baseCurrency: string;
  rfq: { rfqNumber: string };
  lines: Line[];
  selections: {
    id: string;
    supplierId: string;
    selectionReason: string;
    status: string;
  }[];
};

export default function ComparisonDetailPage() {
  const id = useParams<{ comparisonId: string }>().comparisonId;
  const [item, setItem] = useState<Comparison | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(
    () =>
      api<Comparison>(`/supplier-comparisons/${id}`)
        .then(setItem)
        .catch((e: Error) => setError(e.message)),
    [id],
  );
  useEffect(() => {
    void load();
  }, [load]);
  async function select(
    event: FormEvent<HTMLFormElement>,
    quoteId: string,
    lines: Line[],
  ) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api(`/supplier-comparisons/${id}/select`, {
        method: 'POST',
        body: JSON.stringify({
          supplierQuotationId: quoteId,
          selectionReason: form.get('reason'),
          idempotencyKey: crypto.randomUUID(),
          selectedLines: lines
            .map((line) => ({
              supplierQuotationLineId: line.supplierQuotationLineId,
              quantity: form.get(`quantity-${line.id}`),
            }))
            .filter((line) => Number(line.quantity) > 0),
        }),
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function action(name: string) {
    try {
      await api(`/supplier-comparisons/${id}/${name}`, {
        method: 'POST',
        body: '{}',
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (!item)
    return (
      <p role={error ? 'alert' : undefined}>
        {error || 'Đang tải bảng so sánh…'}
      </p>
    );
  const groups = Map.groupBy(item.lines, (line) => line.supplierQuotationId);
  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold">So sánh {item.rfq.rfqNumber}</h1>
        <p>
          {item.status} · Quy đổi {item.baseCurrency}
        </p>
      </header>
      {error && <p role="alert">{error}</p>}
      <div className="flex gap-2">
        {['DRAFT', 'SELECTION_DRAFT'].includes(item.status) && (
          <button
            className="primary rounded px-3 py-2"
            onClick={() => void action('submit')}
          >
            Gửi duyệt lựa chọn
          </button>
        )}
        {item.status === 'SUBMITTED' && (
          <>
            <button onClick={() => void action('approve')}>Phê duyệt</button>
            <button onClick={() => void action('reject')}>Từ chối</button>
          </>
        )}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {[...groups].map(([quoteId, lines]) => (
          <form
            className="panel grid gap-3"
            key={quoteId}
            onSubmit={(e) => void select(e, quoteId, lines)}
          >
            <h2 className="font-semibold">
              Nhà cung cấp {lines[0]?.supplierId}
            </h2>
            {lines.map((line) => (
              <div
                className="grid grid-cols-2 gap-2 border-t pt-2"
                key={line.id}
              >
                <span>{line.rfqLineId}</span>
                <span>
                  {new Intl.NumberFormat('vi-VN').format(
                    Number(line.landedEstimateBase),
                  )}{' '}
                  {item.baseCurrency}
                </span>
                <span>
                  {line.technicalCompliance} ·{' '}
                  {line.productionLeadTimeDays ?? '—'} ngày
                </span>
                <label>
                  Số lượng chọn
                  <input
                    defaultValue="0"
                    min="0"
                    name={`quantity-${line.id}`}
                    step="0.001"
                    type="number"
                  />
                </label>
              </div>
            ))}
            <label>
              Lý do lựa chọn
              <textarea name="reason" required />
            </label>
            <button type="submit">Chọn các dòng này</button>
          </form>
        ))}
      </div>
      <section className="panel">
        <h2 className="font-semibold">Lựa chọn</h2>
        {item.selections.map((selection) => (
          <p key={selection.id}>
            {selection.supplierId}: {selection.selectionReason} ·{' '}
            {selection.status}{' '}
            {selection.status === 'APPROVED' && (
              <Link
                href={`/procurement/purchase-orders/new?selectionId=${selection.id}`}
              >
                Tạo PO
              </Link>
            )}
          </p>
        ))}
      </section>
    </div>
  );
}
