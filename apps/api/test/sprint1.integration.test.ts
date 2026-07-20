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

process.env.DATABASE_URL ??=
  'postgresql://galaxy:galaxy_local@localhost:5432/galaxy_os?schema=public';

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
      await prisma.userRole.deleteMany({ where: { userId: createdUserId } });
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
    const restricted = await prisma.user.findUnique({
      where: { email: restrictedEmail },
    });
    if (restricted) {
      await prisma.userRole.deleteMany({ where: { userId: restricted.id } });
      const roles = await prisma.role.findMany({
        where: { organizationId, code: { startsWith: 'restricted_' } },
        select: { id: true },
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
    const me = await request(app.getHttpServer()).get('/api/v1/me').expect(200);
    expect(me.body.organizationId).toBe(organizationId);
    await request(app.getHttpServer()).get('/api/v1/organization').expect(200);
  });

  it('denies organization update and department creation without permission', async () => {
    process.env.DEV_AUTH_USER_EMAIL = restrictedEmail;
    await request(app.getHttpServer())
      .patch('/api/v1/organization')
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
    const me = await request(app.getHttpServer()).get('/api/v1/me').expect(200);
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
      .send({ code: 'REMOVED_PERMISSION', name: 'Blocked' })
      .expect(403);
  });

  it('rejects disabled users and disabled memberships', async () => {
    process.env.DEV_AUTH_USER_EMAIL = restrictedEmail;
    await prisma.user.update({
      where: { id: restrictedId },
      data: { status: 'disabled' },
    });
    await request(app.getHttpServer()).get('/api/v1/me').expect(401);
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
    await request(app.getHttpServer()).get('/api/v1/me').expect(401);
    process.env.DEV_AUTH_USER_EMAIL = 'admin@galaxy.local';
    const inactive = await request(app.getHttpServer())
      .get(`/api/v1/users/${restrictedId}`)
      .expect(200);
    expect(inactive.body.effectivePermissions).toEqual([]);
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
      .send({ code: `TEST_${Date.now()}`, name: 'Integration Test' })
      .expect(201);
    departmentId = created.body.id;
    const scoped = await request(app.getHttpServer())
      .post('/api/v1/departments')
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

  it('creates a user and assigns an organization role', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/users')
      .send({
        email: `api-${Date.now()}@galaxy.local`,
        displayName: 'API Test',
        status: 'active',
      })
      .expect(201);
    createdUserId = created.body.id;
    expect(created.body).not.toHaveProperty('externalAuthId');
    const role = await prisma.role.findFirstOrThrow({
      where: { organizationId, code: 'sales' },
    });
    await request(app.getHttpServer())
      .put(`/api/v1/users/${createdUserId}/roles`)
      .send({ roleIds: [role.id] })
      .expect(200);
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
      .send({ departments: [{ departmentId: department.id, isPrimary: true }] })
      .expect(200);
    await request(app.getHttpServer())
      .put(`/api/v1/users/${createdUserId}/departments`)
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
        displayName: 'Foreign',
        status: 'active',
      },
    });
    await prisma.organizationMembership.create({
      data: { organizationId: other.id, userId: foreignUser.id },
    });
    await request(app.getHttpServer())
      .get(`/api/v1/departments/${foreign.id}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/v1/users/${foreignUser.id}`)
      .expect(404);
    await request(app.getHttpServer())
      .put(`/api/v1/users/${createdUserId}/departments`)
      .send({ departments: [{ departmentId: foreign.id, isPrimary: false }] })
      .expect(400);
    await request(app.getHttpServer())
      .put(`/api/v1/users/${createdUserId}/roles`)
      .send({ roleIds: [foreignRole.id] })
      .expect(400);
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
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/v1/users/${adminId}`)
      .send({ status: 'invited' })
      .expect(400);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: adminId } })).status,
    ).toBe('active');
    const adminRole = await prisma.role.findFirstOrThrow({
      where: { organizationId, code: 'system_admin' },
    });
    await request(app.getHttpServer())
      .put(`/api/v1/users/${adminId}/roles`)
      .send({ roleIds: [] })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/v1/users/${adminId}/membership`)
      .send({ status: 'disabled' })
      .expect(403);
    expect(adminRole.status).toBe('active');
  });

  it('updates membership status with an audit record', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/users/${createdUserId}/membership`)
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
      .send({ status: 'active' })
      .expect(200);
  });

  it('lists audit logs with permission', () =>
    request(app.getHttpServer())
      .get('/api/v1/audit-logs?page=1&pageSize=20')
      .expect(200));
});
