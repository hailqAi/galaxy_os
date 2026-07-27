'use client';
import { FormEvent, use, useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';

type Shipment = {
  shipmentNumber: string;
  status: string;
  mode: string;
  originLocation: string;
  destinationLocation: string;
  trackingMode: string;
  items: {
    id: string;
    quantity: string;
    unit: string;
    purchaseOrderLine: { customDescription: string };
  }[];
  legs: { id: string; sequence: number; origin: string; destination: string }[];
  packages: { id: string; packageNumber: string }[];
  documents: { id: string; type: string; version: number }[];
  customsDeclarations: {
    id: string;
    declarationNumber: string;
    status: string;
  }[];
  landedCosts: {
    id: string;
    number: string;
    totalAmount: string;
    status: string;
  }[];
};
const next: Record<string, string> = {
  PLANNING: 'BOOKED',
  BOOKED: 'PICKED_UP',
  PICKED_UP: 'DEPARTED',
  DEPARTED: 'IN_TRANSIT',
  IN_TRANSIT: 'CUSTOMS_CLEARANCE',
  CUSTOMS_CLEARANCE: 'ARRIVED',
  ARRIVED: 'DELIVERED_TO_WAREHOUSE',
  DELIVERED_TO_WAREHOUSE: 'CLOSED',
};
export default function ShipmentDetail({
  params,
}: {
  params: Promise<{ shipmentId: string }>;
}) {
  const { shipmentId } = use(params);
  const [item, setItem] = useState<Shipment>();
  const [error, setError] = useState('');
  const load = useCallback(
    () =>
      api<Shipment>(`/shipments/${shipmentId}`)
        .then(setItem)
        .catch((cause: Error) => setError(cause.message)),
    [shipmentId],
  );
  useEffect(() => void load(), [load]);
  async function advance() {
    if (!item || !next[item.status]) return;
    try {
      await api(`/shipments/${shipmentId}/change-status`, {
        method: 'POST',
        body: JSON.stringify({ status: next[item.status] }),
      });
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  async function createCustoms(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api('/customs', {
        method: 'POST',
        body: JSON.stringify({
          shipmentId,
          declarationNumber: form.get('declarationNumber'),
          declarationDate: form.get('declarationDate'),
          customsOffice: form.get('customsOffice'),
          importerLegalEntity: form.get('importerLegalEntity'),
          currency: form.get('currency'),
          exchangeRateSnapshot: form.get('exchangeRateSnapshot'),
          lines: [
            {
              shipmentItemId: form.get('shipmentItemId'),
              hsCode: form.get('hsCode'),
              description: form.get('description'),
              quantity: form.get('quantity'),
              customsValue: form.get('customsValue'),
              dutyRate: form.get('dutyRate') || undefined,
            },
          ],
        }),
      });
      event.currentTarget.reset();
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  async function createLandedCost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api('/landed-costs', {
        method: 'POST',
        body: JSON.stringify({
          shipmentId,
          number: form.get('number'),
          baseCurrency: form.get('baseCurrency'),
          idempotencyKey: crypto.randomUUID(),
          lines: [
            {
              category: form.get('category'),
              description: form.get('costDescription'),
              originalCurrency: form.get('baseCurrency'),
              originalAmount: form.get('originalAmount'),
              exchangeRateSnapshot: form.get('costExchangeRate'),
              allocationMethod: 'BY_QUANTITY',
            },
          ],
        }),
      });
      event.currentTarget.reset();
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  if (!item)
    return (
      <p role={error ? 'alert' : undefined}>{error || 'Đang tải shipment…'}</p>
    );
  return (
    <div className="grid gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{item.shipmentNumber}</h1>
          <p>
            {item.originLocation} → {item.destinationLocation} · Theo dõi{' '}
            {item.trackingMode.toLowerCase()}
          </p>
        </div>
        {next[item.status] && (
          <button className="primary rounded px-3 py-2" onClick={advance}>
            {next[item.status]}
          </button>
        )}
      </header>
      {error && <p role="alert">{error}</p>}
      <section className="panel">
        <h2 className="font-semibold">Tổng quan</h2>
        <p>
          {item.mode} · {item.status}
        </p>
      </section>
      <section className="panel overflow-x-auto">
        <h2 className="font-semibold">Sản phẩm</h2>
        <table className="w-full text-left">
          <thead>
            <tr>
              <th>Mô tả</th>
              <th>Số lượng</th>
            </tr>
          </thead>
          <tbody>
            {item.items.map((line) => (
              <tr className="border-t" key={line.id}>
                <td>{line.purchaseOrderLine.customDescription}</td>
                <td>
                  {line.quantity} {line.unit}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="panel">
        <h2 className="font-semibold">Các chặng và kiện hàng</h2>
        <p>
          {item.legs.length} chặng · {item.packages.length} kiện
        </p>
      </section>
      <section className="panel">
        <h2 className="font-semibold">Chứng từ</h2>
        <p>
          {item.documents.length
            ? item.documents.map((x) => `${x.type} v${x.version}`).join(', ')
            : 'Chưa có chứng từ.'}
        </p>
      </section>
      <section className="panel">
        <h2 className="font-semibold">Hải quan</h2>
        {item.customsDeclarations.map((x) => (
          <p key={x.id}>
            {x.declarationNumber} · {x.status}
          </p>
        ))}
        <form
          className="mt-4 grid gap-3 md:grid-cols-3"
          onSubmit={createCustoms}
        >
          <input name="declarationNumber" placeholder="Số tờ khai" required />
          <input name="declarationDate" type="date" required />
          <input name="customsOffice" placeholder="Chi cục hải quan" required />
          <input
            name="importerLegalEntity"
            placeholder="Pháp nhân nhập khẩu"
            required
          />
          <input name="currency" defaultValue="VND" maxLength={3} required />
          <input
            name="exchangeRateSnapshot"
            defaultValue="1"
            inputMode="decimal"
            required
          />
          <select name="shipmentItemId" required>
            {item.items.map((line) => (
              <option key={line.id} value={line.id}>
                {line.purchaseOrderLine.customDescription}
              </option>
            ))}
          </select>
          <input name="hsCode" placeholder="HS code" required />
          <input name="description" placeholder="Mô tả pháp lý" required />
          <input
            name="quantity"
            placeholder="Số lượng"
            inputMode="decimal"
            required
          />
          <input
            name="customsValue"
            placeholder="Trị giá hải quan"
            inputMode="decimal"
            required
          />
          <input
            name="dutyRate"
            placeholder="% thuế nhập khẩu"
            inputMode="decimal"
          />
          <button className="primary rounded px-3 py-2" type="submit">
            Tạo tờ khai
          </button>
        </form>
      </section>
      <section className="panel">
        <h2 className="font-semibold">Chi phí</h2>
        {item.landedCosts.map((x) => (
          <p key={x.id}>
            {x.number} · {x.totalAmount} · {x.status}
          </p>
        ))}
        <form
          className="mt-4 grid gap-3 md:grid-cols-3"
          onSubmit={createLandedCost}
        >
          <input name="number" placeholder="Số landed cost" required />
          <select name="category">
            <option>FREIGHT</option>
            <option>INSURANCE</option>
            <option>CUSTOMS_DUTY</option>
            <option>IMPORT_TAX</option>
            <option>HANDLING</option>
            <option>OTHER</option>
          </select>
          <input name="costDescription" placeholder="Mô tả chi phí" required />
          <input
            name="baseCurrency"
            defaultValue="VND"
            maxLength={3}
            required
          />
          <input
            name="originalAmount"
            placeholder="Số tiền"
            inputMode="decimal"
            required
          />
          <input
            name="costExchangeRate"
            defaultValue="1"
            inputMode="decimal"
            required
          />
          <button className="primary rounded px-3 py-2" type="submit">
            Tạo landed cost
          </button>
        </form>
      </section>
    </div>
  );
}
