export const apiUrl = '/api/v1';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown = null,
  ) {
    super(message);
  }
}

export const apiErrorCategory = (error: ApiError) =>
  typeof error.body === 'object' &&
  error.body !== null &&
  ('code' in error.body || 'category' in error.body)
    ? 'code' in error.body && typeof error.body.code === 'string'
      ? error.body.code
      : 'category' in error.body && typeof error.body.category === 'string'
        ? error.body.category
        : undefined
    : undefined;

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData
        ? {}
        : { 'Content-Type': 'application/json' }),
      ...init?.headers,
    },
    credentials: 'include',
    cache: 'no-store',
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string | string[];
    } | null;
    throw new ApiError(
      Array.isArray(body?.message)
        ? body.message.join(', ')
        : (body?.message ?? `HTTP ${response.status}`),
      response.status,
      body,
    );
  }
  return response.json() as Promise<T>;
}

export type Actor = {
  userId: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  status: string;
  lastLoginAt: string | null;
  mustChangePassword: boolean;
  organization: { id: string; name: string };
  membership: { id: string; status: string; joinedAt: string };
  departments: { id: string; name: string; isPrimary: boolean }[];
  roles: { id: string; name: string }[];
  permissions: string[];
  administrationScope:
    | 'SYSTEM'
    | 'SELF'
    | 'MANAGED_DEPARTMENTS'
    | 'ORGANIZATION';
  managedDepartmentIds: string[];
  administrationTier: number;
};
