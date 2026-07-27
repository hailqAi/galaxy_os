import { ConflictException, NotFoundException } from '@nestjs/common';
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
  permissions: [],
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
});
