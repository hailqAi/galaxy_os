'use client';
import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { api } from '../lib/api';
type Survey = {
  id: string;
  location: string | null;
  scheduledAt: string | null;
  surveyedAt: string | null;
  approvalStatus: string;
  project: { id: string; code: string; name: string };
};
type Project = { id: string; name: string };
export default function SurveysPage() {
  const [items, setItems] = useState<Survey[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [message, setMessage] = useState('');
  const [open, setOpen] = useState(false);
  async function load() {
    try {
      setItems(await api<Survey[]>('/surveys'));
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
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await api('/surveys', {
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
  return (
    <div className="grid gap-5">
      <p className="text-sm">Trang chủ / Khảo sát & Yêu cầu</p>
      <header className="flex justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Khảo sát</h1>
          <p className="text-sm text-black/60">
            Lịch và kết quả khảo sát dự án
          </p>
        </div>
        <div className="flex gap-2">
          <Link className="rounded border px-3 py-2" href="/requirements">
            Yêu cầu
          </Link>
          <button className="primary" onClick={() => setOpen(true)}>
            + Tạo khảo sát
          </button>
        </div>
      </header>
      {message && <p role="alert">{message}</p>}
      <section className="panel">
        {!items.length ? (
          <p>Chưa có khảo sát.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Dự án</th>
                <th>Địa điểm</th>
                <th>Lịch khảo sát</th>
                <th>Hoàn thành</th>
                <th>Phê duyệt</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <Link href={`/surveys/${item.id}`}>
                      {item.project.code} · {item.project.name}
                    </Link>
                  </td>
                  <td>{item.location ?? '—'}</td>
                  <td>
                    {item.scheduledAt
                      ? new Date(item.scheduledAt).toLocaleString('vi-VN')
                      : 'Chưa xếp lịch'}
                  </td>
                  <td>{item.surveyedAt ? 'Đã hoàn thành' : 'Chưa'}</td>
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
            <h2 className="text-xl font-semibold">Tạo khảo sát</h2>
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
              Địa điểm
              <input name="location" />
            </label>
            <label>
              Lịch khảo sát
              <input name="scheduledAt" type="datetime-local" />
            </label>
            <label>
              Hiện trạng
              <textarea name="siteCondition" />
            </label>
            <label>
              Ghi chú
              <textarea name="notes" />
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
