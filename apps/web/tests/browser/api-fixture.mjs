import { createServer } from 'node:http';

let active = false;
let mustChangePassword = false;
const actor = () => ({
  userId: '00000000-0000-4000-8000-000000000001',
  email: 'valid@example.test',
  displayName: 'Browser Test',
  avatarUrl: null,
  status: 'active',
  lastLoginAt: null,
  mustChangePassword,
  organization: { id: 'test', name: 'Galaxy Test' },
  membership: { id: 'test', status: 'active', joinedAt: '' },
  departments: [],
  roles: [],
  permissions: ['user.read', 'user.capabilities.read'],
  administrationScope: 'ORGANIZATION',
  managedDepartmentIds: [],
  administrationTier: 0,
});

createServer((request, response) => {
  response.setHeader('cache-control', 'no-store');
  if (request.url === '/api/v1/auth/login' && request.method === 'POST') {
    let body = '';
    request.on('data', (chunk) => (body += chunk));
    request.on('end', () => {
      const input = JSON.parse(body);
      if (input.password !== 'fixture-password') {
        response.writeHead(401, { 'content-type': 'application/json' });
        return response.end(
          JSON.stringify({ message: 'Email hoặc mật khẩu không đúng.' }),
        );
      }
      active = true;
      mustChangePassword = input.email === 'temporary@example.test';
      response.writeHead(200, {
        'content-type': 'application/json',
        'set-cookie':
          'galaxy_session=fixture-session; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600',
      });
      response.end(JSON.stringify({ authenticated: true }));
    });
    return;
  }
  if (request.url === '/api/v1/me') {
    if (!active || !request.headers.cookie?.includes('fixture-session')) {
      response.writeHead(401);
      return response.end();
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    return response.end(JSON.stringify(actor()));
  }
  const user = {
    id: 'cf9b5f15-5fa2-4910-b0a6-671f54d345e6',
    email: 'user@example.test',
    displayName: 'User Detail Test',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    organizationMembers: [],
    departmentMembers: [],
    roles: [],
    actions: [],
  };
  if (request.url === '/api/v1/users?page=1&pageSize=20') {
    response.writeHead(200, { 'content-type': 'application/json' });
    return response.end(
      JSON.stringify({ items: [user], page: 1, pageSize: 20, total: 1 }),
    );
  }
  if (request.url === `/api/v1/users/${user.id}`) {
    response.writeHead(200, { 'content-type': 'application/json' });
    return response.end(JSON.stringify(user));
  }
  if (request.url === `/api/v1/users/${user.id}/access-preview`) {
    response.writeHead(200, { 'content-type': 'application/json' });
    return setTimeout(
      () =>
        response.end(
          JSON.stringify({
            userId: user.id,
            scope: 'SELF',
            visibleModules: [],
            visibleDepartmentIds: [],
            manageableUsers: 1,
            effectivePermissions: [],
            deniedPermissions: [],
            sourceRoles: [],
            roles: [],
            permissions: [],
            scopes: [],
            customFields: [],
            protectedTargets: 0,
          }),
        ),
      150,
    );
  }
  if (request.url === '/api/v1/custom-fields?entityType=USER') {
    response.writeHead(200, { 'content-type': 'application/json' });
    return response.end(JSON.stringify([]));
  }
  for (const [suffix, body] of [
    ['capabilities', { capabilities: [] }],
    ['sessions', []],
    ['audit', []],
  ])
    if (request.url === `/api/v1/users/${user.id}/${suffix}`) {
      response.writeHead(200, { 'content-type': 'application/json' });
      return response.end(JSON.stringify(body));
    }
  if (request.url === '/api/v1/auth/logout' && request.method === 'POST') {
    active = false;
    response.writeHead(200, {
      'content-type': 'application/json',
      'set-cookie':
        'galaxy_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
    });
    return response.end(JSON.stringify({ authenticated: false }));
  }
  response.writeHead(404, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ message: 'Not found' }));
}).listen(3101, '127.0.0.1');
