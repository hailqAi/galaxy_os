'use client';

import { FormEvent, Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Actor, api } from '../lib/api';
import { permittedReturnTo } from './model';

function LoginForm() {
  const router = useRouter();
  const query = useSearchParams();
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(
    query.get('expired') ? 'Phiên đăng nhập đã hết hạn.' : '',
  );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      const data = Object.fromEntries(new FormData(event.currentTarget));
      await api('/auth/login', { method: 'POST', body: JSON.stringify(data) });
      const actor = await api<Actor>('/me');
      router.replace(
        actor.mustChangePassword
          ? '/account/change-password'
          : (permittedReturnTo(query.get('returnTo'), actor.permissions) ??
              '/'),
      );
      router.refresh();
    } catch {
      setMessage('Email hoặc mật khẩu không hợp lệ.');
      setLoading(false);
    }
  }
  return (
    <main className="grid min-h-screen place-items-center p-5">
      <form className="panel grid w-full max-w-md gap-5" onSubmit={submit}>
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-brass">
            Galaxy OS
          </p>
          <h1 className="mt-2 text-3xl font-semibold">Đăng nhập</h1>
        </div>
        <label>
          Email đăng nhập
          <input autoComplete="username" name="email" required type="email" />
        </label>
        <label>
          Mật khẩu
          <span className="flex gap-2">
            <input
              autoComplete="current-password"
              className="min-w-0 flex-1"
              name="password"
              required
              type={show ? 'text' : 'password'}
            />
            <button onClick={() => setShow(!show)} type="button">
              {show ? 'Ẩn' : 'Hiện'}
            </button>
          </span>
        </label>
        <button className="primary" disabled={loading} type="submit">
          {loading ? 'Đang đăng nhập…' : 'Đăng nhập'}
        </button>
        <Link href="/forgot-password">Quên mật khẩu?</Link>
        {message && <p role="alert">{message}</p>}
      </form>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="grid min-h-screen place-items-center">Đang tải…</main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
