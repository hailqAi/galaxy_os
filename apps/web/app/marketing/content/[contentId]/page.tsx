'use client';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '../../../lib/api';
import { EntityFiles } from '../../../entity-files';
import { EntityComments } from '../../../entity-comments';
import { EntityActivity } from '../../../entity-activity';
type Item = {
  id: string;
  title: string;
  originalContent: string;
  brandEcosystem: string;
  status: string;
  scheduledAt: string | null;
  variants: {
    id: string;
    channel: string;
    title: string | null;
    body: string;
  }[];
  publishingJobs: {
    id: string;
    channel: string;
    status: string;
    publishedUrl: string | null;
  }[];
};
const channels = ['WEBSITE', 'FACEBOOK', 'YOUTUBE', 'TIKTOK'];
export default function ContentDetail() {
  const id = String(useParams().contentId);
  const [item, setItem] = useState<Item>();
  const [error, setError] = useState('');
  const load = useCallback(
    () =>
      api<Item>(`/content/${id}`)
        .then(setItem)
        .catch((cause: Error) => setError(cause.message)),
    [id],
  );
  useEffect(() => void load(), [load]);
  async function action(name: string, body?: object) {
    try {
      await api(`/content/${id}/${name}`, {
        method: 'POST',
        body: body ? JSON.stringify(body) : undefined,
      });
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  async function variant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await api(`/content/${id}/variants`, {
        method: 'POST',
        body: JSON.stringify(
          Object.fromEntries(new FormData(event.currentTarget)),
        ),
      });
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  if (!item)
    return (
      <p role={error ? 'alert' : 'status'}>{error || 'Đang tải nội dung…'}</p>
    );
  return (
    <div className="grid gap-5">
      <p>Marketing / Nội dung / {item.title}</p>
      <header className="flex justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{item.title}</h1>
          <p>
            {item.brandEcosystem} · {item.status}
          </p>
        </div>
        <div className="flex gap-2">
          {item.status === 'DRAFT' && (
            <button onClick={() => void action('submit-review')}>
              Gửi review
            </button>
          )}
          {item.status === 'IN_REVIEW' && (
            <>
              <button onClick={() => void action('approve')}>Phê duyệt</button>
              <button onClick={() => void action('reject')}>Từ chối</button>
            </>
          )}
        </div>
      </header>
      {error && <p role="alert">{error}</p>}
      <section className="panel">
        <h2 className="font-semibold">Nội dung gốc</h2>
        <p className="whitespace-pre-wrap">{item.originalContent}</p>
      </section>
      <section className="grid gap-3 lg:grid-cols-2">
        {channels.map((channel) => {
          const current = item.variants.find(
            (value) => value.channel === channel,
          );
          return (
            <form className="panel grid gap-2" key={channel} onSubmit={variant}>
              <h2 className="font-semibold">{channel}</h2>
              <input name="channel" type="hidden" value={channel} />
              <input
                name="title"
                placeholder="Tiêu đề kênh"
                defaultValue={current?.title ?? ''}
              />
              <textarea
                name="body"
                required
                rows={5}
                defaultValue={current?.body ?? item.originalContent}
              />
              <button>Lưu phiên bản</button>
            </form>
          );
        })}
      </section>
      {item.status === 'APPROVED' && (
        <form
          className="panel flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const value = String(
              new FormData(event.currentTarget).get('scheduledAt'),
            );
            void action('schedule', {
              scheduledAt: new Date(value).toISOString(),
            });
          }}
        >
          <input name="scheduledAt" type="datetime-local" required />
          <button className="primary">Lập lịch</button>
        </form>
      )}
      <EntityFiles entityType="MarketingContent" entityId={id} />
      <EntityComments entityType="MarketingContent" entityId={id} />
      <EntityActivity entityType="MarketingContent" entityId={id} />
    </div>
  );
}
