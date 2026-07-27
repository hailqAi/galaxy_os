import { ConflictException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { BusinessEntityPolicy } from '../access-control/business-entity.policy';
import { CurrentActor } from '../access-control/current-actor';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../prisma.service';
import { InstallationService } from './installation.service';

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

function buildService() {
  const prisma = {
    installationWorkOrder: { findFirst: vi.fn(), update: vi.fn() },
    technicalApproval: { count: vi.fn().mockResolvedValue(0) },
    inventoryReservation: { count: vi.fn().mockResolvedValue(0) },
    punchItem: { findFirst: vi.fn(), update: vi.fn() },
    activity: { create: vi.fn() },
    $transaction: vi.fn().mockImplementation((run) => run(prisma)),
  };
  return {
    prisma,
    service: new InstallationService(
      prisma as unknown as PrismaService,
      { assertView: vi.fn() } as unknown as BusinessEntityPolicy,
      {} as InventoryService,
    ),
  };
}

describe('Installation operations', () => {
  it('blocks work-order release when readiness is missing', async () => {
    const { prisma, service } = buildService();
    prisma.installationWorkOrder.findFirst.mockResolvedValue({
      id: 'work-order',
      organizationId: actor.organizationId,
      projectId: 'project',
      status: 'DRAFT',
      teamId: null,
      approvedDrawing: false,
      requiredInventory: true,
      plan: { siteReady: false, customerCoordination: false },
      checklist: [],
      items: [],
      deliveries: [],
      dailyLogs: [],
      issues: [],
      punchItems: [],
    });
    await expect(
      service.release(actor, 'work-order', {}),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('requires the dedicated readiness override permission', async () => {
    const { prisma, service } = buildService();
    prisma.installationWorkOrder.findFirst.mockResolvedValue({
      id: 'work-order',
      organizationId: actor.organizationId,
      projectId: 'project',
      status: 'DRAFT',
      teamId: null,
      approvedDrawing: false,
      requiredInventory: false,
      plan: { siteReady: false, customerCoordination: false },
      checklist: [],
      items: [],
      deliveries: [],
      dailyLogs: [],
      issues: [],
      punchItems: [],
    });
    await expect(
      service.release(actor, 'work-order', { overrideReason: 'Emergency' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('prevents a resolver from verifying the same punch item', async () => {
    const { prisma, service } = buildService();
    prisma.punchItem.findFirst.mockResolvedValue({
      id: 'punch',
      projectId: 'project',
      status: 'READY_FOR_VERIFY',
      resolvedBy: actor.userId,
    });
    await expect(service.verifyPunch(actor, 'punch')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
