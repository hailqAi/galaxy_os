'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
const stages = [
  ['DISCOVERY', 'Khám phá'],
  ['QUALIFICATION', 'Đánh giá'],
  ['SURVEY', 'Khảo sát'],
  ['REQUIREMENT', 'Yêu cầu'],
  ['DESIGN_PREPARATION', 'Chuẩn bị thiết kế'],
  ['PROPOSAL', 'Đề xuất'],
  ['NEGOTIATION', 'Đàm phán'],
  ['WON', 'Thành công'],
  ['LOST', 'Thất bại'],
] as const;
type Opportunity = {
  id: string;
  name: string;
  stage: string;
  probability: number;
  estimatedValue: string | null;
  currency: string;
  expectedCloseDate: string | null;
  customer: { displayName: string } | null;
  owner: { displayName: string } | null;
  department: { name: string } | null;
};
type Page = {
  items: Opportunity[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};
export default function OpportunitiesPage() {
  const [data, setData] = useState<Page>();
  const [mode, setMode] = useState<'kanban' | 'table'>('kanban');
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState('');
  const [message, setMessage] = useState('');
  const load = useCallback(async () => {
    try {
      setData(
        await api<Page>(
          `/opportunities?${new URLSearchParams({ page: '1', pageSize: '100', ...(search && { search }), ...(stage && { stage }) })}`,
        ),
      );
    } catch (error) {
      setMessage((error as Error).message);
    }
  }, [search, stage]);
  useEffect(() => {
    const timeout = setTimeout(() => void load(), 0);
    return () => clearTimeout(timeout);
  }, [load]);
  async function move(item: Opportunity) {
    const index = stages.findIndex(([value]) => value === item.stage);
    const next = stages[index + 1];
    if (index < 0 || !next || ['WON', 'LOST'].includes(next[0])) return;
    try {
      await api(`/opportunities/${item.id}/change-stage`, {
        method: 'POST',
        body: JSON.stringify({ stage: next[0] }),
      });
      await load();
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  return (
    <div className="grid gap-5">
      <p className="text-sm text-black/55">Trang chủ / CRM / Cơ hội</p>
      <header className="flex flex-wrap justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Cơ hội</h1>
          <p className="text-sm text-black/60">Quản lý pipeline bán hàng</p>
        </div>
        <div className="flex gap-2">
          <button
            aria-pressed={mode === 'kanban'}
            onClick={() => setMode('kanban')}
          >
            Kanban
          </button>
          <button
            aria-pressed={mode === 'table'}
            onClick={() => setMode('table')}
          >
            Bảng
          </button>
        </div>
      </header>
      <section className="panel flex flex-wrap gap-3">
        <input
          aria-label="Tìm cơ hội"
          placeholder="Tìm cơ hội…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          aria-label="Giai đoạn"
          value={stage}
          onChange={(event) => setStage(event.target.value)}
        >
          <option value="">Tất cả giai đoạn</option>
          {stages.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </section>
      {message && <p role="alert">{message}</p>}
      {!data ? (
        <p role="status">Đang tải pipeline…</p>
      ) : !data.items.length ? (
        <p className="panel">Chưa có cơ hội phù hợp.</p>
      ) : mode === 'kanban' ? (
        <div className="grid gap-3 overflow-x-auto lg:grid-cols-3 xl:grid-cols-5">
          {stages.map(([value, label]) => (
            <section className="panel !p-3" key={value}>
              <h2 className="font-semibold">
                {label} (
                {data.items.filter((item) => item.stage === value).length})
              </h2>
              <div className="mt-3 grid gap-3">
                {data.items
                  .filter((item) => item.stage === value)
                  .map((item) => (
                    <article className="rounded border p-3" key={item.id}>
                      <Link
                        className="font-semibold underline"
                        href={`/crm/opportunities/${item.id}`}
                      >
                        {item.name}
                      </Link>
                      <p className="text-sm">
                        {item.customer?.displayName ?? 'Chưa có khách hàng'}
                      </p>
                      <p>
                        {item.estimatedValue
                          ? Number(item.estimatedValue).toLocaleString('vi-VN')
                          : '—'}{' '}
                        {item.currency}
                      </p>
                      <p className="text-sm">
                        {item.probability}% ·{' '}
                        {item.owner?.displayName ?? 'Chưa gán'}
                      </p>
                      {!['WON', 'LOST', 'NEGOTIATION'].includes(item.stage) && (
                        <button
                          className="mt-2"
                          onClick={() => void move(item)}
                        >
                          Giai đoạn kế
                        </button>
                      )}
                    </article>
                  ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <section className="panel overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Cơ hội</th>
                <th>Khách hàng</th>
                <th>Giai đoạn</th>
                <th>Giá trị</th>
                <th>Xác suất</th>
                <th>Người phụ trách</th>
                <th>Ngày chốt</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <Link href={`/crm/opportunities/${item.id}`}>
                      {item.name}
                    </Link>
                  </td>
                  <td>{item.customer?.displayName ?? '—'}</td>
                  <td>{item.stage}</td>
                  <td>
                    {item.estimatedValue
                      ? Number(item.estimatedValue).toLocaleString('vi-VN')
                      : '—'}
                  </td>
                  <td>{item.probability}%</td>
                  <td>{item.owner?.displayName ?? '—'}</td>
                  <td>
                    {item.expectedCloseDate
                      ? new Date(item.expectedCloseDate).toLocaleDateString(
                          'vi-VN',
                        )
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
