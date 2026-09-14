import { INestApplication, ValidationPipe } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Test } from '@nestjs/testing';
import request, { Test as SuperTest } from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { ProjectsService } from '../src/projects/projects.service';
import { assertG00Isolation } from '../scripts/g00-isolated-environment.mjs';

assertG00Isolation();

describe.sequential(
  'Project generic stage access PostgreSQL integration',
  () => {
    const prisma = new PrismaClient();
    const run = Date.now();
    const email = `project-stage-access-${run}@example.test`;
    const inactiveEmail = `project-stage-inactive-${run}@example.test`;
    let app: INestApplication;
    let organizationId: string;
    let actorId: string;
    let inactiveOwnerId: string;
    let roleId: string;
    let customerId: string;
    let projectId: string;

    const api = () => request(app.getHttpServer());
    const authenticated = (test: SuperTest) =>
      test.set('x-galaxy-dev-auth', email);

    beforeAll(async () => {
      vi.stubEnv('ALLOW_DEV_AUTH', 'true');
      vi.stubEnv('NODE_ENV', 'test');
      vi.stubEnv('DEV_AUTH_USER_EMAIL', email);
      const organization = await prisma.organization.findUniqueOrThrow({
        where: { slug: 'galaxy-centre' },
      });
      organizationId = organization.id;
      const admin = await prisma.user.findUniqueOrThrow({
        where: { email: 'admin@galaxy.local' },
      });
      const [actor, inactiveOwner] = await Promise.all([
        prisma.user.create({
          data: {
            email,
            normalizedEmail: email,
            displayName: 'Project stage integration actor',
            status: 'active',
          },
        }),
        prisma.user.create({
          data: {
            email: inactiveEmail,
            normalizedEmail: inactiveEmail,
            displayName: 'Inactive Project owner',
            status: 'active',
          },
        }),
      ]);
      actorId = actor.id;
      inactiveOwnerId = inactiveOwner.id;
      await prisma.organizationMembership.create({
        data: { organizationId, userId: actorId, status: 'active' },
      });
      const role = await prisma.role.create({
        data: {
          organizationId,
          code: `project_stage_access_${run}`,
          name: `Project stage access ${run}`,
          maximumScope: 'SELF',
        },
      });
      roleId = role.id;
      const permissions = await prisma.permission.findMany({
        where: {
          code: {
            in: ['project.read', 'project.update', 'project.stage.bypass'],
          },
        },
        select: { id: true },
      });
      expect(permissions).toHaveLength(3);
      await prisma.rolePermission.createMany({
        data: permissions.map(({ id: permissionId }) => ({
          roleId,
          permissionId,
        })),
      });
      await prisma.userRole.create({
        data: {
          organizationId,
          userId: actorId,
          roleId,
          scopeType: 'SELF',
        },
      });
      const customer = await prisma.customer.create({
        data: {
          organizationId,
          type: 'COMPANY',
          displayName: `Project stage access ${run}`,
          createdBy: admin.id,
          updatedBy: admin.id,
        },
      });
      customerId = customer.id;
      const project = await prisma.project.create({
        data: {
          organizationId,
          code: `PSA-${run}`,
          name: `Project stage access ${run}`,
          customerId,
          projectType: 'DESIGN_ONLY',
          projectManagerId: actorId,
          createdBy: admin.id,
          updatedBy: admin.id,
        },
      });
      projectId = project.id;
      await prisma.projectMember.create({
        data: {
          organizationId,
          projectId,
          userId: actorId,
          role: 'PROJECT_MANAGER',
          createdBy: admin.id,
        },
      });
      await prisma.projectStageState.createMany({
        data: [
          {
            projectId,
            stage: 'STAGE_ONE',
            status: 'NOT_APPLICABLE',
            decisionReason: 'Integration terminal guard',
            decisionBy: actorId,
            decisionAt: new Date(),
          },
          { projectId, stage: 'STAGE_TWO', status: 'NOT_INITIALIZED' },
          { projectId, stage: 'STAGE_FOUR', status: 'NOT_INITIALIZED' },
        ],
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
      await app?.close();
      if (projectId) {
        await prisma.activity.deleteMany({
          where: { entityType: 'Project', entityId: projectId },
        });
        await prisma.projectRequiredDocument.deleteMany({
          where: { projectId },
        });
        await prisma.projectStageStep.deleteMany({ where: { projectId } });
        await prisma.projectStageState.deleteMany({ where: { projectId } });
        await prisma.projectStageOnePlan.deleteMany({ where: { projectId } });
        await prisma.projectMember.deleteMany({ where: { projectId } });
        await prisma.project.deleteMany({ where: { id: projectId } });
      }
      if (customerId)
        await prisma.customer.deleteMany({ where: { id: customerId } });
      if (actorId) {
        await prisma.userRole.deleteMany({ where: { userId: actorId } });
        await prisma.organizationMembership.deleteMany({
          where: { userId: actorId },
        });
      }
      if (roleId) {
        await prisma.rolePermission.deleteMany({ where: { roleId } });
        await prisma.role.deleteMany({ where: { id: roleId } });
      }
      await prisma.user.deleteMany({
        where: { id: { in: [actorId, inactiveOwnerId].filter(Boolean) } },
      });
      await prisma.$disconnect();
      vi.unstubAllEnvs();
    });

    it('keeps terminal Stage 1 inert and denies template-inapplicable Stage 4', async () => {
      await authenticated(
        api().post(`/api/v1/projects/${projectId}/stages/STAGE_1/initialize`),
      )
        .expect(201)
        .expect(({ body }) =>
          expect(body).toMatchObject({
            initialized: false,
            status: 'NOT_APPLICABLE',
          }),
        );
      expect(
        await prisma.projectStageStep.count({ where: { projectId } }),
      ).toBe(0);
      expect(
        await prisma.projectRequiredDocument.count({ where: { projectId } }),
      ).toBe(0);
      expect(
        await prisma.projectStageOnePlan.count({ where: { projectId } }),
      ).toBe(0);

      const stageFour = await authenticated(
        api().get(`/api/v1/projects/${projectId}/stages/STAGE_4`),
      ).expect(200);
      expect(stageFour.body).toMatchObject({
        state: { readOnly: true },
        templateApplicability: { applicable: false },
        permittedCommands: { initialize: false },
      });
      await authenticated(
        api().post(`/api/v1/projects/${projectId}/stages/STAGE_4/initialize`),
      )
        .expect(422)
        .expect(({ body }) =>
          expect(body).toMatchObject({ code: 'STAGE_NOT_APPLICABLE' }),
        );
      expect(
        await prisma.projectStageState.findUniqueOrThrow({
          where: { projectId_stage: { projectId, stage: 'STAGE_FOUR' } },
        }),
      ).toMatchObject({ status: 'NOT_INITIALIZED' });
    });

    it('blocks an inactive owner, then initializes Stage 2 once under concurrency', async () => {
      await prisma.project.update({
        where: { id: projectId },
        data: { projectOwnerId: inactiveOwnerId },
      });
      await authenticated(
        api().post(`/api/v1/projects/${projectId}/stages/STAGE_2/initialize`),
      )
        .expect(422)
        .expect(({ body }) =>
          expect(body).toMatchObject({ code: 'INACTIVE_PROJECT_OWNER' }),
        );
      expect(
        await prisma.projectStageState.findUniqueOrThrow({
          where: { projectId_stage: { projectId, stage: 'STAGE_TWO' } },
        }),
      ).toMatchObject({ status: 'NOT_INITIALIZED' });
      await prisma.project.update({
        where: { id: projectId },
        data: { projectOwnerId: null },
      });

      const results = await Promise.all(
        [1, 2].map(() =>
          authenticated(
            api().post(
              `/api/v1/projects/${projectId}/stages/STAGE_2/initialize`,
            ),
          ).expect(201),
        ),
      );
      expect(results.map(({ body }) => body.initialized).sort()).toEqual([
        false,
        true,
      ]);
      expect(
        await prisma.projectStageState.count({
          where: { projectId, stage: 'STAGE_TWO', status: 'IN_PROGRESS' },
        }),
      ).toBe(1);
      expect(
        await prisma.activity.count({
          where: {
            entityType: 'Project',
            entityId: projectId,
            event: 'PROJECT_STAGE_INITIALIZED',
          },
        }),
      ).toBe(1);
    });

    it('creates and retries a missing-stage decision without duplicates', async () => {
      const route = `/api/v1/projects/${projectId}/stages/STAGE_5/decision`;
      const payload = {
        decision: 'BYPASSED_WITH_APPROVAL',
        reason: 'Integration approved bypass',
      };
      await authenticated(api().post(route)).send(payload).expect(201);
      await authenticated(api().post(route)).send(payload).expect(201);
      expect(
        await prisma.projectStageState.count({
          where: {
            projectId,
            stage: 'STAGE_FIVE',
            status: 'BYPASSED_WITH_APPROVAL',
          },
        }),
      ).toBe(1);
      expect(
        await prisma.activity.count({
          where: {
            entityType: 'Project',
            entityId: projectId,
            event: 'PROJECT_STAGE_APPLICABILITY_DECIDED',
          },
        }),
      ).toBe(1);
    });

    it('lets only one concurrent different decision win a missing stage', async () => {
      const route = `/api/v1/projects/${projectId}/stages/STAGE_3/decision`;
      const activityWhere = {
        entityType: 'Project',
        entityId: projectId,
        event: 'PROJECT_STAGE_APPLICABILITY_DECIDED',
      };
      const activityBefore = await prisma.activity.count({
        where: activityWhere,
      });
      const service = app.get(ProjectsService) as unknown as {
        stageProject: (...args: unknown[]) => Promise<unknown>;
      };
      const stageProject = service.stageProject.bind(service);
      let arrivals = 0;
      let release!: () => void;
      const bothRead = new Promise<void>((resolve) => {
        release = resolve;
      });
      const stageProjectSpy = vi
        .spyOn(service, 'stageProject')
        .mockImplementation(async (...args) => {
          const project = await stageProject(...args);
          if (args[3] === 'STAGE_3') {
            arrivals += 1;
            if (arrivals === 2) release();
            await bothRead;
          }
          return project;
        });
      const responses = await Promise.all([
        authenticated(api().post(route)).send({
          decision: 'NOT_APPLICABLE',
          reason: 'Concurrent decision A',
        }),
        authenticated(api().post(route)).send({
          decision: 'BYPASSED_WITH_APPROVAL',
          reason: 'Concurrent decision B',
        }),
      ]).finally(() => stageProjectSpy.mockRestore());

      expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
      expect(
        await prisma.projectStageState.count({
          where: { projectId, stage: 'STAGE_THREE' },
        }),
      ).toBe(1);
      expect(
        await prisma.projectStageState.findUniqueOrThrow({
          where: { projectId_stage: { projectId, stage: 'STAGE_THREE' } },
        }),
      ).toMatchObject({
        status: expect.stringMatching(
          /^(NOT_APPLICABLE|BYPASSED_WITH_APPROVAL)$/,
        ),
      });
      expect(await prisma.activity.count({ where: activityWhere })).toBe(
        activityBefore + 1,
      );
    });
  },
);
