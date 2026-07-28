'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { EntityFiles } from '../../entity-files';
import { EntityComments } from '../../entity-comments';
import { EntityActivity } from '../../entity-activity';
type Requirement = {
  id: string;
  title: string;
  customerRequirements: string | null;
  stylePreferences: string | null;
  brandPreferences: string | null;
  budgetMin: string | null;
  budgetMax: string | null;
  currency: string;
  expectedSchedule: string | null;
  approvalStatus: string;
  version: number;
  project: { id: string; code: string; name: string };
  versions: { id: string; version: number; createdAt: string }[];
};
export default function RequirementDetail() {
  const id = String(useParams().requirementId);
  const [item, setItem] = useState<Requirement>();
  const [message, setMessage] = useState('');
  const load = useCallback(
    () =>
      api<Requirement>(`/requirements/${id}`)
        .then(setItem)
        .catch((error: Error) => setMessage(error.message)),
    [id],
  );
  useEffect(() => {
    void load();
  }, [load]);
  async function action(kind: 'submit' | 'approve' | 'reject' | 'new-version') {
    try {
      await api(`/requirements/${id}/${kind}`, { method: 'POST' });
      await load();
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  if (message && !item) return <p role="alert">{message}</p>;
  if (!item) return <p role="status">Đang tải yêu cầu…</p>;
  return (
    <div className="grid gap-5">
      <p>
        <Link href="/requirements">Yêu cầu</Link> / {item.title}
      </p>
      <header className="flex flex-wrap justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{item.title}</h1>
          <p>
            {item.project.name} · {item.approvalStatus} · Phiên bản{' '}
            {item.version}
          </p>
        </div>
        <div className="flex gap-2">
          {item.approvalStatus === 'APPROVED' ? (
            <button onClick={() => void action('new-version')}>
              Tạo phiên bản mới
            </button>
          ) : (
            <>
              <button onClick={() => void action('submit')}>Gửi duyệt</button>
              <button
                className="primary"
                onClick={() => void action('approve')}
              >
                Phê duyệt
              </button>
              <button onClick={() => void action('reject')}>Từ chối</button>
            </>
          )}
        </div>
      </header>
      {message && <p role="alert">{message}</p>}
      <section className="panel grid gap-3">
        <p>
          <strong>Yêu cầu:</strong> {item.customerRequirements ?? '—'}
        </p>
        <p>
          <strong>Phong cách:</strong> {item.stylePreferences ?? '—'}
        </p>
        <p>
          <strong>Thương hiệu:</strong> {item.brandPreferences ?? '—'}
        </p>
        <p>
          <strong>Ngân sách:</strong>{' '}
          {item.budgetMin
            ? Number(item.budgetMin).toLocaleString('vi-VN')
            : '—'}{' '}
          –{' '}
          {item.budgetMax
            ? Number(item.budgetMax).toLocaleString('vi-VN')
            : '—'}{' '}
          {item.currency}
        </p>
        <p>
          <strong>Tiến độ:</strong> {item.expectedSchedule ?? '—'}
        </p>
      </section>
      <section className="panel">
        <h2 className="font-semibold">Lịch sử phiên bản</h2>
        {item.versions.length ? (
          <ul>
            {item.versions.map((version) => (
              <li key={version.id}>
                Phiên bản {version.version} ·{' '}
                {new Date(version.createdAt).toLocaleString('vi-VN')}
              </li>
            ))}
          </ul>
        ) : (
          <p>Chưa có phiên bản trước.</p>
        )}
      </section>
      <EntityFiles entityType="Requirement" entityId={id} />
      <EntityComments entityType="Requirement" entityId={id} />
      <EntityActivity entityType="Requirement" entityId={id} />
    </div>
  );
}
