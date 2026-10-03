import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { CurrentActor } from '../access-control/current-actor';
import { REQUIRED_PERMISSIONS } from '../access-control/access.decorators';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma.service';
import {
  CreateProjectDto,
  DeleteProjectDto,
  ProjectStageDecisionDto,
} from './projects.dto';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { SIMPLE_STAGE_ONE_STEPS } from './project-stage-one.rules';
const actor = {
  organizationId: 'organization',
  userId: 'actor',
  organizationMembershipId: 'membership',
  email: 'actor@example.test',
  displayName: 'Actor',
  mustChangePassword: false,
  permissions: [],
  administrationScope: 'MANAGED_DEPARTMENTS',
  managedDepartmentIds: ['sales'],
  administrationTier: 1,
} satisfies CurrentActor;
describe('ProjectsService', () => {
  it('lọc hồ sơ đã ký từ Contract thật, cùng scope/count và phân trang phía dữ liệu', async () => {
    const findMany = vi.fn(),
      count = vi.fn();
    const prisma = {
      project: { findMany, count },
      $transaction: vi.fn().mockResolvedValue([[], 0]),
    } as unknown as PrismaService;
    const service = new ProjectsService(prisma, {} as AuditService);
    await service.list(
      { ...actor, permissions: ['project.read', 'contract.read'] },
      {
        page: 2,
        pageSize: 20,
        active: true,
        commitment: 'SIGNED',
        sort: 'name',
        direction: 'asc',
      },
    );
    const query = findMany.mock.calls[0]![0];
    expect(query.where).toEqual(count.mock.calls[0]![0].where);
    expect(query.where.AND).toContainEqual({
      status: { in: ['PLANNING', 'ACTIVE'] },
    });
    expect(query.where.AND).toContainEqual({
      contracts: {
        some: {
          status: { in: ['SIGNED', 'ACTIVE', 'SUSPENDED', 'COMPLETED'] },
        },
      },
    });
    expect(query).toMatchObject({
      skip: 20,
      take: 20,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    await expect(
      service.list(actor, { page: 1, pageSize: 20, commitment: 'SIGNED' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  const createCommand = {
    name: '  Galaxy Centre  ',
    estimatedInvestmentAmount: '1000000000.50',
    fundingSource: 'PUBLIC_INVESTMENT_2026' as const,
    customerId: 'A6F29D8E-26F5-4E9C-B974-C2E4CAB612E2',
    primaryContactId: 'B6F29D8E-26F5-4E9C-B974-C2E4CAB612E2',
    idempotencyKey: '  create-project-1  ',
  };

  it('keeps the existing POST /projects project.create authorization boundary', () => {
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS,
        ProjectsController.prototype.create,
      ),
    ).toEqual(['project.create']);
  });

  it('accepts only the approved new-Project command fields and keeps money as a decimal string', async () => {
    const dto = plainToInstance(CreateProjectDto, createCommand);

    await expect(
      validate(dto, { whitelist: true, forbidNonWhitelisted: true }),
    ).resolves.toEqual([]);
    expect(dto).toMatchObject({
      name: 'Galaxy Centre',
      estimatedInvestmentAmount: '1000000000.50',
      idempotencyKey: 'create-project-1',
    });

    const legacy = plainToInstance(CreateProjectDto, {
      ...createCommand,
      code: 'SELECTED-PROJECT',
    });
    await expect(
      validate(legacy, { whitelist: true, forbidNonWhitelisted: true }),
    ).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'code' })]),
    );
  });

  it('requires the exact Project code and a bounded non-empty deletion reason', async () => {
    const dto = plainToInstance(DeleteProjectDto, {
      code: '  PRJ-TEST-DELETE  ',
      reason: '  Dự án kiểm thử cho chức năng xóa.  ',
    });

    await expect(
      validate(dto, { whitelist: true, forbidNonWhitelisted: true }),
    ).resolves.toEqual([]);
    expect(dto).toEqual({
      code: 'PRJ-TEST-DELETE',
      reason: 'Dự án kiểm thử cho chức năng xóa.',
    });
    for (const input of [
      { code: '', reason: 'Có lý do' },
      { code: 'PRJ-TEST-DELETE', reason: ' ' },
      { code: 'PRJ-TEST-DELETE', reason: 'x'.repeat(1001) },
    ])
      await expect(
        validate(plainToInstance(DeleteProjectDto, input), {
          whitelist: true,
          forbidNonWhitelisted: true,
        }),
      ).resolves.not.toEqual([]);
  });

  it('tombstones a scoped Project with actor, reason and one transactional audit', async () => {
    const before = {
      id: 'project-delete',
      organizationId: actor.organizationId,
      code: 'PRJ-TEST-DELETE',
      name: 'TEST Project delete',
      status: 'ACTIVE',
      deletedAt: null,
      deletedBy: null,
      deleteReason: null,
      projectOwnerId: actor.userId,
      projectManagerId: null,
      members: [{ userId: actor.userId }],
      departments: [],
    };
    const projectUpdate = vi.fn().mockResolvedValue({
      ...before,
      deletedAt: new Date('2026-09-10T10:00:00.000Z'),
      deletedBy: actor.userId,
      deleteReason: 'Dự án kiểm thử cho chức năng xóa.',
    });
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: before.id }]),
      project: {
        findFirst: vi.fn().mockResolvedValue(before),
        update: projectUpdate,
      },
    };
    const prisma = {
      $transaction: vi.fn((work) => work(tx)),
    } as unknown as PrismaService;
    const audit = { write: vi.fn() } as unknown as AuditService;

    await expect(
      new ProjectsService(prisma, audit).remove(
        { ...actor, permissions: ['project.delete'] },
        before.id,
        {
          code: before.code,
          reason: 'Dự án kiểm thử cho chức năng xóa.',
        },
      ),
    ).resolves.toMatchObject({
      deleted: true,
      alreadyDeleted: false,
      id: before.id,
      status: 'DELETED',
    });
    expect(projectUpdate).toHaveBeenCalledWith({
      where: { id: before.id },
      data: expect.objectContaining({
        deletedAt: expect.any(Date),
        deletedBy: actor.userId,
        deleteReason: 'Dự án kiểm thử cho chức năng xóa.',
        updatedBy: actor.userId,
        version: { increment: 1 },
      }),
    });
    expect(audit.write).toHaveBeenCalledOnce();
    expect(audit.write).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ userId: actor.userId }),
      expect.objectContaining({
        action: 'PROJECT_DELETED',
        entityType: 'Project',
        entityId: before.id,
        beforeData: expect.objectContaining({ status: 'ACTIVE' }),
        afterData: expect.objectContaining({
          status: 'DELETED',
          deleteReason: 'Dự án kiểm thử cho chức năng xóa.',
        }),
      }),
    );
    expect(tx).not.toHaveProperty('contract.deleteMany');
    expect(tx).not.toHaveProperty('fileAsset.deleteMany');
  });

  it('reauthorizes an exact Project-delete retry without writing a duplicate audit', async () => {
    const deleted = {
      id: 'project-delete',
      organizationId: actor.organizationId,
      code: 'PRJ-TEST-DELETE',
      name: 'TEST Project delete',
      status: 'ACTIVE',
      deletedAt: new Date('2026-09-10T10:00:00.000Z'),
      deletedBy: actor.userId,
      deleteReason: 'Dự án kiểm thử cho chức năng xóa.',
      projectOwnerId: actor.userId,
      projectManagerId: null,
      members: [{ userId: actor.userId }],
      departments: [],
    };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: deleted.id }]),
      project: {
        findFirst: vi.fn().mockResolvedValue(deleted),
        update: vi.fn(),
      },
    };
    const audit = { write: vi.fn() } as unknown as AuditService;

    await expect(
      new ProjectsService(
        { $transaction: vi.fn((work) => work(tx)) } as unknown as PrismaService,
        audit,
      ).remove({ ...actor, permissions: ['project.delete'] }, deleted.id, {
        code: deleted.code,
        reason: deleted.deleteReason,
      }),
    ).resolves.toEqual({
      deleted: true,
      alreadyDeleted: true,
      id: deleted.id,
      status: 'DELETED',
    });
    expect(tx.project.update).not.toHaveBeenCalled();
    expect(audit.write).not.toHaveBeenCalled();
  });

  it('rejects a direct Project-delete command when permission was never granted or was revoked', async () => {
    const transaction = vi.fn();
    const prisma = { $transaction: transaction } as unknown as PrismaService;

    await expect(
      new ProjectsService(prisma, {} as AuditService).remove(
        actor,
        'project-delete',
        { code: 'PRJ-TEST-DELETE', reason: 'Không còn sử dụng.' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('creates one idempotent Project command with the actor, exact Stage 1 defaults, and one trail', async () => {
    const projectCreate = vi.fn().mockImplementation(async ({ data }) => ({
      id: data.id,
      code: data.code,
      name: data.name,
      customerId: data.customerId,
      primaryContactId: data.primaryContactId,
      estimatedValue: data.estimatedValue,
      creationIdempotencyKey: data.creationIdempotencyKey,
    }));
    const tx = {
      project: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: projectCreate,
      },
      customer: {
        findFirst: vi.fn().mockResolvedValue({ id: createCommand.customerId }),
      },
      contact: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: createCommand.primaryContactId }),
      },
      projectMember: { create: vi.fn() },
      projectStageState: {
        createMany: vi.fn().mockResolvedValue({ count: 5 }),
        update: vi.fn(),
      },
      projectStageStep: { createMany: vi.fn().mockResolvedValue({ count: 5 }) },
      projectStageOnePlan: { create: vi.fn() },
      projectRequiredDocument: {
        createMany: vi.fn().mockResolvedValue({ count: 5 }),
      },
      projectStageApproval: { create: vi.fn() },
      uploadSession: { create: vi.fn() },
      activity: { create: vi.fn() },
    };
    const prisma = {
      project: { findFirst: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn((work) => work(tx)),
    } as unknown as PrismaService;
    const audit = { write: vi.fn() } as unknown as AuditService;

    const result = await new ProjectsService(prisma, audit).create(
      { ...actor, permissions: ['estimate.create'] },
      createCommand as never,
    );

    expect(result).toEqual({
      id: expect.any(String),
      code: expect.stringMatching(/^PRJ-[0-9A-F]{32}$/),
      stageOneUrl: expect.stringMatching(
        /^\/projects\/[^/]+\/stage-1\?step=1$/,
      ),
    });
    expect(projectCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: result.id,
        code: result.code,
        name: 'Galaxy Centre',
        estimatedValue: expect.objectContaining({
          toFixed: expect.any(Function),
        }),
        creationIdempotencyKey: 'create-project-1',
        organizationId: actor.organizationId,
        customerId: createCommand.customerId.toLowerCase(),
        primaryContactId: createCommand.primaryContactId.toLowerCase(),
      }),
    });
    expect(tx.projectMember.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId: result.id,
        userId: actor.userId,
        role: 'OWNER',
      }),
    });
    expect(tx.projectStageState.createMany).toHaveBeenCalledWith({
      data: [
        { projectId: result.id, stage: 'STAGE_ONE', status: 'IN_PROGRESS' },
        { projectId: result.id, stage: 'STAGE_TWO', status: 'NOT_INITIALIZED' },
        {
          projectId: result.id,
          stage: 'STAGE_THREE',
          status: 'NOT_INITIALIZED',
        },
        {
          projectId: result.id,
          stage: 'STAGE_FOUR',
          status: 'NOT_INITIALIZED',
        },
        {
          projectId: result.id,
          stage: 'STAGE_FIVE',
          status: 'NOT_INITIALIZED',
        },
      ],
    });
    expect(tx.projectStageStep.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ step: 'ASSIGNMENT' }),
        expect.objectContaining({ step: 'SURVEY' }),
        expect.objectContaining({ step: 'PROPOSAL' }),
        expect.objectContaining({ step: 'FINANCIAL_PLANNING' }),
        expect.objectContaining({ step: 'KICKOFF_APPROVAL' }),
      ]),
    });
    expect(tx.projectStageStep.createMany.mock.calls[0]?.[0].data).toHaveLength(
      5,
    );
    expect(tx.projectStageOnePlan.create).toHaveBeenCalledWith({
      data: { projectId: result.id, fundingSource: 'PUBLIC_INVESTMENT_2026' },
    });
    const definitions =
      tx.projectRequiredDocument.createMany.mock.calls[0]?.[0].data;
    expect(definitions).toHaveLength(
      5 + SIMPLE_STAGE_ONE_STEPS.flatMap(({ documents }) => documents).length,
    );
    expect(
      definitions.map(
        ({ documentName }: { documentName: string }) => documentName,
      ),
    ).toEqual([
      'Văn bản chủ trương / Quyết định giao nhiệm vụ',
      'Báo cáo khảo sát & Phương án nhân sự',
      'Hồ sơ Báo cáo Kinh tế - Kỹ thuật',
      'Văn bản xác nhận / Cân đối nguồn vốn',
      'Quyết định phê duyệt Báo cáo Kinh tế - Kỹ thuật',
      ...SIMPLE_STAGE_ONE_STEPS.flatMap(({ documents }) => documents),
    ]);
    expect(
      definitions
        .slice(5)
        .map(
          ({
            workstreamKey,
            documentName,
            initialMatrix,
          }: {
            workstreamKey: string;
            documentName: string;
            initialMatrix: boolean;
          }) => ({ workstreamKey, documentName, initialMatrix }),
        ),
    ).toEqual(
      SIMPLE_STAGE_ONE_STEPS.flatMap(({ step, documents }) =>
        documents.map((documentName) => ({
          workstreamKey: step,
          documentName,
          initialMatrix: false,
        })),
      ),
    );
    expect(tx.activity.create).toHaveBeenCalledOnce();
    expect(audit.write).toHaveBeenCalledOnce();
    expect(tx.projectStageState.update).toHaveBeenCalledWith({
      where: { projectId_stage: { projectId: result.id, stage: 'STAGE_ONE' } },
      data: { documentDefinitionsInitializedAt: expect.any(Date) },
    });
    expect(tx.projectStageApproval.create).not.toHaveBeenCalled();
    expect(tx.uploadSession.create).not.toHaveBeenCalled();
  });

  it('returns the same Project for the same organization/key and conflicts when its payload changes', async () => {
    const existing = {
      id: '11111111-1111-4111-8111-111111111111',
      code: 'PRJ-11111111',
      name: 'Galaxy Centre',
      estimatedValue: { toFixed: () => '1000000000.50' },
      customerId: createCommand.customerId.toLowerCase(),
      primaryContactId: createCommand.primaryContactId.toLowerCase(),
      creationIdempotencyKey: 'create-project-1',
      stageOnePlan: { fundingSource: 'PUBLIC_INVESTMENT_2026' },
    };
    const projectFindFirst = vi.fn().mockResolvedValue(existing);
    const tx = {
      project: {
        findFirst: projectFindFirst,
        create: vi.fn(),
        update: vi.fn(),
      },
    };
    const prisma = {
      project: { findFirst: projectFindFirst },
      $transaction: vi.fn((work) => work(tx)),
    } as unknown as PrismaService;
    const service = new ProjectsService(prisma, {} as AuditService);

    await expect(
      service.create(
        { ...actor, permissions: ['estimate.create'] },
        createCommand as never,
      ),
    ).resolves.toEqual({
      id: existing.id,
      code: existing.code,
      stageOneUrl: `/projects/${existing.id}/stage-1?step=1`,
    });
    expect(tx.project.create).not.toHaveBeenCalled();
    expect(tx.project.update).not.toHaveBeenCalled();

    await expect(
      service.create({ ...actor, permissions: ['estimate.create'] }, {
        ...createCommand,
        name: 'Different Project',
      } as never),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(projectFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: actor.organizationId,
        }),
      }),
    );
  });

  it.each([
    ['name', 'Different Project'],
    ['estimatedInvestmentAmount', '2.00'],
    ['fundingSource', 'PPP'],
    ['customerId', 'C6F29D8E-26F5-4E9C-B974-C2E4CAB612E2'],
    ['primaryContactId', 'D6F29D8E-26F5-4E9C-B974-C2E4CAB612E2'],
  ] as const)(
    'conflicts when retry payload field %s changes',
    async (field, value) => {
      const existing = {
        id: '11111111-1111-4111-8111-111111111111',
        code: 'PRJ-11111111111141118111111111111111',
        name: 'Galaxy Centre',
        estimatedValue: new Prisma.Decimal('1000000000.50'),
        customerId: createCommand.customerId.toLowerCase(),
        primaryContactId: createCommand.primaryContactId.toLowerCase(),
        stageOnePlan: { fundingSource: 'PUBLIC_INVESTMENT_2026' },
      };
      const prisma = {
        project: { findFirst: vi.fn().mockResolvedValue(existing) },
      } as unknown as PrismaService;

      await expect(
        new ProjectsService(prisma, {} as AuditService).create(
          { ...actor, permissions: ['estimate.create'] },
          { ...createCommand, [field]: value } as never,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    },
  );

  it('returns the concurrent winner after an organization/key unique conflict', async () => {
    const winner = {
      id: '11111111-1111-4111-8111-111111111111',
      code: 'PRJ-11111111111141118111111111111111',
      name: 'Galaxy Centre',
      estimatedValue: new Prisma.Decimal('1000000000.50'),
      customerId: createCommand.customerId.toLowerCase(),
      primaryContactId: createCommand.primaryContactId.toLowerCase(),
      stageOnePlan: { fundingSource: 'PUBLIC_INVESTMENT_2026' },
    };
    const unique = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      { code: 'P2002', clientVersion: '6.19.0' },
    );
    const projectFindFirst = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(winner);
    const prisma = {
      project: { findFirst: projectFindFirst },
      $transaction: vi.fn().mockRejectedValue(unique),
    } as unknown as PrismaService;

    await expect(
      new ProjectsService(prisma, {} as AuditService).create(
        { ...actor, permissions: ['estimate.create'] },
        createCommand as never,
      ),
    ).resolves.toEqual({
      id: winner.id,
      code: winner.code,
      stageOneUrl: `/projects/${winner.id}/stage-1?step=1`,
    });
    expect(projectFindFirst).toHaveBeenCalledTimes(2);
  });

  it('does not disclose another actor or deleted Project through an idempotency key', async () => {
    const hidden = {
      id: '11111111-1111-4111-8111-111111111111',
      code: 'PRJ-11111111111141118111111111111111',
      name: 'Galaxy Centre',
      estimatedValue: new Prisma.Decimal('1000000000.50'),
      customerId: createCommand.customerId.toLowerCase(),
      primaryContactId: createCommand.primaryContactId.toLowerCase(),
      stageOnePlan: { fundingSource: 'PUBLIC_INVESTMENT_2026' },
    };
    const projectFindFirst = vi.fn(
      ({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(
          where.createdBy === actor.userId && where.deletedAt === null
            ? null
            : hidden,
        ),
    );
    const prisma = {
      project: { findFirst: projectFindFirst },
      $transaction: vi.fn().mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '6.19.0',
        }),
      ),
    } as unknown as PrismaService;

    await expect(
      new ProjectsService(prisma, {} as AuditService).create(
        { ...actor, permissions: ['estimate.create'] },
        createCommand as never,
      ),
    ).rejects.toThrow('Project code already exists');
    expect(projectFindFirst).toHaveBeenCalledTimes(2);
  });

  it('rejects cross-organization Customer and Contact references before creating anything', async () => {
    const customerFindFirst = vi.fn().mockResolvedValue(null);
    const contactFindFirst = vi.fn().mockResolvedValue(null);
    const tx = {
      project: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
      customer: { findFirst: customerFindFirst },
      contact: { findFirst: contactFindFirst },
      user: { findFirst: vi.fn() },
    };
    const prisma = {
      project: { findFirst: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn((work) => work(tx)),
    } as unknown as PrismaService;

    await expect(
      new ProjectsService(prisma, {} as AuditService).create(
        { ...actor, permissions: ['estimate.create'] },
        createCommand as never,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.project.create).not.toHaveBeenCalled();
    expect(customerFindFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({ organizationId: actor.organizationId }),
    });

    customerFindFirst.mockResolvedValueOnce({ id: createCommand.customerId });
    await expect(
      new ProjectsService(prisma, {} as AuditService).create(
        { ...actor, permissions: ['estimate.create'] },
        createCommand as never,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(contactFindFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        organizationId: actor.organizationId,
        customerId: createCommand.customerId.toLowerCase(),
        deletedAt: null,
      }),
    });
    expect(tx.project.create).not.toHaveBeenCalled();
  });

  it('returns a derived current stage for only actor-visible Project rows', async () => {
    const findMany = vi.fn();
    const item = {
      id: 'project',
      phase: 'SURVEY',
      stageStates: [{ stage: 'STAGE_ONE', status: 'DONE' }],
    };
    const prisma = {
      project: { findMany, count: vi.fn() },
      $transaction: vi.fn().mockResolvedValue([[item], 1]),
    } as unknown as PrismaService;

    await expect(
      new ProjectsService(prisma, {} as AuditService).list(actor, {
        page: 1,
        pageSize: 20,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        items: [
          expect.objectContaining({
            id: 'project',
            canDeleteProject: false,
            currentStage: 'STAGE_2',
            stages: [{ stageKey: 'STAGE_1', status: 'DONE' }],
          }),
        ],
      }),
    );
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({ organizationId: 'organization' }),
          ]),
        }),
        include: expect.objectContaining({
          stageStates: { select: { stage: true, status: true } },
        }),
      }),
    );
  });

  it('filters and counts only actor-visible current-stage rows', async () => {
    const findMany = vi.fn();
    const count = vi.fn();
    const prisma = {
      project: { findMany, count },
      $transaction: vi.fn().mockResolvedValue([[], 0]),
    } as unknown as PrismaService;

    await new ProjectsService(prisma, {} as AuditService).list(actor, {
      page: 2,
      pageSize: 10,
      currentStage: 'STAGE_3',
    });

    const listWhere = findMany.mock.calls[0]?.[0]?.where;
    const countWhere = count.mock.calls[0]?.[0]?.where;
    expect(listWhere).toBeDefined();
    expect(countWhere).toBeDefined();
    expect(listWhere).toEqual(countWhere);
    expect(listWhere!.AND).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ organizationId: 'organization' }),
        expect.objectContaining({ OR: expect.any(Array) }),
      ]),
    );
    expect(JSON.stringify(listWhere)).toContain('TODO');
  });

  it('applies member, owner and department scope inside the list query', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = {
      project: { findMany, count: vi.fn().mockResolvedValue(0) },
      $transaction: vi.fn().mockResolvedValue([[], 0]),
    } as unknown as PrismaService;
    await new ProjectsService(prisma, {} as AuditService).list(actor, {
      page: 1,
      pageSize: 20,
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({ organizationId: 'organization' }),
          ]),
        }),
      }),
    );
  });
  it('limits the mine view to direct project relationships', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = {
      project: { findMany, count: vi.fn().mockResolvedValue(0) },
      $transaction: vi.fn().mockResolvedValue([[], 0]),
    } as unknown as PrismaService;
    await new ProjectsService(prisma, {} as AuditService).list(actor, {
      page: 1,
      pageSize: 20,
      mine: true,
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              OR: expect.arrayContaining([
                { projectManagerId: actor.userId },
                { members: { some: { userId: actor.userId } } },
              ]),
            }),
          ]),
        }),
      }),
    );
  });
  it('filters project financial fields without domain permissions', async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: 'project' });
    const prisma = {
      project: { findFirst },
    } as unknown as PrismaService;
    await expect(
      new ProjectsService(prisma, {} as AuditService).get(actor, 'project'),
    ).resolves.toEqual({ id: 'project' });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        omit: { estimatedValue: true, contractedValue: true },
        include: expect.objectContaining({
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  displayName: true,
                  email: true,
                  status: true,
                },
              },
            },
          },
        }),
      }),
    );
  });
  it('does not expose a Project value outside the estimate permission scope', async () => {
    const scopedActor = {
      ...actor,
      permissions: ['project.read', 'estimate.read'],
      permissionSources: [
        {
          permission: 'project.read',
          roleId: 'project-reader',
          roleName: 'Project reader',
          scopeType: 'ORGANIZATION' as const,
          departmentId: null,
        },
        {
          permission: 'estimate.read',
          roleId: 'estimate-reader',
          roleName: 'Estimate reader',
          scopeType: 'SELF' as const,
          departmentId: null,
        },
      ],
    } satisfies CurrentActor;
    const project = {
      id: 'project-b',
      projectOwnerId: 'other-user',
      projectManagerId: 'other-user',
      members: [],
      departments: [],
      stageStates: [],
      estimatedValue: '999999',
    };
    const prisma = {
      project: { findMany: vi.fn(), count: vi.fn() },
      $transaction: vi.fn().mockResolvedValue([[project], 1]),
    } as unknown as PrismaService;

    const result = await new ProjectsService(prisma, {} as AuditService).list(
      scopedActor,
      { page: 1, pageSize: 20 },
    );

    expect(result.items[0]).not.toHaveProperty('estimatedValue');
  });
  it('returns an actor-scoped, bounded shared Project header with its workspace', async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: 'project',
      code: 'PRJ-001',
      name: 'Lobby',
      customer: { id: 'customer', displayName: 'Galaxy Centre' },
      location: 'Quận 1',
      projectType: 'DESIGN_AND_BUILD',
      salesOwner: { id: 'sales', displayName: 'Sales owner' },
      projectManager: { id: 'pm', displayName: 'Project manager' },
      status: 'ACTIVE',
      healthStatus: 'ON_TRACK',
      phase: 'SURVEY',
      expectedCompletionDate: new Date('2026-12-15T00:00:00.000Z'),
      updatedAt: new Date('2026-08-01T00:00:00.000Z'),
      members: [],
      estimatedValue: '999999',
      contractedValue: '888888',
    });
    const prisma = {
      project: { findFirst },
      survey: { count: vi.fn().mockResolvedValue(0) },
      requirement: { count: vi.fn().mockResolvedValue(0) },
      projectProductLine: { findMany: vi.fn().mockResolvedValue([]) },
      projectRequiredDocument: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'missing-document',
            documentName: 'Báo cáo khảo sát hiện trạng',
            documentType: 'SURVEY_REPORT',
            currentFileAssetId: null,
            dueDate: null,
            required: true,
            stageKey: 'STAGE_1',
            status: 'MISSING',
          },
        ]),
      },
      estimate: { count: vi.fn().mockResolvedValue(0) },
      quotation: { count: vi.fn().mockResolvedValue(0) },
      contract: { count: vi.fn().mockResolvedValue(0) },
      purchaseRequest: { count: vi.fn().mockResolvedValue(0) },
      productionOrder: { count: vi.fn().mockResolvedValue(0) },
      handover: { count: vi.fn().mockResolvedValue(0) },
      projectStageStep: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ step: 'ASSIGNMENT', status: 'DONE' }]),
      },
      projectStageState: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;

    const result = await new ProjectsService(
      prisma,
      {} as AuditService,
    ).workspaceSummary(
      {
        ...actor,
        permissions: ['project.read', 'project.product.view'],
      },
      'project',
    );

    expect(result.project).toEqual({
      id: 'project',
      code: 'PRJ-001',
      name: 'Lobby',
      customer: { id: 'customer', displayName: 'Galaxy Centre' },
      location: 'Quận 1',
      projectType: 'DESIGN_AND_BUILD',
      salesOwner: { id: 'sales', displayName: 'Sales owner' },
      projectManager: { id: 'pm', displayName: 'Project manager' },
      currentStage: 'STAGE_1',
      status: 'ACTIVE',
      healthStatus: 'ON_TRACK',
      expectedCompletionDate: new Date('2026-12-15T00:00:00.000Z'),
    });
    expect(result.project).not.toHaveProperty('estimatedValue');
    expect(result.project).not.toHaveProperty('contractedValue');
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'project',
          organizationId: actor.organizationId,
        }),
      }),
    );
    expect(result.stages[0]).toMatchObject({
      status: 'Đang thực hiện',
      completedSteps: 1,
      totalSteps: 5,
      progressPercent: 20,
    });
    expect(prisma.projectRequiredDocument.findMany).not.toHaveBeenCalled();
  });
  it('derives the workspace stage from done Stage 1 and in-progress later persisted states', async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: 'project',
      code: 'PRJ-001',
      name: 'Lobby',
      customer: null,
      location: null,
      projectType: null,
      salesOwner: null,
      projectManager: null,
      status: 'ACTIVE',
      healthStatus: 'ON_TRACK',
      phase: 'SURVEY',
      expectedCompletionDate: null,
      updatedAt: new Date('2026-08-01T00:00:00.000Z'),
      members: [],
    });
    const projectStageState = {
      findMany: vi.fn().mockResolvedValue([
        {
          stage: 'STAGE_ONE',
          status: 'DONE',
          completedAt: new Date('2026-08-02T00:00:00.000Z'),
          updatedAt: new Date('2026-08-02T00:00:00.000Z'),
        },
        {
          stage: 'STAGE_THREE',
          status: 'IN_PROGRESS',
          completedAt: null,
          updatedAt: new Date('2026-08-03T00:00:00.000Z'),
        },
      ]),
    };
    const prisma = {
      project: { findFirst },
      survey: { count: vi.fn().mockResolvedValue(0) },
      requirement: { count: vi.fn().mockResolvedValue(0) },
      projectProductLine: { findMany: vi.fn().mockResolvedValue([]) },
      projectRequiredDocument: { findMany: vi.fn().mockResolvedValue([]) },
      estimate: { count: vi.fn().mockResolvedValue(0) },
      quotation: { count: vi.fn().mockResolvedValue(0) },
      contract: { count: vi.fn().mockResolvedValue(0) },
      purchaseRequest: { count: vi.fn().mockResolvedValue(0) },
      productionOrder: { count: vi.fn().mockResolvedValue(0) },
      handover: { count: vi.fn().mockResolvedValue(0) },
      projectStageStep: { findMany: vi.fn().mockResolvedValue([]) },
      projectStageState,
    } as unknown as PrismaService;

    const result = await new ProjectsService(
      prisma,
      {} as AuditService,
    ).workspaceSummary(actor, 'project');

    expect(result.project.currentStage).toBe('STAGE_3');
    expect(result.stages[0]).toMatchObject({
      status: 'Hoàn thành',
      progressPercent: 0,
    });
    expect(projectStageState.findMany).toHaveBeenCalledWith({
      where: { projectId: 'project' },
      select: {
        stage: true,
        status: true,
        completedAt: true,
        updatedAt: true,
      },
    });
  });
  it('returns five independent overview cards with exactly five Stage 1 steps and no invented later progress', async () => {
    const activityCreate = vi.fn();
    const audit = { write: vi.fn() } as unknown as AuditService;
    const prisma = {
      project: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'project',
          code: 'PRJ-001',
          name: 'Lobby',
          customer: null,
          location: null,
          projectType: null,
          salesOwner: null,
          projectManager: null,
          status: 'ACTIVE',
          healthStatus: 'ON_TRACK',
          phase: 'SURVEY',
          expectedCompletionDate: null,
          updatedAt: new Date('2026-08-01T00:00:00.000Z'),
          members: [],
        }),
      },
      projectStageStep: {
        findMany: vi.fn().mockResolvedValue([
          {
            step: 'KICKOFF_APPROVAL',
            status: 'TODO',
            updatedAt: new Date('2026-08-01T00:00:00.000Z'),
          },
          {
            step: 'ASSIGNMENT',
            status: 'DONE',
            updatedAt: new Date('2026-08-02T00:00:00.000Z'),
          },
          {
            step: 'SURVEY',
            status: 'DONE',
            updatedAt: new Date('2026-08-03T00:00:00.000Z'),
          },
          {
            step: 'PROPOSAL',
            status: 'IN_PROGRESS',
            updatedAt: new Date('2026-08-04T00:00:00.000Z'),
          },
          {
            step: 'FINANCIAL_PLANNING',
            status: 'TODO',
            updatedAt: new Date('2026-08-01T00:00:00.000Z'),
          },
        ]),
      },
      projectStageState: {
        findMany: vi.fn().mockResolvedValue([
          {
            stage: 'STAGE_ONE',
            status: 'IN_PROGRESS',
            completedAt: null,
            updatedAt: new Date('2026-08-04T00:00:00.000Z'),
          },
          {
            stage: 'STAGE_TWO',
            status: 'DONE',
            completedAt: new Date('2026-08-05T00:00:00.000Z'),
            updatedAt: new Date('2026-08-05T00:00:00.000Z'),
          },
          {
            stage: 'STAGE_THREE',
            status: 'BLOCKED',
            completedAt: null,
            updatedAt: new Date('2026-08-06T00:00:00.000Z'),
          },
          {
            stage: 'STAGE_FOUR',
            status: 'CANCELLED',
            completedAt: null,
            updatedAt: new Date('2026-08-07T00:00:00.000Z'),
          },
          {
            stage: 'STAGE_FIVE',
            status: 'NOT_INITIALIZED',
            completedAt: null,
            updatedAt: new Date('2026-08-01T00:00:00.000Z'),
          },
        ]),
      },
      activity: { create: activityCreate },
    } as unknown as PrismaService;

    const result = await new ProjectsService(prisma, audit).workspaceSummary(
      actor,
      'project',
    );

    expect(result.stages).toHaveLength(5);
    expect(
      result.stages.map(({ stageKey, title, objective }) => ({
        stageKey,
        title,
        objective,
      })),
    ).toEqual([
      {
        stageKey: 'STAGE_1',
        title: 'GĐ 1 — KHỞI TẠO, HỒ SƠ DỰ ÁN & PHÊ DUYỆT',
        objective:
          'Hoàn thiện thông tin khởi tạo, hồ sơ chủ chốt và quy trình phê duyệt ban đầu.',
      },
      {
        stageKey: 'STAGE_2',
        title: 'GĐ 2 — THIẾT KẾ, SẢN PHẨM & DỰ TOÁN',
        objective:
          'Quản lý khảo sát, thiết kế, lựa chọn sản phẩm, vật liệu, kích thước, BOQ, dự toán và phê duyệt.',
      },
      {
        stageKey: 'STAGE_3',
        title: 'GĐ 3 — THƯƠNG MẠI, HỢP ĐỒNG & MUA HÀNG',
        objective:
          'Quản lý báo giá, thương lượng, hợp đồng khách hàng, nhà cung cấp, RFQ, PO, PI và kế hoạch mua hàng.',
      },
      {
        stageKey: 'STAGE_4',
        title: 'GĐ 4 — SẢN XUẤT, LOGISTICS, KHO & LẮP ĐẶT',
        objective:
          'Quản lý sản xuất, QC, vận chuyển, hải quan, nhập kho, giao hàng, lắp đặt và tiến độ thực hiện.',
      },
      {
        stageKey: 'STAGE_5',
        title: 'GĐ 5 — NGHIỆM THU, BÀN GIAO & BẢO HÀNH',
        objective:
          'Quản lý nghiệm thu, punch list, bàn giao, quyết toán, tài sản khách hàng, bảo hành và hậu mãi.',
      },
    ]);
    expect(result.stages.map(({ status }) => status)).toEqual([
      'Đang thực hiện',
      'Hoàn thành',
      'Cần xử lý',
      'Tạm dừng',
      'Chưa bắt đầu',
    ]);
    expect(result.stages[0]).toMatchObject({
      stageKey: 'STAGE_1',
      completedSteps: 2,
      totalSteps: 5,
      progressPercent: 40,
      updatedAt: new Date('2026-08-04T00:00:00.000Z'),
      nextAction: 'Tiếp tục Lập & Thẩm định hồ sơ đề xuất',
    });
    for (const stage of result.stages.slice(1)) {
      expect(stage.completedSteps).toBeNull();
      expect(stage.totalSteps).toBeNull();
      expect(stage.progressPercent).toBeNull();
    }
    expect(prisma.projectStageStep.findMany).toHaveBeenCalledWith({
      where: { projectId: 'project', stage: 'STAGE_ONE' },
      select: { step: true, status: true, updatedAt: true },
    });
    expect(activityCreate).not.toHaveBeenCalled();
    expect(audit.write).not.toHaveBeenCalled();
  });
  it.each([
    ['CANCELLED', 'TODO', 'Tạm dừng', 'Xem công việc đã tạm dừng'],
    ['BLOCKED', 'TODO', 'Cần xử lý', 'Xử lý công việc đang bị chặn'],
    ['DONE', 'TODO', 'Hoàn thành', 'Xem kết quả giai đoạn'],
    ['NOT_APPLICABLE', 'TODO', 'Hoàn thành', 'Xem kết quả giai đoạn'],
    ['BYPASSED_WITH_APPROVAL', 'TODO', 'Hoàn thành', 'Xem kết quả giai đoạn'],
    ['IN_PROGRESS', 'TODO', 'Đang thực hiện', 'Tiếp tục Tiếp nhận & Phân công'],
    ['TODO', 'TODO', 'Đang thực hiện', 'Tiếp tục Tiếp nhận & Phân công'],
    [
      undefined,
      'IN_PROGRESS',
      'Đang thực hiện',
      'Tiếp tục Tiếp nhận & Phân công',
    ],
    [
      undefined,
      'IN_REVIEW',
      'Đang thực hiện',
      'Tiếp tục Tiếp nhận & Phân công',
    ],
    [
      'NOT_INITIALIZED',
      'TODO',
      'Chưa bắt đầu',
      'Bắt đầu Tiếp nhận & Phân công',
    ],
    [undefined, 'TODO', 'Chưa bắt đầu', 'Bắt đầu Tiếp nhận & Phân công'],
  ] as const)(
    'maps Stage 1 state %s and own Step %s to a truthful visible status and next action',
    async (stageStatus, stepStatus, visibleStatus, nextAction) => {
      const prisma = {
        project: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'project',
            code: 'PRJ-001',
            name: 'Lobby',
            customer: null,
            location: null,
            projectType: null,
            salesOwner: null,
            projectManager: null,
            status: 'ACTIVE',
            healthStatus: 'ON_TRACK',
            phase: 'SURVEY',
            expectedCompletionDate: null,
            members: [],
          }),
        },
        projectStageStep: {
          findMany: vi.fn().mockResolvedValue([
            {
              step: 'ASSIGNMENT',
              status: stepStatus,
              updatedAt: new Date('2026-08-01T00:00:00.000Z'),
            },
          ]),
        },
        projectStageState: {
          findMany: vi.fn().mockResolvedValue(
            stageStatus
              ? [
                  {
                    stage: 'STAGE_ONE',
                    status: stageStatus,
                    completedAt: null,
                    updatedAt: new Date('2026-08-02T00:00:00.000Z'),
                  },
                ]
              : [],
          ),
        },
      } as unknown as PrismaService;

      const result = await new ProjectsService(
        prisma,
        {} as AuditService,
      ).workspaceSummary(actor, 'project');

      expect(result.stages[0]).toMatchObject({
        status: visibleStatus,
        nextAction,
      });
    },
  );
  it.each([
    ['DONE', ['BLOCKED'], 'Hoàn thành', 'Xem kết quả giai đoạn'],
    ['NOT_APPLICABLE', ['BLOCKED'], 'Hoàn thành', 'Xem kết quả giai đoạn'],
    [
      'BYPASSED_WITH_APPROVAL',
      ['BLOCKED'],
      'Hoàn thành',
      'Xem kết quả giai đoạn',
    ],
    [
      'BLOCKED',
      ['DONE', 'DONE', 'DONE', 'DONE', 'DONE'],
      'Cần xử lý',
      'Xử lý công việc đang bị chặn',
    ],
    ['CANCELLED', ['TODO'], 'Tạm dừng', 'Xem công việc đã tạm dừng'],
    [
      'CANCELLED',
      ['DONE', 'DONE', 'DONE', 'DONE', 'DONE'],
      'Tạm dừng',
      'Xem công việc đã tạm dừng',
    ],
  ] as const)(
    'keeps terminal Stage 1 %s authoritative over mixed Step records',
    async (stageStatus, stepStatuses, visibleStatus, nextAction) => {
      const steps = [
        'ASSIGNMENT',
        'SURVEY',
        'PROPOSAL',
        'FINANCIAL_PLANNING',
        'KICKOFF_APPROVAL',
      ] as const;
      const prisma = {
        project: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'project',
            code: 'PRJ-001',
            name: 'Lobby',
            customer: null,
            location: null,
            projectType: null,
            salesOwner: null,
            projectManager: null,
            status: 'ACTIVE',
            healthStatus: 'ON_TRACK',
            phase: 'SURVEY',
            expectedCompletionDate: null,
            members: [],
          }),
        },
        projectStageStep: {
          findMany: vi.fn().mockResolvedValue(
            stepStatuses.map((status, index) => ({
              step: steps[index],
              status,
              updatedAt: new Date('2026-08-01T00:00:00.000Z'),
            })),
          ),
        },
        projectStageState: {
          findMany: vi.fn().mockResolvedValue([
            {
              stage: 'STAGE_ONE',
              status: stageStatus,
              completedAt: null,
              updatedAt: new Date('2026-08-02T00:00:00.000Z'),
            },
          ]),
        },
      } as unknown as PrismaService;

      const result = await new ProjectsService(
        prisma,
        {} as AuditService,
      ).workspaceSummary(actor, 'project');

      expect(result.stages[0]).toMatchObject({
        status: visibleStatus,
        nextAction,
      });
    },
  );
  it('uses the newest own Stage timestamp even when completedAt is older than updatedAt', async () => {
    const prisma = {
      project: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'project',
          code: 'PRJ-001',
          name: 'Lobby',
          customer: null,
          location: null,
          projectType: null,
          salesOwner: null,
          projectManager: null,
          status: 'ACTIVE',
          healthStatus: 'ON_TRACK',
          phase: 'SURVEY',
          expectedCompletionDate: null,
          members: [],
        }),
      },
      projectStageStep: { findMany: vi.fn().mockResolvedValue([]) },
      projectStageState: {
        findMany: vi.fn().mockResolvedValue([
          {
            stage: 'STAGE_TWO',
            status: 'DONE',
            completedAt: new Date('2026-08-05T00:00:00.000Z'),
            updatedAt: new Date('2026-08-09T00:00:00.000Z'),
          },
        ]),
      },
    } as unknown as PrismaService;

    const result = await new ProjectsService(
      prisma,
      {} as AuditService,
    ).workspaceSummary(actor, 'project');

    expect(result.stages[1]?.updatedAt).toEqual(
      new Date('2026-08-09T00:00:00.000Z'),
    );
  });
  it('rejects generic Project financial writes without field permissions', async () => {
    const prisma = {
      project: {
        create: vi.fn(),
        findFirst: vi.fn().mockResolvedValue({ id: 'project' }),
        update: vi.fn(),
      },
    } as unknown as PrismaService;
    const service = new ProjectsService(prisma, {} as AuditService);

    await expect(
      service.create(actor, createCommand as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.update(actor, 'project', { contractedValue: 1 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.project.create).not.toHaveBeenCalled();
    expect(prisma.project.update).not.toHaveBeenCalled();
  });
  it('rejects sorting by a hidden estimate value', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = {
      project: { findMany, count: vi.fn().mockResolvedValue(0) },
      $transaction: vi.fn().mockResolvedValue([[], 0]),
    } as unknown as PrismaService;
    await expect(
      new ProjectsService(prisma, {} as AuditService).list(actor, {
        page: 1,
        pageSize: 20,
        sort: 'estimatedValue',
        direction: 'asc',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(findMany).not.toHaveBeenCalled();
  });
  it('returns full actor-scoped dashboard counts and per-currency estimated values', async () => {
    const count = vi
      .fn()
      .mockResolvedValueOnce(47)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(0);
    const groupBy = vi.fn().mockResolvedValue([
      {
        currency: 'VND',
        _sum: { estimatedValue: { toString: () => '123456789012345678.90' } },
      },
      {
        currency: 'USD',
        _sum: { estimatedValue: { toString: () => '42.50' } },
      },
    ]);
    const prisma = {
      project: { count, groupBy },
    } as unknown as PrismaService;

    await expect(
      new ProjectsService(prisma, {} as AuditService).dashboard(
        { ...actor, permissions: ['project.read', 'estimate.read'] },
        new Date('2026-08-01T12:00:00.000Z'),
      ),
    ).resolves.toEqual({
      total: 47,
      active: 5,
      needsAttention: 3,
      completed: 0,
      permittedCommands: { create: false },
      estimatedValues: [
        { currency: 'VND', value: '123456789012345678.90' },
        { currency: 'USD', value: '42.50' },
      ],
    });
    const scope = {
      organizationId: 'organization',
      deletedAt: null,
      OR: [
        { projectOwnerId: 'actor' },
        { projectManagerId: 'actor' },
        { members: { some: { userId: 'actor' } } },
        { departments: { some: { departmentId: { in: ['sales'] } } } },
      ],
    };
    expect(count).toHaveBeenNthCalledWith(1, { where: scope });
    for (const [{ where }] of count.mock.calls.slice(1)) {
      expect(where).toEqual(
        expect.objectContaining({
          AND: expect.arrayContaining([expect.objectContaining(scope)]),
        }),
      );
    }
    expect(groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ['currency'],
        _sum: { estimatedValue: true },
        where: scope,
      }),
    );
  });
  it('aggregates estimates only across Projects in both read and finance scope', async () => {
    const count = vi.fn().mockResolvedValue(0);
    const groupBy = vi.fn().mockResolvedValue([]);
    const scopedActor = {
      ...actor,
      permissions: ['project.read', 'estimate.read'],
      permissionSources: [
        {
          permission: 'project.read',
          roleId: 'project-reader',
          roleName: 'Project reader',
          scopeType: 'ORGANIZATION' as const,
          departmentId: null,
        },
        {
          permission: 'estimate.read',
          roleId: 'estimate-reader',
          roleName: 'Estimate reader',
          scopeType: 'SELF' as const,
          departmentId: null,
        },
      ],
    } satisfies CurrentActor;
    const prisma = { project: { count, groupBy } } as unknown as PrismaService;

    await new ProjectsService(prisma, {} as AuditService).dashboard(
      scopedActor,
    );

    expect(groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({}),
            expect.objectContaining({ OR: expect.any(Array) }),
          ]),
        }),
      }),
    );
  });
  it('returns the required portfolio counts and backend-derived create capability', async () => {
    const count = vi
      .fn()
      .mockResolvedValueOnce(47)
      .mockResolvedValueOnce(34)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(10);
    const prisma = {
      project: { count },
    } as unknown as PrismaService;

    await expect(
      new ProjectsService(prisma, {} as AuditService).dashboard(
        { ...actor, permissions: ['project.create'] },
        new Date('2026-08-01T12:00:00.000Z'),
      ),
    ).resolves.toEqual({
      total: 47,
      active: 34,
      needsAttention: 3,
      completed: 10,
      permittedCommands: { create: true },
    });
    expect(count).toHaveBeenNthCalledWith(2, {
      where: expect.objectContaining({
        AND: expect.arrayContaining([
          expect.objectContaining({ status: 'ACTIVE' }),
        ]),
      }),
    });
    expect(count).toHaveBeenNthCalledWith(3, {
      where: expect.objectContaining({
        AND: expect.arrayContaining([
          expect.objectContaining({
            OR: expect.arrayContaining([
              { healthStatus: { in: ['AT_RISK', 'OFF_TRACK'] } },
              { status: 'ON_HOLD' },
              {
                expectedCompletionDate: {
                  lt: new Date('2026-08-01T12:00:00.000Z'),
                },
              },
            ]),
          }),
          expect.objectContaining({
            status: { notIn: ['COMPLETED', 'CANCELLED'] },
          }),
        ]),
      }),
    });
    expect(count).toHaveBeenNthCalledWith(4, {
      where: expect.objectContaining({
        AND: expect.arrayContaining([
          expect.objectContaining({ status: 'COMPLETED' }),
        ]),
      }),
    });
  });
  it('returns contract value by currency only for actor-visible projects', async () => {
    const count = vi.fn().mockResolvedValue(0);
    const findMany = vi.fn().mockResolvedValue([{ id: 'project-1' }]);
    const groupBy = vi.fn().mockResolvedValue([
      {
        currency: 'VND',
        _sum: { currentValue: { toString: () => '5000000.50' } },
      },
    ]);
    const prisma = {
      project: { count, findMany },
      contract: { groupBy },
    } as unknown as PrismaService;

    await expect(
      new ProjectsService(prisma, {} as AuditService).dashboard(
        { ...actor, permissions: ['contract.read'] },
        new Date('2026-08-01T12:00:00.000Z'),
      ),
    ).resolves.toEqual({
      total: 0,
      active: 0,
      needsAttention: 0,
      completed: 0,
      permittedCommands: { create: false },
      contractValues: [{ currency: 'VND', value: '5000000.50' }],
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { id: true },
        where: expect.objectContaining({ organizationId: 'organization' }),
      }),
    );
    expect(groupBy).toHaveBeenCalledWith({
      by: ['currency'],
      where: {
        organizationId: 'organization',
        projectId: { in: ['project-1'] },
        status: { in: ['SIGNED', 'ACTIVE', 'SUSPENDED', 'COMPLETED'] },
      },
      _sum: { currentValue: true },
    });
  });
  it('returns received values by currency only with receivable read permission', async () => {
    const count = vi.fn().mockResolvedValue(0);
    const findMany = vi.fn().mockResolvedValue([{ id: 'project-1' }]);
    const groupBy = vi.fn().mockResolvedValue([
      {
        currency: 'USD',
        _sum: { amount: { toString: () => '100.25' } },
      },
    ]);
    const prisma = {
      project: { count, findMany },
      customerPayment: { groupBy },
      customerPaymentSchedule: { groupBy: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;

    await expect(
      new ProjectsService(prisma, {} as AuditService).dashboard(
        { ...actor, permissions: ['receivable.read'] },
        new Date('2026-08-01T12:00:00.000Z'),
      ),
    ).resolves.toEqual({
      total: 0,
      active: 0,
      needsAttention: 0,
      completed: 0,
      permittedCommands: { create: false },
      receivedValues: [{ currency: 'USD', value: '100.25' }],
      receivableValues: [],
    });
    expect(groupBy).toHaveBeenCalledWith({
      by: ['currency'],
      where: {
        organizationId: 'organization',
        projectId: { in: ['project-1'] },
      },
      _sum: { amount: true },
    });
  });
  it('returns outstanding receivables by currency only with receivable read permission', async () => {
    const count = vi.fn().mockResolvedValue(0);
    const findMany = vi.fn().mockResolvedValue([{ id: 'project-1' }]);
    const groupBy = vi.fn().mockResolvedValue([
      {
        currency: 'VND',
        _sum: { outstandingAmount: { toString: () => '999.00' } },
      },
    ]);
    const prisma = {
      project: { count, findMany },
      customerPayment: { groupBy: vi.fn().mockResolvedValue([]) },
      customerPaymentSchedule: { groupBy },
    } as unknown as PrismaService;

    await expect(
      new ProjectsService(prisma, {} as AuditService).dashboard(
        { ...actor, permissions: ['receivable.read'] },
        new Date('2026-08-01T12:00:00.000Z'),
      ),
    ).resolves.toEqual({
      total: 0,
      active: 0,
      needsAttention: 0,
      completed: 0,
      permittedCommands: { create: false },
      receivedValues: [],
      receivableValues: [{ currency: 'VND', value: '999.00' }],
    });
    expect(groupBy).toHaveBeenCalledWith({
      by: ['currency'],
      where: {
        organizationId: 'organization',
        projectId: { in: ['project-1'] },
      },
      _sum: { outstandingAmount: true },
    });
  });
  it('returns outstanding payables by currency only with supplier payable read permission', async () => {
    const count = vi.fn().mockResolvedValue(0);
    const findMany = vi.fn().mockResolvedValue([{ id: 'project-1' }]);
    const groupBy = vi.fn().mockResolvedValue([
      {
        currency: 'THB',
        _sum: { outstandingAmount: { toString: () => '700.00' } },
      },
    ]);
    const prisma = {
      project: { count, findMany },
      supplierPayable: { groupBy },
    } as unknown as PrismaService;

    await expect(
      new ProjectsService(prisma, {} as AuditService).dashboard(
        { ...actor, permissions: ['supplier_payable.read'] },
        new Date('2026-08-01T12:00:00.000Z'),
      ),
    ).resolves.toEqual({
      total: 0,
      active: 0,
      needsAttention: 0,
      completed: 0,
      permittedCommands: { create: false },
      payableValues: [{ currency: 'THB', value: '700.00' }],
    });
    expect(groupBy).toHaveBeenCalledWith({
      by: ['currency'],
      where: {
        organizationId: 'organization',
        projectId: { in: ['project-1'] },
      },
      _sum: { outstandingAmount: true },
    });
  });
  it('counts only actor-assigned pending approvals with the stage review permission', async () => {
    const count = vi.fn().mockResolvedValue(0);
    const findMany = vi.fn().mockResolvedValue([{ id: 'project-1' }]);
    const approvalCount = vi.fn().mockResolvedValue(2);
    const prisma = {
      project: { count, findMany },
      projectStageApproval: { count: approvalCount },
    } as unknown as PrismaService;

    await expect(
      new ProjectsService(prisma, {} as AuditService).dashboard(
        { ...actor, permissions: ['project.stage1.review'] },
        new Date('2026-08-01T12:00:00.000Z'),
      ),
    ).resolves.toEqual({
      total: 0,
      active: 0,
      needsAttention: 0,
      completed: 0,
      permittedCommands: { create: false },
      pendingApprovals: 2,
    });
    expect(approvalCount).toHaveBeenCalledWith({
      where: {
        projectId: { in: ['project-1'] },
        stage: 'STAGE_ONE',
        status: 'PENDING',
        reviewedBy: 'actor',
      },
    });
  });
  it('counts due warranty assets only with warranty read permission', async () => {
    const count = vi.fn().mockResolvedValue(0);
    const findMany = vi.fn().mockResolvedValue([{ id: 'project-1' }]);
    const warrantyCount = vi.fn().mockResolvedValue(4);
    const prisma = {
      project: { count, findMany },
      warrantyAsset: { count: warrantyCount },
    } as unknown as PrismaService;
    const now = new Date('2026-08-01T12:00:00.000Z');

    await expect(
      new ProjectsService(prisma, {} as AuditService).dashboard(
        { ...actor, permissions: ['warranty.read'] },
        now,
      ),
    ).resolves.toEqual({
      total: 0,
      active: 0,
      needsAttention: 0,
      completed: 0,
      permittedCommands: { create: false },
      dueWarrantyAssets: 4,
    });
    expect(warrantyCount).toHaveBeenCalledWith({
      where: {
        organizationId: 'organization',
        projectId: { in: ['project-1'] },
        status: { in: ['ACTIVE', 'EXPIRING'] },
        warrantyEnd: { lte: new Date('2026-08-31T12:00:00.000Z') },
      },
    });
  });
  it('counts due service tickets only with service ticket read permission', async () => {
    const count = vi.fn().mockResolvedValue(0);
    const findMany = vi.fn().mockResolvedValue([{ id: 'project-1' }]);
    const ticketCount = vi.fn().mockResolvedValue(3);
    const prisma = {
      project: { count, findMany },
      serviceTicket: { count: ticketCount },
    } as unknown as PrismaService;
    const now = new Date('2026-08-01T12:00:00.000Z');

    await expect(
      new ProjectsService(prisma, {} as AuditService).dashboard(
        { ...actor, permissions: ['service_ticket.read'] },
        now,
      ),
    ).resolves.toEqual({
      total: 0,
      active: 0,
      needsAttention: 0,
      completed: 0,
      permittedCommands: { create: false },
      dueServiceTickets: 3,
    });
    expect(ticketCount).toHaveBeenCalledWith({
      where: {
        organizationId: 'organization',
        projectId: { in: ['project-1'] },
        status: { notIn: ['CLOSED', 'CANCELLED'] },
        slaDueAt: { lte: new Date('2026-08-02T12:00:00.000Z') },
      },
    });
  });
  it('omits financial aggregates and never derives dashboard totals from a page', async () => {
    const count = vi
      .fn()
      .mockResolvedValueOnce(47)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(0);
    const groupBy = vi.fn();
    const findMany = vi.fn();
    const prisma = {
      project: { count, groupBy, findMany },
    } as unknown as PrismaService;

    await expect(
      new ProjectsService(prisma, {} as AuditService).dashboard(
        actor,
        new Date('2026-08-01T12:00:00.000Z'),
      ),
    ).resolves.toEqual({
      total: 47,
      active: 5,
      needsAttention: 3,
      completed: 0,
      permittedCommands: { create: false },
    });
    expect(groupBy).not.toHaveBeenCalled();
    expect(findMany).not.toHaveBeenCalled();
  });
  it('omits all-null currency groups rather than manufacturing a zero total', async () => {
    const prisma = {
      project: {
        count: vi.fn().mockResolvedValue(0),
        groupBy: vi
          .fn()
          .mockResolvedValue([
            { currency: 'VND', _sum: { estimatedValue: null } },
          ]),
      },
    } as unknown as PrismaService;

    await expect(
      new ProjectsService(prisma, {} as AuditService).dashboard(
        { ...actor, permissions: ['estimate.read'] },
        new Date('2026-08-01T12:00:00.000Z'),
      ),
    ).resolves.toEqual({
      total: 0,
      active: 0,
      needsAttention: 0,
      completed: 0,
      permittedCommands: { create: false },
      estimatedValues: [],
    });
  });
  it('does not expose workspace document records or query hidden domains', async () => {
    const prisma = {
      project: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'project',
          expectedCompletionDate: null,
          updatedAt: new Date('2026-08-01T00:00:00.000Z'),
          customer: { id: 'customer' },
          projectManager: null,
          members: [],
        }),
      },
      survey: { count: vi.fn().mockResolvedValue(0) },
      requirement: { count: vi.fn().mockResolvedValue(0) },
      projectProductLine: { findMany: vi.fn().mockResolvedValue([]) },
      projectRequiredDocument: { findMany: vi.fn().mockResolvedValue([]) },
      estimate: { count: vi.fn().mockResolvedValue(0) },
      quotation: { count: vi.fn().mockResolvedValue(0) },
      contract: { count: vi.fn().mockResolvedValue(0) },
      purchaseRequest: { count: vi.fn().mockResolvedValue(0) },
      productionOrder: { count: vi.fn().mockResolvedValue(0) },
      handover: { count: vi.fn().mockResolvedValue(0) },
      projectStageStep: { findMany: vi.fn().mockResolvedValue([]) },
      projectStageState: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: vi.fn((queries) => Promise.all(queries)),
    } as unknown as PrismaService;

    const result = await new ProjectsService(
      prisma,
      {} as AuditService,
    ).workspaceSummary(actor, 'project');

    expect(result).not.toHaveProperty('requiredDocuments');
    expect(result).not.toHaveProperty('stage2');
    expect(result).not.toHaveProperty('redFlags');
    expect(prisma.projectProductLine.findMany).not.toHaveBeenCalled();
    expect(prisma.estimate.count).not.toHaveBeenCalled();
  });
  it('uses all five canonical Stage 1 step statuses without querying document metadata', async () => {
    const projectStageStep = { findMany: vi.fn().mockResolvedValue([]) };
    const projectRequiredDocument = { findMany: vi.fn().mockResolvedValue([]) };
    const prisma = {
      project: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'project',
          expectedCompletionDate: null,
          updatedAt: new Date('2026-08-01T00:00:00.000Z'),
          customer: { id: 'customer' },
          projectManager: null,
          members: [],
        }),
      },
      projectProductLine: { findMany: vi.fn().mockResolvedValue([]) },
      projectRequiredDocument,
      projectStageStep,
      projectStageState: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;

    await new ProjectsService(prisma, {} as AuditService).workspaceSummary(
      {
        ...actor,
        permissions: ['project.read', 'project.product.view'],
      },
      'project',
    );

    expect(projectStageStep.findMany).toHaveBeenCalledOnce();
    expect(projectStageStep.findMany).toHaveBeenCalledWith({
      where: { projectId: 'project', stage: 'STAGE_ONE' },
      select: { step: true, status: true, updatedAt: true },
    });
    expect(projectRequiredDocument.findMany).not.toHaveBeenCalled();
  });
  it('adds an active member without changing authorization roles', async () => {
    const tx = {
      project: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: 'project', phase: 'SURVEY' }),
      },
      projectMember: { upsert: vi.fn().mockResolvedValue({ id: 'member' }) },
      user: { findFirst: vi.fn().mockResolvedValue({ id: 'user' }) },
      activity: { create: vi.fn() },
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'project' }]),
    };
    const prisma = {
      activity: { findMany: vi.fn() },
      $transaction: vi.fn((work) => work(tx)),
    } as unknown as PrismaService;
    await new ProjectsService(prisma, {} as AuditService).addMember(
      { ...actor, permissions: ['project.manage_members'] },
      'project',
      'user',
      'DESIGNER',
    );
    expect(tx.projectMember.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.not.objectContaining({ permissions: expect.anything() }),
      }),
    );
    expect(tx.activity.create).toHaveBeenCalledOnce();
  });
  it.each([
    ['update', 'project.update'],
    ['delete', 'project.delete'],
  ] as const)(
    'does not use organization-wide project.read to authorize a scoped %s',
    async (operation, permission) => {
      const projectUpdate = vi.fn().mockResolvedValue({
        id: 'project-b',
        members: [],
        departments: [],
      });
      const projectFindFirst = vi.fn(({ where }) =>
        Promise.resolve(
          'AND' in where
            ? null
            : {
                id: 'project-b',
                phase: 'SURVEY',
                members: [],
                departments: [],
              },
        ),
      );
      const prisma = {
        project: { findFirst: projectFindFirst, update: projectUpdate },
        $transaction: vi.fn((work) =>
          work({
            project: { findFirst: projectFindFirst, update: projectUpdate },
            $queryRaw: vi.fn().mockResolvedValue([{ id: 'project-b' }]),
          }),
        ),
      } as unknown as PrismaService;
      const scopedActor = {
        ...actor,
        permissions: ['project.read', permission],
        permissionSources: [
          {
            permission: 'project.read',
            roleId: 'read-role',
            roleName: 'Reader',
            scopeType: 'ORGANIZATION' as const,
            departmentId: null,
          },
          {
            permission,
            roleId: 'action-role',
            roleName: 'Scoped action',
            scopeType: 'SELF' as const,
            departmentId: null,
          },
        ],
      } satisfies CurrentActor;
      const service = new ProjectsService(prisma, {} as AuditService);

      await expect(
        operation === 'update'
          ? service.update(scopedActor, 'project-b', { name: 'Blocked' })
          : service.remove(scopedActor, 'project-b', {
              code: 'PRJ-B',
              reason: 'Không còn sử dụng.',
            }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(projectUpdate).not.toHaveBeenCalled();
    },
  );
  it('does not let organization-wide project.read bootstrap membership outside project.manage_members scope', async () => {
    const memberUpsert = vi.fn();
    const activityCreate = vi.fn();
    const projectFindFirst = vi.fn(({ where }) =>
      Promise.resolve('AND' in where ? null : { id: 'project-b' }),
    );
    const tx = {
      project: { findFirst: projectFindFirst },
      projectMember: { upsert: memberUpsert },
      user: { findFirst: vi.fn().mockResolvedValue({ id: actor.userId }) },
      activity: { create: activityCreate },
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'project-b' }]),
    };
    const prisma = {
      project: { findFirst: projectFindFirst },
      user: tx.user,
      $transaction: vi.fn((work) => work(tx)),
    } as unknown as PrismaService;
    const scopedActor = {
      ...actor,
      permissions: ['project.read', 'project.manage_members'],
      permissionSources: [
        {
          permission: 'project.read',
          roleId: 'read-role',
          roleName: 'Reader',
          scopeType: 'ORGANIZATION' as const,
          departmentId: null,
        },
        {
          permission: 'project.manage_members',
          roleId: 'member-role',
          roleName: 'Member manager',
          scopeType: 'SELF' as const,
          departmentId: null,
        },
      ],
    } satisfies CurrentActor;

    await expect(
      new ProjectsService(prisma, {} as AuditService).addMember(
        scopedActor,
        'project-b',
        actor.userId,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(memberUpsert).not.toHaveBeenCalled();
    expect(activityCreate).not.toHaveBeenCalled();
  });
  it('requires estimate.update on the same Project as project.update', async () => {
    const projectUpdate = vi.fn();
    const projectFindFirst = vi.fn(({ where }) =>
      Promise.resolve('AND' in where ? null : { id: 'project-b' }),
    );
    const tx = {
      project: { findFirst: projectFindFirst, update: projectUpdate },
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'project-b' }]),
    };
    const prisma = {
      project: tx.project,
      $transaction: vi.fn((work) => work(tx)),
    } as unknown as PrismaService;
    const scopedActor = {
      ...actor,
      permissions: ['project.read', 'project.update', 'estimate.update'],
      permissionSources: [
        {
          permission: 'project.read',
          roleId: 'read-role',
          roleName: 'Reader',
          scopeType: 'ORGANIZATION' as const,
          departmentId: null,
        },
        {
          permission: 'project.update',
          roleId: 'update-role',
          roleName: 'Updater',
          scopeType: 'ORGANIZATION' as const,
          departmentId: null,
        },
        {
          permission: 'estimate.update',
          roleId: 'estimate-role',
          roleName: 'Estimate updater',
          scopeType: 'SELF' as const,
          departmentId: null,
        },
      ],
    } satisfies CurrentActor;

    await expect(
      new ProjectsService(prisma, {} as AuditService).update(
        scopedActor,
        'project-b',
        { estimatedValue: 1 },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(projectUpdate).not.toHaveBeenCalled();
  });
  it('rejects skipped phase transitions', async () => {
    const tx = {
      project: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: 'project', phase: 'SURVEY' }),
      },
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'project' }]),
    };
    const prisma = {
      $transaction: vi.fn((work) => work(tx)),
    } as unknown as PrismaService;
    await expect(
      new ProjectsService(prisma, {} as AuditService).changePhase(
        { ...actor, permissions: ['project.change_phase'] },
        'project',
        'DESIGN',
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  describe('generic stage access and commands', () => {
    const visibleProject = {
      id: 'project',
      code: 'PRJ-001',
      name: 'Project',
      customer: { id: 'customer', displayName: 'Customer' },
      location: 'Bangkok',
      projectType: 'DESIGN_AND_BUILD',
      projectOwner: { id: 'owner', displayName: 'Owner' },
      salesOwner: { id: 'sales', displayName: 'Sales' },
      projectManager: { id: 'manager', displayName: 'Manager' },
      entryStage: 'STAGE_ONE',
      phase: 'SURVEY',
      status: 'ACTIVE',
      healthStatus: 'ON_TRACK',
      expectedCompletionDate: null,
      members: [],
      departments: [{ departmentId: 'sales' }],
      requiredDocuments: [],
      stageStates: [
        { stage: 'STAGE_ONE', status: 'IN_PROGRESS' },
        { stage: 'STAGE_TWO', status: 'NOT_INITIALIZED' },
        { stage: 'STAGE_THREE', status: 'NOT_INITIALIZED' },
        { stage: 'STAGE_FOUR', status: 'NOT_INITIALIZED' },
        { stage: 'STAGE_FIVE', status: 'NOT_INITIALIZED' },
      ],
    };

    it.each([
      [
        'STAGE_1',
        'STAGE_FIVE',
        { ...actor, permissions: ['project.read'] as string[] },
        { canSwitchProject: true, canManageProjectAccess: false },
      ],
      [
        'STAGE_5',
        'STAGE_ONE',
        {
          ...actor,
          permissions: ['project.read', 'project.manage_members'] as string[],
        },
        { canSwitchProject: true, canManageProjectAccess: true },
      ],
    ] as const)(
      'opens %s while the current state is on another stage without mutation',
      async (requestedStage, activeStage, currentActor, capabilities) => {
        const project = {
          ...visibleProject,
          estimatedValue: '999',
          contractedValue: '888',
          stageStates: visibleProject.stageStates.map((state) => ({
            ...state,
            status:
              state.stage === activeStage ? 'IN_PROGRESS' : 'NOT_INITIALIZED',
          })),
        };
        const projectOptionsFindMany = vi.fn().mockResolvedValue([
          { id: 'project', code: 'PRJ-001', name: 'Project' },
          { id: 'project-2', code: 'PRJ-002', name: 'Project 2' },
        ]);
        const prisma = {
          project: {
            findFirst: vi.fn().mockResolvedValue(project),
            findMany: projectOptionsFindMany,
            update: vi.fn(),
          },
        } as unknown as PrismaService;

        const result = await new ProjectsService(
          prisma,
          {} as AuditService,
        ).stage(currentActor, 'project', requestedStage);

        expect(result.project.currentStage).toBe(
          activeStage === 'STAGE_ONE' ? 'STAGE_1' : 'STAGE_5',
        );
        expect(result.state.stageKey).toBe(requestedStage);
        expect(result.project).not.toHaveProperty('estimatedValue');
        expect(result.project).not.toHaveProperty('contractedValue');
        expect(result.options.projects).toEqual([
          { id: 'project', code: 'PRJ-001', name: 'Project' },
          { id: 'project-2', code: 'PRJ-002', name: 'Project 2' },
        ]);
        expect(result.capabilities).toEqual(capabilities);
        expect(projectOptionsFindMany).toHaveBeenCalledWith({
          where: {
            organizationId: currentActor.organizationId,
            deletedAt: null,
            OR: [
              { projectOwnerId: currentActor.userId },
              { projectManagerId: currentActor.userId },
              { members: { some: { userId: currentActor.userId } } },
              {
                departments: {
                  some: {
                    departmentId: { in: currentActor.managedDepartmentIds },
                  },
                },
              },
            ],
          },
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          select: { id: true, code: true, name: true },
        });
        expect(prisma.project.update).not.toHaveBeenCalled();
      },
    );

    it.each([
      ['STAGE_2', ['STAGE_ONE']],
      ['STAGE_3', ['STAGE_ONE', 'STAGE_TWO']],
      ['STAGE_4', ['STAGE_ONE', 'STAGE_TWO', 'STAGE_THREE']],
      ['STAGE_5', ['STAGE_ONE', 'STAGE_TWO', 'STAGE_THREE', 'STAGE_FOUR']],
    ] as const)(
      'opens %s with incomplete earlier stages and no inherited warnings',
      async (requestedStage, incompleteStages) => {
        const prisma = {
          project: {
            findFirst: vi.fn().mockResolvedValue(visibleProject),
            findMany: vi.fn().mockResolvedValue([]),
          },
        } as unknown as PrismaService;

        const result = await new ProjectsService(
          prisma,
          {} as AuditService,
        ).stage(actor, 'project', requestedStage);

        expect(result.state.stageKey).toBe(requestedStage);
        for (const stage of incompleteStages)
          expect(
            visibleProject.stageStates.find((state) => state.stage === stage)
              ?.status,
          ).not.toBe('DONE');
        expect(result).not.toHaveProperty('upstreamWarnings');
      },
    );

    it('returns template-owned completion policy with scoped stage documents', async () => {
      const prisma = {
        project: {
          findFirst: vi.fn().mockResolvedValue({
            ...visibleProject,
            requiredDocuments: [
              { id: 'supporting-document', documentType: 'PROPOSAL' },
              { id: 'approval-document', documentType: 'KICKOFF_APPROVAL' },
            ],
          }),
          findMany: vi.fn().mockResolvedValue([]),
        },
      } as unknown as PrismaService;

      await expect(
        new ProjectsService(prisma, {} as AuditService).stage(
          actor,
          'project',
          'STAGE_1',
        ),
      ).resolves.toMatchObject({
        requiredDocuments: [
          { id: 'supporting-document', completionPolicy: 'FILE_PRESENT' },
          { id: 'approval-document', completionPolicy: 'APPROVED' },
        ],
      });
    });

    it('never returns FileAsset identifiers from the generic stage workspace', async () => {
      const findFirst = vi.fn().mockResolvedValue({
        ...visibleProject,
        requiredDocuments: [
          {
            id: 'supporting-document',
            documentType: 'PROPOSAL',
            currentFileAssetId: 'private-file-capability',
          },
        ],
      });
      const prisma = {
        project: {
          findFirst,
          findMany: vi.fn().mockResolvedValue([]),
        },
      } as unknown as PrismaService;

      const result = await new ProjectsService(
        prisma,
        {} as AuditService,
      ).stage(actor, 'project', 'STAGE_1');

      expect(JSON.stringify(result)).not.toContain('private-file-capability');
      expect(
        findFirst.mock.calls[0]?.[0]?.select?.requiredDocuments.select,
      ).not.toHaveProperty('currentFileAssetId');
    });

    it('uses non-disclosing project visibility for a stage read', async () => {
      const findFirst = vi.fn().mockResolvedValue(null);
      const prisma = {
        project: { findFirst, findMany: vi.fn().mockResolvedValue([]) },
      } as unknown as PrismaService;

      await expect(
        new ProjectsService(prisma, {} as AuditService).stage(
          actor,
          'hidden-project',
          'STAGE_3',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'hidden-project',
            organizationId: actor.organizationId,
          }),
        }),
      );
    });

    it('returns a not-applicable stage as viewable and read-only', async () => {
      const prisma = {
        project: {
          findFirst: vi.fn().mockResolvedValue({
            ...visibleProject,
            stageStates: visibleProject.stageStates.map((state) =>
              state.stage === 'STAGE_THREE'
                ? {
                    ...state,
                    status: 'NOT_APPLICABLE',
                    decisionReason: 'Không áp dụng mua sắm',
                    decisionBy: 'actor',
                    decisionAt: new Date('2026-08-07T00:00:00.000Z'),
                    decisionApprovalId: null,
                  }
                : state,
            ),
          }),
          findMany: vi.fn().mockResolvedValue([]),
        },
      } as unknown as PrismaService;

      await expect(
        new ProjectsService(prisma, {} as AuditService).stage(
          {
            ...actor,
            permissions: [
              'project.read',
              'project.update',
              'project.stage.bypass',
            ],
          },
          'project',
          'STAGE_3',
        ),
      ).resolves.toMatchObject({
        state: {
          stageKey: 'STAGE_3',
          status: 'NOT_APPLICABLE',
          readOnly: true,
          decisionReason: 'Không áp dụng mua sắm',
        },
        permittedCommands: { initialize: false, decide: true },
      });
    });

    it('uses Project type applicability and never offers initialization from a read permission twice', async () => {
      const prisma = {
        project: {
          findFirst: vi.fn().mockResolvedValue({
            ...visibleProject,
            projectType: 'DESIGN_ONLY',
          }),
          findMany: vi.fn().mockResolvedValue([]),
        },
      } as unknown as PrismaService;

      await expect(
        new ProjectsService(prisma, {} as AuditService).stage(
          actor,
          'project',
          'STAGE_4',
        ),
      ).resolves.toMatchObject({
        project: { salesOwner: { id: 'sales' } },
        state: { readOnly: true },
        templateApplicability: { applicable: false },
        permittedCommands: { initialize: false },
      });
    });

    it('rejects initialization of a template-inapplicable stage before mutation', async () => {
      const tx = {
        project: {
          findFirst: vi.fn().mockResolvedValue({
            ...visibleProject,
            projectType: 'DESIGN_ONLY',
          }),
        },
        projectStageState: { updateMany: vi.fn(), createMany: vi.fn() },
        activity: { create: vi.fn() },
      };
      const prisma = {
        $transaction: vi.fn((work) => work(tx)),
      } as unknown as PrismaService;

      await expect(
        new ProjectsService(prisma, {} as AuditService).initializeStage(
          { ...actor, permissions: ['project.update'] },
          'project',
          'STAGE_4',
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'STAGE_NOT_APPLICABLE' }),
      });
      expect(tx.projectStageState.updateMany).not.toHaveBeenCalled();
      expect(tx.projectStageState.createMany).not.toHaveBeenCalled();
    });

    it('initializes once and records one Activity without changing current stage', async () => {
      const state = {
        id: 'state-1',
        stage: 'STAGE_ONE',
        status: 'NOT_INITIALIZED',
        version: 1,
      };
      const updateMany = vi
        .fn()
        .mockImplementationOnce(async () => {
          state.status = 'IN_PROGRESS';
          state.version += 1;
          return { count: 1 };
        })
        .mockResolvedValue({ count: 0 });
      const tx = {
        project: {
          findFirst: vi.fn().mockImplementation(async () => ({
            ...visibleProject,
            projectType: 'DESIGN_AND_BUILD',
            stageStates: [state],
          })),
          update: vi.fn(),
        },
        projectStageState: { updateMany },
        activity: { create: vi.fn() },
      };
      const prisma = {
        $transaction: vi.fn((work) => work(tx)),
      } as unknown as PrismaService;
      const service = new ProjectsService(prisma, {} as AuditService);
      const editor = { ...actor, permissions: ['project.update'] };

      await expect(
        service.initializeStage(editor, 'project', 'STAGE_1'),
      ).resolves.toMatchObject({ initialized: true, status: 'IN_PROGRESS' });
      await expect(
        service.initializeStage(editor, 'project', 'STAGE_1'),
      ).resolves.toMatchObject({ initialized: false, status: 'IN_PROGRESS' });

      expect(tx.activity.create).toHaveBeenCalledOnce();
      expect(tx.project.update).not.toHaveBeenCalled();
    });

    it('returns an empty requirement set for a stage with no approved defaults', async () => {
      const tx = {
        project: {
          findFirst: vi.fn().mockResolvedValue({
            ...visibleProject,
            stageStates: [
              {
                id: 'state-4',
                stage: 'STAGE_FOUR',
                status: 'NOT_INITIALIZED',
                version: 1,
              },
            ],
          }),
        },
        projectStageState: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        projectRequiredDocument: { upsert: vi.fn() },
        activity: { create: vi.fn() },
      };
      const prisma = {
        $transaction: vi.fn((work) => work(tx)),
      } as unknown as PrismaService;

      await expect(
        new ProjectsService(prisma, {} as AuditService).initializeStage(
          { ...actor, permissions: ['project.update'] },
          'project',
          'STAGE_4',
        ),
      ).resolves.toMatchObject({ requirements: [] });
      expect(tx.projectRequiredDocument.upsert).not.toHaveBeenCalled();
    });

    it('creates a missing legacy stage once and records its initialization', async () => {
      const tx = {
        project: {
          findFirst: vi.fn().mockResolvedValue({
            ...visibleProject,
            stageStates: [],
          }),
        },
        projectStageState: {
          createMany: vi.fn().mockResolvedValue({ count: 1 }),
          updateMany: vi.fn(),
        },
        activity: { create: vi.fn() },
      };
      const prisma = {
        $transaction: vi.fn((work) => work(tx)),
      } as unknown as PrismaService;

      await expect(
        new ProjectsService(prisma, {} as AuditService).initializeStage(
          { ...actor, permissions: ['project.update'] },
          'project',
          'STAGE_5',
        ),
      ).resolves.toMatchObject({ initialized: true, status: 'IN_PROGRESS' });
      expect(tx.projectStageState.createMany).toHaveBeenCalledWith({
        data: [
          { projectId: 'project', stage: 'STAGE_FIVE', status: 'IN_PROGRESS' },
        ],
        skipDuplicates: true,
      });
      expect(tx.activity.create).toHaveBeenCalledOnce();
    });

    it('claims a concurrently created not-initialized legacy state', async () => {
      const tx = {
        project: {
          findFirst: vi.fn().mockResolvedValue({
            ...visibleProject,
            stageStates: [],
          }),
        },
        projectStageState: {
          createMany: vi.fn().mockResolvedValue({ count: 0 }),
          findUnique: vi.fn().mockResolvedValue({
            id: 'concurrent-state',
            status: 'NOT_INITIALIZED',
            version: 1,
          }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        activity: { create: vi.fn() },
      };
      const prisma = {
        $transaction: vi.fn((work) => work(tx)),
      } as unknown as PrismaService;

      await expect(
        new ProjectsService(prisma, {} as AuditService).initializeStage(
          { ...actor, permissions: ['project.update'] },
          'project',
          'STAGE_3',
        ),
      ).resolves.toMatchObject({ initialized: true, status: 'IN_PROGRESS' });
      expect(tx.projectStageState.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'concurrent-state',
          status: 'NOT_INITIALIZED',
          version: 1,
        },
        data: { status: 'IN_PROGRESS', version: { increment: 1 } },
      });
      expect(tx.activity.create).toHaveBeenCalledOnce();
    });

    it('rereads the winner after a zero-count initialize claim', async () => {
      const tx = {
        project: {
          findFirst: vi.fn().mockResolvedValue({
            ...visibleProject,
            stageStates: [
              {
                id: 'state-3',
                stage: 'STAGE_THREE',
                status: 'NOT_INITIALIZED',
                version: 1,
              },
            ],
          }),
        },
        projectStageState: {
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          findUnique: vi.fn().mockResolvedValue({ status: 'BLOCKED' }),
        },
        activity: { create: vi.fn() },
      };
      const prisma = {
        $transaction: vi.fn((work) => work(tx)),
      } as unknown as PrismaService;

      await expect(
        new ProjectsService(prisma, {} as AuditService).initializeStage(
          { ...actor, permissions: ['project.update'] },
          'project',
          'STAGE_3',
        ),
      ).resolves.toMatchObject({ initialized: false, status: 'BLOCKED' });
      expect(tx.projectStageState.findUnique).toHaveBeenCalled();
      expect(tx.activity.create).not.toHaveBeenCalled();
    });

    it('returns a structured blocker when a configured owner lacks active organization membership', async () => {
      const tx = {
        project: {
          findFirst: vi.fn().mockResolvedValue({
            ...visibleProject,
            projectOwnerId: 'owner',
            salesOwnerId: 'sales',
            projectManagerId: 'manager',
          }),
        },
        user: {
          findMany: vi
            .fn()
            .mockResolvedValue([{ id: 'manager' }, { id: 'sales' }]),
        },
        projectStageState: { updateMany: vi.fn() },
        activity: { create: vi.fn() },
      };
      const prisma = {
        $transaction: vi.fn((work) => work(tx)),
      } as unknown as PrismaService;

      await expect(
        new ProjectsService(prisma, {} as AuditService).initializeStage(
          { ...actor, permissions: ['project.update'] },
          'project',
          'STAGE_2',
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'INACTIVE_PROJECT_OWNER',
          blockers: [expect.objectContaining({ userId: 'owner' })],
        }),
      });
      expect(tx.projectStageState.updateMany).not.toHaveBeenCalled();
    });

    it('treats a legacy TODO stage as initialized and in progress', async () => {
      const project = {
        ...visibleProject,
        stageStates: [
          { id: 'legacy', stage: 'STAGE_TWO', status: 'TODO', version: 1 },
        ],
      };
      const tx = {
        project: { findFirst: vi.fn().mockResolvedValue(project) },
        projectStageState: { updateMany: vi.fn(), createMany: vi.fn() },
      };
      const prisma = {
        project: {
          findFirst: vi.fn().mockResolvedValue(project),
          findMany: vi.fn().mockResolvedValue([]),
        },
        $transaction: vi.fn((work) => work(tx)),
      } as unknown as PrismaService;
      const service = new ProjectsService(prisma, {} as AuditService);

      await expect(
        service.stage(actor, 'project', 'STAGE_2'),
      ).resolves.toMatchObject({
        project: { currentStage: 'STAGE_2' },
        state: { status: 'IN_PROGRESS' },
      });
      await expect(
        service.initializeStage(
          { ...actor, permissions: ['project.update'] },
          'project',
          'STAGE_2',
        ),
      ).resolves.toMatchObject({ initialized: false, status: 'IN_PROGRESS' });
      expect(tx.projectStageState.updateMany).not.toHaveBeenCalled();
      expect(tx.projectStageState.createMany).not.toHaveBeenCalled();
    });

    it('rejects an unauthorized or reasonless bypass before mutation', async () => {
      const prisma = {
        $transaction: vi.fn(),
        projectStageState: { updateMany: vi.fn() },
      } as unknown as PrismaService;
      const service = new ProjectsService(prisma, {} as AuditService);

      await expect(
        service.decideStage(actor, 'project', 'STAGE_2', {
          decision: 'BYPASSED_WITH_APPROVAL',
          reason: 'Approved exception',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        service.decideStage(
          { ...actor, permissions: ['project.stage.bypass'] },
          'project',
          'STAGE_2',
          { decision: 'BYPASSED_WITH_APPROVAL', reason: '   ' },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('validates a supplied approval and audits the stage bypass without changing current stage', async () => {
      const updateMany = vi.fn().mockResolvedValue({ count: 1 });
      const tx = {
        project: {
          findFirst: vi.fn().mockResolvedValue({
            ...visibleProject,
            stageStates: [
              {
                id: 'state-2',
                stage: 'STAGE_TWO',
                status: 'NOT_INITIALIZED',
                version: 2,
              },
            ],
          }),
          update: vi.fn(),
        },
        projectStageApproval: {
          findFirst: vi.fn().mockResolvedValue({ id: 'approval' }),
        },
        projectStageState: { updateMany },
        activity: { create: vi.fn() },
      };
      const prisma = {
        $transaction: vi.fn((work) => work(tx)),
      } as unknown as PrismaService;

      await expect(
        new ProjectsService(prisma, {} as AuditService).decideStage(
          { ...actor, permissions: ['project.stage.bypass'] },
          'project',
          'STAGE_2',
          {
            decision: 'BYPASSED_WITH_APPROVAL',
            reason: '  Phê duyệt ngoại lệ  ',
            approvalId: '8f359385-c028-49b2-85d0-fb53f537504e',
          },
        ),
      ).resolves.toMatchObject({
        status: 'BYPASSED_WITH_APPROVAL',
        reason: 'Phê duyệt ngoại lệ',
      });
      expect(tx.projectStageApproval.findFirst).toHaveBeenCalledWith({
        where: {
          id: '8f359385-c028-49b2-85d0-fb53f537504e',
          projectId: 'project',
          stage: 'STAGE_TWO',
          status: 'APPROVED',
        },
        select: { id: true },
      });
      expect(updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'BYPASSED_WITH_APPROVAL',
            decisionReason: 'Phê duyệt ngoại lệ',
            decisionBy: actor.userId,
            decisionApprovalId: '8f359385-c028-49b2-85d0-fb53f537504e',
            decisionAt: expect.any(Date),
          }),
        }),
      );
      expect(tx.activity.create).toHaveBeenCalledOnce();
      expect(tx.project.update).not.toHaveBeenCalled();
    });

    it('records a decision directly on a missing legacy stage state', async () => {
      const tx = {
        project: {
          findFirst: vi.fn().mockResolvedValue({
            ...visibleProject,
            stageStates: [],
          }),
        },
        projectStageState: {
          createMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        activity: { create: vi.fn() },
      };
      const prisma = {
        $transaction: vi.fn((work) => work(tx)),
      } as unknown as PrismaService;

      await expect(
        new ProjectsService(prisma, {} as AuditService).decideStage(
          { ...actor, permissions: ['project.stage.bypass'] },
          'project',
          'STAGE_5',
          { decision: 'NOT_APPLICABLE', reason: 'Không áp dụng' },
        ),
      ).resolves.toMatchObject({ status: 'NOT_APPLICABLE' });
      expect(tx.projectStageState.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            projectId: 'project',
            stage: 'STAGE_FIVE',
            status: 'NOT_APPLICABLE',
            decisionReason: 'Không áp dụng',
            decisionBy: actor.userId,
          }),
        ],
        skipDuplicates: true,
      });
      expect(tx.activity.create).toHaveBeenCalledOnce();
    });

    it('rereads an idempotent winner after a zero-count decision claim', async () => {
      const desired = {
        status: 'BYPASSED_WITH_APPROVAL',
        decisionReason: 'Ngoại lệ',
        decisionBy: 'other',
        decisionAt: new Date('2026-08-07T01:00:00.000Z'),
        decisionApprovalId: null,
      };
      const tx = {
        project: {
          findFirst: vi.fn().mockResolvedValue({
            ...visibleProject,
            stageStates: [
              {
                id: 'state-2',
                stage: 'STAGE_TWO',
                status: 'NOT_INITIALIZED',
                version: 1,
              },
            ],
          }),
        },
        projectStageState: {
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          findUnique: vi.fn().mockResolvedValue(desired),
        },
        activity: { create: vi.fn() },
      };
      const prisma = {
        $transaction: vi.fn((work) => work(tx)),
      } as unknown as PrismaService;

      await expect(
        new ProjectsService(prisma, {} as AuditService).decideStage(
          { ...actor, permissions: ['project.stage.bypass'] },
          'project',
          'STAGE_2',
          { decision: 'BYPASSED_WITH_APPROVAL', reason: 'Ngoại lệ' },
        ),
      ).resolves.toMatchObject({
        status: 'BYPASSED_WITH_APPROVAL',
        unchanged: true,
      });
      expect(tx.projectStageState.findUnique).toHaveBeenCalled();
      expect(tx.activity.create).not.toHaveBeenCalled();
    });

    it('does not overwrite a different winner after a missing-state create conflict', async () => {
      const tx = {
        project: {
          findFirst: vi.fn().mockResolvedValue({
            ...visibleProject,
            stageStates: [],
          }),
        },
        projectStageState: {
          createMany: vi.fn().mockResolvedValue({ count: 0 }),
          findUnique: vi.fn().mockResolvedValue({
            id: 'winner',
            stage: 'STAGE_FIVE',
            status: 'NOT_APPLICABLE',
            decisionReason: 'Winner decision',
            decisionBy: 'other',
            decisionAt: new Date('2026-08-07T02:00:00.000Z'),
            decisionApprovalId: null,
            version: 1,
          }),
          updateMany: vi.fn(),
        },
        activity: { create: vi.fn() },
      };
      const prisma = {
        $transaction: vi.fn((work) => work(tx)),
      } as unknown as PrismaService;

      await expect(
        new ProjectsService(prisma, {} as AuditService).decideStage(
          { ...actor, permissions: ['project.stage.bypass'] },
          'project',
          'STAGE_5',
          { decision: 'BYPASSED_WITH_APPROVAL', reason: 'Losing decision' },
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(tx.projectStageState.updateMany).not.toHaveBeenCalled();
      expect(tx.activity.create).not.toHaveBeenCalled();
    });

    it('validates the generic stage decision DTO', async () => {
      const dto = Object.assign(new ProjectStageDecisionDto(), {
        decision: 'DONE',
        reason: '',
        approvalId: 'not-a-uuid',
      });

      await expect(validate(dto)).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ property: 'decision' }),
          expect.objectContaining({ property: 'reason' }),
          expect.objectContaining({ property: 'approvalId' }),
        ]),
      );
    });

    it('forwards the generic stage routes without accepting client status', async () => {
      const projects = {
        stage: vi.fn().mockResolvedValue({
          state: { status: 'NOT_INITIALIZED' },
          templateApplicability: { applicable: true },
          permittedCommands: { initialize: true },
        }),
        initializeStage: vi.fn().mockResolvedValue({}),
        decideStage: vi.fn().mockResolvedValue({}),
      };
      const stageOne = {
        initialize: vi.fn().mockResolvedValue({ initialized: true }),
      };
      projects.initializeStage.mockResolvedValueOnce({
        initialized: true,
        status: 'IN_PROGRESS',
      });
      const controller = new ProjectsController(
        projects as unknown as ProjectsService,
        stageOne as never,
        { initializeDocumentDefinitions: vi.fn() } as never,
      );
      const decision = {
        decision: 'NOT_APPLICABLE' as const,
        reason: 'No procurement',
      };

      await controller.stage(actor, 'project', 'STAGE_5');
      await expect(
        controller.initializeStage(actor, 'project', 'STAGE_1'),
      ).resolves.toMatchObject({ initialized: true, status: 'IN_PROGRESS' });
      await controller.decideStage(actor, 'project', 'STAGE_5', decision);

      expect(projects.stage).toHaveBeenCalledWith(actor, 'project', 'STAGE_5');
      expect(projects.initializeStage).toHaveBeenCalledWith(
        actor,
        'project',
        'STAGE_1',
      );
      expect(stageOne.initialize).toHaveBeenCalledWith(actor, 'project');
      expect(projects.decideStage).toHaveBeenCalledWith(
        actor,
        'project',
        'STAGE_5',
        decision,
      );
    });

    it.each(['NOT_APPLICABLE', 'BYPASSED_WITH_APPROVAL'])(
      'does not run Stage 1 orchestration for terminal %s state',
      async (status) => {
        const projects = {
          stage: vi.fn().mockResolvedValue({
            state: { status },
            templateApplicability: { applicable: true },
            permittedCommands: { initialize: false },
          }),
          initializeStage: vi.fn(),
        };
        const stageOne = { initialize: vi.fn() };
        const controller = new ProjectsController(
          projects as unknown as ProjectsService,
          stageOne as never,
          { initializeDocumentDefinitions: vi.fn() } as never,
        );

        await expect(
          controller.initializeStage(actor, 'project', 'STAGE_1'),
        ).resolves.toMatchObject({ initialized: false, status });
        expect(stageOne.initialize).not.toHaveBeenCalled();
        expect(projects.initializeStage).not.toHaveBeenCalled();
      },
    );

    it('rejects a template-inapplicable Stage 1 initialization before orchestration', async () => {
      const denial = new UnprocessableEntityException({
        code: 'STAGE_NOT_APPLICABLE',
      });
      const projects = {
        stage: vi.fn().mockResolvedValue({
          state: { status: 'NOT_INITIALIZED' },
          templateApplicability: { applicable: false },
          permittedCommands: { initialize: false },
        }),
        initializeStage: vi.fn().mockRejectedValue(denial),
      };
      const stageOne = { initialize: vi.fn() };
      const controller = new ProjectsController(
        projects as unknown as ProjectsService,
        stageOne as never,
        { initializeDocumentDefinitions: vi.fn() } as never,
      );

      await expect(
        controller.initializeStage(actor, 'project', 'STAGE_1'),
      ).rejects.toBe(denial);
      expect(stageOne.initialize).not.toHaveBeenCalled();
      expect(projects.initializeStage).toHaveBeenCalledWith(
        actor,
        'project',
        'STAGE_1',
      );
    });

    it('does not run Stage 1 orchestration when generic owner validation blocks', async () => {
      const blocker = new UnprocessableEntityException({
        code: 'INACTIVE_PROJECT_OWNER',
      });
      const projects = {
        stage: vi.fn().mockResolvedValue({
          state: { status: 'NOT_INITIALIZED' },
          templateApplicability: { applicable: true },
          permittedCommands: { initialize: true },
        }),
        initializeStage: vi.fn().mockRejectedValue(blocker),
      };
      const stageOne = { initialize: vi.fn() };
      const controller = new ProjectsController(
        projects as unknown as ProjectsService,
        stageOne as never,
        { initializeDocumentDefinitions: vi.fn() } as never,
      );

      await expect(
        controller.initializeStage(actor, 'project', 'STAGE_1'),
      ).rejects.toBe(blocker);
      expect(stageOne.initialize).not.toHaveBeenCalled();
    });

    it('reconciles Stage 1 orchestration on an in-progress initialization retry', async () => {
      const projects = {
        stage: vi.fn().mockResolvedValue({
          state: { status: 'IN_PROGRESS' },
          templateApplicability: { applicable: true },
          permittedCommands: { initialize: false },
        }),
        initializeStage: vi.fn().mockResolvedValue({
          initialized: false,
          status: 'IN_PROGRESS',
        }),
      };
      const stageOne = {
        initialize: vi.fn().mockResolvedValue({ initialized: false }),
      };
      const controller = new ProjectsController(
        projects as unknown as ProjectsService,
        stageOne as never,
        { initializeDocumentDefinitions: vi.fn() } as never,
      );

      await expect(
        controller.initializeStage(actor, 'project', 'STAGE_1'),
      ).resolves.toMatchObject({ initialized: false, status: 'IN_PROGRESS' });
      expect(projects.initializeStage).toHaveBeenCalledOnce();
      expect(stageOne.initialize).toHaveBeenCalledOnce();
    });
  });
});
