import { describe, expect, it, vi } from 'vitest';
import { BusinessEntityPolicy } from '../access-control/business-entity.policy';
import { CurrentActor } from '../access-control/current-actor';
import { PrismaService } from '../prisma.service';
import { SearchController } from './search.controller';

const actor = {
  organizationId: 'organization',
  userId: 'actor',
  organizationMembershipId: 'membership',
  email: 'actor@example.test',
  displayName: 'Actor',
  mustChangePassword: false,
  permissions: ['search.read', 'file.read'],
  administrationScope: 'SELF',
  managedDepartmentIds: [],
  administrationTier: 0,
} satisfies CurrentActor;

describe('SearchController file scope', () => {
  it('filters sensitive files and requires an accessible attachment in SQL', async () => {
    const fileFindMany = vi.fn().mockResolvedValue([]);
    const empty = () => ({
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    });
    const prisma = {
      customer: empty(),
      contact: empty(),
      lead: empty(),
      opportunity: empty(),
      project: empty(),
      task: empty(),
      projectRequiredDocument: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([
            {
              id: 'finance-document',
              currentFileAssetId: 'finance-file',
              versions: [],
            },
          ])
          .mockResolvedValueOnce([]),
      },
      projectStageOneDocument: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      entityAttachment: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([{ fileAssetId: 'finance-attached' }])
          .mockResolvedValueOnce([]),
      },
      fileAsset: { findMany: fileFindMany },
    } as unknown as PrismaService;
    const policy = {
      leadWhere: vi.fn().mockReturnValue({}),
      opportunityWhere: vi.fn().mockReturnValue({}),
      projectWhere: vi.fn().mockReturnValue({ id: 'visible-project' }),
      taskWhere: vi.fn().mockReturnValue({}),
    } as unknown as BusinessEntityPolicy;

    const result = await new SearchController(prisma, policy).search(actor, {
      q: 'finance',
      entityTypes: ['File'],
      page: 1,
      pageSize: 5,
    });

    expect(result.groups).toEqual([
      { entityType: 'File', total: 0, items: [] },
    ]);
    expect(fileFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { notIn: ['finance-file', 'finance-attached'] },
          attachments: {
            some: {
              OR: expect.arrayContaining([
                expect.objectContaining({
                  project: { id: 'visible-project' },
                }),
              ]),
            },
          },
        }),
      }),
    );
  });
});
