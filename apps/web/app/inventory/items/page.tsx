'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
type Item = {
  id: string;
  itemCode: string;
  unit: string;
  product?: { productCode: string; name: string };
  balances: {
    onHand: string;
    available: string;
    reserved: string;
    qualityHold: string;
    damaged: string;
  }[];
};
export default function InventoryItemsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    api<{ items: Item[] }>('/inventory/items')
      .then((result) => setItems(result.items))
      .catch((cause: Error) => setError(cause.message));
  }, []);
  const sum = (item: Item, field: keyof Item['balances'][number]) =>
    item.balances.reduce((value, balance) => value + Number(balance[field]), 0);
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">Danh mục tồn kho</h1>
      {error && <p role="alert">{error}</p>}
      <section className="panel overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr>
              <th>Mã</th>
              <th>Sản phẩm</th>
              <th>On hand</th>
              <th>Available</th>
              <th>Reserved</th>
              <th>Quality hold</th>
              <th>Damaged</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr className="border-t" key={item.id}>
                <td>
                  <Link href={`/inventory/items/${item.id}`}>
                    {item.itemCode}
                  </Link>
                </td>
                <td>
                  {item.product?.name || item.product?.productCode || '—'}
                </td>
                <td>{sum(item, 'onHand')}</td>
                <td>{sum(item, 'available')}</td>
                <td>{sum(item, 'reserved')}</td>
                <td>{sum(item, 'qualityHold')}</td>
                <td>{sum(item, 'damaged')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!items.length && !error && <p className="py-6">Chưa có tồn kho.</p>}
      </section>
    </div>
  );
}
