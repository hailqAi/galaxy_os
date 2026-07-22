import { routePermissions } from '../portal-navigation';
import { Actor, api, ApiError } from '../lib/api';

export const INVALID_LOGIN = 'Email hoặc mật khẩu không đúng.';
export const UNAVAILABLE_LOGIN =
  'Không thể đăng nhập lúc này. Vui lòng thử lại.';

export const validateLogin = (email: string, password: string) => ({
  email: !email.trim()
    ? 'Vui lòng nhập email.'
    : !/^\S+@\S+\.\S+$/.test(email)
      ? 'Email không hợp lệ.'
      : '',
  password: password ? '' : 'Vui lòng nhập mật khẩu.',
});

export async function authenticate(email: string, password: string) {
  try {
    await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  } catch (error) {
    throw new Error(
      error instanceof ApiError && error.status === 401
        ? INVALID_LOGIN
        : UNAVAILABLE_LOGIN,
    );
  }
  try {
    return await api<Actor>('/me');
  } catch {
    throw new Error(UNAVAILABLE_LOGIN);
  }
}

export const safeReturnTo = (value: string | null) => {
  if (!value?.startsWith('/') || value.startsWith('//') || value.includes('\\'))
    return null;
  try {
    const decoded = decodeURIComponent(value);
    return /(?:^|[?&])(?:email|password|currentPassword|newPassword|temporaryPassword|resetToken|sessionToken|token)=/i.test(
      decoded,
    )
      ? null
      : value;
  } catch {
    return null;
  }
};

export const permittedReturnTo = (value: string | null, granted: string[]) => {
  const path = safeReturnTo(value);
  const required =
    path && routePermissions.find(([prefix]) => path.startsWith(prefix))?.[1];
  return path && (!required || granted.includes(required)) ? path : null;
};
