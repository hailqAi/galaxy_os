import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { BusinessEntityPolicy } from '../access-control/business-entity.policy';
import { CurrentActor } from '../access-control/current-actor';
import { PrismaService } from '../prisma.service';
import { AfterSalesService } from './after-sales.service';

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
const policy = { assertView: vi.fn() } as unknown as BusinessEntityPolicy;

describe('Inspection, handover and after-sales', () => {
  it('blocks acceptance until inspection passes', async () => {
    const service = new AfterSalesService(
      {
        inspection: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'inspection',
            projectId: 'project',
            status: 'FAILED',
            items: [],
            acceptances: [],
          }),
        },
      } as unknown as PrismaService,
      policy,
    );
    await expect(
      service.createAcceptance(actor, 'inspection', {
        participants: [
          { name: 'Customer', role: 'CUSTOMER', signingStatus: 'SIGNED' },
        ],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('blocks handover when required readiness is incomplete', async () => {
    const prisma = {
      handover: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'handover',
          projectId: 'project',
          status: 'DRAFT',
          items: [],
          checklist: [],
          documents: [],
          statusHistory: [],
        }),
      },
      handoverChecklist: { count: vi.fn().mockResolvedValue(1) },
      handoverDocument: { findMany: vi.fn().mockResolvedValue([]) },
      acceptanceRecord: { count: vi.fn().mockResolvedValue(1) },
      punchItem: { count: vi.fn().mockResolvedValue(0) },
    };
    const service = new AfterSalesService(
      prisma as unknown as PrismaService,
      policy,
    );
    await expect(
      service.completeHandover(actor, 'handover', {}),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('denies a ticket for another project customer', async () => {
    const service = new AfterSalesService(
      {
        project: { findFirst: vi.fn().mockResolvedValue(null) },
      } as unknown as PrismaService,
      policy,
    );
    await expect(
      service.createTicket(actor, {
        ticketNumber: 'SV-1',
        customerId: '00000000-0000-4000-8000-000000000001',
        projectId: '00000000-0000-4000-8000-000000000002',
        issueCategory: 'PRODUCT',
        priority: 'NORMAL',
        description: 'Issue',
        chargeable: false,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('requires customer confirmation before closing a ticket', async () => {
    const service = new AfterSalesService(
      {
        serviceTicket: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'ticket',
            projectId: 'project',
            status: 'RESOLVED',
          }),
        },
      } as unknown as PrismaService,
      policy,
    );
    await expect(service.closeTicket(actor, 'ticket')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('blocks closing while a service workflow remains open', async () => {
    const service = new AfterSalesService(
      {
        serviceTicket: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'ticket',
            projectId: 'project',
            status: 'CUSTOMER_CONFIRMED',
          }),
        },
        serviceVisit: { count: vi.fn() },
        warrantyClaim: { count: vi.fn() },
        warrantyReplacement: { count: vi.fn() },
        $transaction: vi.fn().mockResolvedValue([1, 0, 0]),
      } as unknown as PrismaService,
      policy,
    );
    await expect(service.closeTicket(actor, 'ticket')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects a service visit for a closed ticket', async () => {
    const service = new AfterSalesService(
      {
        serviceTicket: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'ticket',
            projectId: 'project',
            status: 'CLOSED',
          }),
        },
      } as unknown as PrismaService,
      policy,
    );
    await expect(
      service.createServiceVisit(actor, 'ticket', {
        scheduledAt: new Date(),
        visitType: 'INSPECTION',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('keeps completed handover documents immutable', async () => {
    const service = new AfterSalesService(
      {
        handoverDocument: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'document',
            supersededBy: null,
            handover: { projectId: 'project', status: 'COMPLETED' },
          }),
        },
      } as unknown as PrismaService,
      policy,
    );
    await expect(
      service.signHandoverDocument(actor, 'document', {
        signedStatus: 'SIGNED_MANUALLY',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('prevents another technician from completing an assigned visit', async () => {
    const service = new AfterSalesService(
      {
        serviceVisit: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'visit',
            projectId: 'project',
            technicianId: 'other-user',
            status: 'IN_PROGRESS',
            visitType: 'DIAGNOSIS',
          }),
        },
      } as unknown as PrismaService,
      policy,
    );
    await expect(
      service.completeServiceVisit(actor, 'visit', {
        diagnosis: 'Fault found',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects an unattached temporary asset before completing a visit', async () => {
    const findFirst = vi.fn(({ where }) =>
      Promise.resolve(where.attachments ? null : { id: 'file' }),
    );
    const service = new AfterSalesService(
      {
        serviceVisit: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'visit',
            projectId: 'project',
            technicianId: actor.userId,
            status: 'IN_PROGRESS',
            visitType: 'DIAGNOSIS',
          }),
          update: vi.fn(),
        },
        fileAsset: { findFirst },
      } as unknown as PrismaService,
      policy,
    );

    await expect(
      service.completeServiceVisit(actor, 'visit', {
        diagnosis: 'Fault found',
        evidenceFileId: '00000000-0000-4000-8000-000000000001',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          attachments: { some: { projectId: 'project' } },
        }),
      }),
    );
  });

  it('rejects an expired warranty claim unless it is goodwill', async () => {
    const service = new AfterSalesService(
      {
        serviceTicket: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'ticket',
            projectId: 'project',
            customerId: 'customer',
            status: 'IN_PROGRESS',
            reportedAt: new Date('2026-01-01'),
          }),
        },
        warrantyAsset: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'asset',
            projectId: 'project',
            customerId: 'customer',
            warrantyStart: new Date('2024-01-01'),
            warrantyEnd: new Date('2025-01-01'),
          }),
        },
      } as unknown as PrismaService,
      policy,
    );
    await expect(
      service.createWarrantyClaim(actor, 'ticket', {
        claimNumber: 'CL-1',
        warrantyAssetId: '00000000-0000-4000-8000-000000000001',
        claimType: 'CUSTOMER_WARRANTY',
        issueDescription: 'Failed',
        submissionMode: 'MANUAL',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
