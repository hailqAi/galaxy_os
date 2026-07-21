'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { api } from '../lib/api';

export default function ForgotPasswordPage() {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    const email = String(new FormData(event.currentTarget).get('email'));
    await api('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }).catch(() => undefined);
    setMessage(
      'Nếu tài khoản tồn tại, hướng dẫn đặt lại mật khẩu đã được gửi.',
    );
    setLoading(false);
  }
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <form className="panel grid w-full max-w-md gap-4" onSubmit={submit}>
        <h1 className="text-3xl font-semibold">Quên mật khẩu</h1>
        <label>
          Email đăng nhập
          <input name="email" required type="email" />
        </label>
        <button className="primary" disabled={loading} type="submit">
          {loading ? 'Đang gửi…' : 'Gửi hướng dẫn'}
        </button>
        {message && <p role="status">{message}</p>}
        <Link href="/login">Quay lại đăng nhập</Link>
      </form>
    </main>
  );
}
