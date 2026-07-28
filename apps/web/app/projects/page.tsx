'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
type Project = {
  id: string;
  code: string;
  name: string;
  phase: string;
  status: string;
  healthStatus: string;
  progressPercentage: number;
  estimatedValue: string | null;
  currency: string;
  expectedCompletionDate: string | null;
  customer: { displayName: string };
  projectManager: { displayName: string } | null;
  departments: { department: { name: string } }[];
};
type Page = {
  items: Project[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};
export default function ProjectsPage() {
  const [data, setData] = useState<Page>();
  const [search, setSearch] = useState('');
  const [phase, setPhase] = useState('');
  const [status, setStatus] = useState('');
  const [health, setHealth] = useState('');
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState('');
  const load = useCallback(async () => {
    try {
      setData(
        await api<Page>(
          `/projects?${new URLSearchParams({ page: String(page), pageSize: '20', ...(search && { search }), ...(phase && { phase }), ...(status && { status }), ...(health && { health }) })}`,
        ),
      );
    } catch (error) {
      setMessage((error as Error).message);
    }
  }, [health, page, phase, search, status]);
  useEffect(() => {
    const timeout = setTimeout(() => void load(), 0);
    return () => clearTimeout(timeout);
  }, [load]);
  return (
    <div className="grid gap-5">
      <p className="text-sm text-black/55">Trang chủ / Dự án</p>
      <header className="flex flex-wrap justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Dự án</h1>
          <p className="text-sm text-black/60">
            Trung tâm quản lý toàn bộ dự án Galaxy Centre
          </p>
        </div>
        <Link className="primary rounded px-4 py-2" href="/projects/new">
          + Tạo dự án
        </Link>
      </header>
      <section className="grid gap-3 sm:grid-cols-4">
        {[
          [
            'Đang hoạt động',
            data?.items.filter((item) => item.status === 'ACTIVE').length ?? 0,
          ],
          [
            'Cần chú ý',
            data?.items.filter((item) => item.healthStatus !== 'ON_TRACK')
              .length ?? 0,
          ],
          [
            'Tiến độ TB',
            data?.items.length
              ? Math.round(
                  data.items.reduce(
                    (sum, item) => sum + item.progressPercentage,
                    0,
                  ) / data.items.length,
                ) + '%'
              : '0%',
          ],
          [
            'Tổng giá trị',
            data?.items
              .reduce((sum, item) => sum + Number(item.estimatedValue ?? 0), 0)
              .toLocaleString('vi-VN') ?? '0',
          ],
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
            aria-label="Tìm dự án"
            placeholder="Tìm mã hoặc tên…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select
            aria-label="Giai đoạn"
            value={phase}
            onChange={(event) => setPhase(event.target.value)}
          >
            <option value="">Tất cả giai đoạn</option>
            {['SURVEY', 'REQUIREMENT', 'DESIGN'].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
          <select
            aria-label="Trạng thái"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">Tất cả trạng thái</option>
            {['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED'].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
          <select
            aria-label="Sức khỏe"
            value={health}
            onChange={(event) => setHealth(event.target.value)}
          >
            <option value="">Tất cả sức khỏe</option>
            {['ON_TRACK', 'AT_RISK', 'OFF_TRACK'].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </div>
        {message && <p role="alert">{message}</p>}
        {!data ? (
          <p role="status">Đang tải dự án…</p>
        ) : !data.items.length ? (
          <p>Chưa có dự án phù hợp.</p>
        ) : (
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Mã</th>
                  <th>Tên dự án</th>
                  <th>Khách hàng</th>
                  <th>Giai đoạn</th>
                  <th>Project Manager</th>
                  <th>Phòng ban</th>
                  <th>Tiến độ</th>
                  <th>Sức khỏe</th>
                  <th>Hoàn thành dự kiến</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.code}</td>
                    <td>
                      <Link className="underline" href={`/projects/${item.id}`}>
                        {item.name}
                      </Link>
                    </td>
                    <td>{item.customer.displayName}</td>
                    <td>{item.phase}</td>
                    <td>{item.projectManager?.displayName ?? '—'}</td>
                    <td>
                      {item.departments
                        .map((value) => value.department.name)
                        .join(', ') || '—'}
                    </td>
                    <td>{item.progressPercentage}%</td>
                    <td>{item.healthStatus}</td>
                    <td>
                      {item.expectedCompletionDate
                        ? new Date(
                            item.expectedCompletionDate,
                          ).toLocaleDateString('vi-VN')
                        : '—'}
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
