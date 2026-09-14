import { INestApplication, ValidationPipe } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Test } from '@nestjs/testing';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import request, { Test as SuperTest } from 'supertest';
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { FileStorage } from '../src/files/file-storage';
import { STAGE_TWO_PLAN_HEADERS } from '../src/projects/project-stage-two.dto';
import { STAGE_TWO_DOCUMENT_DEFAULTS } from '../src/projects/project-stage-two.service';
import { assertG00Isolation } from '../scripts/g00-isolated-environment.mjs';

const isolated = assertG00Isolation();

describe.sequential('Project Stage 2 PostgreSQL API integration', () => {
  const prisma = new PrismaClient();
  const run = `${Date.now()}-${process.pid}`;
  const memberEmail = `stage-two-member-${run}@example.test`;
  const outsiderEmail = `stage-two-outsider-${run}@example.test`;
  const fileAssetIds: string[] = [];
  const storageKeys: string[] = [];
  const definitionIds: string[] = [];
  let app: INestApplication;
  let storage: FileStorage;
  let runtimePath = '';
  let organizationId = '';
  let adminId = '';
  let memberId = '';
  let outsiderId = '';
  let memberRoleId = '';
  let outsiderRoleId = '';
  let customerId = '';
  let projectId = '';
  let otherProjectId = '';
  let activeDepartmentId = '';
  let inactiveDepartmentId = '';

  const api = () => request(app.getHttpServer());
  const authenticated = (test: SuperTest, email = 'admin@galaxy.local') => {
    process.env.DEV_AUTH_USER_EMAIL = email;
    return test.set('x-galaxy-dev-auth', email);
  };
  const stage = () => `/api/v1/projects/${projectId}/stage-2`;
  const row = (code: string, overrides: Record<string, unknown> = {}) => ({
    code,
    description: `Công việc ${code}`,
    departmentId: activeDepartmentId,
    startDate: '2026-08-14',
    finishDate: '2026-08-15',
    allocatedBudget: '1000.5',
    ...overrides,
  });
  const workbook = async (
    rows: unknown[][],
    headers: readonly string[] = STAGE_TWO_PLAN_HEADERS,
  ) => {
    const value = new ExcelJS.Workbook();
    const sheet = value.addWorksheet('Ke hoach');
    sheet.addRow([...headers]);
    rows.forEach((values) => sheet.addRow(values));
    return Buffer.from(await value.xlsx.writeBuffer());
  };
  const createWorkbookAsset = async (
    bytes: Buffer,
    suffix: string,
    options: {
      project?: string;
      available?: boolean;
      attached?: boolean;
      sizeBytes?: number;
      logicalContext?: boolean;
    } = {},
  ) => {
    const storageKey = await storage.put(organizationId, bytes);
    storageKeys.push(storageKey);
    const asset = await prisma.fileAsset.create({
      data: {
        organizationId,
        originalFilename: `stage-two-${suffix}.xlsx`,
        storedFilename: `${suffix}-${run}`,
        mimeType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        sizeBytes: options.sizeBytes ?? bytes.length,
        storageKey,
        checksum: createHash('sha256').update(bytes).digest('hex'),
        category: 'PROJECT_DOCUMENT',
        uploadedById: adminId,
      },
    });
    fileAssetIds.push(asset.id);
    const ownedProjectId = options.project ?? projectId;
    let stageDocumentId: string | undefined;
    if (options.logicalContext !== false) {
      const definition = await prisma.projectRequiredDocument.create({
        data: {
          organizationId,
          projectId: ownedProjectId,
          stageKey: 'STAGE_2',
          workstreamKey: 'PLAN',
          documentType: `IMPORT_${suffix}_${asset.id}`,
          documentName: `Workbook ${suffix}`,
          required: false,
          initialMatrix: true,
          status: 'MISSING',
        },
      });
      definitionIds.push(definition.id);
      stageDocumentId = (
        await prisma.projectStageOneDocument.create({
          data: {
            projectId: ownedProjectId,
            contextType: 'STAGE_MATRIX_DOCUMENT',
            stageKey: 'STAGE_2',
            workstreamKey: 'PLAN',
            documentType: definition.documentType,
            displayName: definition.documentName,
            requiredDocumentId: definition.id,
            currentFileAssetId: asset.id,
            currentVersion: 1,
            status: 'UPLOADED',
            submittedOfficerId: adminId,
            actualActorId: adminId,
            idempotencyKey: `import-${suffix}-${asset.id}`,
          },
        })
      ).id;
    }
    if (options.attached !== false)
      await prisma.entityAttachment.create({
        data: {
          fileAssetId: asset.id,
          entityType: stageDocumentId ? 'ProjectStageOneDocument' : 'Project',
          entityId: stageDocumentId ?? ownedProjectId,
          projectId: ownedProjectId,
          createdBy: adminId,
        },
      });
    await prisma.uploadSession.create({
      data: {
        organizationId,
        actorId: adminId,
        projectId: ownedProjectId,
        stageOneDocumentId: stageDocumentId,
        submittingOfficerId: stageDocumentId ? adminId : undefined,
        fileAssetId: asset.id,
        originalFilename: asset.originalFilename,
        declaredSize: BigInt(bytes.length),
        mimeType: asset.mimeType,
        storageKey,
        status: options.available === false ? 'UPLOADING' : 'AVAILABLE',
        partSize: bytes.length,
        totalParts: 1,
        uploadedBytes: BigInt(bytes.length),
        expiresAt: new Date(Date.now() + 60_000),
        completedAt: options.available === false ? null : new Date(),
      },
    });
    return asset.id;
  };

  beforeAll(async () => {
    runtimePath = await mkdtemp(join(isolated.testRoot, 'stage-two-'));
    vi.stubEnv('ALLOW_DEV_AUTH', 'true');
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('DEV_AUTH_USER_EMAIL', 'admin@galaxy.local');
    vi.stubEnv('FILE_STORAGE_PATH', join(runtimePath, 'files'));
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { slug: 'galaxy-centre' },
    });
    organizationId = organization.id;
    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: 'admin@galaxy.local' },
    });
    adminId = admin.id;
    const [member, outsider] = (await Promise.all(
      [memberEmail, outsiderEmail].map((email) =>
        prisma.user.create({
          data: {
            email,
            normalizedEmail: email,
            displayName: email.split('@')[0]!,
            status: 'active',
          },
        }),
      ),
    )) as unknown as [{ id: string }, { id: string }];
    memberId = member.id;
    outsiderId = outsider.id;
    await prisma.organizationMembership.createMany({
      data: [memberId, outsiderId].map((userId) => ({
        organizationId,
        userId,
        status: 'active',
      })),
    });
    const [memberRole, outsiderRole] = await Promise.all([
      prisma.role.create({
        data: {
          organizationId,
          code: `stage_two_member_${run}`,
          name: `Stage Two member ${run}`,
          maximumScope: 'SELF',
        },
      }),
      prisma.role.create({
        data: {
          organizationId,
          code: `stage_two_outsider_${run}`,
          name: `Stage Two outsider ${run}`,
          maximumScope: 'SELF',
        },
      }),
    ]);
    memberRoleId = memberRole.id;
    outsiderRoleId = outsiderRole.id;
    const baseCodes = [
      'project.read',
      'project.update',
      'task.read',
      'task.create',
      'task.update',
      'task.delete',
      'import.create',
      'import.confirm',
      'file.read',
      'file.download',
      'project.document.manage',
    ];
    const permissions = await prisma.permission.findMany({
      where: {
        code: { in: [...baseCodes, 'estimate.read', 'estimate.update'] },
      },
      select: { id: true, code: true },
    });
    expect(permissions).toHaveLength(baseCodes.length + 2);
    await prisma.rolePermission.createMany({
      data: [
        ...permissions
          .filter(({ code }) => baseCodes.includes(code))
          .map(({ id }) => ({ roleId: memberRoleId, permissionId: id })),
        ...permissions.map(({ id }) => ({
          roleId: outsiderRoleId,
          permissionId: id,
        })),
      ],
    });
    await prisma.userRole.createMany({
      data: [
        {
          organizationId,
          userId: memberId,
          roleId: memberRoleId,
          scopeType: 'SELF',
        },
        {
          organizationId,
          userId: outsiderId,
          roleId: outsiderRoleId,
          scopeType: 'SELF',
        },
      ],
    });
    const [activeDepartment, inactiveDepartment] = await Promise.all([
      prisma.department.create({
        data: {
          organizationId,
          code: `S2A-${run}`,
          name: `Stage Two Active ${run}`,
          status: 'active',
        },
      }),
      prisma.department.create({
        data: {
          organizationId,
          code: `S2I-${run}`,
          name: `Stage Two Inactive ${run}`,
          status: 'archived',
        },
      }),
    ]);
    activeDepartmentId = activeDepartment.id;
    inactiveDepartmentId = inactiveDepartment.id;
    const customer = await prisma.customer.create({
      data: {
        organizationId,
        type: 'COMPANY',
        displayName: `Stage Two customer ${run}`,
        createdBy: adminId,
        updatedBy: adminId,
      },
    });
    customerId = customer.id;
    const [project, otherProject] = (await Promise.all(
      ['main', 'other'].map((suffix) =>
        prisma.project.create({
          data: {
            organizationId,
            code: `STAGE2-${suffix}-${run}`,
            name: `Stage Two ${suffix} ${run}`,
            customerId,
            projectType: 'DESIGN_AND_BUILD',
            projectManagerId: suffix === 'main' ? memberId : adminId,
            createdBy: adminId,
            updatedBy: adminId,
          },
        }),
      ),
    )) as unknown as [{ id: string }, { id: string }];
    projectId = project.id;
    otherProjectId = otherProject.id;
    await prisma.projectMember.create({
      data: {
        organizationId,
        projectId,
        userId: memberId,
        role: 'PROJECT_MANAGER',
        createdBy: adminId,
      },
    });
    await prisma.projectStageState.create({
      data: { projectId, stage: 'STAGE_TWO', status: 'IN_PROGRESS' },
    });
    await prisma.projectRequiredDocument.create({
      data: {
        organizationId,
        projectId,
        stageKey: 'STAGE_2',
        workstreamKey: 'PLAN',
        documentType: `OPTIONAL_${run}`,
        documentName: 'Hồ sơ kế hoạch tùy chọn',
        required: false,
        status: 'MISSING',
      },
    });
    await prisma.task.create({
      data: {
        organizationId,
        projectId: otherProjectId,
        relatedEntityType: 'PROJECT_STAGE_TWO_BASELINE',
        relatedEntityId: otherProjectId,
        baselineVersion: 1,
        code: 'SCOPED',
        title: 'Other scoped row',
        description: 'Other scoped row',
        departmentId: activeDepartmentId,
        createdBy: adminId,
        updatedBy: adminId,
      },
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
    storage = app.get(FileStorage);
  }, 30_000);

  afterAll(async () => {
    await app?.close();
    await prisma.importJob.deleteMany({ where: { projectId } });
    await prisma.uploadSession.deleteMany({
      where: { fileAssetId: { in: fileAssetIds } },
    });
    await prisma.entityAttachment.deleteMany({
      where: { fileAssetId: { in: fileAssetIds } },
    });
    await prisma.projectStageOneDocumentVersion.deleteMany({
      where: {
        document: {
          projectId: { in: [projectId, otherProjectId].filter(Boolean) },
        },
      },
    });
    await prisma.projectStageOneDocument.deleteMany({
      where: { projectId: { in: [projectId, otherProjectId].filter(Boolean) } },
    });
    await prisma.fileAsset.deleteMany({ where: { id: { in: fileAssetIds } } });
    await prisma.auditLog.deleteMany({
      where: {
        entityId: {
          in: [projectId, otherProjectId, ...definitionIds].filter(Boolean),
        },
      },
    });
    await prisma.activity.deleteMany({
      where: {
        entityId: {
          in: [projectId, otherProjectId, ...definitionIds].filter(Boolean),
        },
      },
    });
    await prisma.task.deleteMany({
      where: { projectId: { in: [projectId, otherProjectId].filter(Boolean) } },
    });
    await prisma.projectStageStep.deleteMany({ where: { projectId } });
    await prisma.projectStageState.deleteMany({ where: { projectId } });
    await prisma.projectRequiredDocumentVersion.deleteMany({
      where: {
        requirement: {
          projectId: { in: [projectId, otherProjectId].filter(Boolean) },
        },
      },
    });
    await prisma.projectRequiredDocument.deleteMany({
      where: {
        projectId: { in: [projectId, otherProjectId].filter(Boolean) },
      },
    });
    await prisma.projectMember.deleteMany({ where: { projectId } });
    await prisma.project.deleteMany({
      where: { id: { in: [projectId, otherProjectId].filter(Boolean) } },
    });
    await prisma.customer.deleteMany({ where: { id: customerId } });
    await prisma.department.deleteMany({
      where: { id: { in: [activeDepartmentId, inactiveDepartmentId] } },
    });
    await prisma.userRole.deleteMany({
      where: { userId: { in: [memberId, outsiderId] } },
    });
    await prisma.rolePermission.deleteMany({
      where: { roleId: { in: [memberRoleId, outsiderRoleId] } },
    });
    await prisma.role.deleteMany({
      where: { id: { in: [memberRoleId, outsiderRoleId] } },
    });
    await prisma.organizationMembership.deleteMany({
      where: { userId: { in: [memberId, outsiderId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [memberId, outsiderId] } },
    });
    await prisma.$disconnect();
    await rm(runtimePath, { recursive: true, force: true });
    vi.unstubAllEnvs();
  }, 30_000);

  it('initializes the exact four defaults once without reseeding later edits', async () => {
    const route = `/api/v1/projects/${projectId}/stages/STAGE_2/initialize`;
    await authenticated(api().post(route), memberEmail).expect(201);
    const defaults = await prisma.projectRequiredDocument.findMany({
      where: {
        projectId,
        stageKey: 'STAGE_2',
        documentType: { in: [...STAGE_TWO_DOCUMENT_DEFAULTS] },
      },
      orderBy: { position: 'asc' },
    });
    expect(
      defaults.map(({ documentName, position, required, initialMatrix }) => ({
        documentName,
        position,
        required,
        initialMatrix,
      })),
    ).toEqual([
      {
        documentName: 'Kế hoạch & khảo sát dự án',
        position: 0,
        required: false,
        initialMatrix: true,
      },
      {
        documentName: 'Thiết kế, sản phẩm & BOQ',
        position: 1,
        required: false,
        initialMatrix: true,
      },
      {
        documentName: 'Thẩm định & phê duyệt',
        position: 2,
        required: false,
        initialMatrix: true,
      },
      {
        documentName: 'Hồ sơ khác',
        position: 3,
        required: false,
        initialMatrix: true,
      },
    ]);
    expect(
      await prisma.projectStageState.findUniqueOrThrow({
        where: { projectId_stage: { projectId, stage: 'STAGE_TWO' } },
        select: { documentDefinitionsInitializedAt: true },
      }),
    ).toEqual({ documentDefinitionsInitializedAt: expect.any(Date) });

    await prisma.projectRequiredDocument.update({
      where: { id: defaults[0]!.id },
      data: {
        documentName: 'Tên mặc định đã đổi',
        normalizedName: 'tên mặc định đã đổi',
        supersededAt: new Date(),
        supersededBy: adminId,
      },
    });
    const beforeRetry = await prisma.projectRequiredDocument.count({
      where: { projectId, stageKey: 'STAGE_2' },
    });
    await authenticated(api().post(route), memberEmail).expect(201);
    expect(
      await prisma.projectRequiredDocument.count({
        where: { projectId, stageKey: 'STAGE_2' },
      }),
    ).toBe(beforeRetry);
    expect(
      await prisma.projectRequiredDocument.findUniqueOrThrow({
        where: { id: defaults[0]!.id },
        select: { documentName: true, supersededAt: true },
      }),
    ).toMatchObject({
      documentName: 'Tên mặc định đã đổi',
      supersededAt: expect.any(Date),
    });
    expect(
      await prisma.activity.count({
        where: {
          entityType: 'Project',
          entityId: projectId,
          event: 'PROJECT_STAGE_TWO_DOCUMENT_DEFINITIONS_INITIALIZED',
        },
      }),
    ).toBe(1);
  });

  it('authorizes the read model directly and omits finance server-side', async () => {
    const response = await authenticated(
      api().get(`${stage()}?step=1`),
      memberEmail,
    );
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body).toMatchObject({
      selectedStep: 1,
      plan: [],
      tabs: [
        { step: 1, label: 'KẾ HOẠCH & KHẢO SÁT' },
        { step: 2, label: 'THIẾT KẾ, SẢN PHẨM & BOQ' },
        { step: 3, label: 'THẨM ĐỊNH & PHÊ DUYỆT' },
      ],
      documentDefinitions: expect.arrayContaining([
        expect.objectContaining({ required: false, active: true }),
      ]),
      documents: [],
      permittedCommands: {
        viewAllocatedBudget: false,
        editAllocatedBudget: false,
      },
    });
    expect(JSON.stringify(response.body)).not.toContain('allocatedBudget');
    expect(response.body.options.departments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: activeDepartmentId }),
      ]),
    );
    expect(response.body.options.departments).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: inactiveDepartmentId }),
      ]),
    );

    const denied = await authenticated(
      api().get(`${stage()}?step=1`),
      outsiderEmail,
    ).expect(404);
    expect(JSON.stringify(denied.body)).not.toMatch(
      new RegExp(`STAGE2-main|${projectId}|1000|xlsx`, 'i'),
    );
  });

  it('creates and edits optional document types without deleting archive history', async () => {
    const input = {
      name: '  Hồ sơ tiến độ tổng thể  ',
      workstreamKey: 'PLAN',
      description: '  Gantt và nguồn lực  ',
      position: 4,
      initialMatrix: true,
      active: true,
    };
    const managePermission = await prisma.permission.findUniqueOrThrow({
      where: { code: 'project.document.manage' },
      select: { id: true },
    });
    await prisma.rolePermission.delete({
      where: {
        roleId_permissionId: {
          roleId: memberRoleId,
          permissionId: managePermission.id,
        },
      },
    });
    await authenticated(
      api().post(`${stage()}/document-definitions`),
      memberEmail,
    )
      .send(input)
      .expect(403);
    await prisma.rolePermission.create({
      data: {
        roleId: memberRoleId,
        permissionId: managePermission.id,
      },
    });
    await authenticated(
      api().post(`${stage()}/document-definitions`),
      memberEmail,
    )
      .send({ ...input, name: 'Workflow không hợp lệ', initialMatrix: false })
      .expect(400);
    const created = await authenticated(
      api().post(`${stage()}/document-definitions`),
      memberEmail,
    )
      .send(input)
      .expect(201);
    definitionIds.push(created.body.id);
    expect(created.body).toMatchObject({
      name: 'Hồ sơ tiến độ tổng thể',
      workstreamKey: 'PLAN',
      description: 'Gantt và nguồn lực',
      position: 4,
      initialMatrix: true,
      active: true,
      required: false,
    });
    const persisted = await prisma.projectRequiredDocument.findUniqueOrThrow({
      where: { id: created.body.id },
    });
    expect(persisted).toMatchObject({
      projectId,
      stageKey: 'STAGE_2',
      workstreamKey: 'PLAN',
      required: false,
      normalizedName: 'hồ sơ tiến độ tổng thể',
      initialMatrix: true,
    });
    await authenticated(
      api().patch(`${stage()}/document-definitions/${created.body.id}`),
      memberEmail,
    )
      .send({ ...input, initialMatrix: false })
      .expect(400);
    expect(
      await prisma.projectRequiredDocument.findUniqueOrThrow({
        where: { id: created.body.id },
        select: { initialMatrix: true },
      }),
    ).toEqual({ initialMatrix: true });
    await prisma.projectRequiredDocumentVersion.create({
      data: {
        requirementId: created.body.id,
        version: 1,
        status: 'UPLOADED',
        createdBy: adminId,
      },
    });

    await authenticated(
      api().post(`${stage()}/document-definitions`),
      memberEmail,
    )
      .send({ ...input, name: 'hỒ   SƠ TIẾN ĐỘ TỔNG THỂ' })
      .expect(409);
    const outsider = await authenticated(
      api().post(`${stage()}/document-definitions`),
      outsiderEmail,
    )
      .send({ ...input, name: 'Không được tạo' })
      .expect(404);
    expect(JSON.stringify(outsider.body)).not.toMatch(/STAGE2-main|Hồ sơ/i);

    const otherDefinition = await prisma.projectRequiredDocument.create({
      data: {
        organizationId,
        projectId: otherProjectId,
        stageKey: 'STAGE_2',
        workstreamKey: 'PLAN',
        documentType: `OTHER_${run}`,
        documentName: 'Other definition',
        normalizedName: `other ${run}`,
        required: false,
        initialMatrix: true,
        status: 'MISSING',
      },
    });
    definitionIds.push(otherDefinition.id);
    await authenticated(
      api().patch(`${stage()}/document-definitions/${otherDefinition.id}`),
    )
      .send({ ...input, name: 'Cross Project' })
      .expect(404);

    const hiddenInput = {
      ...input,
      name: 'Hồ sơ tiến độ đã đổi tên',
      description: 'Gantt và nguồn lực',
      position: 1,
      active: false,
    };
    const hidden = await authenticated(
      api().patch(`${stage()}/document-definitions/${created.body.id}`),
      memberEmail,
    )
      .send(hiddenInput)
      .expect(200);
    expect(hidden.body).toMatchObject({
      id: created.body.id,
      name: 'Hồ sơ tiến độ đã đổi tên',
      position: 1,
      active: false,
      required: false,
    });
    expect(
      await prisma.projectRequiredDocumentVersion.count({
        where: { requirementId: created.body.id },
      }),
    ).toBe(1);
    expect(
      await prisma.projectRequiredDocument.findUniqueOrThrow({
        where: { id: created.body.id },
      }),
    ).toMatchObject({ supersededAt: expect.any(Date), status: 'MISSING' });

    const restoredInput = { ...hiddenInput, position: 2, active: true };
    const restored = await authenticated(
      api().patch(`${stage()}/document-definitions/${created.body.id}`),
      memberEmail,
    )
      .send(restoredInput)
      .expect(200);
    expect(restored.body).toMatchObject({
      id: created.body.id,
      position: 2,
      active: true,
      required: false,
    });
    await authenticated(
      api().patch(`${stage()}/document-definitions/${created.body.id}`),
      memberEmail,
    )
      .send(restoredInput)
      .expect(200);

    const reloaded = await authenticated(
      api().get(stage()),
      memberEmail,
    ).expect(200);
    expect(reloaded.body.documentDefinitions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: created.body.id,
          position: 2,
          active: true,
          required: false,
          initialMatrix: true,
          files: [],
        }),
      ]),
    );
    expect(
      await prisma.activity.count({
        where: {
          entityType: 'ProjectRequiredDocument',
          entityId: created.body.id,
          event: { startsWith: 'PROJECT_STAGE_TWO_DOCUMENT_DEFINITION_' },
        },
      }),
    ).toBe(3);
    const definitionAudits = await prisma.auditLog.findMany({
      where: {
        entityType: 'ProjectRequiredDocument',
        entityId: created.body.id,
        action: { startsWith: 'PROJECT_STAGE_TWO_DOCUMENT_DEFINITION_' },
      },
    });
    expect(definitionAudits).toHaveLength(3);
    expect(JSON.stringify(definitionAudits)).not.toMatch(
      /storageKey|allocatedBudget|checksum|originalFilename/,
    );

    const immutable = await prisma.projectRequiredDocument.create({
      data: {
        organizationId,
        projectId,
        stageKey: 'STAGE_2',
        workstreamKey: 'PLAN',
        documentType: `SUPERSEDED_${run}`,
        documentName: 'Immutable history',
        normalizedName: `immutable ${run}`,
        required: false,
        initialMatrix: true,
        status: 'SUPERSEDED',
        supersededAt: new Date(),
        supersededBy: adminId,
      },
    });
    definitionIds.push(immutable.id);
    await authenticated(
      api().patch(`${stage()}/document-definitions/${immutable.id}`),
      memberEmail,
    )
      .send({ ...input, name: 'Mutated history' })
      .expect(409);
  });

  it('adds, reloads, edits, soft-deletes, and reuses scoped codes with optimistic versions', async () => {
    await authenticated(api().post('/api/v1/tasks'))
      .send({
        title: 'Generic Stage 2 bypass',
        projectId,
        relatedEntityType: 'PROJECT_STAGE_TWO_BASELINE',
      })
      .expect(409);
    const normalTask = await prisma.task.create({
      data: {
        organizationId,
        projectId,
        title: 'Generic task',
        createdBy: adminId,
        updatedBy: adminId,
      },
    });
    await authenticated(api().patch(`/api/v1/tasks/${normalTask.id}`))
      .send({ relatedEntityType: 'PROJECT_STAGE_TWO_BASELINE' })
      .expect(409);
    expect(
      await prisma.task.findUniqueOrThrow({ where: { id: normalTask.id } }),
    ).toMatchObject({
      relatedEntityType: null,
      baselineVersion: null,
      code: null,
    });

    const created = await authenticated(api().put(`${stage()}/plan`))
      .send({ rows: [row('SCOPED')], removedRows: [] })
      .expect(200);
    expect(created.body.plan[0]).toMatchObject({
      code: 'SCOPED',
      allocatedBudget: '1000.50',
      version: 1,
    });
    const original = created.body.plan[0];
    await authenticated(api().patch(`/api/v1/tasks/${original.id}`))
      .send({ title: 'Generic bypass' })
      .expect(409);
    await authenticated(api().delete(`/api/v1/tasks/${original.id}`)).expect(
      409,
    );
    expect(
      await prisma.task.count({
        where: {
          projectId,
          relatedEntityType: 'PROJECT_STAGE_TWO_BASELINE',
          code: 'SCOPED',
          deletedAt: null,
        },
      }),
    ).toBe(1);

    await authenticated(api().put(`${stage()}/plan`))
      .send({ rows: [row('SCOPED')], removedRows: [] })
      .expect(409);
    await authenticated(api().put(`${stage()}/plan`))
      .send({
        rows: [row('BAD-DATE', { startDate: '2026-02-30' })],
        removedRows: [],
      })
      .expect(400);
    await authenticated(api().put(`${stage()}/plan`))
      .send({
        rows: [row('BAD-DEPARTMENT', { departmentId: inactiveDepartmentId })],
        removedRows: [],
      })
      .expect(400);

    const updated = await authenticated(
      api().put(`${stage()}/plan`),
      memberEmail,
    )
      .send({
        rows: [
          {
            ...row('SCOPED', {
              id: original.id,
              version: original.version,
              description: 'Cập nhật không quyền tài chính',
            }),
            allocatedBudget: undefined,
          },
        ],
        removedRows: [],
      })
      .expect(200);
    expect(JSON.stringify(updated.body)).not.toContain('allocatedBudget');
    expect(
      (
        await prisma.task.findUniqueOrThrow({ where: { id: original.id } })
      ).allocatedBudget?.toFixed(2),
    ).toBe('1000.50');
    const next = updated.body.plan[0];

    await authenticated(api().put(`${stage()}/plan`), memberEmail)
      .send({
        rows: [
          {
            ...row('SCOPED', { id: original.id, version: original.version }),
            allocatedBudget: undefined,
          },
        ],
        removedRows: [],
      })
      .expect(409);
    await authenticated(api().put(`${stage()}/plan`))
      .send({ rows: [], removedRows: [{ id: next.id, version: next.version }] })
      .expect(200);
    expect(
      await prisma.task.findUniqueOrThrow({ where: { id: next.id } }),
    ).toMatchObject({ deletedAt: expect.any(Date) });
    const reused = await authenticated(api().put(`${stage()}/plan`))
      .send({ rows: [row('SCOPED')], removedRows: [] })
      .expect(200);
    expect(reused.body.plan).toEqual([
      expect.objectContaining({ code: 'SCOPED', allocatedBudget: '1000.50' }),
    ]);
    expect(
      await prisma.activity.count({
        where: {
          entityType: 'Project',
          entityId: projectId,
          event: 'PROJECT_STAGE_TWO_PLAN_SAVED',
        },
      }),
    ).toBe(4);
    expect(
      await prisma.auditLog.count({
        where: {
          entityType: 'Project',
          entityId: projectId,
          action: 'PROJECT_STAGE_TWO_PLAN_SAVED',
        },
      }),
    ).toBe(4);
  });

  it('returns a valid authorized XLSX and denies non-finance or non-member callers before bytes', async () => {
    const response = await authenticated(api().get(`${stage()}/plan-template`))
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(response.headers['content-type']).toContain(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    const value = new ExcelJS.Workbook();
    await value.xlsx.load(response.body as never);
    expect(
      STAGE_TWO_PLAN_HEADERS.map(
        (_, index) => value.worksheets[0]!.getCell(1, index + 1).text,
      ),
    ).toEqual(STAGE_TWO_PLAN_HEADERS);
    expect(value.worksheets[0]!.actualRowCount).toBe(1);

    const noFinance = await authenticated(
      api().get(`${stage()}/plan-template`),
      memberEmail,
    ).expect(403);
    expect(JSON.stringify(noFinance.body)).not.toMatch(
      /allocatedBudget|1000|PK/,
    );
    const outsider = await authenticated(
      api().get(`${stage()}/plan-template`),
      outsiderEmail,
    ).expect(404);
    expect(JSON.stringify(outsider.body)).not.toMatch(
      /STAGE2-main|xlsx|1000|PK/i,
    );
  });

  it('previews row errors, confirms valid rows once, and hides finance from limited actors', async () => {
    const bytes = await workbook([
      [
        'IM-01',
        'Import hợp lệ',
        `S2A-${run}`,
        '2026-08-16',
        '2026-08-17',
        '25.5',
      ],
      ['SCOPED', 'Trùng cơ sở', `S2A-${run}`, '2026-08-16', '2026-08-17', '10'],
      ['IM-03', 'Phòng ngưng', `S2I-${run}`, '2026-08-16', '2026-08-17', '10'],
    ]);
    const fileAssetId = await createWorkbookAsset(bytes, 'mixed');
    const preview = await authenticated(
      api().post(`${stage()}/plan-import/preview`),
    )
      .send({ fileAssetId })
      .expect(201);
    expect(preview.body).toMatchObject({
      summary: { totalRows: 3, validRows: 1, invalidRows: 2 },
      rows: [
        expect.objectContaining({
          status: 'VALID',
          data: expect.objectContaining({
            code: 'IM-01',
            allocatedBudget: '25.50',
          }),
        }),
        expect.objectContaining({ status: 'INVALID' }),
        expect.objectContaining({ status: 'INVALID' }),
      ],
    });
    expect(JSON.stringify(preview.body)).not.toMatch(
      /storageKey|checksum|storedFilename/,
    );
    expect(
      await prisma.task.count({
        where: { projectId, code: 'IM-01', deletedAt: null },
      }),
    ).toBe(0);
    const confirmed = await authenticated(
      api().post(`${stage()}/plan-import/${preview.body.jobId}/confirm`),
    ).expect(201);
    expect(confirmed.body).toMatchObject({
      jobId: preview.body.jobId,
      status: 'COMPLETED',
      importedRows: 1,
      skippedRows: 2,
    });
    const retry = await authenticated(
      api().post(`${stage()}/plan-import/${preview.body.jobId}/confirm`),
    ).expect(201);
    expect(retry.body).toEqual(confirmed.body);
    expect(
      await prisma.task.count({
        where: { projectId, code: 'IM-01', deletedAt: null },
      }),
    ).toBe(1);
    const importAudit = await prisma.auditLog.findFirstOrThrow({
      where: {
        entityType: 'Project',
        entityId: projectId,
        action: 'PROJECT_STAGE_TWO_PLAN_IMPORTED',
      },
      select: { beforeData: true, afterData: true, metadata: true },
    });
    expect(JSON.stringify(importAudit)).not.toMatch(
      /allocatedBudget|25\.50|987654/i,
    );
    expect(
      await prisma.activity.count({
        where: {
          entityType: 'Project',
          entityId: projectId,
          event: 'PROJECT_STAGE_TWO_PLAN_IMPORTED',
        },
      }),
    ).toBe(1);

    const limitedBytes = await workbook([
      [
        'IM-02',
        'Không ngân sách',
        `S2A-${run}`,
        '2026-08-16',
        '2026-08-17',
        null,
      ],
    ]);
    const limitedFileId = await createWorkbookAsset(limitedBytes, 'limited');
    const limited = await authenticated(
      api().post(`${stage()}/plan-import/preview`),
      memberEmail,
    )
      .send({ fileAssetId: limitedFileId })
      .expect(201);
    expect(JSON.stringify(limited.body)).not.toContain('allocatedBudget');

    const budgetFileId = await createWorkbookAsset(
      await workbook([
        [
          'IM-04',
          'Có ngân sách',
          `S2A-${run}`,
          '2026-08-16',
          '2026-08-17',
          '987654.32',
        ],
      ]),
      'limited-budget',
    );
    const denied = await authenticated(
      api().post(`${stage()}/plan-import/preview`),
      memberEmail,
    )
      .send({ fileAssetId: budgetFileId })
      .expect(403);
    expect(JSON.stringify(denied.body)).not.toMatch(/allocatedBudget|987654/);

    const estimateRead = await prisma.permission.findUniqueOrThrow({
      where: { code: 'estimate.read' },
      select: { id: true },
    });
    await prisma.rolePermission.create({
      data: { roleId: memberRoleId, permissionId: estimateRead.id },
    });
    const readable = await authenticated(
      api().post(`${stage()}/plan-import/preview`),
      memberEmail,
    )
      .send({ fileAssetId: budgetFileId })
      .expect(201);
    expect(readable.body.rows[0].data).toMatchObject({
      code: 'IM-04',
      allocatedBudget: '987654.32',
    });
    const writeDenied = await authenticated(
      api().post(`${stage()}/plan-import/${readable.body.jobId}/confirm`),
      memberEmail,
    ).expect(403);
    expect(JSON.stringify(writeDenied.body)).not.toMatch(/987654|IM-04/);
    expect(
      await prisma.task.count({
        where: { projectId, code: 'IM-04', deletedAt: null },
      }),
    ).toBe(0);
    await prisma.rolePermission.delete({
      where: {
        roleId_permissionId: {
          roleId: memberRoleId,
          permissionId: estimateRead.id,
        },
      },
    });
  });

  it('requires download permission and hides financial workbook bytes', async () => {
    const bytes = await workbook([
      [
        'SEC-01',
        'Workbook bảo mật',
        `S2A-${run}`,
        '2026-08-16',
        '2026-08-17',
        null,
      ],
    ]);
    const ordinaryId = await createWorkbookAsset(bytes, 'download-permission');
    await authenticated(
      api().get(`/api/v1/files/${ordinaryId}/download`),
      memberEmail,
    ).expect(404);
    const downloadPermission = await prisma.permission.findUniqueOrThrow({
      where: { code: 'file.download' },
      select: { id: true },
    });
    await prisma.rolePermission.delete({
      where: {
        roleId_permissionId: {
          roleId: memberRoleId,
          permissionId: downloadPermission.id,
        },
      },
    });
    try {
      await authenticated(
        api().post(`${stage()}/plan-import/preview`),
        memberEmail,
      )
        .send({ fileAssetId: ordinaryId })
        .expect(403);
    } finally {
      await prisma.rolePermission.create({
        data: { roleId: memberRoleId, permissionId: downloadPermission.id },
      });
    }

    const financialId = await createWorkbookAsset(bytes, 'financial-evidence');
    const financialDefinition = await prisma.projectRequiredDocument.create({
      data: {
        organizationId,
        projectId,
        stageKey: 'STAGE_1',
        workstreamKey: 'FINANCIAL_PLANNING',
        documentType: 'PRELIMINARY_FINANCIAL_PLAN',
        documentName: 'Kế hoạch tài chính sơ bộ',
        status: 'DRAFT',
        currentFileAssetId: financialId,
        currentVersion: 1,
      },
    });
    definitionIds.push(financialDefinition.id);
    await authenticated(
      api().post(`${stage()}/plan-import/preview`),
      memberEmail,
    )
      .send({ fileAssetId: financialId })
      .expect(404);
  });

  it('rejects an unrelated same-Project workbook as a plan import source', async () => {
    const unrelatedId = await createWorkbookAsset(
      await workbook([
        [
          'SEC-02',
          'Workbook sai ngữ cảnh',
          `S2A-${run}`,
          '2026-08-16',
          '2026-08-17',
          null,
        ],
      ]),
      'unrelated-project-file',
      { logicalContext: false },
    );
    await authenticated(api().post(`${stage()}/plan-import/preview`))
      .send({ fileAssetId: unrelatedId })
      .expect(404);
  });

  it('reauthorizes the exact completed workbook and rolls back confirm-time duplicates', async () => {
    const unavailableId = await createWorkbookAsset(
      await workbook([
        ['NO-01', 'Chưa xong', `S2A-${run}`, '2026-08-16', '2026-08-17', null],
      ]),
      'unavailable',
      { available: false },
    );
    await authenticated(api().post(`${stage()}/plan-import/preview`))
      .send({ fileAssetId: unavailableId })
      .expect(404);
    const outsideId = await createWorkbookAsset(
      await workbook([
        ['NO-02', 'Sai dự án', `S2A-${run}`, '2026-08-16', '2026-08-17', null],
      ]),
      'outside',
      { project: otherProjectId },
    );
    await authenticated(api().post(`${stage()}/plan-import/preview`))
      .send({ fileAssetId: outsideId })
      .expect(404);
    const oversizedId = await createWorkbookAsset(
      await workbook([
        ['NO-03', 'Quá lớn', `S2A-${run}`, '2026-08-16', '2026-08-17', null],
      ]),
      'oversized',
      { sizeBytes: 5 * 1024 * 1024 + 1 },
    );
    await authenticated(api().post(`${stage()}/plan-import/preview`))
      .send({ fileAssetId: oversizedId })
      .expect(400);

    const transactionId = await createWorkbookAsset(
      await workbook([
        ['TX-01', 'Cạnh tranh', `S2A-${run}`, '2026-08-16', '2026-08-17', null],
      ]),
      'transaction',
    );
    const preview = await authenticated(
      api().post(`${stage()}/plan-import/preview`),
    )
      .send({ fileAssetId: transactionId })
      .expect(201);
    await prisma.task.create({
      data: {
        organizationId,
        projectId,
        relatedEntityType: 'PROJECT_STAGE_TWO_BASELINE',
        relatedEntityId: projectId,
        baselineVersion: 1,
        code: 'TX-01',
        title: 'Concurrent row',
        description: 'Concurrent row',
        departmentId: activeDepartmentId,
        createdBy: adminId,
        updatedBy: adminId,
      },
    });
    await authenticated(
      api().post(`${stage()}/plan-import/${preview.body.jobId}/confirm`),
    ).expect(409);
    expect(
      await prisma.task.count({ where: { projectId, code: 'TX-01' } }),
    ).toBe(1);
    expect(
      await prisma.importJob.findUniqueOrThrow({
        where: { id: preview.body.jobId },
      }),
    ).toMatchObject({ status: 'VALIDATED', importedRows: 0 });
  });

  it('rejects confirmation when the exact workbook context is superseded after preview', async () => {
    const sourceId = await createWorkbookAsset(
      await workbook([
        [
          'STALE-01',
          'Nguồn đã thay đổi',
          `S2A-${run}`,
          '2026-08-16',
          '2026-08-17',
          null,
        ],
      ]),
      'superseded-after-preview',
    );
    const preview = await authenticated(
      api().post(`${stage()}/plan-import/preview`),
    )
      .send({ fileAssetId: sourceId })
      .expect(201);
    const session = await prisma.uploadSession.findUniqueOrThrow({
      where: { fileAssetId: sourceId },
      select: { stageOneDocumentId: true },
    });
    await prisma.projectStageOneDocument.update({
      where: { id: session.stageOneDocumentId! },
      data: { status: 'SUPERSEDED' },
    });

    await authenticated(
      api().post(`${stage()}/plan-import/${preview.body.jobId}/confirm`),
    ).expect(404);
    expect(
      await prisma.task.count({ where: { projectId, code: 'STALE-01' } }),
    ).toBe(0);
    expect(
      await prisma.importJob.findUniqueOrThrow({
        where: { id: preview.body.jobId },
      }),
    ).toMatchObject({ status: 'VALIDATED', importedRows: 0 });
  });

  it('rejects confirmation after a newer file version replaces the previewed workbook', async () => {
    const sourceId = await createWorkbookAsset(
      await workbook([
        [
          'STALE-02',
          'Nguồn không còn là bản hiện tại',
          `S2A-${run}`,
          '2026-08-16',
          '2026-08-17',
          null,
        ],
      ]),
      'replaced-after-preview',
    );
    const preview = await authenticated(
      api().post(`${stage()}/plan-import/preview`),
    )
      .send({ fileAssetId: sourceId })
      .expect(201);
    const session = await prisma.uploadSession.findUniqueOrThrow({
      where: { fileAssetId: sourceId },
      select: { stageOneDocumentId: true },
    });
    const replacementId = await createWorkbookAsset(
      await workbook([]),
      'replacement-current-version',
      { logicalContext: false, attached: false },
    );
    await prisma.projectStageOneDocument.update({
      where: { id: session.stageOneDocumentId! },
      data: { currentFileAssetId: replacementId, currentVersion: 2 },
    });

    await authenticated(
      api().post(`${stage()}/plan-import/${preview.body.jobId}/confirm`),
    ).expect(404);
    expect(
      await prisma.task.count({ where: { projectId, code: 'STALE-02' } }),
    ).toBe(0);
    expect(
      await prisma.importJob.findUniqueOrThrow({
        where: { id: preview.body.jobId },
      }),
    ).toMatchObject({ status: 'VALIDATED', importedRows: 0 });
  });

  it('completes empty Step 1 idempotently without document gates', async () => {
    await prisma.task.updateMany({
      where: {
        projectId,
        relatedEntityType: 'PROJECT_STAGE_TWO_BASELINE',
        deletedAt: null,
      },
      data: { deletedAt: new Date() },
    });
    const first = await authenticated(
      api().post(`${stage()}/steps/1/complete`),
      memberEmail,
    ).expect(201);
    const retry = await authenticated(
      api().post(`${stage()}/steps/1/complete`),
      memberEmail,
    ).expect(201);
    expect(retry.body).toEqual(first.body);
    expect(first.body).toMatchObject({ completed: true, step: 1 });
    expect(
      await prisma.activity.count({
        where: {
          entityType: 'Project',
          entityId: projectId,
          event: 'PROJECT_STAGE_TWO_STEP_ONE_COMPLETED',
        },
      }),
    ).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: {
          entityType: 'Project',
          entityId: projectId,
          action: 'PROJECT_STAGE_TWO_STEP_ONE_COMPLETED',
        },
      }),
    ).toBe(1);
  });
});
