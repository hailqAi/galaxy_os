import { INestApplication, ValidationPipe } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';
import { TasksService } from '../src/tasks/tasks.service';
import { assertG00Isolation } from '../scripts/g00-isolated-environment.mjs';

assertG00Isolation();
process.env.PASSWORD_BCRYPT_ROUNDS = '4';

describe.sequential('Sprint 1 API integration', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let organizationId: string;
  let adminId: string;
  let departmentId: string;
  let scopedDepartmentId: string;
  let createdUserId: string;
  let restrictedId: string;
  let restrictedRoleId: string;
  let grantedDepartmentId: string;
  const enterpriseDepartmentIds: string[] = [];
  let customFieldId: string;
  let accessProfileRoleId: string;
  const restrictedEmail = `restricted-${Date.now()}@galaxy.local`;

  beforeAll(async () => {
    vi.stubEnv('ALLOW_DEV_AUTH', 'true');
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('DEV_AUTH_USER_EMAIL', 'admin@galaxy.local');
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { slug: 'galaxy-centre' },
    });
    organizationId = organization.id;
    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: 'admin@galaxy.local' },
    });
    adminId = admin.id;
    const restricted = await prisma.user.create({
      data: {
        email: restrictedEmail,
        normalizedEmail: restrictedEmail,
        displayName: 'Restricted',
        status: 'active',
      },
    });
    restrictedId = restricted.id;
    await prisma.organizationMembership.create({
      data: { organizationId, userId: restricted.id },
    });
    const role = await prisma.role.create({
      data: {
        organizationId,
        code: `restricted_${Date.now()}`,
        name: 'Restricted',
      },
    });
    restrictedRoleId = role.id;
    const read = await prisma.permission.findUniqueOrThrow({
      where: { code: 'organization.read' },
    });
    await prisma.rolePermission.create({
      data: { roleId: role.id, permissionId: read.id },
    });
    await prisma.userRole.create({
      data: { organizationId, userId: restricted.id, roleId: role.id },
    });
    app = (
      await Test.createTestingModule({ imports: [AppModule] }).compile()
    ).createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterEach(() => {
    process.env.DEV_AUTH_USER_EMAIL = 'admin@galaxy.local';
  });

  afterAll(async () => {
    if (createdUserId) {
      await prisma.session.deleteMany({ where: { userId: createdUserId } });
      await prisma.passwordCredential.deleteMany({
        where: { userId: createdUserId },
      });
      await prisma.departmentMembership.deleteMany({
        where: { userId: createdUserId },
      });
      await prisma.userRole.deleteMany({ where: { userId: createdUserId } });
      await prisma.managedDepartment.deleteMany({
        where: { manager: { userId: restrictedId } },
      });
      await prisma.organizationMembership.deleteMany({
        where: { userId: createdUserId },
      });
      await prisma.user.delete({ where: { id: createdUserId } });
    }
    if (departmentId)
      await prisma.department.delete({ where: { id: departmentId } });
    if (scopedDepartmentId)
      await prisma.department.delete({ where: { id: scopedDepartmentId } });
    if (grantedDepartmentId)
      await prisma.department.delete({ where: { id: grantedDepartmentId } });
    if (customFieldId)
      await prisma.customFieldDefinition.delete({
        where: { id: customFieldId },
      });
    if (accessProfileRoleId) {
      await prisma.rolePermission.deleteMany({
        where: { roleId: accessProfileRoleId },
      });
      await prisma.role.delete({ where: { id: accessProfileRoleId } });
    }
    for (const id of enterpriseDepartmentIds.reverse())
      await prisma.department.delete({ where: { id } });
    const restricted = await prisma.user.findUnique({
      where: { email: restrictedEmail },
    });
    if (restricted) {
      await prisma.userRole.deleteMany({ where: { userId: restricted.id } });
      const roles = await prisma.role.findMany({
        where: { organizationId, code: { startsWith: 'restricted_' } },
        select: { id: true },
      });
      await prisma.userRole.deleteMany({
        where: { roleId: { in: roles.map(({ id }) => id) } },
      });
      await prisma.rolePermission.deleteMany({
        where: { roleId: { in: roles.map(({ id }) => id) } },
      });
      await prisma.role.deleteMany({
        where: { organizationId, code: { startsWith: 'restricted_' } },
      });
      await prisma.organizationMembership.deleteMany({
        where: { userId: restricted.id },
      });
      await prisma.user.delete({ where: { id: restricted.id } });
    }
    await app.close();
    await prisma.$disconnect();
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it('gets the current actor and organization', async () => {
    const me = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('x-galaxy-dev-auth', process.env.DEV_AUTH_USER_EMAIL!);
    expect(me.body.organizationId).toBe(organizationId);
    await request(app.getHttpServer())
      .get('/api/v1/organization')
      .set('x-galaxy-dev-auth', process.env.DEV_AUTH_USER_EMAIL!);
  });

  it('keeps central ChatGPT metadata and checks system-only, including after assignment revocation', async () => {
    const endpoint = '/api/v1/system/settings/chatgpt-connection';
    const checked = await request(app.getHttpServer())
      .get(endpoint)
      .set('x-galaxy-dev-auth', 'admin@galaxy.local')
      .expect(200);
    expect(checked.body).toMatchObject({
      status: 'NOT_CONFIGURED',
      appEligibility: 'ELIGIBILITY_UNCONFIRMED',
      inferenceGrant: 'NOT_GRANTED',
      providerScope: 'UNCONFIRMED',
      identity: null,
      models: [],
      canConnect: false,
      canDisconnect: false,
    });
    const permissions = await prisma.permission.findMany({
      where: {
        code: { in: ['system.settings.read', 'system.settings.update'] },
      },
    });
    const assignment = await prisma.userRole.findFirstOrThrow({
      where: { userId: restrictedId, roleId: restrictedRoleId },
    });
    const membership = await prisma.organizationMembership.findFirstOrThrow({
      where: { userId: restrictedId, organizationId },
    });
    const scopedDepartment = await prisma.department.findFirstOrThrow({
      where: { organizationId, status: 'active' },
    });
    const { randomBytes, createHash } = await import('node:crypto');
    const token = randomBytes(32).toString('hex');
    const session = await prisma.session.create({
      data: {
        userId: restrictedId,
        organizationMembershipId: membership.id,
        tokenHash: createHash('sha256').update(token).digest('hex'),
        expiresAt: new Date(Date.now() + 3600000),
        lastSeenAt: new Date(),
      },
    });
    const unrelatedSystemRole = await prisma.role.create({
      data: {
        organizationId,
        code: `chatgpt-unrelated-${Date.now()}`,
        name: 'Unrelated SYSTEM fixture',
        permissions: {
          create: { permission: { connect: { code: 'organization.read' } } },
        },
      },
    });
    const unrelatedSystemAssignment = await prisma.userRole.create({
      data: {
        organizationId,
        userId: restrictedId,
        roleId: unrelatedSystemRole.id,
        scopeType: 'SYSTEM',
      },
    });
    const cookie = `${process.env.SESSION_COOKIE_NAME}=${token}`;
    try {
      await prisma.rolePermission.createMany({
        data: permissions.map((permission) => ({
          roleId: restrictedRoleId,
          permissionId: permission.id,
        })),
      });
      for (const scopeType of ['SELF', 'DEPARTMENT', 'ORGANIZATION'] as const) {
        await prisma.userRole.update({
          where: { id: assignment.id },
          data: {
            scopeType,
            departmentId:
              scopeType === 'DEPARTMENT' ? scopedDepartment.id : null,
          },
        });
        await request(app.getHttpServer())
          .get(endpoint)
          .set('Cookie', cookie)
          .expect(403);
        await request(app.getHttpServer())
          .post(endpoint)
          .set('Cookie', cookie)
          .send({})
          .expect(403);
      }
      await prisma.userRole.update({
        where: { id: assignment.id },
        data: { scopeType: 'SYSTEM' },
      });
      const result = await request(app.getHttpServer())
        .post(endpoint)
        .set('Cookie', cookie)
        .send({})
        .expect(201);
      expect(result.body.checkKind).toBe('LOCAL_CONFIGURATION_ONLY');
      expect(result.body.checkedAt).toEqual(expect.any(String));
      expect(result.body.models).toEqual([]);
      await prisma.userRole.update({
        where: { id: assignment.id },
        data: { scopeType: 'ORGANIZATION' },
      });
      await request(app.getHttpServer())
        .get(endpoint)
        .set('Cookie', cookie)
        .expect(403);
      await request(app.getHttpServer())
        .post(endpoint)
        .set('Cookie', cookie)
        .send({})
        .expect(403);
    } finally {
      await prisma.userRole.delete({
        where: { id: unrelatedSystemAssignment.id },
      });
      await prisma.rolePermission.deleteMany({
        where: { roleId: unrelatedSystemRole.id },
      });
      await prisma.role.delete({ where: { id: unrelatedSystemRole.id } });
      await prisma.session.delete({ where: { id: session.id } });
      await prisma.userRole.update({
        where: { id: assignment.id },
        data: {
          scopeType: assignment.scopeType,
          departmentId: assignment.departmentId,
        },
      });
      await prisma.rolePermission.deleteMany({
        where: {
          roleId: restrictedRoleId,
          permissionId: { in: permissions.map((p) => p.id) },
        },
      });
    }
  });

  it('reads paged tasks and complete status totals from the same domain query', async () => {
    const title = `tracker-${crypto.randomUUID()}`;
    try {
      await prisma.task.createMany({
        data: Array.from({ length: 125 }, (_, i) => ({
          organizationId,
          title,
          createdBy: adminId,
          updatedBy: adminId,
          status: i < 110 ? ('TODO' as const) : ('DONE' as const),
        })),
      });
      const actor = await request(app.getHttpServer())
        .get('/api/v1/me')
        .set('x-galaxy-dev-auth', 'admin@galaxy.local')
        .expect(200);
      // Vitest/esbuild does not emit DTO design metadata. Exercise the real
      // domain + database here; browser acceptance uses the compiled HTTP route.
      const service = app.get(TasksService);
      const response = await service.list(actor.body, {
        search: title,
        page: 3,
        pageSize: 50,
      });
      expect(response).toMatchObject({
        total: 125,
        totalPages: 3,
        statusCounts: { TODO: 110, DONE: 15 },
        computedAt: expect.any(String),
      });
      expect(response.items).toHaveLength(25);
      const open = await service.list(actor.body, {
        search: title,
        open: true,
        page: 1,
        pageSize: 50,
      });
      expect(open).toMatchObject({
        total: 110,
        statusCounts: { TODO: 110 },
      });
      expect(open.items).toHaveLength(50);
    } finally {
      await prisma.task.deleteMany({
        where: { organizationId, title, createdBy: adminId },
      });
    }
  });

  it('updates task content, assignees and history together without partial writes', async () => {
    const task = await prisma.task.create({
      data: {
        organizationId,
        title: 'Atomic task update',
        createdBy: adminId,
        updatedBy: adminId,
      },
    });
    try {
      const actor = await request(app.getHttpServer())
        .get('/api/v1/me')
        .set('x-galaxy-dev-auth', 'admin@galaxy.local')
        .expect(200);
      const service = app.get(TasksService);
      await expect(
        service.update(
          { ...actor.body, permissions: ['task.read', 'task.update'] },
          task.id,
          { title: 'Must not bypass assignment permission', assigneeIds: [] },
        ),
      ).rejects.toThrow('Task assignment permission is required');
      await expect(
        service.update(actor.body, task.id, {
          title: 'Must not persist',
          assigneeIds: [crypto.randomUUID()],
        }),
      ).rejects.toThrow('Assignable user not found');
      expect(
        await prisma.task.findUniqueOrThrow({ where: { id: task.id } }),
      ).toMatchObject({ title: task.title, version: task.version });

      const updated = await service.update(actor.body, task.id, {
        title: 'Saved with assignment',
        assigneeIds: [restrictedId],
      });
      expect(updated).toMatchObject({
        title: 'Saved with assignment',
        version: task.version + 1,
        assignees: [{ userId: restrictedId }],
      });
      expect(
        await prisma.activity.findMany({
          where: { organizationId, entityType: 'Task', entityId: task.id },
          orderBy: { createdAt: 'asc' },
        }),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ event: 'TASK_ASSIGNED' }),
          expect.objectContaining({
            event: 'TASK_UPDATED',
            actorId: adminId,
            metadata: {
              fields: ['title', 'assigneeIds'],
              fromVersion: task.version,
              toVersion: task.version + 1,
            },
          }),
        ]),
      );
      const failingAudit = new TasksService(
        prisma.$extends({
          query: {
            activity: {
              create({ args, query }) {
                if (args.data.event === 'TASK_UPDATED')
                  throw new Error('Injected audit failure');
                return query(args);
              },
            },
          },
        }) as unknown as PrismaService,
      );
      await expect(
        failingAudit.update(actor.body, task.id, {
          title: 'Must roll back',
          assigneeIds: [adminId],
        }),
      ).rejects.toThrow('Injected audit failure');
      expect(await service.get(actor.body, task.id)).toMatchObject({
        title: updated.title,
        version: updated.version,
        assignees: [{ userId: restrictedId }],
        activity: expect.any(Array),
      });
      expect(
        await prisma.activity.count({
          where: { organizationId, entityType: 'Task', entityId: task.id },
        }),
      ).toBe(2);
      expect(
        await prisma.notification.findMany({
          where: { organizationId, entityType: 'Task', entityId: task.id },
        }),
      ).toMatchObject([{ recipientId: restrictedId }]);
    } finally {
      await prisma.notification.deleteMany({
        where: { organizationId, entityType: 'Task', entityId: task.id },
      });
      await prisma.activity.deleteMany({
        where: { organizationId, entityType: 'Task', entityId: task.id },
      });
      await prisma.taskAssignee.deleteMany({ where: { taskId: task.id } });
      await prisma.task.delete({ where: { id: task.id } });
    }
  });

  it('denies organization update and department creation without permission', async () => {
    process.env.DEV_AUTH_USER_EMAIL = restrictedEmail;
    await request(app.getHttpServer())
      .patch('/api/v1/organization')
      .set('x-galaxy-dev-auth', process.env.DEV_AUTH_USER_EMAIL!)
      .send({ name: 'Blocked' })
      .expect(403);
    const beforeCount = await prisma.department.count({
      where: { organizationId, code: 'BLOCKED' },
    });
    const beforeAudit = await prisma.auditLog.count({
      where: { actorUserId: restrictedId, action: 'department.create' },
    });
    await request(app.getHttpServer())
      .post('/api/v1/departments')
      .set('x-galaxy-dev-auth', process.env.DEV_AUTH_USER_EMAIL!)
      .send({ code: 'BLOCKED', name: 'Blocked' })
      .expect(403);
    expect(
      await prisma.department.count({
        where: { organizationId, code: 'BLOCKED' },
      }),
    ).toBe(beforeCount);
    expect(
      await prisma.auditLog.count({
        where: { actorUserId: restrictedId, action: 'department.create' },
      }),
    ).toBe(beforeAudit);
  });

  it('does not grant permission through department membership', async () => {
    const department = await prisma.department.findFirstOrThrow({
      where: { organizationId, status: 'active' },
    });
    await prisma.departmentMembership.create({
      data: {
        organizationId,
        departmentId: department.id,
        userId: restrictedId,
      },
    });
    process.env.DEV_AUTH_USER_EMAIL = restrictedEmail;
    await request(app.getHttpServer())
      .post('/api/v1/departments')
      .set('x-galaxy-dev-auth', process.env.DEV_AUTH_USER_EMAIL!)
      .send({ code: 'DEPARTMENT_ONLY', name: 'Blocked' })
      .expect(403);
    await prisma.departmentMembership.deleteMany({
      where: { organizationId, userId: restrictedId },
    });
  });

  it('grants and removes access with a role and unions multiple roles', async () => {
    const createPermission = await prisma.permission.findUniqueOrThrow({
      where: { code: 'department.create' },
    });
    const readPermission = await prisma.permission.findUniqueOrThrow({
      where: { code: 'department.read' },
    });
    const secondRole = await prisma.role.create({
      data: {
        organizationId,
        code: `restricted_second_${Date.now()}`,
        name: 'Restricted second',
      },
    });
    await prisma.rolePermission.createMany({
      data: [
        { roleId: restrictedRoleId, permissionId: createPermission.id },
        { roleId: secondRole.id, permissionId: readPermission.id },
      ],
    });
    await prisma.userRole.create({
      data: {
        organizationId,
        userId: restrictedId,
        roleId: secondRole.id,
      },
    });
    process.env.DEV_AUTH_USER_EMAIL = restrictedEmail;
    const me = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('x-galaxy-dev-auth', process.env.DEV_AUTH_USER_EMAIL!);
    expect(me.body.permissions).toEqual(
      expect.arrayContaining([
        'organization.read',
        'department.create',
        'department.read',
      ]),
    );
    expect(new Set(me.body.permissions).size).toBe(me.body.permissions.length);
    const created = await request(app.getHttpServer())
      .post('/api/v1/departments')
      .set('x-galaxy-dev-auth', process.env.DEV_AUTH_USER_EMAIL!)
      .send({ code: `GRANTED_${Date.now()}`, name: 'Granted' })
      .expect(201);
    grantedDepartmentId = created.body.id;
    await prisma.rolePermission.delete({
      where: {
        roleId_permissionId: {
          roleId: restrictedRoleId,
          permissionId: createPermission.id,
        },
      },
    });
    await request(app.getHttpServer())
      .post('/api/v1/departments')
      .set('x-galaxy-dev-auth', process.env.DEV_AUTH_USER_EMAIL!)
      .send({ code: 'REMOVED_PERMISSION', name: 'Blocked' })
      .expect(403);
  });

  it('rejects disabled users and disabled memberships', async () => {
    process.env.DEV_AUTH_USER_EMAIL = restrictedEmail;
    await prisma.user.update({
      where: { id: restrictedId },
      data: { status: 'disabled' },
    });
    await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('x-galaxy-dev-auth', process.env.DEV_AUTH_USER_EMAIL!);
    await prisma.user.update({
      where: { id: restrictedId },
      data: { status: 'active' },
    });
    await prisma.organizationMembership.update({
      where: {
        organizationId_userId: { organizationId, userId: restrictedId },
      },
      data: { status: 'disabled' },
    });
    await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('x-galaxy-dev-auth', process.env.DEV_AUTH_USER_EMAIL!);
    process.env.DEV_AUTH_USER_EMAIL = 'admin@galaxy.local';
    const inactive = await request(app.getHttpServer())
      .get(`/api/v1/users/${restrictedId}`)
      .set('x-galaxy-dev-auth', process.env.DEV_AUTH_USER_EMAIL!)
      .expect(200);
    expect(inactive.body).not.toHaveProperty('effectivePermissions');
    await prisma.organizationMembership.update({
      where: {
        organizationId_userId: { organizationId, userId: restrictedId },
      },
      data: { status: 'active' },
    });
  });

  it('creates a department with permission using the actor organization', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/departments')
      .set('x-galaxy-dev-auth', process.env.DEV_AUTH_USER_EMAIL!)
      .send({ code: `TEST_${Date.now()}`, name: 'Integration Test' })
      .expect(201);
    departmentId = created.body.id;
    const scoped = await request(app.getHttpServer())
      .post('/api/v1/departments')
      .set('x-galaxy-dev-auth', process.env.DEV_AUTH_USER_EMAIL!)
      .send({
        code: `SCOPE_${Date.now()}`,
        name: 'Actor scoped',
      })
      .expect(201);
    scopedDepartmentId = scoped.body.id;
    expect(scoped.body.organizationId).toBe(organizationId);
    expect(
      await prisma.auditLog.count({
        where: {
          organizationId,
          action: 'department.create',
          entityId: scopedDepartmentId,
        },
      }),
    ).toBe(1);
  });

  it('enforces managed-department visibility, target authority, and role delegation', async () => {
    const [managedDepartment, unrelatedDepartment] = await Promise.all([
      prisma.department.findFirstOrThrow({
        where: { organizationId, code: 'SALES' },
      }),
      prisma.department.findFirstOrThrow({
        where: { organizationId, code: 'DESIGN' },
      }),
    ]);
    const managerRole = await prisma.role.findFirstOrThrow({
      where: { organizationId, code: 'sales_manager' },
    });
    const subordinateRole = await prisma.role.findFirstOrThrow({
      where: { organizationId, code: 'sales' },
    });
    const protectedRole = await prisma.role.findFirstOrThrow({
      where: { organizationId, code: 'system_admin' },
    });
    const managerMembership = await prisma.organizationMembership.update({
      where: {
        organizationId_userId: { organizationId, userId: restrictedId },
      },
      data: { administrationScope: 'MANAGED_DEPARTMENTS' },
    });
    await prisma.userRole.create({
      data: {
        organizationId,
        userId: restrictedId,
        roleId: managerRole.id,
        scopeType: 'DEPARTMENT',
        departmentId: managedDepartment.id,
      },
    });
    await prisma.managedDepartment.create({
      data: {
        organizationId,
        managerId: managerMembership.id,
        departmentId: managedDepartment.id,
        createdByUserId: adminId,
      },
    });
    const makeTarget = async (departmentId: string, label: string) => {
      const targetEmail = `${label.toLowerCase().replace(' ', '-')}-${Date.now()}@galaxy.local`;
      const user = await prisma.user.create({
        data: {
          email: targetEmail,
          normalizedEmail: targetEmail,
          displayName: label,
          status: 'active',
        },
      });
      await prisma.organizationMembership.create({
        data: { organizationId, userId: user.id },
      });
      await prisma.departmentMembership.create({
        data: { organizationId, userId: user.id, departmentId },
      });
      return user;
    };
    const allowed = await makeTarget(managedDepartment.id, 'Managed target');
    const unrelated = await makeTarget(
      unrelatedDepartment.id,
      'Unrelated target',
    );
    process.env.DEV_AUTH_USER_EMAIL = restrictedEmail;
    const list = await request(app.getHttpServer())
      .get('/api/v1/users?pageSize=100')
      .set('x-galaxy-dev-auth', restrictedEmail)
      .expect(200);
    expect(
      list.body.items.map(({ userId }: { userId: string }) => userId),
    ).toContain(allowed.id);
    expect(
      list.body.items.map(({ userId }: { userId: string }) => userId),
    ).not.toContain(unrelated.id);
    expect(list.body.items[0]).not.toHaveProperty('credential');
    expect(list.body.items[0]).not.toHaveProperty('effectivePermissions');
    expect(list.body.items[0]).not.toHaveProperty('organizationMembers');
    expect(list.body.items[0]).not.toHaveProperty('sessions');
    expect(list.body.items[0]).not.toHaveProperty('auditLogs');
    await request(app.getHttpServer())
      .patch(`/api/v1/users/${allowed.id}`)
      .set('x-galaxy-dev-auth', restrictedEmail)
      .send({ displayName: 'Managed updated' })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/v1/users/${unrelated.id}`)
      .set('x-galaxy-dev-auth', restrictedEmail)
      .send({ displayName: 'Blocked' })
      .expect(404);
    await request(app.getHttpServer())
      .post(`/api/v1/auth/users/${adminId}/reset-password`)
      .set('x-galaxy-dev-auth', restrictedEmail)
      .expect(404);
    await request(app.getHttpServer())
      .put(`/api/v1/users/${allowed.id}/roles`)
      .set('x-galaxy-dev-auth', restrictedEmail)
      .send({ roleIds: [subordinateRole.id] })
      .expect(200);
    await request(app.getHttpServer())
      .put(`/api/v1/users/${allowed.id}/roles`)
      .set('x-galaxy-dev-auth', restrictedEmail)
      .send({ roleIds: [protectedRole.id] })
      .expect(409);
    const temporary = await request(app.getHttpServer())
      .post(`/api/v1/auth/users/${allowed.id}/reset-password`)
      .set('x-galaxy-dev-auth', restrictedEmail)
      .expect(201);
    const credential = await prisma.passwordCredential.findUniqueOrThrow({
      where: { userId: allowed.id },
    });
    expect(credential.mustChangePassword).toBe(true);
    expect(credential.passwordHash).not.toContain(
      temporary.body.temporaryPassword,
    );
    expect(
      JSON.stringify(
        await prisma.auditLog.findMany({ where: { entityId: allowed.id } }),
      ),
    ).not.toContain(temporary.body.temporaryPassword);
    for (const userId of [allowed.id, unrelated.id]) {
      await prisma.session.deleteMany({ where: { userId } });
      await prisma.passwordResetToken.deleteMany({ where: { userId } });
      await prisma.passwordCredential.deleteMany({ where: { userId } });
      await prisma.userRole.deleteMany({ where: { userId } });
      await prisma.departmentMembership.deleteMany({ where: { userId } });
      await prisma.organizationMembership.deleteMany({ where: { userId } });
      await prisma.auditLog.deleteMany({ where: { entityId: userId } });
      await prisma.user.delete({ where: { id: userId } });
    }
    await prisma.managedDepartment.deleteMany({
      where: { managerId: managerMembership.id },
    });
    await prisma.userRole.deleteMany({
      where: { userId: restrictedId, roleId: managerRole.id },
    });
    await prisma.organizationMembership.update({
      where: { id: managerMembership.id },
      data: { administrationScope: 'SELF' },
    });
    process.env.DEV_AUTH_USER_EMAIL = 'admin@galaxy.local';
  });

  it('creates a user and assigns an organization role', async () => {
    const email = `api-${Date.now()}@galaxy.local`;
    const role = await prisma.role.findFirstOrThrow({
      where: { organizationId, code: 'sales' },
    });
    const department = await prisma.department.findFirstOrThrow({
      where: { organizationId, status: 'active' },
    });
    const created = await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('x-galaxy-dev-auth', process.env.DEV_AUTH_USER_EMAIL!)
      .send({
        email,
        displayName: 'API Test',
        status: 'active',
        temporaryPassword: 'Temporary password 123',
        roleIds: [role.id],
        departments: [{ departmentId: department.id, isPrimary: true }],
      })
      .expect(201);
    createdUserId = created.body.id;
    expect(created.body).not.toHaveProperty('externalAuthId');
    expect(created.body.temporaryPassword).toBe('Temporary password 123');
    expect(
      (
        await prisma.passwordCredential.findUniqueOrThrow({
          where: { userId: createdUserId },
        })
      ).mustChangePassword,
    ).toBe(true);
    expect(
      await prisma.departmentMembership.count({
        where: { userId: createdUserId, departmentId: department.id },
      }),
    ).toBe(1);
    expect(
      await prisma.userRole.count({
        where: { userId: createdUserId, roleId: role.id },
      }),
    ).toBe(1);
    await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('x-galaxy-dev-auth', process.env.DEV_AUTH_USER_EMAIL!)
      .send({
        email: email.toUpperCase(),
        displayName: 'Duplicate',
        temporaryPassword: 'Temporary password 123',
      })
      .expect(409);
    await request(app.getHttpServer())
      .put(`/api/v1/users/${createdUserId}/roles`)
      .set('x-galaxy-dev-auth', process.env.DEV_AUTH_USER_EMAIL!)
      .send({ roleIds: [role.id] })
      .expect(200);
    const capabilities = await request(app.getHttpServer())
      .get(`/api/v1/users/${createdUserId}/capabilities`)
      .set('x-galaxy-dev-auth', process.env.DEV_AUTH_USER_EMAIL!)
      .expect(200);
    expect(
      new Set(
        capabilities.body.capabilities.map(({ key }: { key: string }) => key),
      ).size,
    ).toBe(capabilities.body.capabilities.length);
    expect(capabilities.body.capabilities[0]).toHaveProperty('sourceRoles');
    const preview = await request(app.getHttpServer())
      .get(`/api/v1/users/${createdUserId}/access-preview`)
      .set('x-galaxy-dev-auth', process.env.DEV_AUTH_USER_EMAIL!)
      .expect(200);
    for (const field of [
      'visibleModules',
      'visibleDepartmentIds',
      'effectivePermissions',
      'deniedPermissions',
      'sourceRoles',
      'roles',
      'permissions',
      'scopes',
      'customFields',
    ])
      expect(Array.isArray(preview.body[field])).toBe(true);
  });

  it('assigns role permissions through the protected API and audits the change', async () => {
    const role = await prisma.role.create({
      data: {
        organizationId,
        code: `restricted_permissions_${Date.now()}`,
        name: 'Permission assignment test',
      },
    });
    const permission = await prisma.permission.findUniqueOrThrow({
      where: { code: 'department.read' },
    });
    await request(app.getHttpServer())
      .put(`/api/v1/roles/${role.id}/permissions`)
      .set('x-galaxy-dev-auth', process.env.DEV_AUTH_USER_EMAIL!)
      .send({ permissionIds: [permission.id] })
      .expect(200);
    expect(
      await prisma.auditLog.count({
        where: {
          organizationId,
          action: 'role.permission.assign',
          entityId: role.id,
        },
      }),
    ).toBe(1);
  });

  it('adds and removes department membership with audit records', async () => {
    const department = await prisma.department.findFirstOrThrow({
      where: { organizationId, status: 'active' },
    });
    await request(app.getHttpServer())
      .put(`/api/v1/users/${createdUserId}/departments`)
      .set('x-galaxy-dev-auth', process.env.DEV_AUTH_USER_EMAIL!)
      .send({ departments: [{ departmentId: department.id, isPrimary: true }] })
      .expect(200);
    await request(app.getHttpServer())
      .put(`/api/v1/users/${createdUserId}/departments`)
      .set('x-galaxy-dev-auth', process.env.DEV_AUTH_USER_EMAIL!)
      .send({ departments: [] })
      .expect(200);
    const actions = await prisma.auditLog.findMany({
      where: {
        organizationId,
        entityType: 'DepartmentMembership',
        action: {
          in: ['department.membership.add', 'department.membership.remove'],
        },
      },
      select: { action: true },
    });
    expect(actions.map(({ action }) => action)).toEqual(
      expect.arrayContaining([
        'department.membership.add',
        'department.membership.remove',
      ]),
    );
  });

  it('rejects cross-organization records and protects the final administrator', async () => {
    const other = await prisma.organization.create({
      data: {
        name: 'Other',
        slug: `other-${Date.now()}`,
        timezone: 'UTC',
        defaultCurrency: 'USD',
      },
    });
    const foreign = await prisma.department.create({
      data: { organizationId: other.id, code: 'FOREIGN', name: 'Foreign' },
    });
    const foreignRole = await prisma.role.create({
      data: { organizationId: other.id, code: 'foreign', name: 'Foreign' },
    });
    const foreignUser = await prisma.user.create({
      data: {
        email: `foreign-${Date.now()}@galaxy.local`,
        normalizedEmail: `foreign-${Date.now()}@galaxy.local`,
        displayName: 'Foreign',
        status: 'active',
      },
    });
    await prisma.organizationMembership.create({
      data: { organizationId: other.id, userId: foreignUser.id },
    });
    await request(app.getHttpServer())
      .get(`/api/v1/departments/${foreign.id}`)
      .set('x-galaxy-dev-auth', process.env.DEV_AUTH_USER_EMAIL!)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/v1/users/${foreignUser.id}`)
      .set('x-galaxy-dev-auth', process.env.DEV_AUTH_USER_EMAIL!)
      .expect(404);
    await request(app.getHttpServer())
      .put(`/api/v1/users/${createdUserId}/departments`)
      .set('x-galaxy-dev-auth', process.env.DEV_AUTH_USER_EMAIL!)
      .send({ departments: [{ departmentId: foreign.id, isPrimary: false }] })
      .expect(400);
    await request(app.getHttpServer())
      .put(`/api/v1/users/${createdUserId}/roles`)
      .set('x-galaxy-dev-auth', process.env.DEV_AUTH_USER_EMAIL!)
      .send({ roleIds: [foreignRole.id] })
      .expect(404);
    await prisma.organizationMembership.delete({
      where: {
        organizationId_userId: {
          organizationId: other.id,
          userId: foreignUser.id,
        },
      },
    });
    await prisma.user.delete({ where: { id: foreignUser.id } });
    await prisma.department.delete({ where: { id: foreign.id } });
    await prisma.role.delete({ where: { id: foreignRole.id } });
    await prisma.organization.delete({ where: { id: other.id } });
    await request(app.getHttpServer())
      .post(`/api/v1/users/${adminId}/disable`)
      .set('x-galaxy-dev-auth', process.env.DEV_AUTH_USER_EMAIL!)
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/v1/users/${adminId}`)
      .set('x-galaxy-dev-auth', process.env.DEV_AUTH_USER_EMAIL!)
      .send({ status: 'invited' })
      .expect(403);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: adminId } })).status,
    ).toBe('active');
    const adminRole = await prisma.role.findFirstOrThrow({
      where: { organizationId, code: 'system_admin' },
    });
    await request(app.getHttpServer())
      .put(`/api/v1/users/${adminId}/roles`)
      .set('x-galaxy-dev-auth', process.env.DEV_AUTH_USER_EMAIL!)
      .send({ roleIds: [] })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/v1/users/${adminId}/membership`)
      .set('x-galaxy-dev-auth', process.env.DEV_AUTH_USER_EMAIL!)
      .send({ status: 'disabled' })
      .expect(403);
    expect(adminRole.status).toBe('active');
  });

  it('updates membership status with an audit record', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/users/${createdUserId}/membership`)
      .set('x-galaxy-dev-auth', process.env.DEV_AUTH_USER_EMAIL!)
      .send({ status: 'disabled' })
      .expect(200);
    expect(
      await prisma.auditLog.count({
        where: {
          organizationId,
          entityType: 'OrganizationMembership',
          action: 'membership.update',
        },
      }),
    ).toBeGreaterThan(0);
    await request(app.getHttpServer())
      .patch(`/api/v1/users/${createdUserId}/membership`)
      .set('x-galaxy-dev-auth', process.env.DEV_AUTH_USER_EMAIL!)
      .send({ status: 'active' })
      .expect(200);
  });

  it('lists audit logs with permission', () =>
    request(app.getHttpServer())
      .get('/api/v1/audit-logs?page=1&pageSize=20')
      .set('x-galaxy-dev-auth', process.env.DEV_AUTH_USER_EMAIL!)
      .expect(200));

  it('protects system settings from Organization Administrators', async () => {
    await request(app.getHttpServer())
      .put('/api/v1/system/settings')
      .set('x-galaxy-dev-auth', process.env.DEV_AUTH_USER_EMAIL!)
      .send({ key: 'authentication.sessionLifetimeHours', value: 24 })
      .expect(200);
    process.env.DEV_AUTH_USER_EMAIL = 'organization.admin@galaxy.local';
    await request(app.getHttpServer())
      .get('/api/v1/system/settings')
      .set('x-galaxy-dev-auth', 'organization.admin@galaxy.local')
      .expect(403);
  });

  it('prevents organizational hierarchy cycles', async () => {
    process.env.DEV_AUTH_USER_EMAIL = 'admin@galaxy.local';
    const parent = await request(app.getHttpServer())
      .post('/api/v1/departments')
      .set('x-galaxy-dev-auth', 'admin@galaxy.local')
      .send({
        code: `PARENT_${Date.now()}`,
        name: 'Parent',
        unitType: 'DIVISION',
      })
      .expect(201);
    const child = await request(app.getHttpServer())
      .post('/api/v1/departments')
      .set('x-galaxy-dev-auth', 'admin@galaxy.local')
      .send({
        code: `CHILD_${Date.now()}`,
        name: 'Child',
        unitType: 'TEAM',
        parentId: parent.body.id,
      })
      .expect(201);
    enterpriseDepartmentIds.push(parent.body.id, child.body.id);
    await request(app.getHttpServer())
      .patch(`/api/v1/departments/${parent.body.id}`)
      .set('x-galaxy-dev-auth', 'admin@galaxy.local')
      .send({ parentId: child.body.id })
      .expect(400);
  });

  it('validates metadata-driven custom fields and values', async () => {
    process.env.DEV_AUTH_USER_EMAIL = 'admin@galaxy.local';
    await request(app.getHttpServer())
      .post('/api/v1/custom-fields')
      .set('x-galaxy-dev-auth', 'admin@galaxy.local')
      .send({
        scope: 'ORGANIZATION',
        entityType: 'USER',
        key: `invalid_${Date.now()}`,
        label: 'Invalid',
        dataType: 'SINGLE_SELECT',
        options: [],
      })
      .expect(400);
    const key = `employee_code_${Date.now()}`;
    const field = await request(app.getHttpServer())
      .post('/api/v1/custom-fields')
      .set('x-galaxy-dev-auth', 'admin@galaxy.local')
      .send({
        scope: 'ORGANIZATION',
        entityType: 'USER',
        key,
        label: 'Employee code',
        dataType: 'NUMBER',
      })
      .expect(201);
    customFieldId = field.body.id;
    await request(app.getHttpServer())
      .put(`/api/v1/custom-fields/USER/${createdUserId}/values`)
      .set('x-galaxy-dev-auth', 'admin@galaxy.local')
      .send({ values: { [key]: 'not-a-number' } })
      .expect(400);
  });

  it('enforces representative authority and department boundaries', async () => {
    const usersFor = async (email: string, status: number) => {
      process.env.DEV_AUTH_USER_EMAIL = email;
      return request(app.getHttpServer())
        .get('/api/v1/users?pageSize=100')
        .set('x-galaxy-dev-auth', email)
        .expect(status);
    };
    const director = await usersFor('director@galaxy.local', 200);
    expect(
      director.body.items.some(
        ({ email }: { email: string }) =>
          email === 'accounting.employee@galaxy.local',
      ),
    ).toBe(true);
    process.env.DEV_AUTH_USER_EMAIL = 'director@galaxy.local';
    await request(app.getHttpServer())
      .get('/api/v1/system/settings')
      .set('x-galaxy-dev-auth', 'director@galaxy.local')
      .expect(403);
    const sales = await usersFor('sales.manager@galaxy.local', 200);
    expect(
      sales.body.items.some(
        ({ email }: { email: string }) =>
          email === 'sales.employee@galaxy.local',
      ),
    ).toBe(true);
    expect(
      sales.body.items.some(
        ({ email }: { email: string }) =>
          email === 'accounting.employee@galaxy.local',
      ),
    ).toBe(false);
    const accounting = await usersFor('accounting.manager@galaxy.local', 200);
    expect(
      accounting.body.items.some(
        ({ email }: { email: string }) =>
          email === 'accounting.employee@galaxy.local',
      ),
    ).toBe(true);
    expect(
      accounting.body.items.some(
        ({ email }: { email: string }) =>
          email === 'sales.employee@galaxy.local',
      ),
    ).toBe(false);
    await usersFor('normal.employee@galaxy.local', 403);
  });

  it('uses an explicit audited custom access profile for per-user checkboxes', async () => {
    process.env.DEV_AUTH_USER_EMAIL = 'admin@galaxy.local';
    const permission = await prisma.permission.findUniqueOrThrow({
      where: { code: 'department.read' },
    });
    const created = await request(app.getHttpServer())
      .put(`/api/v1/users/${createdUserId}/access-profile`)
      .set('x-galaxy-dev-auth', 'admin@galaxy.local')
      .send({
        name: 'Created user access profile',
        maximumScope: 'SELF',
        permissionIds: [permission.id],
      })
      .expect(200);
    accessProfileRoleId = created.body.roleId;
    expect(
      await prisma.userRole.count({
        where: {
          userId: createdUserId,
          roleId: accessProfileRoleId,
          scopeType: 'SELF',
        },
      }),
    ).toBe(1);
    await request(app.getHttpServer())
      .put(`/api/v1/users/${createdUserId}/access-profile`)
      .set('x-galaxy-dev-auth', 'admin@galaxy.local')
      .send({
        name: 'Created user access profile',
        maximumScope: 'SELF',
        permissionIds: [],
      })
      .expect(200);
    expect(
      (
        await prisma.role.findUniqueOrThrow({
          where: { id: accessProfileRoleId },
        })
      ).status,
    ).toBe('archived');
    expect(
      await prisma.auditLog.count({
        where: {
          entityId: createdUserId,
          action: 'user.access-profile.update',
        },
      }),
    ).toBeGreaterThanOrEqual(2);
  });
});
