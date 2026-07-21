'use client';

import { FormEvent, Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api } from '../lib/api';

function ResetPasswordForm() {
  const [token] = useState(useSearchParams().get('token') ?? '');
  useEffect(() => {
    if (token) window.history.replaceState(null, '', '/reset-password');
  }, [token]);
  const [message, setMessage] = useState(
    token ? '' : 'Liên kết không hợp lệ hoặc đã hết hạn.',
  );
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    if (data.newPassword !== data.confirmNewPassword)
      return setMessage('Mật khẩu xác nhận không khớp.');
    setLoading(true);
    try {
      await api('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, ...data }),
      });
      setDone(true);
      setMessage('Mật khẩu đã được đặt lại.');
    } catch {
      setMessage('Liên kết không hợp lệ, đã hết hạn hoặc đã được sử dụng.');
    } finally {
      setLoading(false);
    }
  }
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <form className="panel grid w-full max-w-md gap-4" onSubmit={submit}>
        <h1 className="text-3xl font-semibold">Đặt lại mật khẩu</h1>
        {!done && token && (
          <>
            <p>Dùng cụm mật khẩu từ 15 ký tự.</p>
            <label>
              Mật khẩu mới
              <input
                minLength={15}
                name="newPassword"
                required
                type="password"
              />
            </label>
            <label>
              Xác nhận mật khẩu
              <input
                minLength={15}
                name="confirmNewPassword"
                required
                type="password"
              />
            </label>
            <button className="primary" disabled={loading} type="submit">
              {loading ? 'Đang đặt lại…' : 'Đặt lại mật khẩu'}
            </button>
          </>
        )}
        {message && <p role="status">{message}</p>}
        <Link href="/login">Đăng nhập</Link>
      </form>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="grid min-h-screen place-items-center">Đang tải…</main>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
