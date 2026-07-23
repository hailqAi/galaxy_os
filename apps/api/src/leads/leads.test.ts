import { ConflictException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { CurrentActor } from '../access-control/current-actor';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma.service';
import { LeadsService } from './leads.service';

const actor = {
  organizationId: 'organization',
  userId: 'actor',
  administrationScope: 'MANAGED_DEPARTMENTS',
  managedDepartmentIds: ['sales'],
} as CurrentActor;

describe('LeadsService', () => {
  it('filters Lead in Prisma by owned or managed department scope', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = {
      lead: { findMany, count: vi.fn().mockResolvedValue(0) },
      $transaction: vi.fn().mockResolvedValue([[], 0]),
    } as unknown as PrismaService;
    await new LeadsService(prisma, {} as AuditService).list(actor, {
      page: 1,
      pageSize: 20,
      search: 'villa',
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

  it('denies cross-department assignment before looking up the target', async () => {
    const prisma = {
      lead: {
        findFirst: vi.fn().mockResolvedValue({ id: 'lead', status: 'NEW' }),
      },
      user: { findFirst: vi.fn() },
    } as unknown as PrismaService;
    await expect(
      new LeadsService(prisma, {} as AuditService).assign(actor, 'lead', {
        ownerId: 'target',
        departmentId: 'accounting',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it('assigns, records activity and notifies in one transaction', async () => {
    const tx = {
      lead: { update: vi.fn().mockResolvedValue({ id: 'lead' }) },
      activity: { create: vi.fn() },
      notification: { create: vi.fn() },
    };
    const prisma = {
      lead: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'lead',
          name: 'Villa',
          status: 'NEW',
          departmentId: 'sales',
        }),
      },
      user: { findFirst: vi.fn().mockResolvedValue({ id: 'target' }) },
      $transaction: vi.fn((work) => work(tx)),
    } as unknown as PrismaService;
    await new LeadsService(prisma, {} as AuditService).assign(actor, 'lead', {
      ownerId: 'target',
      departmentId: 'sales',
    });
    expect(tx.activity.create).toHaveBeenCalledOnce();
    expect(tx.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recipientId: 'target',
          type: 'LEAD_ASSIGNED',
        }),
      }),
    );
  });

  it('converts once and rejects a second conversion', async () => {
    const tx = {
      lead: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'lead',
          name: 'Villa',
          status: 'QUALIFIED',
          currency: 'VND',
        }),
        update: vi.fn(),
      },
      opportunity: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'opportunity' }),
      },
      activity: { create: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn((work) => work(tx)),
    } as unknown as PrismaService;
    const service = new LeadsService(prisma, {} as AuditService);
    await expect(service.convert(actor, 'lead')).resolves.toEqual({
      leadId: 'lead',
      opportunityId: 'opportunity',
    });
    expect(tx.lead.update).toHaveBeenCalledOnce();
    expect(tx.activity.create).toHaveBeenCalledOnce();
    tx.opportunity.findUnique.mockResolvedValue({ id: 'opportunity' });
    await expect(service.convert(actor, 'lead')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
