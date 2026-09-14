import { describe, expect, it, vi } from 'vitest';
import { CurrentActor } from '../access-control/current-actor';
import {
  findProjectFiles,
  hiddenProjectFileIds,
  hiddenStageOneFinanceFileIds,
} from './project-file';

const actor = {
  organizationId: 'organization',
  userId: 'actor',
  organizationMembershipId: 'membership',
  email: 'actor@example.test',
  displayName: 'Actor',
  mustChangePassword: false,
  permissions: ['file.read'],
  administrationScope: 'ORGANIZATION',
  managedDepartmentIds: [],
  administrationTier: 1,
} satisfies CurrentActor;

describe('Project file reference policy', () => {
  it('hides every Stage 1 finance reference and Stage 2 plan workbook source', async () => {
    const db = {
      projectRequiredDocument: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([
            {
              id: 'finance-required',
              projectId: 'project',
              stageKey: 'STAGE_1',
              workstreamKey: 'FINANCIAL_PLANNING',
              documentType: 'Hồ sơ đã đổi tên',
              currentFileAssetId: 'finance-current',
              versions: [{ fileAssetId: 'finance-version' }],
            },
          ])
          .mockResolvedValueOnce([
            {
              id: 'plan-required',
              currentFileAssetId: 'plan-current',
              versions: [],
            },
          ]),
      },
      projectStageOneDocument: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([
            {
              id: 'plan-logical',
              currentFileAssetId: null,
              versions: [{ fileAssetId: 'plan-version' }],
            },
          ]),
      },
      entityAttachment: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([{ fileAssetId: 'finance-attached' }])
          .mockResolvedValueOnce([{ fileAssetId: 'plan-attached' }]),
      },
      fileAsset: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { id: 'plan-current' },
            { id: 'plan-version' },
            { id: 'plan-attached' },
          ]),
      },
    };

    await expect(
      hiddenProjectFileIds(db as never, actor, 'project'),
    ).resolves.toEqual([
      'finance-current',
      'finance-version',
      'finance-attached',
      'plan-current',
      'plan-version',
      'plan-attached',
    ]);
    expect(db.projectRequiredDocument.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { documentType: 'PRELIMINARY_FINANCIAL_PLAN' },
            { stageKey: 'STAGE_1', workstreamKey: 'FINANCIAL_PLANNING' },
          ]),
        }),
      }),
    );
  });

  it('requires a file capability before returning a Project evidence file', async () => {
    const db = { fileAsset: { findMany: vi.fn() } };

    await expect(
      findProjectFiles(db as never, { ...actor, permissions: [] }, 'project', [
        'file',
      ]),
    ).resolves.toEqual([]);
    expect(db.fileAsset.findMany).not.toHaveBeenCalled();
  });

  it('hides finance files for Projects outside the finance permission scope', async () => {
    const db = {
      project: {
        findMany: vi.fn().mockResolvedValue([{ id: 'visible-project' }]),
      },
      projectRequiredDocument: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'visible-document',
            projectId: 'visible-project',
            currentFileAssetId: 'visible-file',
            versions: [],
          },
          {
            id: 'hidden-document',
            projectId: 'hidden-project',
            currentFileAssetId: 'hidden-file',
            versions: [{ fileAssetId: 'hidden-version' }],
          },
        ]),
      },
      projectStageOneDocument: { findMany: vi.fn().mockResolvedValue([]) },
      entityAttachment: {
        findMany: vi.fn().mockResolvedValue([{ fileAssetId: 'hidden-link' }]),
      },
    };
    const scopedActor = {
      ...actor,
      permissions: [...actor.permissions, 'project.stage1.finance.read'],
      permissionSources: [
        {
          permission: 'project.stage1.finance.read',
          roleId: 'finance-role',
          roleName: 'Finance',
          scopeType: 'SELF' as const,
          departmentId: null,
        },
      ],
    } satisfies CurrentActor;

    await expect(
      hiddenStageOneFinanceFileIds(db as never, scopedActor),
    ).resolves.toEqual(['hidden-file', 'hidden-version', 'hidden-link']);
  });
});
