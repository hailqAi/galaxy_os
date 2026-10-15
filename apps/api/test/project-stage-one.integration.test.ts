import { INestApplication, ValidationPipe } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Test } from '@nestjs/testing';
import request, { Test as SuperTest } from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { SIMPLE_STAGE_ONE_STEPS } from '../src/projects/project-stage-one.rules';
import { assertG00Isolation } from '../scripts/g00-isolated-environment.mjs';

const initialDocumentMatrix = [
  ['Văn bản chủ trương / Quyết định giao nhiệm vụ', 'ASSIGNMENT'],
  ['Báo cáo khảo sát & Phương án nhân sự', 'SURVEY'],
  ['Hồ sơ Báo cáo Kinh tế - Kỹ thuật', 'PROPOSAL'],
  ['Văn bản xác nhận / Cân đối nguồn vốn', 'FINANCIAL_PLANNING'],
  ['Quyết định phê duyệt Báo cáo Kinh tế - Kỹ thuật', 'KICKOFF_APPROVAL'],
] as const;

assertG00Isolation();

describe.sequential('Project Stage 1 PostgreSQL integration', () => {
  const prisma = new PrismaClient();
  const run = Date.now();
  const limitedEmail = `stage-one-limited-${run}@example.test`;
  const outsiderEmail = `stage-one-outsider-${run}@example.test`;
  const reviewerEmail = `stage-one-reviewer-${run}@example.test`;
  const editorEmail = `stage-one-editor-${run}@example.test`;
  let app: INestApplication;
  let organizationId: string;
  let adminId: string;
  let projectId: string;
  let customerId: string;
  let simpleProjectId: string;
  let simpleCustomerId: string;
  let simpleContactId: string;
  let mismatchedCustomerId: string;
  let mismatchedContactId: string;
  let limitedId: string;
  let outsiderId: string;
  let reviewerId: string;
  let editorId: string;
  let limitedRoleId: string;
  let editorRoleId: string;
  let approvalId: string;
  let fileAssetId: string;
  let simpleFileAssetIds: string[] = [];

  const api = () => request(app.getHttpServer());
  const authenticated = (test: SuperTest, email: string) => {
    process.env.DEV_AUTH_USER_EMAIL = email;
    return test.set('x-galaxy-dev-auth', email);
  };

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
    const createUser = (email: string) =>
      prisma.user.create({
        data: {
          email,
          normalizedEmail: email,
          displayName: `Stage 1 ${email.split('@')[0]}`,
          status: 'active',
        },
      });
    const [limited, outsider, reviewer, editor] = await Promise.all([
      createUser(limitedEmail),
      createUser(outsiderEmail),
      createUser(reviewerEmail),
      createUser(editorEmail),
    ]);
    limitedId = limited.id;
    outsiderId = outsider.id;
    reviewerId = reviewer.id;
    editorId = editor.id;
    await prisma.organizationMembership.createMany({
      data: [limitedId, outsiderId, reviewerId, editorId].map((userId) => ({
        organizationId,
        userId,
        status: 'active',
      })),
    });
    const projectRead = await prisma.permission.findUniqueOrThrow({
      where: { code: 'project.read' },
    });
    const editorPermissions = await prisma.permission.findMany({
      where: {
        code: { in: ['project.update', 'estimate.read', 'estimate.update'] },
      },
      select: { id: true },
    });
    expect(editorPermissions).toHaveLength(3);
    const systemRole = await prisma.role.findFirstOrThrow({
      where: { organizationId, category: 'SYSTEM', status: 'active' },
      orderBy: { administrationTier: 'desc' },
    });
    const limitedRole = await prisma.role.create({
      data: {
        organizationId,
        code: `stage_one_read_${run}`,
        name: `Stage 1 read ${run}`,
        maximumScope: 'SELF',
      },
    });
    limitedRoleId = limitedRole.id;
    const editorRole = await prisma.role.create({
      data: {
        organizationId,
        code: `stage_one_editor_${run}`,
        name: `Stage 1 editor ${run}`,
        maximumScope: 'SELF',
      },
    });
    editorRoleId = editorRole.id;
    await prisma.rolePermission.create({
      data: { roleId: limitedRoleId, permissionId: projectRead.id },
    });
    await prisma.rolePermission.createMany({
      data: editorPermissions.map(({ id }) => ({
        roleId: editorRoleId,
        permissionId: id,
      })),
    });
    await prisma.userRole.createMany({
      data: [
        {
          organizationId,
          userId: editorId,
          roleId: editorRoleId,
          scopeType: 'SELF',
        },
        {
          organizationId,
          userId: limitedId,
          roleId: limitedRoleId,
          scopeType: 'SELF',
        },
        {
          organizationId,
          userId: outsiderId,
          roleId: limitedRoleId,
          scopeType: 'SELF',
        },
        {
          organizationId,
          userId: reviewerId,
          roleId: systemRole.id,
          scopeType: 'SYSTEM',
        },
      ],
    });
    expect(
      await prisma.user.count({
        where: {
          id: { in: [limitedId, outsiderId, reviewerId, editorId] },
          status: 'active',
          organizationMembers: {
            some: { organizationId, status: 'active' },
          },
          roles: { some: { organizationId, status: 'active' } },
        },
      }),
    ).toBe(4);
    expect(limitedRole).toMatchObject({ organizationId, status: 'active' });
    expect(systemRole).toMatchObject({ organizationId, status: 'active' });
    const customer = await prisma.customer.create({
      data: {
        organizationId,
        type: 'COMPANY',
        displayName: `Stage 1 customer ${run}`,
        createdBy: adminId,
        updatedBy: adminId,
      },
    });
    customerId = customer.id;
    const project = await prisma.project.create({
      data: {
        organizationId,
        code: `STAGE18-${run}`,
        name: `Stage 1 integration ${run}`,
        customerId,
        projectType: 'DESIGN_AND_BUILD',
        projectManagerId: adminId,
        description: 'Isolated Stage 1 scope.',
        createdBy: adminId,
        updatedBy: adminId,
      },
    });
    projectId = project.id;
    const simpleCustomer = await prisma.customer.create({
      data: {
        organizationId,
        type: 'COMPANY',
        displayName: `Simple Stage 1 customer ${run}`,
        createdBy: adminId,
        updatedBy: adminId,
      },
    });
    simpleCustomerId = simpleCustomer.id;
    const simpleContact = await prisma.contact.create({
      data: {
        organizationId,
        customerId: simpleCustomerId,
        firstName: 'Simple',
        displayName: 'Simple representative',
        createdBy: adminId,
        updatedBy: adminId,
      },
    });
    simpleContactId = simpleContact.id;
    const mismatchedCustomer = await prisma.customer.create({
      data: {
        organizationId,
        type: 'COMPANY',
        displayName: `Mismatched Stage 1 customer ${run}`,
        createdBy: adminId,
        updatedBy: adminId,
      },
    });
    mismatchedCustomerId = mismatchedCustomer.id;
    const mismatchedContact = await prisma.contact.create({
      data: {
        organizationId,
        customerId: mismatchedCustomerId,
        firstName: 'Mismatched',
        displayName: 'Mismatched representative',
        createdBy: adminId,
        updatedBy: adminId,
      },
    });
    mismatchedContactId = mismatchedContact.id;
    const simpleProject = await prisma.project.create({
      data: {
        organizationId,
        code: `SIMPLE-STAGE1-${run}`,
        name: `Simple Stage 1 integration ${run}`,
        currency: 'USD',
        customerId: simpleCustomerId,
        createdBy: adminId,
        updatedBy: adminId,
      },
    });
    simpleProjectId = simpleProject.id;
    await prisma.projectStageState.create({
      data: {
        projectId: simpleProjectId,
        stage: 'STAGE_ONE',
        status: 'NOT_INITIALIZED',
      },
    });
    await prisma.projectRequiredDocument.create({
      data: {
        organizationId,
        projectId: simpleProjectId,
        stageKey: 'STAGE_1',
        workstreamKey: 'KEY_DOSSIER',
        documentType: initialDocumentMatrix[0][0],
        documentName: initialDocumentMatrix[0][0],
        ownerRole: 'PROJECT_MANAGER',
        status: 'MISSING',
        required: false,
        initialMatrix: true,
        supersededAt: new Date(),
        supersededBy: adminId,
      },
    });
    await prisma.projectMember.createMany({
      data: [adminId, limitedId, reviewerId].map((userId) => ({
        organizationId,
        projectId,
        userId,
        role: userId === adminId ? 'PROJECT_MANAGER' : 'OBSERVER',
        createdBy: adminId,
      })),
    });
    await prisma.projectMember.createMany({
      data: [adminId, reviewerId, editorId].map((userId) => ({
        organizationId,
        projectId: simpleProjectId,
        userId,
        role: userId === adminId ? 'PROJECT_MANAGER' : 'OBSERVER',
        createdBy: adminId,
      })),
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
    if (simpleProjectId) {
      await prisma.notification.deleteMany({
        where: { projectId: simpleProjectId },
      });
      await prisma.activity.deleteMany({
        where: {
          OR: [
            { entityType: 'Project', entityId: simpleProjectId },
            { metadata: { path: ['projectId'], equals: simpleProjectId } },
          ],
        },
      });
      await prisma.auditLog.deleteMany({
        where: { entityType: 'Project', entityId: simpleProjectId },
      });
      await prisma.projectStageApproval.deleteMany({
        where: { projectId: simpleProjectId },
      });
      await prisma.projectStageOneDocumentVersion.deleteMany({
        where: { document: { projectId: simpleProjectId } },
      });
      await prisma.projectStageOneDocument.deleteMany({
        where: { projectId: simpleProjectId },
      });
      await prisma.projectRequiredDocumentVersion.deleteMany({
        where: { requirement: { projectId: simpleProjectId } },
      });
      await prisma.projectRequiredDocument.deleteMany({
        where: { projectId: simpleProjectId },
      });
      await prisma.projectStageStep.deleteMany({
        where: { projectId: simpleProjectId },
      });
      await prisma.projectStageState.deleteMany({
        where: { projectId: simpleProjectId },
      });
      await prisma.projectStageOnePlan.deleteMany({
        where: { projectId: simpleProjectId },
      });
      await prisma.entityAttachment.deleteMany({
        where: { projectId: simpleProjectId },
      });
      await prisma.projectMember.deleteMany({
        where: { projectId: simpleProjectId },
      });
      await prisma.project.deleteMany({ where: { id: simpleProjectId } });
      if (simpleFileAssetIds.length)
        await prisma.fileAsset.deleteMany({
          where: { id: { in: simpleFileAssetIds } },
        });
    }
    if (projectId) {
      await prisma.notification.deleteMany({ where: { projectId } });
      await prisma.activity.deleteMany({
        where: {
          OR: [
            { entityType: 'Project', entityId: projectId },
            ...(approvalId
              ? [{ entityType: 'ProjectStageApproval', entityId: approvalId }]
              : []),
          ],
        },
      });
      await prisma.auditLog.deleteMany({
        where: { entityType: 'Project', entityId: projectId },
      });
      await prisma.projectStageApproval.deleteMany({ where: { projectId } });
      await prisma.projectRequiredDocumentVersion.deleteMany({
        where: { requirement: { projectId } },
      });
      await prisma.projectRequiredDocument.deleteMany({ where: { projectId } });
      if (fileAssetId)
        await prisma.fileAsset.deleteMany({ where: { id: fileAssetId } });
      await prisma.survey.deleteMany({ where: { projectId } });
      await prisma.projectStageStep.deleteMany({ where: { projectId } });
      await prisma.projectStageState.deleteMany({ where: { projectId } });
      await prisma.projectStageOnePlan.deleteMany({ where: { projectId } });
      await prisma.projectMember.deleteMany({ where: { projectId } });
      await prisma.project.deleteMany({ where: { id: projectId } });
    }
    const contactIds = [simpleContactId, mismatchedContactId].filter(Boolean);
    if (contactIds.length)
      await prisma.contact.deleteMany({ where: { id: { in: contactIds } } });
    const customerIds = [
      customerId,
      simpleCustomerId,
      mismatchedCustomerId,
    ].filter(Boolean);
    if (customerIds.length)
      await prisma.customer.deleteMany({ where: { id: { in: customerIds } } });
    const userIds = [limitedId, outsiderId, reviewerId, editorId].filter(
      Boolean,
    );
    if (userIds.length) {
      await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.organizationMembership.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    if (limitedRoleId) {
      await prisma.rolePermission.deleteMany({
        where: { roleId: limitedRoleId },
      });
      await prisma.role.deleteMany({ where: { id: limitedRoleId } });
    }
    if (editorRoleId) {
      await prisma.rolePermission.deleteMany({
        where: { roleId: editorRoleId },
      });
      await prisma.role.deleteMany({ where: { id: editorRoleId } });
    }
    await prisma.$disconnect();
    vi.unstubAllEnvs();
  });

  it('runs the scoped simplified initiation and five-step completion idempotently', async () => {
    const projectCount = await prisma.project.count({
      where: { id: simpleProjectId },
    });
    const payload = {
      name: `Simple investment ${run}`,
      estimatedInvestmentAmount: '123456789012345678.90',
      fundingSource: 'PPP',
      customerId: simpleCustomerId,
      primaryContactId: simpleContactId,
      idempotencyKey: `simple-initiate-${run}`,
    };

    await authenticated(
      api().post(`/api/v1/projects/${simpleProjectId}/stage-1/initiate-simple`),
      editorEmail,
    )
      .send({ ...payload, primaryContactId: mismatchedContactId })
      .expect(404);
    expect(
      await prisma.project.findUniqueOrThrow({
        where: { id: simpleProjectId },
        select: { name: true },
      }),
    ).not.toEqual({ name: payload.name });

    await prisma.projectRequiredDocument.updateMany({
      where: {
        projectId: simpleProjectId,
        stageKey: 'STAGE_1',
        documentName: initialDocumentMatrix[0][0],
      },
      data: { status: 'SUPERSEDED' },
    });
    await authenticated(
      api().post(`/api/v1/projects/${simpleProjectId}/stage-1/initiate-simple`),
      'admin@galaxy.local',
    )
      .send(payload)
      .expect(409);
    expect(
      await prisma.projectStageState.findUniqueOrThrow({
        where: {
          projectId_stage: { projectId: simpleProjectId, stage: 'STAGE_ONE' },
        },
        select: { documentDefinitionsInitializedAt: true },
      }),
    ).toEqual({ documentDefinitionsInitializedAt: null });
    await prisma.projectRequiredDocument.updateMany({
      where: {
        projectId: simpleProjectId,
        stageKey: 'STAGE_1',
        documentName: initialDocumentMatrix[0][0],
      },
      data: {
        status: 'MISSING',
        supersededAt: null,
        supersededBy: null,
      },
    });

    const initiated = await authenticated(
      api().post(`/api/v1/projects/${simpleProjectId}/stage-1/initiate-simple`),
      'admin@galaxy.local',
    )
      .send(payload)
      .expect(201);
    expect(initiated.body.initiation).toEqual({
      name: payload.name,
      estimatedInvestmentAmount: payload.estimatedInvestmentAmount,
      fundingSource: payload.fundingSource,
      customerId: simpleCustomerId,
      primaryContactId: simpleContactId,
    });
    expect(initiated.body.approval).toMatchObject({
      status: 'PENDING',
      decision: null,
    });
    expect(initiated.body.steps).toHaveLength(5);
    expect(initiated.body.keyDossier.attachments).toEqual([]);
    expect(initiated.body.workflow.documents).toEqual([]);
    expect(initiated.body.keyDossier.items).toEqual(
      expect.arrayContaining(
        initialDocumentMatrix.map(([name], position) =>
          expect.objectContaining({
            name,
            workstreamKey: 'KEY_DOSSIER',
            position,
            initialMatrix: true,
            active: true,
            files: [],
          }),
        ),
      ),
    );
    expect(
      initiated.body.keyDossier.items.filter(
        ({
          initialMatrix,
          active,
        }: {
          initialMatrix: boolean;
          active: boolean;
        }) => initialMatrix && active,
      ),
    ).toHaveLength(5);
    const workflowDefinitions = initiated.body.workflow.definitions;
    expect(workflowDefinitions).toHaveLength(
      SIMPLE_STAGE_ONE_STEPS.flatMap(({ documents }) => documents).length,
    );
    expect(
      workflowDefinitions.map(
        ({ name, workstreamKey, position }: Record<string, unknown>) => ({
          name,
          workstreamKey,
          position,
        }),
      ),
    ).toEqual(
      expect.arrayContaining(
        SIMPLE_STAGE_ONE_STEPS.flatMap(({ step, documents }) =>
          documents.map((name, position) => ({
            name,
            workstreamKey: step,
            position,
          })),
        ),
      ),
    );
    expect(initiated.body.permittedCommands).toEqual({
      manageDocumentDefinitions: true,
    });
    expect(
      await prisma.projectStageState.findUniqueOrThrow({
        where: {
          projectId_stage: { projectId: simpleProjectId, stage: 'STAGE_ONE' },
        },
        select: { status: true, documentDefinitionsInitializedAt: true },
      }),
    ).toEqual({
      status: 'TODO',
      documentDefinitionsInitializedAt: expect.any(Date),
    });

    const retried = await authenticated(
      api().post(`/api/v1/projects/${simpleProjectId}/stage-1/initiate-simple`),
      'admin@galaxy.local',
    )
      .send(payload)
      .expect(201);
    expect(retried.body).toEqual(initiated.body);
    expect(await prisma.project.count({ where: { id: simpleProjectId } })).toBe(
      projectCount,
    );
    expect(
      await prisma.projectStageStep.count({
        where: { projectId: simpleProjectId, stage: 'STAGE_ONE' },
      }),
    ).toBe(5);
    expect(
      await prisma.projectRequiredDocument.count({
        where: {
          projectId: simpleProjectId,
          stageKey: 'STAGE_1',
          initialMatrix: true,
          supersededAt: null,
        },
      }),
    ).toBe(5);
    expect(
      await prisma.projectRequiredDocument.count({
        where: {
          projectId: simpleProjectId,
          stageKey: 'STAGE_1',
          required: true,
        },
      }),
    ).toBe(0);
    expect(
      await prisma.projectRequiredDocument.count({
        where: {
          projectId: simpleProjectId,
          stageKey: 'STAGE_1',
          initialMatrix: true,
          supersededAt: null,
        },
      }),
    ).toBe(5);
    expect(
      await prisma.activity.count({
        where: {
          entityType: 'Project',
          entityId: simpleProjectId,
          event: 'PROJECT_STAGE_ONE_SIMPLE_INITIATED',
        },
      }),
    ).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: {
          entityType: 'Project',
          entityId: simpleProjectId,
          action: 'PROJECT_STAGE_ONE_SIMPLE_INITIATED',
        },
      }),
    ).toBe(1);
    expect(
      await prisma.activity.count({
        where: {
          entityType: 'Project',
          entityId: simpleProjectId,
          event: 'PROJECT_STAGE_ONE_DOCUMENT_DEFINITIONS_INITIALIZED',
        },
      }),
    ).toBe(1);
    const definitionInitializationAudit =
      await prisma.auditLog.findFirstOrThrow({
        where: {
          entityType: 'Project',
          entityId: simpleProjectId,
          action: 'PROJECT_STAGE_ONE_DOCUMENT_DEFINITIONS_INITIALIZED',
        },
        select: { afterData: true, metadata: true },
      });
    expect(JSON.stringify(definitionInitializationAudit)).not.toMatch(
      /filename|storageKey|preliminary|estimatedInvestmentAmount/i,
    );

    const stored = await prisma.project.findUniqueOrThrow({
      where: { id: simpleProjectId },
      select: {
        name: true,
        estimatedValue: true,
        currency: true,
        customerId: true,
        primaryContactId: true,
      },
    });
    expect(stored).toMatchObject({
      name: payload.name,
      customerId: simpleCustomerId,
      primaryContactId: simpleContactId,
      currency: 'USD',
    });
    expect(stored.estimatedValue?.toFixed(2)).toBe(
      payload.estimatedInvestmentAmount,
    );

    const simple = await authenticated(
      api().get(`/api/v1/projects/${simpleProjectId}/stage-1/simple`),
      'admin@galaxy.local',
    ).expect(200);
    expect(simple.body.options.projects).toContainEqual(
      expect.objectContaining({ id: simpleProjectId }),
    );
    expect(simple.body.options.members).toContainEqual(
      expect.objectContaining({ id: reviewerId }),
    );
    expect(
      simple.body.steps.map(
        ({ step, documentTypes }: Record<string, unknown>) => ({
          step,
          names: (documentTypes as { name: string }[]).map(({ name }) => name),
        }),
      ),
    ).toEqual(
      SIMPLE_STAGE_ONE_STEPS.map(({ step, documents }) => ({
        step,
        names: [...documents],
      })),
    );
    const responseKeys = (value: unknown): string[] =>
      value && typeof value === 'object'
        ? Object.entries(value).flatMap(([key, child]) => [
            key,
            ...responseKeys(child),
          ])
        : [];
    expect(responseKeys(simple.body)).not.toEqual(
      expect.arrayContaining([
        'projectType',
        'governance',
        'responsibilityNotes',
        'preliminaryRevenue',
        'readiness',
        'redFlags',
        'surveys',
        'proposalBaseline',
      ]),
    );
    await authenticated(
      api().get(`/api/v1/projects/${simpleProjectId}/stage-1/simple`),
      outsiderEmail,
    ).expect(404);

    await prisma.projectRequiredDocument.updateMany({
      where: {
        projectId: simpleProjectId,
        stageKey: 'STAGE_1',
        documentType: {
          in: initialDocumentMatrix.map(([name]) => name),
        },
      },
      data: { required: true },
    });

    const completedWithoutFiles = await authenticated(
      api().post(
        `/api/v1/projects/${simpleProjectId}/stage-1/steps/ASSIGNMENT/complete`,
      ),
      'admin@galaxy.local',
    )
      .send({})
      .expect(201);
    expect(completedWithoutFiles.body).toEqual({
      completed: true,
      nextStep: 2,
      stageCompleted: false,
    });

    const simpleRequirements = await prisma.projectRequiredDocument.findMany({
      where: {
        projectId: simpleProjectId,
        stageKey: 'STAGE_1',
        documentType: {
          in: initialDocumentMatrix.map(([name]) => name),
        },
      },
      select: { id: true },
    });
    const simpleFiles = await Promise.all(
      simpleRequirements.map((_, index) =>
        prisma.fileAsset.create({
          data: {
            organizationId,
            originalFilename: `simple-stage-one-${run}-${index}.pdf`,
            storedFilename: `simple-stage-one-${run}-${index}.pdf`,
            mimeType: 'application/pdf',
            sizeBytes: 8,
            storageKey: `simple-stage-one-integration/${run}/${index}`,
            checksum: String(index).padStart(64, '0'),
            category: 'PROJECT_DOCUMENT',
            uploadedById: adminId,
          },
        }),
      ),
    );
    simpleFileAssetIds = simpleFiles.map(({ id }) => id);
    await prisma.$transaction([
      ...simpleRequirements.map(({ id }, index) =>
        prisma.projectRequiredDocument.update({
          where: { id },
          data: {
            currentFileAssetId: simpleFiles[index]!.id,
            currentVersion: 1,
            status: 'UPLOADED',
          },
        }),
      ),
      prisma.projectRequiredDocumentVersion.createMany({
        data: simpleRequirements.map(({ id }, index) => ({
          requirementId: id,
          version: 1,
          fileAssetId: simpleFiles[index]!.id,
          status: 'UPLOADED',
          createdBy: adminId,
        })),
      }),
      prisma.entityAttachment.createMany({
        data: simpleRequirements.map(({ id }, index) => ({
          fileAssetId: simpleFiles[index]!.id,
          entityType: 'ProjectRequiredDocument',
          entityId: id,
          projectId: simpleProjectId,
          createdBy: adminId,
        })),
      }),
    ]);
    const logicalDocument = await prisma.projectStageOneDocument.create({
      data: {
        projectId: simpleProjectId,
        contextType: 'STAGE_MATRIX_DOCUMENT',
        stageKey: 'STAGE_1',
        workstreamKey: 'KEY_DOSSIER',
        step: null,
        documentType: initialDocumentMatrix[0][0],
        displayName: initialDocumentMatrix[0][0],
        requiredDocumentId: simpleRequirements[0]!.id,
        currentFileAssetId: simpleFiles[0]!.id,
        currentVersion: 1,
        status: 'UPLOADED',
        submittedOfficerId: adminId,
        actualActorId: adminId,
        idempotencyKey: `simple-read-disclosure-${run}`,
      },
    });
    await prisma.projectStageOneDocumentVersion.create({
      data: {
        documentId: logicalDocument.id,
        version: 1,
        fileAssetId: simpleFiles[0]!.id,
        status: 'UPLOADED',
        submittedOfficerId: adminId,
        actualActorId: adminId,
      },
    });
    const linkedRequirements = await prisma.projectRequiredDocument.findMany({
      where: { id: { in: simpleRequirements.map(({ id }) => id) } },
      select: {
        currentFileAssetId: true,
        versions: { select: { fileAssetId: true } },
      },
    });
    expect(
      new Set(
        linkedRequirements.map(({ currentFileAssetId }) => currentFileAssetId),
      ).size,
    ).toBe(simpleRequirements.length);
    expect(
      linkedRequirements.every(
        ({ currentFileAssetId, versions }) =>
          Boolean(currentFileAssetId) &&
          versions.some(
            ({ fileAssetId }) => fileAssetId === currentFileAssetId,
          ),
      ),
    ).toBe(true);
    const mismatchedRequirement = simpleRequirements[1]!;
    await prisma.projectRequiredDocument.update({
      where: { id: mismatchedRequirement.id },
      data: { currentVersion: 2 },
    });
    const staleRead = await authenticated(
      api().get(`/api/v1/projects/${simpleProjectId}/stage-1/simple`),
      'admin@galaxy.local',
    ).expect(200);
    expect(staleRead.body.keyDossier.attachments).toHaveLength(
      simpleRequirements.length - 1,
    );
    expect(
      staleRead.body.keyDossier.attachments.find(
        ({ id }: { id: string }) => id === logicalDocument.id,
      ),
    ).not.toHaveProperty('versions');
    expect(JSON.stringify(staleRead.body.keyDossier.attachments)).not.toMatch(
      /checksum|storageKey|storedFilename|actualActorId|submittedOfficerId/,
    );
    await prisma.projectRequiredDocument.update({
      where: { id: mismatchedRequirement.id },
      data: { currentVersion: 1, status: 'MISSING' },
    });
    const inactiveRead = await authenticated(
      api().get(`/api/v1/projects/${simpleProjectId}/stage-1/simple`),
      'admin@galaxy.local',
    ).expect(200);
    expect(inactiveRead.body.keyDossier.attachments).toHaveLength(
      simpleRequirements.length - 1,
    );
    await prisma.projectRequiredDocument.update({
      where: { id: mismatchedRequirement.id },
      data: { status: 'UPLOADED' },
    });
    await prisma.projectRequiredDocument.updateMany({
      where: {
        projectId: simpleProjectId,
        stageKey: 'STAGE_1',
        documentType: {
          in: initialDocumentMatrix.map(([name]) => name),
        },
      },
      data: { required: true },
    });

    await prisma.projectStageStep.update({
      where: {
        projectId_stage_step: {
          projectId: simpleProjectId,
          stage: 'STAGE_ONE',
          step: 'ASSIGNMENT',
        },
      },
      data: { status: 'DONE' },
    });
    for (const [index, { step }] of SIMPLE_STAGE_ONE_STEPS.entries()) {
      if (step === 'KICKOFF_APPROVAL') break;
      const response = await authenticated(
        api().post(
          `/api/v1/projects/${simpleProjectId}/stage-1/steps/${step}/complete`,
        ),
        'admin@galaxy.local',
      )
        .send({})
        .expect(201);
      expect(response.body).toEqual({
        completed: true,
        nextStep: index + 2,
        stageCompleted: false,
      });
    }
    expect(
      await prisma.activity.count({
        where: {
          entityType: 'Project',
          entityId: simpleProjectId,
          event: 'PROJECT_STAGE_ONE_SIMPLE_STEP_COMPLETED',
          metadata: { path: ['step'], equals: 'ASSIGNMENT' },
        },
      }),
    ).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: {
          entityType: 'Project',
          entityId: simpleProjectId,
          action: 'PROJECT_STAGE_ONE_SIMPLE_STEP_COMPLETED',
          beforeData: { path: ['step'], equals: 'ASSIGNMENT' },
        },
      }),
    ).toBe(1);
    const reinitiated = await authenticated(
      api().post(`/api/v1/projects/${simpleProjectId}/stage-1/initiate-simple`),
      editorEmail,
    )
      .send({ ...payload, idempotencyKey: `${payload.idempotencyKey}-second` })
      .expect(201);
    expect(reinitiated.body.approval).toMatchObject({
      status: 'PENDING',
      decision: null,
    });
    const completed = await authenticated(
      api().post(
        `/api/v1/projects/${simpleProjectId}/stage-1/steps/KICKOFF_APPROVAL/complete`,
      ),
      'admin@galaxy.local',
    )
      .send({})
      .expect(201);
    expect(completed.body).toEqual({
      completed: true,
      nextStep: null,
      stageCompleted: true,
    });
    await authenticated(
      api().post(
        `/api/v1/projects/${simpleProjectId}/stage-1/steps/KICKOFF_APPROVAL/complete`,
      ),
      'admin@galaxy.local',
    )
      .send({})
      .expect(201)
      .expect(completed.body);
    expect(
      await prisma.projectStageState.findUniqueOrThrow({
        where: {
          projectId_stage: { projectId: simpleProjectId, stage: 'STAGE_ONE' },
        },
        select: { status: true },
      }),
    ).toEqual({ status: 'DONE' });
    expect(
      await prisma.activity.count({
        where: {
          entityType: 'Project',
          entityId: simpleProjectId,
          event: 'PROJECT_STAGE_ONE_SIMPLE_STEP_COMPLETED',
        },
      }),
    ).toBe(5);
    expect(
      await prisma.auditLog.count({
        where: {
          entityType: 'Project',
          entityId: simpleProjectId,
          action: 'PROJECT_STAGE_ONE_SIMPLE_STEP_COMPLETED',
        },
      }),
    ).toBe(5);
    await prisma.projectRequiredDocument.updateMany({
      where: { projectId: simpleProjectId, stageKey: 'STAGE_1' },
      data: { required: false },
    });
  });

  it('customizes optional Project definitions without reseeding or losing history', async () => {
    const definitionState = await prisma.projectStageState.findUniqueOrThrow({
      where: {
        projectId_stage: { projectId: simpleProjectId, stage: 'STAGE_ONE' },
      },
      select: { documentDefinitionsInitializedAt: true },
    });
    if (!definitionState.documentDefinitionsInitializedAt) {
      await authenticated(
        api().post(
          `/api/v1/projects/${simpleProjectId}/stage-1/initiate-simple`,
        ),
        'admin@galaxy.local',
      )
        .send({
          name: `Simple investment ${run}`,
          estimatedInvestmentAmount: '123456789012345678.90',
          fundingSource: 'PPP',
          customerId: simpleCustomerId,
          primaryContactId: simpleContactId,
          idempotencyKey: `simple-initiate-${run}`,
        })
        .expect(201);
    }
    const definitionsBefore = await prisma.projectRequiredDocument.findMany({
      where: { projectId: simpleProjectId, stageKey: 'STAGE_1' },
      select: { id: true, documentName: true },
    });
    const assignmentDefault =
      await prisma.projectRequiredDocument.findFirstOrThrow({
        where: {
          projectId: simpleProjectId,
          stageKey: 'STAGE_1',
          initialMatrix: true,
          documentName: initialDocumentMatrix[0][0],
        },
      });
    const customPayload = {
      name: 'Hồ sơ tùy chỉnh',
      workstreamKey: 'ASSIGNMENT',
      description: 'Tài liệu hỗ trợ dự án.',
      position: 20,
      initialMatrix: false,
      active: true,
    };

    await authenticated(
      api().post(
        `/api/v1/projects/${simpleProjectId}/stage-1/document-definitions`,
      ),
      editorEmail,
    )
      .send(customPayload)
      .expect(403);
    const created = await authenticated(
      api().post(
        `/api/v1/projects/${simpleProjectId}/stage-1/document-definitions`,
      ),
      'admin@galaxy.local',
    )
      .send(customPayload)
      .expect(201);
    expect(created.body).toMatchObject({
      ...customPayload,
      required: false,
      files: [],
    });
    const sameNameMatrix = await authenticated(
      api().post(
        `/api/v1/projects/${simpleProjectId}/stage-1/key-dossier/items`,
      ),
      'admin@galaxy.local',
    )
      .send({ ...customPayload, initialMatrix: true })
      .expect(201);
    expect(sameNameMatrix.body).toMatchObject({
      name: customPayload.name,
      initialMatrix: true,
    });
    expect(
      await prisma.projectRequiredDocument.findMany({
        where: {
          projectId: simpleProjectId,
          stageKey: 'STAGE_1',
          documentType: customPayload.name,
        },
        select: { initialMatrix: true },
        orderBy: { initialMatrix: 'asc' },
      }),
    ).toEqual([{ initialMatrix: false }, { initialMatrix: true }]);
    await authenticated(
      api().post(
        `/api/v1/projects/${simpleProjectId}/stage-1/document-definitions`,
      ),
      'admin@galaxy.local',
    )
      .send({
        ...customPayload,
        name: '  hồ sơ   TÙY CHỈNH  ',
        confirmDuplicate: true,
      })
      .expect(409);

    const archived = await authenticated(
      api().patch(
        `/api/v1/projects/${simpleProjectId}/stage-1/key-dossier/items/${assignmentDefault.id}`,
      ),
      'admin@galaxy.local',
    )
      .send({
        name: 'Văn bản chủ trương đã đổi',
        workstreamKey: 'ASSIGNMENT',
        description: 'Đã đổi tên.',
        position: 9,
        initialMatrix: true,
        active: false,
      })
      .expect(200);
    expect(archived.body).toMatchObject({
      id: assignmentDefault.id,
      name: 'Văn bản chủ trương đã đổi',
      workstreamKey: 'KEY_DOSSIER',
      position: 9,
      active: false,
    });

    const retriedAfterArchive = await authenticated(
      api().post(`/api/v1/projects/${simpleProjectId}/stage-1/initiate-simple`),
      'admin@galaxy.local',
    )
      .send({
        name: `Simple investment ${run}`,
        estimatedInvestmentAmount: '123456789012345678.90',
        fundingSource: 'PPP',
        customerId: simpleCustomerId,
        primaryContactId: simpleContactId,
        idempotencyKey: `simple-initiate-${run}`,
      })
      .expect(201);
    expect(
      retriedAfterArchive.body.keyDossier.items.find(
        ({ id }: { id: string }) => id === assignmentDefault.id,
      ),
    ).toMatchObject({
      name: 'Văn bản chủ trương đã đổi',
      active: false,
    });
    expect(
      await prisma.projectRequiredDocument.count({
        where: { projectId: simpleProjectId, stageKey: 'STAGE_1' },
      }),
    ).toBe(definitionsBefore.length + 2);
    expect(
      await prisma.projectRequiredDocument.count({
        where: {
          projectId: simpleProjectId,
          stageKey: 'STAGE_1',
          documentName: initialDocumentMatrix[0][0],
        },
      }),
    ).toBe(0);

    const historyFile = await prisma.fileAsset.create({
      data: {
        organizationId,
        originalFilename: `definition-history-${run}.pdf`,
        storedFilename: `definition-history-${run}.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: 1,
        storageKey: `definition-history/${run}`,
        checksum: 'a'.repeat(64),
        category: 'PROJECT_DOCUMENT',
        uploadedById: adminId,
      },
    });
    simpleFileAssetIds.push(historyFile.id);
    await prisma.projectRequiredDocument.update({
      where: { id: created.body.id },
      data: {
        currentFileAssetId: historyFile.id,
        currentVersion: 1,
        status: 'UPLOADED',
      },
    });
    await prisma.projectRequiredDocumentVersion.create({
      data: {
        requirementId: created.body.id,
        version: 1,
        fileAssetId: historyFile.id,
        status: 'UPLOADED',
        createdBy: adminId,
      },
    });
    await authenticated(
      api().patch(
        `/api/v1/projects/${simpleProjectId}/stage-1/document-definitions/${created.body.id}`,
      ),
      'admin@galaxy.local',
    )
      .send({ ...customPayload, active: false })
      .expect(200);
    expect(
      await prisma.projectRequiredDocument.findUniqueOrThrow({
        where: { id: created.body.id },
        select: {
          currentFileAssetId: true,
          currentVersion: true,
          required: true,
          _count: { select: { versions: true } },
        },
      }),
    ).toEqual({
      currentFileAssetId: historyFile.id,
      currentVersion: 1,
      required: false,
      _count: { versions: 1 },
    });
    const restoredCustom = await authenticated(
      api().patch(
        `/api/v1/projects/${simpleProjectId}/stage-1/document-definitions/${created.body.id}`,
      ),
      'admin@galaxy.local',
    )
      .send(customPayload)
      .expect(200);
    expect(restoredCustom.body).toMatchObject({
      id: created.body.id,
      active: true,
    });
    const restoredDefault = await authenticated(
      api().patch(
        `/api/v1/projects/${simpleProjectId}/stage-1/key-dossier/items/${assignmentDefault.id}`,
      ),
      'admin@galaxy.local',
    )
      .send({ ...archived.body, active: true })
      .expect(200);
    expect(restoredDefault.body).toMatchObject({
      id: assignmentDefault.id,
      active: true,
    });
    expect(
      await prisma.projectRequiredDocument.count({
        where: {
          id: { in: [created.body.id, assignmentDefault.id] },
          supersededAt: null,
        },
      }),
    ).toBe(2);
    await authenticated(
      api().patch(
        `/api/v1/projects/${projectId}/stage-1/key-dossier/items/${assignmentDefault.id}`,
      ),
      'admin@galaxy.local',
    )
      .send(customPayload)
      .expect(404);
    expect(
      await prisma.projectRequiredDocument.count({
        where: {
          projectId: simpleProjectId,
          stageKey: 'STAGE_1',
          required: true,
        },
      }),
    ).toBe(0);
    expect(
      await prisma.activity.count({
        where: {
          entityType: 'ProjectRequiredDocument',
          entityId: { in: [created.body.id, assignmentDefault.id] },
          event: {
            in: [
              'PROJECT_STAGE_ONE_DOCUMENT_DEFINITION_CREATED',
              'PROJECT_STAGE_ONE_DOCUMENT_DEFINITION_UPDATED',
            ],
          },
        },
      }),
    ).toBe(5);
    const definitionAudits = await prisma.auditLog.findMany({
      where: {
        entityType: 'ProjectRequiredDocument',
        entityId: { in: [created.body.id, assignmentDefault.id] },
        action: {
          in: [
            'PROJECT_STAGE_ONE_DOCUMENT_DEFINITION_CREATED',
            'PROJECT_STAGE_ONE_DOCUMENT_DEFINITION_UPDATED',
          ],
        },
      },
      select: { beforeData: true, afterData: true, metadata: true },
    });
    expect(definitionAudits).toHaveLength(5);
    expect(JSON.stringify(definitionAudits)).not.toMatch(
      /filename|storageKey|preliminary|estimatedInvestmentAmount/i,
    );
    const archivedHistorical = await prisma.projectRequiredDocument.create({
      data: {
        organizationId,
        projectId: simpleProjectId,
        stageKey: 'STAGE_1',
        workstreamKey: 'PROPOSAL',
        documentType: `ARCHIVED_HISTORY_${run}`,
        documentName: 'Hồ sơ   lưu trữ',
        required: false,
        status: 'UPLOADED',
        currentFileAssetId: historyFile.id,
        currentVersion: 1,
        supersededAt: new Date(),
        supersededBy: adminId,
      },
    });
    await prisma.projectRequiredDocumentVersion.create({
      data: {
        requirementId: archivedHistorical.id,
        version: 1,
        fileAssetId: historyFile.id,
        status: 'UPLOADED',
        createdBy: adminId,
      },
    });
    const definitionCountBeforeHistoricalLink =
      await prisma.projectRequiredDocument.count({
        where: { projectId: simpleProjectId, stageKey: 'STAGE_1' },
      });
    const linkedHistorical = await authenticated(
      api().post(
        `/api/v1/projects/${simpleProjectId}/stage-1/document-definitions`,
      ),
      'admin@galaxy.local',
    )
      .send({
        ...customPayload,
        name: ' hồ sơ lưu trữ ',
        workstreamKey: 'PROPOSAL',
      })
      .expect(201);
    expect(linkedHistorical.body).toMatchObject({
      id: archivedHistorical.id,
      active: true,
    });
    expect(
      await prisma.projectRequiredDocument.findUniqueOrThrow({
        where: { id: archivedHistorical.id },
        select: {
          currentFileAssetId: true,
          currentVersion: true,
          status: true,
          supersededAt: true,
          _count: { select: { versions: true } },
        },
      }),
    ).toEqual({
      currentFileAssetId: historyFile.id,
      currentVersion: 1,
      status: 'UPLOADED',
      supersededAt: null,
      _count: { versions: 1 },
    });
    expect(
      await prisma.projectRequiredDocument.count({
        where: { projectId: simpleProjectId, stageKey: 'STAGE_1' },
      }),
    ).toBe(definitionCountBeforeHistoricalLink);
    await prisma.projectRequiredDocument.create({
      data: {
        organizationId,
        projectId: simpleProjectId,
        stageKey: 'STAGE_1',
        workstreamKey: 'SURVEY',
        documentType: `LEGACY_CUSTOM_${run}`,
        documentName: 'Hồ sơ   lịch sử',
        required: false,
      },
    });
    await authenticated(
      api().post(
        `/api/v1/projects/${simpleProjectId}/stage-1/document-definitions`,
      ),
      'admin@galaxy.local',
    )
      .send({
        ...customPayload,
        name: '  hồ sơ lịch sử ',
        workstreamKey: 'SURVEY',
      })
      .expect(409);
    const legacySuperseded = await prisma.projectRequiredDocument.create({
      data: {
        organizationId,
        projectId: simpleProjectId,
        stageKey: 'STAGE_1',
        workstreamKey: 'PROPOSAL',
        documentType: `LEGACY_SUPERSEDED_${run}`,
        documentName: 'Hồ sơ đã thay thế',
        normalizedName: 'hồ sơ đã thay thế',
        required: false,
        status: 'SUPERSEDED',
        supersededAt: new Date(),
        supersededBy: adminId,
      },
    });
    await authenticated(
      api().post(
        `/api/v1/projects/${simpleProjectId}/stage-1/document-definitions`,
      ),
      'admin@galaxy.local',
    )
      .send({
        ...customPayload,
        name: legacySuperseded.documentName,
        workstreamKey: 'PROPOSAL',
        active: false,
      })
      .expect(409);
    await authenticated(
      api().patch(
        `/api/v1/projects/${simpleProjectId}/stage-1/document-definitions/${legacySuperseded.id}`,
      ),
      'admin@galaxy.local',
    )
      .send({
        ...customPayload,
        name: `${legacySuperseded.documentName} đổi`,
        workstreamKey: 'SURVEY',
        active: false,
      })
      .expect(409);
    await authenticated(
      api().patch(
        `/api/v1/projects/${simpleProjectId}/stage-1/document-definitions/${legacySuperseded.id}`,
      ),
      'admin@galaxy.local',
    )
      .send({
        ...customPayload,
        name: legacySuperseded.documentName,
        workstreamKey: 'PROPOSAL',
        active: true,
      })
      .expect(409);
  });

  it('persists, isolates, approves, and idempotently completes Stage 1', async () => {
    const initialize = await authenticated(
      api().post(`/api/v1/projects/${projectId}/stage-1/initialize`),
      'admin@galaxy.local',
    )
      .send({})
      .expect(201);
    expect(initialize.body).toMatchObject({ initialized: true });
    await authenticated(
      api().post(`/api/v1/projects/${projectId}/stage-1/initialize`),
      'admin@galaxy.local',
    )
      .send({})
      .expect(201)
      .expect({ initialized: false, routing: initialize.body.routing });
    expect(
      await prisma.projectStageState.count({
        where: { projectId, stage: 'STAGE_ONE' },
      }),
    ).toBe(1);
    expect(
      await prisma.projectStageStep.count({
        where: { projectId, stage: 'STAGE_ONE' },
      }),
    ).toBe(5);
    expect(
      await prisma.projectStageOnePlan.count({ where: { projectId } }),
    ).toBe(1);
    const activityBeforeGovernance = await prisma.activity.count({
      where: { entityType: 'Project', entityId: projectId },
    });
    const auditBeforeGovernance = await prisma.auditLog.count({
      where: { entityType: 'Project', entityId: projectId },
    });
    const governance = {
      principalUserId: adminId,
      coordinatorUserIds: [limitedId, reviewerId],
      responsibilityNotes: 'Admin owns governance; observer coordinates.',
    };
    const savedGovernance = await authenticated(
      api().patch(`/api/v1/projects/${projectId}/stage-1/governance`),
      'admin@galaxy.local',
    )
      .send(governance)
      .expect(200);
    expect(savedGovernance.body).toMatchObject({
      ...governance,
      responsibilityNoteMaxLength: 1000,
    });
    const reloadedGovernance = await authenticated(
      api().get(`/api/v1/projects/${projectId}/stage-1/initiation`),
      'admin@galaxy.local',
    ).expect(200);
    expect(reloadedGovernance.body.governance).toMatchObject(governance);
    await authenticated(
      api().patch(`/api/v1/projects/${projectId}/stage-1/governance`),
      'admin@galaxy.local',
    )
      .send(governance)
      .expect(200);
    expect(
      await prisma.activity.count({
        where: { entityType: 'Project', entityId: projectId },
      }),
    ).toBe(activityBeforeGovernance + 1);
    expect(
      await prisma.auditLog.count({
        where: { entityType: 'Project', entityId: projectId },
      }),
    ).toBe(auditBeforeGovernance + 1);
    const documentTypes = [
      'PROJECT_DOSSIER',
      'RESPONSIBILITY_MATRIX',
      'SURVEY_REPORT',
      'SITE_CONSTRAINTS',
      'SCOPE_STATEMENT',
      'PROPOSAL',
      'PROPOSAL_MILESTONES',
      'PROPOSAL_WBS',
      'RISK_REGISTER',
      'RESOURCE_PLAN',
      'PRELIMINARY_FINANCIAL_PLAN',
      'KICKOFF_APPROVAL',
    ];
    expect(initialize.body.routing).toMatchObject({
      projectType: 'DESIGN_AND_BUILD',
      requiresSurvey: true,
      requiresPreliminaryFinance: true,
      steps: [
        'ASSIGNMENT',
        'SURVEY',
        'PROPOSAL',
        'FINANCIAL_PLANNING',
        'KICKOFF_APPROVAL',
      ],
      documentTypes,
    });
    expect(
      (
        await prisma.projectRequiredDocument.findMany({
          where: { projectId, stageKey: 'STAGE_1', required: false },
          select: { documentType: true },
        })
      )
        .map(({ documentType }) => documentType)
        .sort(),
    ).toEqual([...documentTypes].sort());
    await prisma.projectRequiredDocument.updateMany({
      where: { projectId, stageKey: 'STAGE_1' },
      data: { required: true },
    });

    await prisma.projectStageOnePlan.update({
      where: { projectId },
      data: {
        preliminaryRevenue: '1000.00',
        preliminaryCost: '800.00',
        preliminaryMargin: '200.00',
        preliminaryCurrency: 'USD',
        preliminaryFinancialPlanDate: new Date('2026-08-01T00:00:00.000Z'),
      },
    });
    for (const path of ['initiation', 'summary', 'routing']) {
      const response = await authenticated(
        api().get(`/api/v1/projects/${projectId}/stage-1/${path}`),
        limitedEmail,
      ).expect(200);
      expect(JSON.stringify(response.body)).not.toMatch(
        /preliminary|1000\.00|800\.00|200\.00/i,
      );
    }
    await authenticated(
      api()
        .get(`/api/v1/projects/${projectId}/stage-1/summary`)
        .query({ sort: 'preliminaryRevenue' }),
      limitedEmail,
    )
      .expect(400)
      .expect((response) => {
        const body = JSON.stringify(response.body);
        expect(body).not.toMatch(/preliminary/i);
        expect(body).not.toContain('1000.00');
      });
    await authenticated(
      api().get(`/api/v1/projects/${projectId}/stage-1/summary`),
      outsiderEmail,
    )
      .expect(404)
      .expect((response) =>
        expect(JSON.stringify(response.body)).not.toContain(`STAGE18-${run}`),
      );

    const blocked = await authenticated(
      api().post(`/api/v1/projects/${projectId}/stage-1/gate`),
      'admin@galaxy.local',
    ).expect(422);
    expect(blocked.body.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'REQUIRED_DOCUMENT_NOT_APPROVED' }),
        expect.objectContaining({ code: 'STAGE_APPROVAL_MISSING' }),
        expect.objectContaining({ code: 'ASSIGNMENT_STEP_INCOMPLETE' }),
      ]),
    );
    expect(
      await prisma.project.findUniqueOrThrow({
        where: { id: projectId },
        select: { phase: true },
      }),
    ).toEqual({ phase: 'SURVEY' });

    const fileAsset = await prisma.fileAsset.create({
      data: {
        organizationId,
        originalFilename: `stage-one-${run}.pdf`,
        storedFilename: `stage-one-${run}.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: 8,
        storageKey: `stage-one-integration/${run}`,
        checksum: '0'.repeat(64),
        category: 'PROJECT_DOCUMENT',
        uploadedById: adminId,
      },
    });
    fileAssetId = fileAsset.id;
    await prisma.$transaction([
      prisma.projectStageOnePlan.update({
        where: { projectId },
        data: {
          scopeNotes:
            'No location: this integration Project has no physical site.',
          proposalBaseline: 'Baseline is ready.',
          proposalMilestones: ['Milestone'],
          proposalWbs: ['WBS'],
          riskNotes: 'Risk is recorded.',
          resourceNotes: 'Resources are recorded.',
        },
      }),
      prisma.survey.create({
        data: {
          organizationId,
          projectId,
          scheduledAt: new Date('2026-07-01T00:00:00.000Z'),
          surveyedAt: new Date('2026-07-02T00:00:00.000Z'),
          createdBy: adminId,
          updatedBy: adminId,
        },
      }),
      prisma.projectStageStep.updateMany({
        where: {
          projectId,
          stage: 'STAGE_ONE',
          step: {
            in: ['ASSIGNMENT', 'SURVEY', 'PROPOSAL', 'FINANCIAL_PLANNING'],
          },
        },
        data: { status: 'DONE' },
      }),
      prisma.projectRequiredDocument.updateMany({
        where: { projectId, stageKey: 'STAGE_1', required: true },
        data: { status: 'PENDING_REVIEW', currentFileAssetId: fileAssetId },
      }),
      prisma.projectRequiredDocument.updateMany({
        where: {
          projectId,
          stageKey: 'STAGE_1',
          documentType: 'KICKOFF_APPROVAL',
        },
        data: {
          status: 'APPROVED',
          approvedAt: new Date(),
          approvedBy: reviewerId,
        },
      }),
    ]);

    let projectLocked!: () => void;
    const projectHasLock = new Promise<void>((resolve) => {
      projectLocked = resolve;
    });
    let releaseProject!: () => void;
    const releaseProjectLock = new Promise<void>((resolve) => {
      releaseProject = resolve;
    });
    const projectLock = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT "id" FROM "Project"
        WHERE "id" = ${projectId}::uuid
        FOR UPDATE
      `;
      projectLocked();
      await releaseProjectLock;
    });
    await projectHasLock;
    const submissionRequest = Promise.resolve(
      authenticated(
        api().post(`/api/v1/projects/${projectId}/stage-1/approval/submit`),
        'admin@galaxy.local',
      )
        .send({ idempotencyKey: `stage-one-submit-${run}` })
        .expect(201),
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(
      await prisma.projectStageStep.findUniqueOrThrow({
        where: {
          projectId_stage_step: {
            projectId,
            stage: 'STAGE_ONE',
            step: 'KICKOFF_APPROVAL',
          },
        },
        select: { status: true },
      }),
    ).toEqual({ status: 'TODO' });
    releaseProject();
    const [, submitted] = await Promise.all([projectLock, submissionRequest]);
    approvalId = submitted.body.id;
    expect(submitted.body.reviewedBy).not.toBe(adminId);
    const resolvedReviewer = await prisma.user.findUniqueOrThrow({
      where: { id: submitted.body.reviewedBy },
      select: { id: true, email: true },
    });
    const retriedSubmission = await authenticated(
      api().post(`/api/v1/projects/${projectId}/stage-1/approval/submit`),
      'admin@galaxy.local',
    )
      .send({ idempotencyKey: `stage-one-submit-${run}` })
      .expect(201);
    expect(retriedSubmission.body).toEqual(submitted.body);
    expect(
      await prisma.projectStageApproval.count({ where: { projectId } }),
    ).toBe(1);
    expect(
      await prisma.activity.count({
        where: { entityType: 'ProjectStageApproval', entityId: approvalId },
      }),
    ).toBe(1);
    expect(
      await prisma.notification.count({
        where: {
          entityType: 'Project',
          entityId: projectId,
          recipientId: resolvedReviewer.id,
          href: `/projects/${projectId}/stage-1/approval`,
        },
      }),
    ).toBe(1);
    await authenticated(
      api().post(
        `/api/v1/projects/${projectId}/stage-1/approval/${approvalId}/decision`,
      ),
      resolvedReviewer.email,
    )
      .send({ version: 1, decision: 'APPROVED' })
      .expect(201);
    await prisma.projectRequiredDocument.updateMany({
      where: { projectId, stageKey: 'STAGE_1', required: true },
      data: {
        status: 'APPROVED',
        approvedAt: new Date(),
        approvedBy: resolvedReviewer.id,
      },
    });

    process.env.DEV_AUTH_USER_EMAIL = 'admin@galaxy.local';
    const gates = await Promise.all(
      [1, 2].map(() =>
        api()
          .post(`/api/v1/projects/${projectId}/stage-1/gate`)
          .set('x-galaxy-dev-auth', 'admin@galaxy.local'),
      ),
    );
    expect(
      gates
        .map(({ status }) => status)
        .every((status) => [201, 409].includes(status)),
    ).toBe(true);
    const gate = gates.find(
      ({ status, body }) => status === 201 && !body.alreadyComplete,
    );
    expect(gate).toBeDefined();
    expect(gate!.body).toMatchObject({
      completed: true,
      alreadyComplete: false,
      completedBy: adminId,
      gateDecisionVersion: 1,
      phase: 'DESIGN',
    });
    const activityCount = await prisma.activity.count({
      where: {
        entityType: 'Project',
        entityId: projectId,
        event: 'PROJECT_STAGE_ONE_GATE_COMPLETED',
      },
    });
    const notificationCount = await prisma.notification.count({
      where: {
        projectId,
        type: 'PROJECT_STAGE_ONE_GATE_COMPLETED',
        href: `/projects/${projectId}`,
      },
    });
    expect(activityCount).toBe(1);
    expect(notificationCount).toBe(2);
    const stageState = await prisma.projectStageState.findUniqueOrThrow({
      where: { projectId_stage: { projectId, stage: 'STAGE_ONE' } },
      select: {
        status: true,
        completedBy: true,
        completedAt: true,
        gateDecisionVersion: true,
        version: true,
      },
    });
    expect(stageState).toMatchObject({
      status: 'DONE',
      completedBy: adminId,
      gateDecisionVersion: 1,
      version: 2,
    });
    expect(stageState.completedAt).toBeInstanceOf(Date);
    const workspace = await authenticated(
      api().get(`/api/v1/projects/${projectId}/workspace-summary`),
      'admin@galaxy.local',
    ).expect(200);
    expect(workspace.body.stages).toContainEqual(
      expect.objectContaining({
        stageKey: 'STAGE_1',
        status: 'Hoàn thành',
        progressPercent: 100,
      }),
    );
    for (const stageKey of ['STAGE_2', 'STAGE_3', 'STAGE_4', 'STAGE_5'])
      expect(workspace.body.stages).toContainEqual(
        expect.objectContaining({
          stageKey,
          status: 'Chưa bắt đầu',
          progressPercent: null,
        }),
      );
    await authenticated(
      api().post(`/api/v1/projects/${projectId}/stage-1/gate`),
      'admin@galaxy.local',
    )
      .expect(201)
      .expect({ ...gate!.body, alreadyComplete: true });
    expect(
      await prisma.activity.count({
        where: {
          entityType: 'Project',
          entityId: projectId,
          event: 'PROJECT_STAGE_ONE_GATE_COMPLETED',
        },
      }),
    ).toBe(activityCount);
    expect(
      await prisma.notification.count({
        where: {
          projectId,
          type: 'PROJECT_STAGE_ONE_GATE_COMPLETED',
          href: `/projects/${projectId}`,
        },
      }),
    ).toBe(notificationCount);
  });

  it('enforces the Stage 1 legacy Step invariant in PostgreSQL', async () => {
    const idempotencyKey = `invalid-null-stage-one-step-${run}`;

    try {
      await expect(
        prisma.projectStageOneDocument.create({
          data: {
            projectId,
            contextType: 'STAGE_WORKFLOW_STEP_DOCUMENT',
            stageKey: 'STAGE_1',
            workstreamKey: 'ASSIGNMENT',
            step: null,
            documentType: 'INVALID_STAGE_ONE_STEP',
            displayName: 'Invalid Stage 1 Step',
            submittedOfficerId: adminId,
            actualActorId: adminId,
            idempotencyKey,
          },
        }),
      ).rejects.toThrow('ProjectStageOneDocument_stageKey_step_check');
    } finally {
      await prisma.projectStageOneDocument.deleteMany({
        where: { projectId, idempotencyKey },
      });
    }
  });
});
