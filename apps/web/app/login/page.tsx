'use client';

import { FormEvent, Suspense, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { apiUrl } from '../lib/api';
import { authenticate, permittedReturnTo, validateLogin } from './model';

function LoginForm() {
  const router = useRouter();
  const query = useSearchParams();
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({ email: '', password: '' });
  const submitting = useRef(false);
  const [message, setMessage] = useState(
    query.get('sessionExpired') ? 'Phiên đăng nhập đã hết hạn.' : '',
  );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    setMessage('');
    const nextErrors = validateLogin(email, password);
    setErrors(nextErrors);
    if (nextErrors.email || nextErrors.password) return;
    submitting.current = true;
    setLoading(true);
    try {
      const actor = await authenticate(email, password);
      router.replace(
        actor.mustChangePassword
          ? '/account/change-password'
          : (permittedReturnTo(query.get('returnTo'), actor.permissions) ??
              '/'),
      );
      router.refresh();
    } catch (error) {
      setPassword('');
      setMessage((error as Error).message);
      submitting.current = false;
      setLoading(false);
    }
  }
  return (
    <main className="grid min-h-screen place-items-center p-5">
      <form
        action={`${apiUrl}/auth/login`}
        className="panel grid w-full max-w-md gap-5"
        method="post"
        noValidate
        onSubmit={submit}
      >
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-brass">
            Galaxy OS
          </p>
          <h1 className="mt-2 text-3xl font-semibold">Đăng nhập</h1>
        </div>
        <label>
          Email đăng nhập
          <input
            autoComplete="username"
            name="email"
            onChange={(event) => setEmail(event.target.value)}
            aria-describedby={errors.email ? 'email-error' : undefined}
            aria-invalid={Boolean(errors.email)}
            type="email"
            value={email}
          />
          {errors.email && <span id="email-error">{errors.email}</span>}
        </label>
        <div>
          <label htmlFor="login-password">Mật khẩu</label>
          <span className="flex gap-2">
            <input
              autoComplete="current-password"
              className="min-w-0 flex-1"
              id="login-password"
              name="password"
              onChange={(event) => setPassword(event.target.value)}
              aria-describedby={errors.password ? 'password-error' : undefined}
              aria-invalid={Boolean(errors.password)}
              type={show ? 'text' : 'password'}
              value={password}
            />
            <button
              aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              aria-pressed={show}
              onClick={() => setShow(!show)}
              type="button"
            >
              {show ? 'Ẩn' : 'Hiện'}
            </button>
          </span>
          {errors.password && (
            <span id="password-error">{errors.password}</span>
          )}
        </div>
        <button className="primary" disabled={loading} type="submit">
          {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
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
