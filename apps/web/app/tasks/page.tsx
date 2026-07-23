'use client';
import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
const statuses = [
  ['TODO', 'Cần làm'],
  ['IN_PROGRESS', 'Đang thực hiện'],
  ['BLOCKED', 'Bị chặn'],
  ['IN_REVIEW', 'Đang duyệt'],
  ['DONE', 'Hoàn thành'],
] as const;
type Task = {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  project: { id: string; name: string } | null;
  department: { name: string } | null;
  assignees: { user: { id: string; displayName: string } }[];
  checklist: { completedAt: string | null }[];
};
type Page = {
  items: Task[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};
type Project = { id: string; name: string };
export default function TasksPage() {
  const [data, setData] = useState<Page>();
  const [projects, setProjects] = useState<Project[]>([]);
  const [tab, setTab] = useState<'mine' | 'all' | 'board' | 'overdue'>('mine');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const load = useCallback(async () => {
    try {
      setData(
        await api<Page>(
          `/tasks?${new URLSearchParams({ page: '1', pageSize: '100', ...(search && { search }), ...(tab === 'mine' && { mine: 'true' }), ...(tab === 'overdue' && { overdue: 'true' }) })}`,
        ),
      );
    } catch (error) {
      setMessage((error as Error).message);
    }
  }, [search, tab]);
  useEffect(() => {
    const timeout = setTimeout(() => void load(), 0);
    return () => clearTimeout(timeout);
  }, [load]);
  useEffect(() => {
    api<{ items: Project[] }>('/projects?pageSize=100')
      .then((result) => setProjects(result.items))
      .catch(() => undefined);
  }, []);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await api('/tasks', {
        method: 'POST',
        body: JSON.stringify(
          Object.fromEntries(
            Object.entries(values).filter(([, value]) => value !== ''),
          ),
        ),
      });
      setOpen(false);
      await load();
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  const count = (status: string) =>
    data?.items.filter((task) => task.status === status).length ?? 0;
  return (
    <div className="grid gap-5">
      <p className="text-sm text-black/55">Trang chủ / Công việc</p>
      <header className="flex justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Công việc</h1>
          <p className="text-sm text-black/60">
            Theo dõi công việc cá nhân và dự án
          </p>
        </div>
        <button className="primary" onClick={() => setOpen(true)}>
          + Thêm công việc
        </button>
      </header>
      <section className="grid gap-3 sm:grid-cols-5">
        {statuses.map(([value, label]) => (
          <div className="panel" key={value}>
            <p className="text-sm">{label}</p>
            <strong className="text-2xl">{count(value)}</strong>
          </div>
        ))}
      </section>
      <nav className="flex flex-wrap gap-2" aria-label="Chế độ công việc">
        {[
          ['mine', 'Công việc của tôi'],
          ['all', 'Tất cả công việc'],
          ['board', 'Bảng công việc'],
          ['overdue', 'Quá hạn'],
        ].map(([value, label]) => (
          <button
            aria-pressed={tab === value}
            key={value}
            onClick={() => setTab(value as typeof tab)}
          >
            {label}
          </button>
        ))}
      </nav>
      <section className="panel grid gap-4">
        <input
          aria-label="Tìm công việc"
          placeholder="Tìm công việc…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        {message && <p role="alert">{message}</p>}
        {!data ? (
          <p role="status">Đang tải công việc…</p>
        ) : !data.items.length ? (
          <p>Chưa có công việc phù hợp.</p>
        ) : tab === 'board' ? (
          <div className="grid gap-3 lg:grid-cols-5">
            {statuses.map(([value, label]) => (
              <section className="rounded border p-3" key={value}>
                <h2 className="font-semibold">{label}</h2>
                {data.items
                  .filter((task) => task.status === value)
                  .map((task) => (
                    <article className="mt-3 rounded border p-3" key={task.id}>
                      <Link href={`/tasks/${task.id}`}>{task.title}</Link>
                      <p className="text-sm">
                        {task.project?.name ?? 'Không có dự án'}
                      </p>
                      <small>{task.priority}</small>
                    </article>
                  ))}
              </section>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Công việc</th>
                  <th>Dự án</th>
                  <th>Người phụ trách</th>
                  <th>Phòng ban</th>
                  <th>Ưu tiên</th>
                  <th>Trạng thái</th>
                  <th>Hạn</th>
                  <th>Checklist</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((task) => (
                  <tr key={task.id}>
                    <td>
                      <Link href={`/tasks/${task.id}`}>{task.title}</Link>
                    </td>
                    <td>{task.project?.name ?? '—'}</td>
                    <td>
                      {task.assignees
                        .map((item) => item.user.displayName)
                        .join(', ') || '—'}
                    </td>
                    <td>{task.department?.name ?? '—'}</td>
                    <td>{task.priority}</td>
                    <td>{task.status}</td>
                    <td>
                      {task.dueDate
                        ? new Date(task.dueDate).toLocaleDateString('vi-VN')
                        : '—'}
                    </td>
                    <td>
                      {task.checklist.filter((item) => item.completedAt).length}
                      /{task.checklist.length}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {open && (
        <div
          className="fixed inset-0 grid place-items-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Thêm công việc"
        >
          <form
            className="panel grid w-full max-w-xl gap-3"
            onSubmit={(event) => void create(event)}
          >
            <h2 className="text-xl font-semibold">Thêm công việc</h2>
            <label>
              Tiêu đề
              <input name="title" required maxLength={300} />
            </label>
            <label>
              Dự án
              <select name="projectId">
                <option value="">Không có</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Ưu tiên
              <select name="priority">
                <option>NORMAL</option>
                <option>HIGH</option>
                <option>URGENT</option>
                <option>LOW</option>
              </select>
            </label>
            <label>
              Hạn hoàn thành
              <input name="dueDate" type="date" />
            </label>
            <label>
              Mô tả
              <textarea name="description" maxLength={10000} />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)}>
                Hủy
              </button>
              <button className="primary">Tạo</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
