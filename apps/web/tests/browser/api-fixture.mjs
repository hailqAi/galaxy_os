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
  permissions: [
    'dashboard.read',
    'user.read',
    'user.capabilities.read',
    'project.read',
    'project.update',
    'project.stage1.submit',
  ],
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
  if (request.url === '/api/v1/uploads/initiate' && request.method === 'POST') {
    let body = '';
    request.on('data', (chunk) => (body += chunk));
    request.on('end', () => {
      response.writeHead(201, {
        'content-type': 'application/json',
        location: '/api/v1/uploads/fixture-session',
        'upload-offset': '0',
      });
      response.end(
        JSON.stringify({
          method: request.method,
          body: JSON.parse(body),
          cookie: request.headers.cookie,
          csrf: request.headers['x-csrf-token'],
        }),
      );
    });
    return;
  }
  const projectId = request.url?.match(
    /^\/api\/v1\/projects\/(project-70[12])(?:\/|$)/,
  )?.[1];
  if (projectId) {
    const project = {
      id: projectId,
      code: projectId === 'project-701' ? 'PRJ-701' : 'PRJ-702',
      name:
        projectId === 'project-701'
          ? 'Galaxy Tower Lobby'
          : 'Galaxy Tower Annex',
      customerId: 'customer-1',
      customer: { id: 'customer-1', displayName: 'Galaxy Centre' },
      projectType: 'DESIGN_AND_BUILD',
      location: 'Quận 1, TP.HCM',
      projectManagerId: 'user-1',
      projectManager: { id: 'user-1', displayName: 'Browser Test' },
      startDate: '2026-08-01T00:00:00.000Z',
      expectedCompletionDate: '2026-12-15T00:00:00.000Z',
      status: 'ACTIVE',
      healthStatus: 'ON_TRACK',
      stageOnePlan: { scopeNotes: 'Lobby fit-out' },
      members: [
        {
          userId: 'user-1',
          user: { id: 'user-1', displayName: 'Browser Test', status: 'ACTIVE' },
        },
      ],
    };
    const workspace = {
      project: { ...project, currentStage: 'STAGE_1' },
      stages: [
        {
          stageKey: 'STAGE_1',
          title: 'GĐ 1 — KHỞI TẠO, HỒ SƠ DỰ ÁN & PHÊ DUYỆT',
          objective:
            'Hoàn thiện thông tin khởi tạo, hồ sơ chủ chốt và quy trình phê duyệt ban đầu.',
          status: 'Đang thực hiện',
          completedSteps: 2,
          totalSteps: 5,
          progressPercent: 40,
          updatedAt: '2026-08-18T00:00:00.000Z',
          nextAction: 'Tiếp tục Lập & Thẩm định hồ sơ đề xuất',
        },
        ...[
          [
            'STAGE_2',
            'GĐ 2 — THIẾT KẾ, SẢN PHẨM & DỰ TOÁN',
            'Quản lý khảo sát, thiết kế, lựa chọn sản phẩm, vật liệu, kích thước, BOQ, dự toán và phê duyệt.',
          ],
          [
            'STAGE_3',
            'GĐ 3 — THƯƠNG MẠI, HỢP ĐỒNG & MUA HÀNG',
            'Quản lý báo giá, thương lượng, hợp đồng khách hàng, nhà cung cấp, RFQ, PO, PI và kế hoạch mua hàng.',
          ],
          [
            'STAGE_4',
            'GĐ 4 — SẢN XUẤT, LOGISTICS, KHO & LẮP ĐẶT',
            'Quản lý sản xuất, QC, vận chuyển, hải quan, nhập kho, giao hàng, lắp đặt và tiến độ thực hiện.',
          ],
          [
            'STAGE_5',
            'GĐ 5 — NGHIỆM THU, BÀN GIAO & BẢO HÀNH',
            'Quản lý nghiệm thu, punch list, bàn giao, quyết toán, tài sản khách hàng, bảo hành và hậu mãi.',
          ],
        ].map(([stageKey, title, objective]) => ({
          stageKey,
          title,
          objective,
          status: 'Chưa bắt đầu',
          completedSteps: null,
          totalSteps: null,
          progressPercent: null,
          updatedAt: null,
          nextAction: 'Bắt đầu giai đoạn',
        })),
      ],
    };
    const stageOne = {
      steps: [
        {
          id: 'step-finance',
          step: 'FINANCIAL_PLANNING',
          status: 'IN_PROGRESS',
          dueDate: '2026-08-18T00:00:00.000Z',
        },
      ],
      requiredDocuments: { required: 1, approved: 0, rejected: 0, overdue: 0 },
      routing: null,
      readiness: {
        status: 'IN_PROGRESS',
        satisfied: 1,
        total: 2,
        progress: 50,
        cards: [
          {
            key: 'FINANCE',
            applicable: true,
            satisfied: 0,
            total: 1,
            status: 'NOT_STARTED',
          },
        ],
      },
      redFlags: [
        {
          code: 'FINANCIAL_PLAN_MISSING_WHEN_REQUIRED',
          severity: 'WARNING',
          title: 'Preliminary finance is missing',
          description: 'THB 99.00 is pending for 2026-08-18.',
          owner: 'PROJECT_MANAGER',
          dueDate: '2026-08-18T00:00:00.000Z',
          remediation: 'Complete finance.',
        },
      ],
    };
    const path = request.url;
    if (path === `/api/v1/projects/${projectId}/stage-1/initiation`) {
      response.writeHead(200, { 'content-type': 'application/json' });
      return response.end(
        JSON.stringify({
          project,
          routing: {
            projectType: 'DESIGN_AND_BUILD',
            workstreams: ['PROJECT_MANAGEMENT'],
            steps: ['ASSIGNMENT', 'FINANCIAL_PLANNING'],
            requiresSurvey: true,
            requiresPreliminaryFinance: true,
            documentTypes: ['PROJECT_DOSSIER', 'PRELIMINARY_FINANCIAL_PLAN'],
            riskLevel: 'HIGH',
            nextActionBasis: 'ASSIGNMENT',
          },
        }),
      );
    }
    if (path === `/api/v1/projects/${projectId}/workspace-summary`) {
      response.writeHead(200, { 'content-type': 'application/json' });
      return response.end(JSON.stringify(workspace));
    }
    if (path === `/api/v1/projects/${projectId}/stage-1/summary`) {
      response.writeHead(200, { 'content-type': 'application/json' });
      return response.end(JSON.stringify(stageOne));
    }
    if (
      request.method === 'PATCH' ||
      (request.method === 'POST' && path.includes('/stage-1/'))
    ) {
      response.writeHead(200, { 'content-type': 'application/json' });
      return response.end(JSON.stringify({}));
    }
  }
  const user = {
    id: 'cf9b5f15-5fa2-4910-b0a6-671f54d345e6',
    userId: 'cf9b5f15-5fa2-4910-b0a6-671f54d345e6',
    username: 'user-detail-test',
    email: 'user@example.test',
    displayName: 'User Detail Test',
    status: 'active',
    membershipStatus: 'active',
    mustChangePassword: false,
    locked: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    lastLoginAt: null,
    organizationMembers: [],
    departments: [],
    departmentMembers: [],
    roles: [],
    actions: [],
  };
  if (request.url?.startsWith('/api/v1/users?')) {
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
}).listen(Number(process.env.PORT ?? 3101), '127.0.0.1');
