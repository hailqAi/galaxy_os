'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Actor, api, apiUrl } from '../../lib/api';

export default function ProfilePage() {
  const [actor, setActor] = useState<Actor>();
  const [message, setMessage] = useState('Đang tải…');
  const [sessions, setSessions] = useState<
    { id: string; createdAt: string; lastSeenAt: string; expiresAt: string }[]
  >([]);
  const load = () =>
    Promise.all([
      api<Actor>('/me'),
      api<
        {
          id: string;
          createdAt: string;
          lastSeenAt: string;
          expiresAt: string;
        }[]
      >('/me/sessions'),
    ]).then(([value, sessionData]) => {
      setActor(value);
      setSessions(sessionData);
      setMessage('');
    });
  useEffect(() => {
    void load();
  }, []);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('Đang lưu…');
    try {
      await api('/me/profile', {
        method: 'PATCH',
        body: JSON.stringify(
          Object.fromEntries(new FormData(event.currentTarget)),
        ),
      });
      await load();
      setMessage('Đã cập nhật hồ sơ.');
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = new FormData(event.currentTarget);
    setMessage('Đang tải ảnh…');
    try {
      await api('/me/avatar', { method: 'POST', body });
      await load();
      setMessage('Đã cập nhật ảnh đại diện.');
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  async function remove() {
    await api('/me/avatar', { method: 'DELETE' });
    await load();
    setMessage('Đã xóa ảnh đại diện.');
  }
  if (!actor) return <p role="status">{message}</p>;
  return (
    <section className="grid gap-6 lg:grid-cols-2">
      <div className="panel">
        <h1 className="text-3xl font-semibold">Hồ sơ của tôi</h1>
        <form className="mt-5 grid gap-4" onSubmit={save}>
          <label>
            Email đăng nhập
            <input disabled readOnly value={actor.email} />
          </label>
          <label>
            Tên hiển thị
            <input
              defaultValue={actor.displayName}
              maxLength={120}
              minLength={2}
              name="displayName"
              required
            />
          </label>
          <button className="primary" type="submit">
            Lưu tên hiển thị
          </button>
        </form>
        <dl className="mt-6 grid gap-2 text-sm">
          <div>
            <dt>Tổ chức</dt>
            <dd>{actor.organization.name}</dd>
          </div>
          <div>
            <dt>Trạng thái</dt>
            <dd>
              {actor.status} · {actor.membership.status}
            </dd>
          </div>
          <div>
            <dt>Phòng ban</dt>
            <dd>
              {actor.departments
                .map(
                  (item) => `${item.name}${item.isPrimary ? ' (chính)' : ''}`,
                )
                .join(', ') || 'Chưa có'}
            </dd>
          </div>
          <div>
            <dt>Vai trò</dt>
            <dd>
              {actor.roles.map((item) => item.name).join(', ') || 'Chưa có'}
            </dd>
          </div>
          <div>
            <dt>Đăng nhập gần nhất</dt>
            <dd>
              {actor.lastLoginAt
                ? new Date(actor.lastLoginAt).toLocaleString('vi-VN')
                : 'Chưa có'}
            </dd>
          </div>
        </dl>
      </div>
      <div className="panel lg:col-span-2">
        <h2 className="text-xl font-semibold">Phiên đăng nhập</h2>
        <ul className="mt-3 grid gap-2">
          {sessions.map((session) => (
            <li
              className="flex items-center justify-between gap-3"
              key={session.id}
            >
              <span>
                Tạo {new Date(session.createdAt).toLocaleString('vi-VN')} · hoạt
                động {new Date(session.lastSeenAt).toLocaleString('vi-VN')}
              </span>
              <button
                onClick={() =>
                  void api(`/me/sessions/${session.id}`, {
                    method: 'DELETE',
                  }).then(load)
                }
                type="button"
              >
                Thu hồi
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="panel">
        <h2 className="text-xl font-semibold">Ảnh đại diện</h2>
        {actor.avatarUrl && (
          <img
            alt="Ảnh đại diện hiện tại"
            className="mt-4 h-32 w-32 rounded-full object-cover"
            src={`${apiUrl}${actor.avatarUrl}`}
          />
        )}
        <form className="mt-5 grid gap-3" onSubmit={upload}>
          <label>
            Chọn JPEG, PNG hoặc WebP (tối đa 2 MB)
            <input
              accept="image/jpeg,image/png,image/webp"
              name="avatar"
              required
              type="file"
            />
          </label>
          <button className="primary" type="submit">
            {actor.avatarUrl ? 'Thay ảnh' : 'Tải ảnh'}
          </button>
        </form>
        {actor.avatarUrl && (
          <button className="mt-3" onClick={() => void remove()}>
            Xóa ảnh
          </button>
        )}
      </div>
      <p className="lg:col-span-2" role="status">
        {message}
      </p>
    </section>
  );
}
