import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma.service';
import { ProjectApproverResolver } from './project-approver-resolver.service';

describe('ProjectApproverResolver', () => {
  it('requires active membership, permission, project or organization scope, and excludes creator', async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: 'approver' }]);
    const resolver = new ProjectApproverResolver({
      user: { findMany },
    } as unknown as PrismaService);

    await expect(
      resolver.resolve(
        'organization',
        'project',
        'project.stage1.review',
        'creator',
      ),
    ).resolves.toEqual([{ id: 'approver' }]);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { not: 'creator' },
          status: 'active',
          organizationMembers: {
            some: { organizationId: 'organization', status: 'active' },
          },
          roles: {
            some: expect.objectContaining({
              organizationId: 'organization',
              status: 'active',
              role: expect.objectContaining({
                permissions: {
                  some: {
                    permission: {
                      code: 'project.stage1.review',
                    },
                  },
                },
              }),
            }),
          },
        }),
      }),
    );
  });
});
