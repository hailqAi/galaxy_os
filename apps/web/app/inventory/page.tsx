'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
type Summary = {
  onHand: string | null;
  available: string | null;
  reserved: string | null;
  inTransit: string | null;
  qualityHold: string | null;
  damaged: string | null;
};
export default function InventoryPage() {
  const projectId = useSearchParams().get('projectId');
  const [summary, setSummary] = useState<Summary>();
  const [error, setError] = useState('');
  useEffect(() => {
    api<Summary>(
      `/inventory/summary${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`,
    )
      .then(setSummary)
      .catch((cause: Error) => setError(cause.message));
  }, [projectId]);
  const cards: [string, keyof Summary][] = [
    ['On hand', 'onHand'],
    ['Available', 'available'],
    ['Reserved', 'reserved'],
    ['In transit', 'inTransit'],
    ['Quality hold', 'qualityHold'],
    ['Damaged', 'damaged'],
  ];
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">Tồn kho</h1>
      {error && <p role="alert">{error}</p>}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {cards.map(([label, field]) => (
          <div className="panel" key={label}>
            <p>{label}</p>
            <strong>{summary?.[field] || '0'}</strong>
          </div>
        ))}
      </section>
      <section className="panel flex flex-wrap gap-4">
        <Link href="/inventory/items">Danh mục tồn kho</Link>
        <Link href="/inventory/transactions">Lịch sử giao dịch</Link>
        <Link href="/inventory/receipts">Phiếu nhập kho</Link>
        <Link href="/inventory/reservations">Giữ hàng</Link>
        <Link href="/inventory/transfers">Điều chuyển</Link>
        <Link href="/inventory/issues">Xuất kho</Link>
        <Link href="/inventory/returns">Hàng trả</Link>
        <Link href="/inventory/adjustments">Điều chỉnh</Link>
        <Link href="/inventory/counts">Kiểm kê</Link>
      </section>
    </div>
  );
}
