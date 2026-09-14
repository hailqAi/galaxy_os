import { INestApplication, ValidationPipe } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Test } from '@nestjs/testing';
import request, { Test as SuperTest } from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { assertG00Isolation } from '../scripts/g00-isolated-environment.mjs';

assertG00Isolation();

describe.sequential('Project Product and required document integration', () => {
  const prisma = new PrismaClient();
  const run = Date.now();
  const approverEmail = `project-approver-${run}@example.test`;
  let app: INestApplication;
  let organizationId: string;
  let projectId: string;
  let adminId: string;
  let approverId: string;
  let requirementId: string;
  const fileIds: string[] = [];

  const api = () => request(app.getHttpServer());
  const authenticated = (test: SuperTest) =>
    test.set('x-galaxy-dev-auth', process.env.DEV_AUTH_USER_EMAIL!);

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
    const project = await prisma.project.findFirstOrThrow({
      where: { organizationId, deletedAt: null },
    });
    projectId = project.id;
    const approver = await prisma.user.create({
      data: {
        email: approverEmail,
        normalizedEmail: approverEmail,
        displayName: 'Project document approver',
        status: 'active',
      },
    });
    approverId = approver.id;
    await prisma.organizationMembership.create({
      data: { organizationId, userId: approverId },
    });
    const systemRole = await prisma.role.findFirstOrThrow({
      where: { organizationId, category: 'SYSTEM', status: 'active' },
    });
    await prisma.userRole.create({
      data: {
        organizationId,
        userId: approverId,
        roleId: systemRole.id,
        scopeType: 'ORGANIZATION',
      },
    });
    await prisma.projectMember.upsert({
      where: { projectId_userId: { projectId, userId: approverId } },
      create: {
        organizationId,
        projectId,
        userId: approverId,
        createdBy: adminId,
      },
      update: {},
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

  afterAll(async () => {
    if (requirementId) {
      await prisma.notification.deleteMany({
        where: { entityId: requirementId },
      });
      await prisma.activity.deleteMany({
        where: {
          entityType: 'ProjectRequiredDocument',
          entityId: requirementId,
        },
      });
      await prisma.auditLog.deleteMany({
        where: {
          entityType: 'ProjectRequiredDocument',
          entityId: requirementId,
        },
      });
      await prisma.projectRequiredDocumentVersion.deleteMany({
        where: { requirementId },
      });
      await prisma.entityAttachment.deleteMany({
        where: { entityId: requirementId },
      });
      await prisma.projectRequiredDocument.deleteMany({
        where: { id: requirementId },
      });
    }
    await prisma.fileAsset.deleteMany({ where: { id: { in: fileIds } } });
    if (approverId) {
      await prisma.projectMember.deleteMany({
        where: { projectId, userId: approverId },
      });
      await prisma.userRole.deleteMany({ where: { userId: approverId } });
      await prisma.organizationMembership.deleteMany({
        where: { userId: approverId },
      });
      await prisma.user.deleteMany({ where: { id: approverId } });
    }
    await app.close();
    await prisma.$disconnect();
    vi.unstubAllEnvs();
  });

  it('runs document create, replace, review, notification, and history on PostgreSQL', async () => {
    const created = await authenticated(
      api().post(`/api/v1/projects/${projectId}/required-documents`),
    )
      .send({
        stageKey: 'STAGE_2',
        workstreamKey: 'PRODUCT',
        documentType: `TEST_${run}`,
        documentName: `Browser acceptance ${run}`,
        ownerUserId: approverId,
      })
      .expect(201);
    requirementId = created.body.id;
    expect(created.body.required).toBe(false);

    for (const version of [1, 2]) {
      const file = await prisma.fileAsset.create({
        data: {
          organizationId,
          originalFilename: `document-v${version}.txt`,
          storedFilename: `document-v${version}-${run}.txt`,
          mimeType: 'text/plain',
          sizeBytes: version,
          storageKey: `integration/${run}/${version}`,
          checksum: String(version).repeat(64),
          category: 'PROJECT_DOCUMENT',
          uploadedById: adminId,
        },
      });
      fileIds.push(file.id);
      await prisma.entityAttachment.create({
        data: {
          fileAssetId: file.id,
          entityType: 'ProjectRequiredDocument',
          entityId: requirementId,
          projectId,
          createdBy: adminId,
        },
      });
      await authenticated(
        api().post(
          `/api/v1/projects/${projectId}/required-documents/${requirementId}/file`,
        ),
      )
        .send({ fileAssetId: file.id })
        .expect(201);
      if (version === 1) {
        await authenticated(
          api().post(
            `/api/v1/projects/${projectId}/required-documents/${requirementId}/file`,
          ),
        )
          .send({ fileAssetId: file.id })
          .expect(201);
        expect(
          await prisma.projectRequiredDocument.findUniqueOrThrow({
            where: { id: requirementId },
            select: { currentVersion: true },
          }),
        ).toEqual({ currentVersion: 1 });
        expect(
          await prisma.projectRequiredDocumentVersion.count({
            where: { requirementId },
          }),
        ).toBe(1);
        expect(
          await prisma.activity.count({
            where: {
              entityType: 'ProjectRequiredDocument',
              entityId: requirementId,
              event: 'PROJECT_DOCUMENT_FILE_LINKED',
            },
          }),
        ).toBe(1);
        expect(
          await prisma.auditLog.count({
            where: {
              entityType: 'ProjectRequiredDocument',
              entityId: requirementId,
              action: 'PROJECT_DOCUMENT_FILE_LINKED',
            },
          }),
        ).toBe(1);
      }
    }

    await authenticated(
      api().post(
        `/api/v1/projects/${projectId}/required-documents/${requirementId}/submit`,
      ),
    ).expect(201);
    expect(
      await prisma.notification.count({
        where: {
          entityId: requirementId,
          recipientId: approverId,
          href: `/projects/${projectId}/documents/${requirementId}`,
        },
      }),
    ).toBe(1);

    process.env.DEV_AUTH_USER_EMAIL = approverEmail;
    await authenticated(
      api().post(
        `/api/v1/projects/${projectId}/required-documents/${requirementId}/decision`,
      ),
    )
      .send({ decision: 'APPROVED' })
      .expect(201);

    const history = await authenticated(
      api().get(
        `/api/v1/projects/${projectId}/required-documents/${requirementId}/history`,
      ),
    ).expect(200);
    expect(history.body.current).toMatchObject({
      status: 'APPROVED',
      version: 2,
      downloadId: fileIds[1],
      filename: 'document-v2.txt',
    });
    expect(history.body.versions).toEqual([
      expect.objectContaining({
        version: 1,
        downloadId: fileIds[0],
        filename: 'document-v1.txt',
      }),
    ]);
  });
});
