import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { BusinessEntityPolicy } from '../access-control/business-entity.policy';
import { CurrentActor } from '../access-control/current-actor';
import { PrismaService } from '../prisma.service';
import { ProductionService } from './production.service';

const actor = {
  organizationId: 'org',
  userId: 'user',
  organizationMembershipId: 'member',
  email: 'user@example.test',
  displayName: 'User',
  mustChangePassword: false,
  permissions: ['file.read', 'project.stage1.finance.read', 'estimate.read'],
  administrationScope: 'ORGANIZATION',
  managedDepartmentIds: [],
  administrationTier: 1,
} satisfies CurrentActor;

describe('Production tracking', () => {
  it('creates only from a confirmed PO', async () => {
    const service = new ProductionService(
      {
        purchaseOrder: { findFirst: vi.fn().mockResolvedValue(null) },
      } as unknown as PrismaService,
      {
        projectWhere: vi.fn().mockReturnValue({}),
      } as unknown as BusinessEntityPolicy,
    );
    await expect(
      service.create(actor, {
        purchaseOrderId: '00000000-0000-4000-8000-000000000001',
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('requires a reason for delayed status', async () => {
    const service = new ProductionService(
      {} as PrismaService,
      {} as BusinessEntityPolicy,
    );
    vi.spyOn(service, 'get').mockResolvedValue({
      status: 'IN_PRODUCTION',
    } as never);
    await expect(
      service.changeStatus(actor, 'production', { status: 'DELAYED' }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('blocks ready status while required approval is pending', async () => {
    const service = new ProductionService(
      {} as PrismaService,
      {} as BusinessEntityPolicy,
    );
    vi.spyOn(service, 'get').mockResolvedValue({
      status: 'PACKING',
      technicalApprovals: [{ required: true, status: 'PENDING' }],
      sampleApprovals: [],
      milestones: [],
    } as never);
    await expect(
      service.changeStatus(actor, 'production', {
        status: 'READY_FOR_SHIPMENT',
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('does not approve a different revision that commits while the decision waits for the Project lock', async () => {
    const initial = {
      currentRevision: 1,
      createdBy: 'other',
      productionOrder: { projectId: 'project' },
    };
    const prisma = {
      $queryRaw: vi.fn(),
      technicalApproval: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(initial)
          .mockResolvedValueOnce({ ...initial, currentRevision: 2 }),
        update: vi.fn(),
      },
      technicalApprovalRevision: { update: vi.fn() },
    };
    Object.assign(prisma, {
      $transaction: vi.fn(async (callback: (tx: typeof prisma) => unknown) =>
        callback(prisma),
      ),
    });
    const service = new ProductionService(
      prisma as unknown as PrismaService,
      {
        projectWhere: vi.fn().mockReturnValue({}),
      } as unknown as BusinessEntityPolicy,
    );
    await expect(
      service.decideTechnical(actor, 'approval', { decision: 'APPROVED' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.technicalApprovalRevision.update).not.toHaveBeenCalled();
    expect(prisma.technicalApproval.update).not.toHaveBeenCalled();
  });

  it('prevents technical self approval', async () => {
    const service = new ProductionService(
      {
        technicalApproval: {
          findFirst: vi.fn().mockResolvedValue({
            createdBy: actor.userId,
          }),
        },
      } as unknown as PrismaService,
      {
        projectWhere: vi.fn().mockReturnValue({}),
      } as unknown as BusinessEntityPolicy,
    );
    await expect(
      service.decideTechnical(actor, 'approval', { decision: 'APPROVED' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('decides a pending sample without changing the PO workflow', async () => {
    const update = vi.fn().mockResolvedValue({ status: 'APPROVED' });
    const service = new ProductionService(
      {
        sampleApproval: {
          findFirst: vi.fn().mockResolvedValue({
            status: 'PENDING',
            submittedBy: 'other',
            productionOrder: { projectId: 'project' },
          }),
          update,
        },
        $transaction: vi.fn(async (callback) =>
          callback({
            $queryRaw: vi.fn(),
            sampleApproval: {
              findUniqueOrThrow: vi
                .fn()
                .mockResolvedValue({ status: 'PENDING', submittedBy: 'other' }),
              update,
            },
          }),
        ),
      } as unknown as PrismaService,
      {
        projectWhere: vi.fn().mockReturnValue({}),
      } as unknown as BusinessEntityPolicy,
    );
    await service.decideSample(actor, 'sample', { decision: 'APPROVED' });
    expect(update).toHaveBeenCalledOnce();
  });

  it('rejects every production file field unless it is attached to the same Project', async () => {
    const fileId = '00000000-0000-4000-8000-000000000001';
    const prisma = {
      fileAsset: { findFirst: vi.fn().mockResolvedValue(null) },
      productionMilestone: { create: vi.fn() },
      technicalApproval: {
        create: vi.fn(),
        findFirst: vi.fn().mockResolvedValue({
          id: 'approval',
          currentRevision: 1,
          productionOrder: { projectId: 'project' },
        }),
      },
      technicalApprovalRevision: { create: vi.fn() },
      sampleApproval: { create: vi.fn() },
      qualityReport: { create: vi.fn() },
      packingRecord: { create: vi.fn() },
    };
    const service = new ProductionService(
      prisma as unknown as PrismaService,
      {
        projectWhere: vi.fn().mockReturnValue({}),
      } as unknown as BusinessEntityPolicy,
    );
    vi.spyOn(service, 'get').mockResolvedValue({
      projectId: 'project',
    } as never);

    const commands = [
      () =>
        service.milestone(actor, 'production', {
          name: 'Factory ready',
          sequence: 1,
          status: 'PLANNED',
          evidenceFileId: fileId,
        }),
      () =>
        service.technicalApproval(actor, 'production', {
          type: 'SHOP_DRAWING',
          title: 'Drawing',
          description: 'Revision 1',
          fileId,
        }),
      () =>
        service.technicalRevision(actor, 'approval', {
          description: 'Revision 2',
          fileId,
        }),
      () => service.sample(actor, 'production', { name: 'Sample', fileId }),
      () =>
        service.quality(actor, 'production', {
          reportNumber: 'QC-1',
          inspectionDate: new Date(),
          result: 'PASSED',
          summary: 'Passed',
          fileId,
        }),
      () =>
        service.packing(actor, 'production', {
          packingNumber: 'PK-1',
          packageCount: 1,
          packedAt: new Date(),
          fileId,
        }),
    ];

    for (const command of commands)
      await expect(command()).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.fileAsset.findFirst).toHaveBeenCalledTimes(commands.length);
    expect(prisma.productionMilestone.create).not.toHaveBeenCalled();
    expect(prisma.technicalApproval.create).not.toHaveBeenCalled();
    expect(prisma.technicalApprovalRevision.create).not.toHaveBeenCalled();
    expect(prisma.sampleApproval.create).not.toHaveBeenCalled();
    expect(prisma.qualityReport.create).not.toHaveBeenCalled();
    expect(prisma.packingRecord.create).not.toHaveBeenCalled();
  });
});
