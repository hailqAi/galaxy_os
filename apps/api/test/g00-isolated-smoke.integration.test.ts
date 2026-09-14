import { INestApplication, ValidationPipe } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Test } from '@nestjs/testing';
import { hash } from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assertG00Isolation } from '../scripts/g00-isolated-environment.mjs';
import { AppModule } from '../src/app.module';

const isolated = assertG00Isolation();

describe.sequential('G00 isolated API/PostgreSQL smoke', () => {
  const prisma = new PrismaClient();
  const prefix = `g00-${isolated.runId}`;
  const password = 'g00-isolated-password';
  const slugs = [`${prefix}-a`, `${prefix}-b`];
  const emails = {
    scoped: `${prefix}-scoped@example.test`,
    finance: `${prefix}-finance@example.test`,
  };
  let app: INestApplication | undefined;
  let projectA = '';
  let projectA2 = '';
  let projectB = '';
  let databaseIdentityVerified = false;

  async function cleanup() {
    const organizations = await prisma.organization.findMany({
      where: { slug: { in: slugs } },
      select: { id: true },
    });
    const organizationIds = organizations.map(({ id }) => id);
    const users = await prisma.user.findMany({
      where: { normalizedEmail: { in: Object.values(emails) } },
      select: { id: true },
    });
    const userIds = users.map(({ id }) => id);
    const roles = await prisma.role.findMany({
      where: { organizationId: { in: organizationIds } },
      select: { id: true },
    });
    const roleIds = roles.map(({ id }) => id);

    await prisma.auditLog.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.projectMember.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await prisma.project.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await prisma.customer.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await prisma.userRole.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await prisma.rolePermission.deleteMany({
      where: { roleId: { in: roleIds } },
    });
    await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
    await prisma.organizationMembership.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await prisma.passwordCredential.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.organization.deleteMany({
      where: { id: { in: organizationIds } },
    });
  }

  async function login(email: string) {
    const response = await request(app!.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(201);
    const header = response.headers['set-cookie'];
    const cookie = Array.isArray(header) ? header[0] : header;
    if (!cookie) throw new Error('Login did not return a session cookie');
    return cookie.split(';', 1)[0]!;
  }

  beforeAll(async () => {
    const identity = await prisma.$queryRaw<
      Array<{ database: string; username: string }>
    >`SELECT current_database() AS database, current_user AS username`;
    expect(identity).toEqual([
      {
        database: isolated.databaseName,
        username: isolated.databaseUser,
      },
    ]);
    databaseIdentityVerified = true;
    await cleanup();

    const organizations = await Promise.all(
      slugs.map((slug, index) =>
        prisma.organization.create({
          data: {
            slug,
            name: `G00 synthetic tenant ${index + 1}`,
            timezone: 'Asia/Bangkok',
            defaultCurrency: 'VND',
          },
        }),
      ),
    );
    const organizationA = organizations[0]!;
    const organizationB = organizations[1]!;
    const passwordHash = await hash(password, 4);
    const users = await Promise.all(
      Object.entries(emails).map(([kind, email]) =>
        prisma.user.create({
          data: {
            email,
            normalizedEmail: email,
            displayName: `G00 ${kind}`,
            status: 'active',
            credential: {
              create: { passwordHash, mustChangePassword: false },
            },
            organizationMembers: {
              create: { organizationId: organizationA.id },
            },
          },
        }),
      ),
    );
    const scopedUser = users[0]!;
    const financeUser = users[1]!;
    const permissions = await Promise.all(
      ['project.read', 'estimate.read', 'contract.read'].map((code) =>
        prisma.permission.findUniqueOrThrow({ where: { code } }),
      ),
    );
    const projectRead = permissions[0]!;
    const estimateRead = permissions[1]!;
    const contractRead = permissions[2]!;
    const roles = await Promise.all([
      prisma.role.create({
        data: {
          organizationId: organizationA.id,
          code: `${prefix}-scoped`,
          name: 'G00 scoped reader',
          maximumScope: 'SELF',
          permissions: {
            create: { permissionId: projectRead.id },
          },
        },
      }),
      prisma.role.create({
        data: {
          organizationId: organizationA.id,
          code: `${prefix}-finance`,
          name: 'G00 finance reader',
          maximumScope: 'ORGANIZATION',
          permissions: {
            create: [projectRead, estimateRead, contractRead].map(({ id }) => ({
              permissionId: id,
            })),
          },
        },
      }),
    ]);
    const scopedRole = roles[0]!;
    const financeRole = roles[1]!;
    await prisma.userRole.createMany({
      data: [
        {
          organizationId: organizationA.id,
          userId: scopedUser.id,
          roleId: scopedRole.id,
          scopeType: 'SELF',
        },
        {
          organizationId: organizationA.id,
          userId: financeUser.id,
          roleId: financeRole.id,
          scopeType: 'ORGANIZATION',
        },
      ],
    });
    const customers = await Promise.all([
      prisma.customer.create({
        data: {
          organizationId: organizationA.id,
          type: 'INDIVIDUAL',
          displayName: 'G00 synthetic customer A',
          createdBy: financeUser.id,
          updatedBy: financeUser.id,
        },
      }),
      prisma.customer.create({
        data: {
          organizationId: organizationB.id,
          type: 'INDIVIDUAL',
          displayName: 'G00 synthetic customer B',
          createdBy: financeUser.id,
          updatedBy: financeUser.id,
        },
      }),
    ]);
    const customerA = customers[0]!;
    const customerB = customers[1]!;
    const projects = await Promise.all([
      prisma.project.create({
        data: {
          organizationId: organizationA.id,
          code: `${prefix}-A1`,
          name: 'G00 same-tenant project A1',
          customerId: customerA.id,
          estimatedValue: '120.50',
          contractedValue: '100.25',
          createdBy: financeUser.id,
          updatedBy: financeUser.id,
        },
      }),
      prisma.project.create({
        data: {
          organizationId: organizationA.id,
          code: `${prefix}-A2`,
          name: 'G00 same-tenant project A2',
          customerId: customerA.id,
          estimatedValue: '220.50',
          contractedValue: '200.25',
          createdBy: financeUser.id,
          updatedBy: financeUser.id,
        },
      }),
      prisma.project.create({
        data: {
          organizationId: organizationB.id,
          code: `${prefix}-B1`,
          name: 'G00 other-tenant project B1',
          customerId: customerB.id,
          estimatedValue: '320.50',
          contractedValue: '300.25',
          createdBy: financeUser.id,
          updatedBy: financeUser.id,
        },
      }),
    ]);
    const first = projects[0]!;
    const second = projects[1]!;
    const otherTenant = projects[2]!;
    projectA = first.id;
    projectA2 = second.id;
    projectB = otherTenant.id;
    await prisma.projectMember.create({
      data: {
        organizationId: organizationA.id,
        projectId: first.id,
        userId: scopedUser.id,
        role: 'G00_TEST_READER',
        createdBy: financeUser.id,
      },
    });
    expect(second.organizationId).toBe(organizationA.id);

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

  afterAll(async () => {
    try {
      if (app) await app.close();
    } finally {
      try {
        if (databaseIdentityVerified) await cleanup();
      } finally {
        await prisma.$disconnect();
      }
    }
  });

  it('uses real auth and existing SELF binding for one allowed Project', async () => {
    const cookie = await login(emails.scoped);
    const response = await request(app!.getHttpServer())
      .get(`/api/v1/projects/${projectA}`)
      .set('Cookie', cookie)
      .expect(200);
    expect(response.body.id).toBe(projectA);
    expect(response.body).not.toHaveProperty('estimatedValue');
    expect(response.body).not.toHaveProperty('contractedValue');
    await request(app!.getHttpServer())
      .get(`/api/v1/projects/${projectA2}`)
      .set('Cookie', cookie)
      .expect(404);
  });

  it('allows the organization finance binding to see both local Projects', async () => {
    const cookie = await login(emails.finance);
    for (const id of [projectA, projectA2]) {
      const response = await request(app!.getHttpServer())
        .get(`/api/v1/projects/${id}`)
        .set('Cookie', cookie)
        .expect(200);
      expect(response.body).toHaveProperty('estimatedValue');
      expect(response.body).toHaveProperty('contractedValue');
    }
  });

  it('does not expose the other tenant Project to the scoped reader', async () => {
    const cookie = await login(emails.scoped);
    await request(app!.getHttpServer())
      .get(`/api/v1/projects/${projectB}`)
      .set('Cookie', cookie)
      .expect(404);
  });
});
