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
    await request(app.getHttpServer())
      .post('/api/v1/departments')
      .send({ code: 'BLOCKED', name: 'Blocked' })
      .expect(403);
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
    const role = await prisma.role.findFirstOrThrow({
      where: { organizationId, code: 'sales' },
    });
    await request(app.getHttpServer())
      .put(`/api/v1/users/${createdUserId}/roles`)
      .send({ roleIds: [role.id] })
      .expect(200);
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
    await request(app.getHttpServer())
      .get(`/api/v1/departments/${foreign.id}`)
      .expect(404);
    await prisma.department.delete({ where: { id: foreign.id } });
    await prisma.organization.delete({ where: { id: other.id } });
    await request(app.getHttpServer())
      .post(`/api/v1/users/${adminId}/disable`)
      .expect(403);
  });

  it('lists audit logs with permission', () =>
    request(app.getHttpServer())
      .get('/api/v1/audit-logs?page=1&pageSize=20')
      .expect(200));
});
