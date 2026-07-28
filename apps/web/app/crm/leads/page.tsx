'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';

type Lead = {
  id: string;
  name: string;
  companyName: string | null;
  phone: string | null;
  status: string;
  priority: string;
  estimatedValue: string | null;
  currency: string;
  expectedCloseDate: string | null;
  updatedAt: string;
  source: { name: string } | null;
  owner: { displayName: string } | null;
  department: { name: string } | null;
};
type Page = {
  items: Lead[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};
type Source = { id: string; name: string };

export default function LeadsPage() {
  const router = useRouter();
  const [data, setData] = useState<Page>();
  const [sources, setSources] = useState<Source[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [priority, setPriority] = useState('');
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState('');
  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: '20',
        ...(search && { search }),
        ...(status && { status }),
        ...(sourceId && { sourceId }),
        ...(priority && { priority }),
      });
      setData(await api<Page>(`/leads?${params}`));
    } catch (error) {
      setMessage((error as Error).message);
    }
  }, [page, priority, search, sourceId, status]);
  useEffect(() => {
    const timeout = setTimeout(() => void load(), 0);
    return () => clearTimeout(timeout);
  }, [load]);
  useEffect(() => {
    api<Source[]>('/lead-sources')
      .then(setSources)
      .catch(() => undefined);
  }, []);
  const count = (value: string) =>
    data?.items.filter((lead) => lead.status === value).length ?? 0;
  async function action(lead: Lead, kind: 'qualify' | 'archive' | 'convert') {
    try {
      if (kind === 'convert') {
        const result = await api<{ opportunityId: string }>(
          `/leads/${lead.id}/convert-to-opportunity`,
          { method: 'POST' },
        );
        router.push(`/crm/opportunities/${result.opportunityId}`);
        return;
      }
      await api(
        `/leads/${lead.id}/${kind === 'archive' ? 'change-status' : 'qualify'}`,
        {
          method: 'POST',
          body:
            kind === 'archive'
              ? JSON.stringify({ status: 'ARCHIVED' })
              : undefined,
        },
      );
      await load();
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  return (
    <div className="grid gap-5">
      <p className="text-sm text-black/55">
        Trang chủ / CRM / Khách hàng tiềm năng
      </p>
      <header className="flex flex-wrap justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Khách hàng tiềm năng</h1>
          <p className="text-sm text-black/60">
            Theo dõi và chuyển đổi Lead thành cơ hội
          </p>
        </div>
        <Link className="primary rounded px-4 py-2" href="/crm/leads/new">
          + Thêm Lead
        </Link>
      </header>
      <section className="grid gap-3 sm:grid-cols-5">
        {[
          ['Lead mới', count('NEW')],
          ['Chưa liên hệ', count('ASSIGNED')],
          ['Đang xử lý', count('CONTACTED')],
          ['Đủ điều kiện', count('QUALIFIED')],
          ['Đã chuyển đổi', count('CONVERTED')],
        ].map(([label, value]) => (
          <div className="panel" key={label}>
            <p className="text-sm text-black/55">{label}</p>
            <strong className="text-2xl">{value}</strong>
          </div>
        ))}
      </section>
      <section className="panel grid gap-4">
        <div className="flex flex-wrap gap-3">
          <input
            aria-label="Tìm Lead"
            placeholder="Tìm Lead…"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
          <select
            aria-label="Trạng thái"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">Tất cả trạng thái</option>
            {[
              'NEW',
              'ASSIGNED',
              'CONTACTED',
              'QUALIFIED',
              'UNQUALIFIED',
              'CONVERTED',
              'ARCHIVED',
            ].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select
            aria-label="Nguồn"
            value={sourceId}
            onChange={(event) => setSourceId(event.target.value)}
          >
            <option value="">Tất cả nguồn</option>
            {sources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Ưu tiên"
            value={priority}
            onChange={(event) => setPriority(event.target.value)}
          >
            <option value="">Tất cả ưu tiên</option>
            {['LOW', 'NORMAL', 'HIGH', 'URGENT'].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </div>
        {message && <p role="alert">{message}</p>}
        {!data ? (
          <p role="status">Đang tải Lead…</p>
        ) : !data.items.length ? (
          <p>Chưa có Lead phù hợp.</p>
        ) : (
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Lead</th>
                  <th>Công ty</th>
                  <th>Nguồn</th>
                  <th>Điện thoại</th>
                  <th>Người phụ trách</th>
                  <th>Phòng ban</th>
                  <th>Trạng thái</th>
                  <th>Ưu tiên</th>
                  <th>Giá trị</th>
                  <th>Ngày chốt</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((lead) => (
                  <tr key={lead.id}>
                    <td>
                      <Link
                        className="underline"
                        href={`/crm/leads/${lead.id}`}
                      >
                        {lead.name}
                      </Link>
                    </td>
                    <td>{lead.companyName ?? '—'}</td>
                    <td>{lead.source?.name ?? '—'}</td>
                    <td>{lead.phone ?? '—'}</td>
                    <td>{lead.owner?.displayName ?? '—'}</td>
                    <td>{lead.department?.name ?? '—'}</td>
                    <td>{lead.status}</td>
                    <td>{lead.priority}</td>
                    <td>
                      {lead.estimatedValue
                        ? Number(lead.estimatedValue).toLocaleString('vi-VN')
                        : '—'}{' '}
                      {lead.currency}
                    </td>
                    <td>
                      {lead.expectedCloseDate
                        ? new Date(lead.expectedCloseDate).toLocaleDateString(
                            'vi-VN',
                          )
                        : '—'}
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        <Link href={`/crm/leads/${lead.id}/edit`}>Sửa</Link>
                        {!['CONVERTED', 'ARCHIVED'].includes(lead.status) && (
                          <>
                            <button
                              onClick={() => void action(lead, 'qualify')}
                            >
                              Đủ ĐK
                            </button>
                            <button
                              onClick={() => void action(lead, 'convert')}
                            >
                              Chuyển đổi
                            </button>
                            <button
                              onClick={() => void action(lead, 'archive')}
                            >
                              Lưu trữ
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Trước
          </button>
          <span className="px-3 py-2">
            {page}/{data?.totalPages || 1}
          </span>
          <button
            disabled={!data || page >= data.totalPages}
            onClick={() => setPage(page + 1)}
          >
            Sau
          </button>
        </div>
      </section>
    </div>
  );
}
