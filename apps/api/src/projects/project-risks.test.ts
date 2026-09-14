import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BusinessEntityPolicy } from '../access-control/business-entity.policy';
import { CurrentActor } from '../access-control/current-actor';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma.service';
import { ProjectRisksService } from './project-risks.service';

const actor = {
  organizationId: '00000000-0000-4000-8000-000000000001',
  userId: '00000000-0000-4000-8000-000000000002',
  organizationMembershipId: '00000000-0000-4000-8000-000000000003',
  email: 'risk.owner@example.test',
  displayName: 'Risk owner',
  mustChangePassword: false,
  permissions: [
    'project.read',
    'project.update',
    'estimate.read',
    'estimate.update',
    'financial_margin.read',
  ],
  administrationScope: 'ORGANIZATION',
  managedDepartmentIds: [],
  administrationTier: 1,
} satisfies CurrentActor;
const policy = {
  projectWhere: vi.fn().mockReturnValue({ id: 'visible-project' }),
  actorForProject: vi.fn().mockResolvedValue(actor),
} as unknown as BusinessEntityPolicy;
const audit = { write: vi.fn() } as unknown as AuditService;

describe('Project risk register', () => {
  beforeEach(() => vi.clearAllMocks());

  it('persists priority and EMV from explicit risk inputs', async () => {
    const create = vi.fn(async ({ data }) => ({ id: 'risk', ...data }));
    const tx = {
      project: { findFirst: vi.fn().mockResolvedValue({ id: 'project' }) },
      projectMember: { findFirst: vi.fn().mockResolvedValue({ id: 'member' }) },
      projectRisk: { create },
    };
    const service = new ProjectRisksService(
      { $transaction: vi.fn((work) => work(tx)) } as unknown as PrismaService,
      policy,
      audit,
    );

    await service.create(actor, 'project', {
      code: 'R-01',
      title: 'Supplier delay',
      cause: 'Capacity shortage',
      event: 'Delivery misses the approved milestone',
      impact: 'Installation starts late',
      category: 'SUPPLIER',
      stage: 'STAGE_TWO',
      ownerId: actor.userId,
      likelihood: 3,
      impactScore: 4,
      probability: '0.30',
      financialImpact: '100000000',
      treatment: 'Reserve production slot',
      response: 'Activate alternate supplier',
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        priorityScore: 12,
        probability: expect.objectContaining({ toFixed: expect.any(Function) }),
        financialImpact: expect.objectContaining({
          toFixed: expect.any(Function),
        }),
        emv: expect.objectContaining({ toFixed: expect.any(Function) }),
      }),
    });
    const data = create.mock.calls[0]![0].data;
    expect(data.emv.toFixed(2)).toBe('30000000.00');
    expect(audit.write).toHaveBeenCalled();
  });

  it('does not infer probability from a 3-of-5 likelihood score', async () => {
    const create = vi.fn(async ({ data }) => ({ id: 'risk', ...data }));
    const tx = {
      project: { findFirst: vi.fn().mockResolvedValue({ id: 'project' }) },
      projectMember: { findFirst: vi.fn().mockResolvedValue({ id: 'member' }) },
      projectRisk: { create },
    };
    const service = new ProjectRisksService(
      { $transaction: vi.fn((work) => work(tx)) } as unknown as PrismaService,
      policy,
      audit,
    );

    await service.create(actor, 'project', {
      code: 'R-02',
      title: 'Unquantified risk',
      cause: 'Unknown',
      event: 'Risk event',
      impact: 'Schedule impact',
      category: 'SCHEDULE',
      stage: 'STAGE_TWO',
      ownerId: actor.userId,
      likelihood: 3,
      impactScore: 2,
    });

    expect(create.mock.calls[0]![0].data).toMatchObject({
      likelihood: 3,
      priorityScore: 6,
      probability: null,
      emv: null,
    });
  });

  it('rejects whitespace-only risk narratives before persistence', async () => {
    const service = new ProjectRisksService({} as PrismaService, policy, audit);

    await expect(
      service.create(actor, 'project', {
        code: '   ',
        title: 'Risk',
        cause: 'Cause',
        event: 'Event',
        impact: 'Impact',
        category: 'SUPPLIER',
        stage: 'STAGE_TWO',
        ownerId: actor.userId,
        likelihood: 1,
        impactScore: 1,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('redacts financial impact and EMV without financial permission', async () => {
    const prisma = {
      project: { findFirst: vi.fn().mockResolvedValue({ id: 'project' }) },
      projectRisk: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'risk',
            financialImpact: '100000000',
            probability: '0.3',
            emv: '30000000',
          },
        ]),
      },
    } as unknown as PrismaService;
    const service = new ProjectRisksService(prisma, policy, audit);

    const result = await service.list(
      { ...actor, permissions: ['project.read', 'estimate.read'] },
      'project',
    );

    expect(result[0]).toEqual({ id: 'risk' });
  });

  it('rejects quantified risk data without financial permission', async () => {
    const service = new ProjectRisksService({} as PrismaService, policy, audit);

    await expect(
      service.create(
        { ...actor, permissions: ['project.read', 'project.update'] },
        'project',
        {
          code: 'R-03',
          title: 'Financial risk',
          cause: 'Cause',
          event: 'Event',
          impact: 'Impact',
          category: 'FINANCIAL',
          stage: 'STAGE_TWO',
          ownerId: actor.userId,
          likelihood: 3,
          impactScore: 4,
          probability: '0.3',
          financialImpact: '100000000',
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('uses target-scoped permissions before exposing financial risk data', async () => {
    const scopedPolicy = {
      projectWhere: vi.fn().mockReturnValue({ id: 'visible-project' }),
      actorForProject: vi.fn().mockResolvedValue({
        ...actor,
        permissions: ['project.read'],
      }),
    } as unknown as BusinessEntityPolicy;
    const prisma = {
      project: { findFirst: vi.fn().mockResolvedValue({ id: 'project' }) },
      projectRisk: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'risk',
            financialImpact: '100000000',
            probability: '0.3',
            emv: '30000000',
            allocations: [],
          },
        ]),
      },
    } as unknown as PrismaService;
    const service = new ProjectRisksService(prisma, scopedPolicy, audit);

    const result = await service.list(
      { ...actor, permissionSources: [] },
      'project',
    );

    expect(result[0]).toEqual({ id: 'risk' });
  });

  it('upserts one contingency allocation for each estimate revision and risk', async () => {
    const upsert = vi.fn().mockResolvedValue({ id: 'allocation' });
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'project' }]),
      project: { findFirst: vi.fn().mockResolvedValue({ id: 'project' }) },
      projectRisk: {
        findFirst: vi.fn().mockResolvedValue({ id: 'risk', status: 'OPEN' }),
      },
      estimateVersion: {
        findFirst: vi.fn().mockResolvedValue({
          id: '00000000-0000-4000-8000-000000000010',
          status: 'DRAFT',
        }),
      },
      estimateRiskAllocation: { upsert },
    };
    const service = new ProjectRisksService(
      { $transaction: vi.fn((work) => work(tx)) } as unknown as PrismaService,
      policy,
      audit,
    );

    await service.allocate(actor, 'project', 'risk', {
      estimateVersionId: '00000000-0000-4000-8000-000000000010',
      approvedAmount: '30000000',
      basis: 'Approved management reserve',
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          estimateVersionId_riskId: {
            estimateVersionId: '00000000-0000-4000-8000-000000000010',
            riskId: 'risk',
          },
        },
      }),
    );
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.estimateVersion.findFirst.mock.invocationCallOrder[0]!,
    );
  });

  it('rejects allocation when the risk is not in the Project', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'project' }]),
      project: { findFirst: vi.fn().mockResolvedValue({ id: 'project' }) },
      projectRisk: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const service = new ProjectRisksService(
      { $transaction: vi.fn((work) => work(tx)) } as unknown as PrismaService,
      policy,
      audit,
    );

    await expect(
      service.allocate(actor, 'project', 'foreign-risk', {
        estimateVersionId: '00000000-0000-4000-8000-000000000010',
        approvedAmount: '1',
        basis: 'No cross-project allocation',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('requires estimate.update for a contingency allocation', async () => {
    const service = new ProjectRisksService({} as PrismaService, policy, audit);

    await expect(
      service.allocate(
        { ...actor, permissions: ['project.read'] },
        'project',
        'risk',
        {
          estimateVersionId: '00000000-0000-4000-8000-000000000010',
          approvedAmount: '1',
          basis: 'Unauthorized',
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
