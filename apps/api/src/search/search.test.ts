import { describe, expect, it, vi } from 'vitest';
import { BusinessEntityPolicy } from '../access-control/business-entity.policy';
import { CurrentActor } from '../access-control/current-actor';
import { PrismaService } from '../prisma.service';
import { SearchService } from './search.service';
import { TasksService } from '../tasks/tasks.service';
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
  it('uses each permission scope rather than an unrelated organization assignment for search', async () => {
    const empty = {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    };
    const prisma = {
      customer: empty,
      contact: empty,
      lead: empty,
      opportunity: empty,
      project: empty,
      task: { ...empty, findMany: vi.fn().mockResolvedValue([]) },
      projectRequiredDocument: empty,
      projectStageOneDocument: empty,
      entityAttachment: empty,
      fileAsset: { ...empty, findMany: vi.fn().mockResolvedValue([]) },
      $transaction: vi
        .fn()
        .mockImplementation(async (queries) => Promise.all(queries)),
    } as unknown as PrismaService;
    const mixed: CurrentActor = {
      ...actor,
      administrationScope: 'ORGANIZATION',
      permissions: ['search.read', 'task.read', 'file.read', 'project.read'],
      permissionSources: ['task.read', 'file.read', 'project.read'].map(
        (permission, i) => ({
          permission,
          assignmentId: String(i),
          administrationTier: 1,
          roleId: String(i),
          roleName: 'fixture',
          scopeType: permission === 'project.read' ? 'ORGANIZATION' : 'SELF',
          departmentId: null,
        }),
      ),
    };
    await new SearchService(
      prisma,
      new BusinessEntityPolicy(prisma),
      new TasksService(prisma),
    ).search(mixed, {
      q: 'fixture',
      entityTypes: ['Task', 'File'],
      page: 1,
      pageSize: 5,
    });
    const taskWhere = vi.mocked(prisma.task.findMany).mock.calls[0]![0]!.where;
    expect(JSON.stringify(taskWhere)).toContain('createdBy');
    expect(JSON.stringify(taskWhere)).not.toContain('"project"');
    const fileWhere = vi.mocked(prisma.fileAsset.findMany).mock.calls[0]![0]!
      .where;
    expect(JSON.stringify(fileWhere)).toContain('projectOwnerId');
  });
  it('keeps aggregate file totals and page offsets instead of reporting the page length', async () => {
    const empty = {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    };
    const findMany = vi.fn().mockResolvedValue([]),
      count = vi.fn().mockResolvedValue(37);
    const prisma = {
      customer: empty,
      contact: empty,
      lead: empty,
      opportunity: empty,
      project: empty,
      task: empty,
      projectRequiredDocument: empty,
      projectStageOneDocument: empty,
      entityAttachment: empty,
      fileAsset: { findMany, count },
      $transaction: vi
        .fn()
        .mockImplementation(async (queries) => Promise.all(queries)),
    } as unknown as PrismaService;
    const policy = {
      leadWhere: () => ({}),
      opportunityWhere: () => ({}),
      projectWhere: () => ({}),
      taskWhere: () => ({}),
    } as unknown as BusinessEntityPolicy;
    const result = await new SearchController(
      new SearchService(prisma, policy, new TasksService(prisma)),
    ).search(actor, {
      q: 'source',
      entityTypes: ['File'],
      page: 2,
      pageSize: 5,
    });
    expect(result.groups[0]?.total).toBe(37);
    expect(findMany.mock.calls[0]![0]).toMatchObject({ skip: 5, take: 5 });
    expect(count.mock.calls[0]![0].where).toEqual(
      findMany.mock.calls[0]![0].where,
    );
  });
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
      fileAsset: {
        findMany: fileFindMany,
        count: vi.fn().mockResolvedValue(0),
      },
      $transaction: vi
        .fn()
        .mockImplementation(async (queries) => Promise.all(queries)),
    } as unknown as PrismaService;
    const policy = {
      leadWhere: vi.fn().mockReturnValue({}),
      opportunityWhere: vi.fn().mockReturnValue({}),
      projectWhere: vi.fn().mockReturnValue({ id: 'visible-project' }),
      taskWhere: vi.fn().mockReturnValue({}),
    } as unknown as BusinessEntityPolicy;

    const result = await new SearchController(
      new SearchService(prisma, policy, new TasksService(prisma)),
    ).search(actor, {
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
