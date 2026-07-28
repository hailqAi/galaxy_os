'use client';
import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { api } from '../lib/api';
type Requirement = {
  id: string;
  title: string;
  approvalStatus: string;
  version: number;
  budgetMin: string | null;
  budgetMax: string | null;
  currency: string;
  project: { id: string; code: string; name: string };
};
type Project = { id: string; name: string };
export default function RequirementsPage() {
  const [items, setItems] = useState<Requirement[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  async function load() {
    try {
      setItems(await api<Requirement[]>('/requirements'));
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  useEffect(() => {
    const timeout = setTimeout(() => void load(), 0);
    api<{ items: Project[] }>('/projects?pageSize=100')
      .then((result) => setProjects(result.items))
      .catch(() => undefined);
    return () => clearTimeout(timeout);
  }, []);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const raw = Object.fromEntries(new FormData(event.currentTarget));
    const body = Object.fromEntries(
      Object.entries(raw).filter(([, value]) => value !== ''),
    );
    try {
      await api('/requirements', {
        method: 'POST',
        body: JSON.stringify({
          ...body,
          budgetMin: body.budgetMin ? Number(body.budgetMin) : undefined,
          budgetMax: body.budgetMax ? Number(body.budgetMax) : undefined,
        }),
      });
      setOpen(false);
      await load();
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  return (
    <div className="grid gap-5">
      <p>
        <Link href="/surveys">Khảo sát</Link> / Yêu cầu
      </p>
      <header className="flex justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Yêu cầu</h1>
          <p className="text-sm text-black/60">
            Yêu cầu khách hàng và lịch sử phiên bản
          </p>
        </div>
        <button className="primary" onClick={() => setOpen(true)}>
          + Tạo yêu cầu
        </button>
      </header>
      {message && <p role="alert">{message}</p>}
      <section className="panel">
        {!items.length ? (
          <p>Chưa có yêu cầu.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Tiêu đề</th>
                <th>Dự án</th>
                <th>Ngân sách</th>
                <th>Phiên bản</th>
                <th>Phê duyệt</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <Link href={`/requirements/${item.id}`}>{item.title}</Link>
                  </td>
                  <td>{item.project.name}</td>
                  <td>
                    {item.budgetMin
                      ? Number(item.budgetMin).toLocaleString('vi-VN')
                      : '—'}{' '}
                    –{' '}
                    {item.budgetMax
                      ? Number(item.budgetMax).toLocaleString('vi-VN')
                      : '—'}{' '}
                    {item.currency}
                  </td>
                  <td>{item.version}</td>
                  <td>{item.approvalStatus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {open && (
        <div className="fixed inset-0 grid place-items-center bg-black/40 p-4">
          <form
            className="panel grid w-full max-w-xl gap-3"
            onSubmit={(event) => void create(event)}
          >
            <h2 className="text-xl font-semibold">Tạo yêu cầu</h2>
            <label>
              Dự án
              <select name="projectId" required>
                <option value="">Chọn dự án</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Tiêu đề
              <input name="title" required />
            </label>
            <label>
              Yêu cầu khách hàng
              <textarea name="customerRequirements" />
            </label>
            <label>
              Phong cách
              <textarea name="stylePreferences" />
            </label>
            <label>
              Ngân sách tối thiểu
              <input name="budgetMin" type="number" min="0" />
            </label>
            <label>
              Ngân sách tối đa
              <input name="budgetMax" type="number" min="0" />
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
