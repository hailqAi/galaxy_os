'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { EntityFiles } from '../../entity-files';
import { EntityComments } from '../../entity-comments';
import { EntityActivity } from '../../entity-activity';
type Survey = {
  id: string;
  location: string | null;
  siteCondition: string | null;
  measurements: unknown;
  notes: string | null;
  scheduledAt: string | null;
  surveyedAt: string | null;
  approvalStatus: string;
  version: number;
  project: { id: string; code: string; name: string };
};
export default function SurveyDetail() {
  const id = String(useParams().surveyId);
  const [item, setItem] = useState<Survey>();
  const [message, setMessage] = useState('');
  const load = useCallback(
    () =>
      api<Survey>(`/surveys/${id}`)
        .then(setItem)
        .catch((error: Error) => setMessage(error.message)),
    [id],
  );
  useEffect(() => {
    void load();
  }, [load]);
  async function action(kind: 'complete' | 'approve') {
    try {
      await api(`/surveys/${id}/${kind}`, { method: 'POST' });
      await load();
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  if (message && !item) return <p role="alert">{message}</p>;
  if (!item) return <p role="status">Đang tải khảo sát…</p>;
  return (
    <div className="grid gap-5">
      <p>
        <Link href="/surveys">Khảo sát</Link> / {item.project.code}
      </p>
      <header className="flex justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            Khảo sát {item.project.name}
          </h1>
          <p>
            {item.approvalStatus} · Phiên bản {item.version}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            disabled={!!item.surveyedAt}
            onClick={() => void action('complete')}
          >
            Hoàn thành
          </button>
          <button
            disabled={item.approvalStatus === 'APPROVED'}
            onClick={() => void action('approve')}
          >
            Phê duyệt
          </button>
        </div>
      </header>
      {message && <p role="alert">{message}</p>}
      <section className="panel grid gap-3">
        <p>
          <strong>Địa điểm:</strong> {item.location ?? '—'}
        </p>
        <p>
          <strong>Lịch:</strong>{' '}
          {item.scheduledAt
            ? new Date(item.scheduledAt).toLocaleString('vi-VN')
            : '—'}
        </p>
        <p>
          <strong>Hiện trạng:</strong> {item.siteCondition ?? '—'}
        </p>
        <p>
          <strong>Kích thước:</strong>{' '}
          {item.measurements ? JSON.stringify(item.measurements) : '—'}
        </p>
        <p>
          <strong>Ghi chú:</strong> {item.notes ?? '—'}
        </p>
      </section>
      <EntityFiles entityType="Survey" entityId={id} />
      <EntityComments entityType="Survey" entityId={id} />
      <EntityActivity entityType="Survey" entityId={id} />
    </div>
  );
}
