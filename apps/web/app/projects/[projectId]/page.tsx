'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { EntityFiles } from '../../entity-files';
import { EntityComments } from '../../entity-comments';
type Project = {
  id: string;
  code: string;
  name: string;
  customer: { id: string; displayName: string };
  primaryContact: { displayName: string } | null;
  phase: string;
  status: string;
  healthStatus: string;
  progressPercentage: number;
  projectManager: { displayName: string } | null;
  expectedCompletionDate: string | null;
  description: string | null;
  members: {
    id: string;
    role: string | null;
    user: { id: string; displayName: string; email: string };
  }[];
  departments: { id: string; department: { id: string; name: string } }[];
};
type Activity = {
  id: string;
  event: string;
  createdAt: string;
  actor: { displayName: string };
};
type User = { userId: string; displayName: string };
type Department = { id: string; name: string };
export default function ProjectDetailPage() {
  const id = String(useParams().projectId);
  const [project, setProject] = useState<Project>();
  const [activity, setActivity] = useState<Activity[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [message, setMessage] = useState('');
  const load = useCallback(async () => {
    try {
      const [item, timeline] = await Promise.all([
        api<Project>(`/projects/${id}`),
        api<Activity[]>(`/projects/${id}/timeline`),
      ]);
      setProject(item);
      setActivity(timeline);
    } catch (error) {
      setMessage((error as Error).message);
    }
  }, [id]);
  useEffect(() => {
    const timeout = setTimeout(() => void load(), 0);
    api<{ items: User[] }>('/users?pageSize=100')
      .then((result) => setUsers(result.items))
      .catch(() => undefined);
    api<{ items: Department[] }>('/departments?pageSize=100')
      .then((result) => setDepartments(result.items))
      .catch(() => undefined);
    return () => clearTimeout(timeout);
  }, [load]);
  async function add(
    event: FormEvent<HTMLFormElement>,
    kind: 'members' | 'departments',
  ) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await api(`/projects/${id}/${kind}`, {
        method: 'POST',
        body: JSON.stringify(values),
      });
      event.currentTarget.reset();
      await load();
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  async function nextPhase() {
    const phases = ['SURVEY', 'REQUIREMENT', 'DESIGN'];
    const next = phases[phases.indexOf(project?.phase ?? '') + 1];
    if (!next) return;
    try {
      await api(`/projects/${id}/change-phase`, {
        method: 'POST',
        body: JSON.stringify({ phase: next }),
      });
      await load();
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  if (message && !project) return <p role="alert">{message}</p>;
  if (!project) return <p role="status">Đang tải Project Hub…</p>;
  return (
    <div className="grid gap-5">
      <p>
        <Link href="/projects">Dự án</Link> / {project.code}
      </p>
      <header className="flex flex-wrap justify-between gap-4">
        <div>
          <p className="text-sm">{project.code}</p>
          <h1 className="text-2xl font-semibold">{project.name}</h1>
          <p>
            {project.customer.displayName} · {project.phase} · {project.status}{' '}
            · {project.healthStatus}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            className="rounded border px-3 py-2"
            href={`/projects/${id}/edit`}
          >
            Chỉnh sửa
          </Link>
          <button
            disabled={project.phase === 'DESIGN'}
            onClick={() => void nextPhase()}
          >
            Đổi giai đoạn
          </button>
        </div>
      </header>
      {message && <p role="alert">{message}</p>}
      <section className="grid gap-3 sm:grid-cols-5">
        {[
          ['Tiến độ', `${project.progressPercentage}%`],
          ['Thành viên', project.members.length],
          ['Phòng ban', project.departments.length],
          ['Sức khỏe', project.healthStatus],
          [
            'Hoàn thành',
            project.expectedCompletionDate
              ? new Date(project.expectedCompletionDate).toLocaleDateString(
                  'vi-VN',
                )
              : '—',
          ],
        ].map(([label, value]) => (
          <div className="panel" key={label}>
            <p className="text-sm text-black/55">{label}</p>
            <strong>{value}</strong>
          </div>
        ))}
      </section>
      <section className="grid gap-5 lg:grid-cols-2">
        <div className="panel">
          <h2 className="font-semibold">Thông tin dự án</h2>
          <p className="mt-3">
            Project Manager: {project.projectManager?.displayName ?? 'Chưa gán'}
          </p>
          <p>Liên hệ chính: {project.primaryContact?.displayName ?? '—'}</p>
          <p className="mt-3">{project.description ?? 'Chưa có mô tả.'}</p>
        </div>
        <div className="panel">
          <h2 className="font-semibold">Thành viên</h2>
          <ul className="my-3">
            {project.members.map((member) => (
              <li key={member.id}>
                {member.user.displayName} · {member.role ?? 'Thành viên'}
              </li>
            ))}
          </ul>
          <form
            className="flex gap-2"
            onSubmit={(event) => void add(event, 'members')}
          >
            <select name="userId" required>
              <option value="">Chọn người dùng</option>
              {users.map((user) => (
                <option key={user.userId} value={user.userId}>
                  {user.displayName}
                </option>
              ))}
            </select>
            <button className="primary">Thêm</button>
          </form>
        </div>
        <div className="panel">
          <h2 className="font-semibold">Phòng ban</h2>
          <ul className="my-3">
            {project.departments.map((item) => (
              <li key={item.id}>{item.department.name}</li>
            ))}
          </ul>
          <form
            className="flex gap-2"
            onSubmit={(event) => void add(event, 'departments')}
          >
            <select name="departmentId" required>
              <option value="">Chọn phòng ban</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
            <button className="primary">Thêm</button>
          </form>
        </div>
        <div className="panel">
          <h2 className="font-semibold">Dòng thời gian</h2>
          {activity.length ? (
            <ol className="mt-3 divide-y">
              {activity.map((item) => (
                <li className="py-2" key={item.id}>
                  <strong>{item.actor.displayName}</strong> · {item.event}
                  <br />
                  <small>
                    {new Date(item.createdAt).toLocaleString('vi-VN')}
                  </small>
                </li>
              ))}
            </ol>
          ) : (
            <p>Chưa có hoạt động.</p>
          )}
        </div>
      </section>
      <EntityFiles entityType="Project" entityId={id} />
      <EntityComments entityType="Project" entityId={id} />
    </div>
  );
}
