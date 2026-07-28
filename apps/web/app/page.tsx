'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from './lib/api';

type Dashboard = {
  kpis: {
    activeLeads: number;
    pipelineValue: string | number;
    activeProjects: number;
    overdueTasks: number;
  };
  pipeline: { stage: string; count: number; value: string | number }[];
  projectHealth: { health: string; count: number }[];
  attentionTasks: {
    id: string;
    title: string;
    status: string;
    priority: string;
    dueDate: string | null;
    project: { name: string } | null;
  }[];
};

export default function DashboardPage() {
  const [data, setData] = useState<Dashboard>();
  const [error, setError] = useState('');
  useEffect(() => {
    api<Dashboard>('/dashboard')
      .then(setData)
      .catch((cause: Error) => setError(cause.message));
  }, []);
  return (
    <div className="grid gap-5">
      <p className="text-sm">Trang chủ / Tổng quan</p>
      <header>
        <h1 className="text-2xl font-semibold">Tổng quan Galaxy OS</h1>
        <p className="text-sm text-black/60">
          Dữ liệu kinh doanh và công việc trong phạm vi của bạn
        </p>
      </header>
      {error && <p role="alert">{error}</p>}
      {!data ? (
        <p role="status">Đang tải tổng quan…</p>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-4">
            {[
              ['Lead đang xử lý', data.kpis.activeLeads],
              [
                'Giá trị pipeline',
                Number(data.kpis.pipelineValue).toLocaleString('vi-VN'),
              ],
              ['Dự án đang hoạt động', data.kpis.activeProjects],
              ['Công việc quá hạn', data.kpis.overdueTasks],
            ].map(([label, value]) => (
              <div className="panel" key={label}>
                <p>{label}</p>
                <strong className="text-2xl">{value}</strong>
              </div>
            ))}
          </section>
          <section className="grid gap-4 lg:grid-cols-2">
            <div className="panel">
              <h2 className="font-semibold">Pipeline cơ hội</h2>
              {data.pipeline.map((item) => (
                <p className="flex justify-between py-1" key={item.stage}>
                  <span>{item.stage}</span>
                  <strong>{item.count}</strong>
                </p>
              ))}
            </div>
            <div className="panel">
              <h2 className="font-semibold">Sức khỏe dự án</h2>
              {data.projectHealth.map((item) => (
                <p className="flex justify-between py-1" key={item.health}>
                  <span>{item.health}</span>
                  <strong>{item.count}</strong>
                </p>
              ))}
            </div>
          </section>
          <section className="panel">
            <h2 className="font-semibold">Công việc cần xử lý</h2>
            {!data.attentionTasks.length ? (
              <p>Không có công việc cần xử lý.</p>
            ) : (
              <ul className="divide-y">
                {data.attentionTasks.map((task) => (
                  <li className="flex justify-between py-2" key={task.id}>
                    <Link href={`/tasks/${task.id}`}>{task.title}</Link>
                    <span>
                      {task.priority} · {task.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
