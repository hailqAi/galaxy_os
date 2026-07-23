import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { REQUIRED_PERMISSIONS } from '../access-control/access.decorators';
import { CurrentActor } from '../access-control/current-actor';
import { PrismaService } from '../prisma.service';
import { SurveysController } from './discovery.controller';
import { DiscoveryService } from './discovery.service';

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

describe('DiscoveryService', () => {
  it('creates a Survey and its activity in one transaction', async () => {
    const tx = {
      survey: { create: vi.fn().mockResolvedValue({ id: 'survey' }) },
      activity: { create: vi.fn() },
    };
    const prisma = {
      project: { findFirst: vi.fn().mockResolvedValue({ id: 'project' }) },
      $transaction: vi.fn((work) => work(tx)),
    } as unknown as PrismaService;
    await new DiscoveryService(prisma).createSurvey(actor, {
      projectId: 'project',
      location: 'Hà Nội',
    });
    expect(tx.survey.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ organizationId: 'organization' }),
      }),
    );
    expect(tx.activity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ event: 'SURVEY_CREATED' }),
      }),
    );
  });
  it('applies organization and project scope when reading Survey', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const prisma = { survey: { findFirst } } as unknown as PrismaService;
    await expect(
      new DiscoveryService(prisma).survey(actor, 'survey'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'organization',
          project: expect.objectContaining({ organizationId: 'organization' }),
        }),
      }),
    );
  });
  it('updates, schedules and completes a draft Survey', async () => {
    const tx = {
      survey: { update: vi.fn().mockResolvedValue({ id: 'survey' }) },
      activity: { create: vi.fn() },
    };
    const prisma = {
      survey: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: 'survey', approvalStatus: 'DRAFT' }),
        update: vi.fn().mockResolvedValue({ id: 'survey' }),
      },
      $transaction: vi.fn((work) => work(tx)),
    } as unknown as PrismaService;
    const service = new DiscoveryService(prisma);
    await service.updateSurvey(actor, 'survey', { notes: 'Đã đo' });
    await service.scheduleSurvey(actor, 'survey', '2026-08-01T08:00:00.000Z');
    await service.completeSurvey(actor, 'survey');
    expect(prisma.survey.update).toHaveBeenCalledTimes(2);
    expect(tx.activity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ event: 'SURVEY_COMPLETED' }),
      }),
    );
  });
  it('protects Survey approval with the existing permission guard metadata', () => {
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS,
        SurveysController.prototype.approve,
      ),
    ).toEqual(['survey.approve']);
  });
  it('creates Requirement activity and enforces approved immutability', async () => {
    const tx = {
      requirement: { create: vi.fn().mockResolvedValue({ id: 'requirement' }) },
      activity: { create: vi.fn() },
    };
    const prisma = {
      project: { findFirst: vi.fn().mockResolvedValue({ id: 'project' }) },
      requirement: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'requirement',
          approvalStatus: 'APPROVED',
          versions: [],
        }),
      },
      $transaction: vi.fn((work) => work(tx)),
    } as unknown as PrismaService;
    const service = new DiscoveryService(prisma);
    await service.createRequirement(actor, {
      projectId: 'project',
      title: 'Yêu cầu',
    });
    expect(tx.activity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ event: 'REQUIREMENT_CREATED' }),
      }),
    );
    await expect(
      service.updateRequirement(actor, 'requirement', { title: 'Ghi đè' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it('submits, approves, rejects and versions Requirement atomically', async () => {
    const before = {
      id: 'requirement',
      version: 1,
      approvalStatus: 'DRAFT',
      versions: [],
      project: { id: 'project' },
    };
    const tx = {
      requirement: { update: vi.fn().mockResolvedValue({ id: 'requirement' }) },
      requirementVersion: { create: vi.fn() },
      activity: { create: vi.fn() },
    };
    const prisma = {
      requirement: { findFirst: vi.fn().mockResolvedValue(before) },
      $transaction: vi.fn((work) => work(tx)),
    } as unknown as PrismaService;
    const service = new DiscoveryService(prisma);
    await service.approval(actor, 'requirement', 'PENDING');
    await service.approval(actor, 'requirement', 'APPROVED');
    await service.approval(actor, 'requirement', 'REJECTED');
    await service.newVersion(actor, 'requirement');
    expect(tx.activity.create).toHaveBeenCalledTimes(3);
    expect(tx.requirementVersion.create).toHaveBeenCalledOnce();
    expect(tx.requirement.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          version: { increment: 1 },
          approvalStatus: 'DRAFT',
        }),
      }),
    );
  });
});
