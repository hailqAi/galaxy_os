'use client';
import React, { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from './lib/api';
type Comment = {
  id: string;
  body: string;
  editedAt: string | null;
  deletedAt: string | null;
  author: { id: string; displayName: string };
  mentions: { mentionedUser: { id: string; displayName: string } | null }[];
  replies: {
    id: string;
    body: string;
    createdAt: string;
    author: { id: string; displayName: string };
  }[];
  createdAt: string;
};
type Page = { items: Comment[]; total: number };
type User = { userId: string; displayName: string };
export function canDeleteComment({
  actorUserId,
  authorId,
  permissions,
}: {
  actorUserId?: string;
  authorId: string;
  permissions?: string[];
}) {
  return (
    permissions === undefined ||
    permissions.includes('comment.delete_any') ||
    (permissions.includes('comment.delete_own') && actorUserId === authorId)
  );
}
export function EntityComments({
  actorUserId,
  entityType,
  entityId,
  permissions,
}: {
  actorUserId?: string;
  entityType: string;
  entityId: string;
  permissions?: string[];
}) {
  const [data, setData] = useState<Page>();
  const [users, setUsers] = useState<User[]>([]);
  const [message, setMessage] = useState('');
  const [mentionSearch, setMentionSearch] = useState('');
  const canCreate = permissions?.includes('comment.create') ?? true;
  const canReadUsers = permissions?.includes('user.read') ?? true;
  const load = useCallback(
    () =>
      api<Page>(
        `/comments?entityType=${entityType}&entityId=${entityId}&pageSize=50`,
      )
        .then(setData)
        .catch((error: Error) => setMessage(error.message)),
    [entityId, entityType],
  );
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!canReadUsers || !mentionSearch.trim()) return;
    api<{ items: User[] }>(
      `/users?${new URLSearchParams({
        pageSize: '20',
        status: 'active',
        search: mentionSearch.trim(),
      })}`,
    )
      .then((result) => setUsers(result.items))
      .catch(() => setUsers([]));
  }, [canReadUsers, mentionSearch]);
  const visibleUsers = mentionSearch.trim() ? users : [];
  async function submit(event: FormEvent<HTMLFormElement>, parentId?: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const raw = Object.fromEntries(new FormData(form));
    const mentionedUserIds = String(raw.mentionedUserId ?? '')
      .split(',')
      .filter(Boolean);
    try {
      await api(parentId ? `/comments/${parentId}/replies` : '/comments', {
        method: 'POST',
        body: JSON.stringify({
          entityType,
          entityId,
          body: raw.body,
          mentionedUserIds,
        }),
      });
      form.reset();
      await load();
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  async function remove(id: string) {
    try {
      await api(`/comments/${id}`, { method: 'DELETE' });
      await load();
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  return (
    <section className="panel grid gap-4">
      <h2 className="font-semibold">Bình luận</h2>
      {message && <p role="alert">{message}</p>}
      {!data ? (
        <p>Đang tải bình luận…</p>
      ) : !data.items.length ? (
        <p>Chưa có bình luận.</p>
      ) : (
        <ol className="divide-y">
          {data.items.map((comment) => (
            <li className="py-4" key={comment.id}>
              <div className="flex justify-between">
                <p>
                  <strong>{comment.author.displayName}</strong> ·{' '}
                  <small>
                    {new Date(comment.createdAt).toLocaleString('vi-VN')}
                  </small>
                </p>
                {!comment.deletedAt &&
                  canDeleteComment({
                    actorUserId,
                    authorId: comment.author.id,
                    permissions,
                  }) && (
                    <button onClick={() => void remove(comment.id)}>Xóa</button>
                  )}
              </div>
              <p className="whitespace-pre-wrap">
                {comment.deletedAt ? 'Bình luận đã bị xóa' : comment.body}
              </p>
              {comment.replies.length > 0 && (
                <ol className="ml-6 mt-2 border-l pl-4">
                  {comment.replies.map((reply) => (
                    <li className="py-2" key={reply.id}>
                      <strong>{reply.author.displayName}</strong>:{' '}
                      <span className="whitespace-pre-wrap">{reply.body}</span>
                    </li>
                  ))}
                </ol>
              )}
              {canCreate && (
                <form
                  className="ml-6 mt-2 flex gap-2"
                  onSubmit={(event) => void submit(event, comment.id)}
                >
                  <input
                    name="body"
                    required
                    maxLength={10000}
                    placeholder="Trả lời…"
                  />
                  <button>Trả lời</button>
                </form>
              )}
            </li>
          ))}
        </ol>
      )}
      {canCreate && (
        <form className="grid gap-3" onSubmit={(event) => void submit(event)}>
          <label>
            Nội dung
            <textarea name="body" required maxLength={10000} />
          </label>
          {canReadUsers && (
            <label>
              Nhắc đến
              <input
                onChange={(event) => setMentionSearch(event.target.value)}
                placeholder="Tìm người dùng"
                value={mentionSearch}
              />
              {visibleUsers.length > 0 && (
                <select name="mentionedUserId">
                  <option value="">Không nhắc</option>
                  {visibleUsers.map((user) => (
                    <option key={user.userId} value={user.userId}>
                      {user.displayName}
                    </option>
                  ))}
                </select>
              )}
            </label>
          )}
          <button className="primary">Gửi bình luận</button>
        </form>
      )}
    </section>
  );
}
