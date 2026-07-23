'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
type Job = {
  id: string;
  channel: string;
  scheduledAt: string;
  status: string;
  attemptCount: number;
  publishedUrl: string | null;
  lastErrorMessage: string | null;
  updatedAt: string;
  contentItem: { title: string };
};
export default function PublishingPage() {
  const [items, setItems] = useState<Job[]>();
  const [error, setError] = useState('');
  const load = useCallback(
    () =>
      api<{ items: Job[] }>('/publishing-jobs?pageSize=50')
        .then((data) => setItems(data.items))
        .catch((cause: Error) => setError(cause.message)),
    [],
  );
  useEffect(() => void load(), [load]);
  async function action(id: string, name: 'retry' | 'cancel') {
    try {
      await api(`/publishing-jobs/${id}/${name}`, { method: 'POST' });
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  async function process() {
    try {
      await api('/publishing-jobs/process-due', {
        method: 'POST',
        body: JSON.stringify({ limit: 10 }),
      });
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  return (
    <div className="grid gap-5">
      <p>Trang chủ / Marketing / Hàng đợi</p>
      <header className="flex justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Hàng đợi xuất bản</h1>
          <p className="text-sm text-black/60">
            Provider giả lập chỉ hoạt động development/test
          </p>
        </div>
        <button onClick={() => void process()}>Xử lý job đến hạn</button>
      </header>
      {error && <p role="alert">{error}</p>}
      {!items ? (
        <p role="status">Đang tải hàng đợi…</p>
      ) : !items.length ? (
        <p className="panel">Chưa có job xuất bản.</p>
      ) : (
        <section className="panel">
          <table>
            <thead>
              <tr>
                <th>Nội dung</th>
                <th>Kênh</th>
                <th>Lịch</th>
                <th>Trạng thái</th>
                <th>Lần thử</th>
                <th>URL/Lỗi</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {items.map((job) => (
                <tr key={job.id}>
                  <td>{job.contentItem.title}</td>
                  <td>{job.channel}</td>
                  <td>{new Date(job.scheduledAt).toLocaleString('vi-VN')}</td>
                  <td>{job.status}</td>
                  <td>{job.attemptCount}</td>
                  <td>
                    {job.publishedUrl ? (
                      <a
                        href={job.publishedUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Mở bài
                      </a>
                    ) : (
                      (job.lastErrorMessage ?? '—')
                    )}
                  </td>
                  <td>
                    {job.status === 'FAILED' && (
                      <button onClick={() => void action(job.id, 'retry')}>
                        Retry
                      </button>
                    )}
                    {['SCHEDULED', 'QUEUED', 'RETRY_SCHEDULED'].includes(
                      job.status,
                    ) && (
                      <button onClick={() => void action(job.id, 'cancel')}>
                        Hủy
                      </button>
                    )}
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
