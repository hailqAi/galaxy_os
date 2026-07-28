import { UnprocessableEntityException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { CurrentActor } from '../access-control/current-actor';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma.service';
import { ProjectsService } from './projects.service';
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
  it('adds an active member without changing authorization roles', async () => {
    const tx = {
      projectMember: { upsert: vi.fn().mockResolvedValue({ id: 'member' }) },
      activity: { create: vi.fn() },
    };
    const prisma = {
      project: { findFirst: vi.fn().mockResolvedValue({ id: 'project' }) },
      activity: { findMany: vi.fn() },
      user: { findFirst: vi.fn().mockResolvedValue({ id: 'user' }) },
      $transaction: vi.fn((work) => work(tx)),
    } as unknown as PrismaService;
    await new ProjectsService(prisma, {} as AuditService).addMember(
      actor,
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
  it('rejects skipped phase transitions', async () => {
    const prisma = {
      project: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: 'project', phase: 'SURVEY' }),
      },
    } as unknown as PrismaService;
    await expect(
      new ProjectsService(prisma, {} as AuditService).changePhase(
        actor,
        'project',
        'DESIGN',
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});
