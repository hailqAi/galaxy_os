'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { EntityFiles } from '../../entity-files';
import { EntityComments } from '../../entity-comments';
type Task = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  completedAt: string | null;
  project: { id: string; name: string } | null;
  department: { name: string } | null;
  assignees: { user: { id: string; displayName: string } }[];
  watchers: { user: { id: string; displayName: string } }[];
  checklist: { id: string; title: string; completedAt: string | null }[];
  dependencies: {
    requiredTask: { id: string; title: string; status: string };
  }[];
  activity: {
    id: string;
    event: string;
    createdAt: string;
    actor: { displayName: string };
  }[];
};
export default function TaskDetailPage() {
  const id = String(useParams().taskId);
  const [task, setTask] = useState<Task>();
  const [message, setMessage] = useState('');
  const load = useCallback(
    () =>
      api<Task>(`/tasks/${id}`)
        .then(setTask)
        .catch((error: Error) => setMessage(error.message)),
    [id],
  );
  useEffect(() => {
    void load();
  }, [load]);
  async function status(value: string) {
    try {
      await api(
        `/tasks/${id}/${value === 'DONE' ? 'complete' : 'change-status'}`,
        {
          method: 'POST',
          body:
            value === 'DONE' ? undefined : JSON.stringify({ status: value }),
        },
      );
      await load();
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  async function checklist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      await api(`/tasks/${id}/checklist`, {
        method: 'POST',
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      form.reset();
      await load();
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  async function toggle(item: Task['checklist'][number]) {
    try {
      await api(`/tasks/${id}/checklist`, {
        method: 'POST',
        body: JSON.stringify({ id: item.id, completed: !item.completedAt }),
      });
      await load();
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  if (message && !task) return <p role="alert">{message}</p>;
  if (!task) return <p role="status">Đang tải công việc…</p>;
  return (
    <div className="grid gap-5">
      <p>
        <Link href="/tasks">Công việc</Link> / {task.title}
      </p>
      <header className="flex flex-wrap justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{task.title}</h1>
          <p>
            {task.status} · {task.priority} ·{' '}
            {task.project?.name ?? 'Không có dự án'}
          </p>
        </div>
        <div className="flex gap-2">
          {['TODO', 'IN_PROGRESS', 'BLOCKED', 'IN_REVIEW', 'DONE'].map(
            (value) => (
              <button
                disabled={task.status === value}
                key={value}
                onClick={() => void status(value)}
              >
                {value}
              </button>
            ),
          )}
        </div>
      </header>
      {message && <p role="alert">{message}</p>}
      <section className="grid gap-5 lg:grid-cols-2">
        <div className="panel">
          <h2 className="font-semibold">Mô tả</h2>
          <p className="mt-3">{task.description ?? 'Chưa có mô tả.'}</p>
          <p className="mt-3">
            Hạn:{' '}
            {task.dueDate
              ? new Date(task.dueDate).toLocaleString('vi-VN')
              : '—'}
          </p>
          <p>
            Người phụ trách:{' '}
            {task.assignees.map((item) => item.user.displayName).join(', ') ||
              '—'}
          </p>
          <p>
            Người theo dõi:{' '}
            {task.watchers.map((item) => item.user.displayName).join(', ') ||
              '—'}
          </p>
        </div>
        <div className="panel">
          <h2 className="font-semibold">Checklist</h2>
          <ul className="my-3">
            {task.checklist.map((item) => (
              <li key={item.id}>
                <label className="flex items-center gap-2">
                  <input
                    checked={!!item.completedAt}
                    onChange={() => void toggle(item)}
                    type="checkbox"
                  />
                  {item.title}
                </label>
              </li>
            ))}
          </ul>
          <form
            className="flex gap-2"
            onSubmit={(event) => void checklist(event)}
          >
            <input name="title" required placeholder="Mục kiểm tra" />
            <button className="primary">Thêm</button>
          </form>
        </div>
        <div className="panel lg:col-span-2">
          <h2 className="font-semibold">Hoạt động</h2>
          {task.activity.length ? (
            <ol className="mt-3 divide-y">
              {task.activity.map((item) => (
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
      <EntityFiles entityType="Task" entityId={id} />
      <EntityComments entityType="Task" entityId={id} />
    </div>
  );
}
