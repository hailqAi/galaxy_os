'use client';
import { use, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
type Item = {
  itemCode: string;
  unit: string;
  product?: { productCode: string; name: string };
  purchaseOrderId: string | null;
  shipmentId: string | null;
  lots: { id: string; lotNumber: string }[];
  serials: { id: string; serialNumber: string; status: string }[];
  balances: {
    id: string;
    onHand: string;
    available: string;
    reserved: string;
    qualityHold: string;
    damaged: string;
    issued: string;
    installed: string;
    warehouse: { name: string };
    storageLocation: { code: string } | null;
  }[];
  transactionLines: {
    id: string;
    quantity: string;
    transaction: { transactionNumber: string; type: string; postedAt: string };
  }[];
};
export default function InventoryItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [item, setItem] = useState<Item>();
  const [error, setError] = useState('');
  useEffect(() => {
    api<Item>(`/inventory/items/${id}`)
      .then(setItem)
      .catch((cause: Error) => setError(cause.message));
  }, [id]);
  if (!item)
    return (
      <p role={error ? 'alert' : undefined}>{error || 'Đang tải tồn kho…'}</p>
    );
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">
        {item.itemCode} · {item.product?.name || 'Sản phẩm'}
      </h1>
      <section className="panel">
        <p>
          PO: {item.purchaseOrderId || '—'} · Shipment: {item.shipmentId || '—'}
        </p>
        <p>Lot: {item.lots.map((x) => x.lotNumber).join(', ') || '—'}</p>
        <p>
          Serial:{' '}
          {item.serials
            .map((x) => `${x.serialNumber} (${x.status})`)
            .join(', ') || '—'}
        </p>
      </section>
      <section className="panel overflow-x-auto">
        <h2 className="font-semibold">Balance theo vị trí</h2>
        <table className="w-full text-left">
          <thead>
            <tr>
              <th>Kho/Vị trí</th>
              <th>On hand</th>
              <th>Available</th>
              <th>Reserved</th>
              <th>Quality</th>
              <th>Damaged</th>
              <th>Issued</th>
              <th>Installed</th>
            </tr>
          </thead>
          <tbody>
            {item.balances.map((x) => (
              <tr className="border-t" key={x.id}>
                <td>
                  {x.warehouse.name}/{x.storageLocation?.code || '—'}
                </td>
                <td>{x.onHand}</td>
                <td>{x.available}</td>
                <td>{x.reserved}</td>
                <td>{x.qualityHold}</td>
                <td>{x.damaged}</td>
                <td>{x.issued}</td>
                <td>{x.installed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="panel">
        <h2 className="font-semibold">Lịch sử transaction</h2>
        {item.transactionLines.map((line) => (
          <p key={line.id}>
            {line.transaction.transactionNumber} · {line.transaction.type} ·{' '}
            {line.quantity} {item.unit}
          </p>
        ))}
      </section>
    </div>
  );
}
