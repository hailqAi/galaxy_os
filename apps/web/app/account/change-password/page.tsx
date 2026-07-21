'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';

export default function ChangePasswordPage() {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    if (data.newPassword !== data.confirmNewPassword)
      return setMessage('Mật khẩu xác nhận không khớp.');
    setLoading(true);
    try {
      await api('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      form.reset();
      setMessage('Đã đổi mật khẩu. Vui lòng đăng nhập lại.');
      router.replace('/login');
      router.refresh();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <form className="panel mx-auto grid max-w-xl gap-4" onSubmit={submit}>
      <h1 className="text-3xl font-semibold">Đổi mật khẩu</h1>
      <p>Dùng ít nhất 15 ký tự; cụm mật khẩu được khuyến khích.</p>
      <label>
        Mật khẩu hiện tại
        <input
          name="currentPassword"
          required
          type={show ? 'text' : 'password'}
        />
      </label>
      <label>
        Mật khẩu mới
        <input
          minLength={15}
          name="newPassword"
          required
          type={show ? 'text' : 'password'}
        />
      </label>
      <label>
        Xác nhận mật khẩu mới
        <input
          minLength={15}
          name="confirmNewPassword"
          required
          type={show ? 'text' : 'password'}
        />
      </label>
      <button onClick={() => setShow(!show)} type="button">
        {show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
      </button>
      <button className="primary" disabled={loading} type="submit">
        {loading ? 'Đang đổi…' : 'Đổi mật khẩu'}
      </button>
      {message && <p role="status">{message}</p>}
    </form>
  );
}
