import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import ExcelJS from 'exceljs';
import { describe, expect, it, vi } from 'vitest';
import { BusinessEntityPolicy } from '../access-control/business-entity.policy';
import { REQUIRED_PERMISSIONS } from '../access-control/access.decorators';
import { CurrentActor } from '../access-control/current-actor';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma.service';
import {
  STAGE_TWO_PLAN_HEADERS,
  StageTwoDocumentDefinitionDto,
  StageTwoPlanBatchDto,
} from './project-stage-two.dto';
import { ProjectStageTwoService } from './project-stage-two.service';
import { ProjectStageTwoController } from './project-stage-two.controller';

const actor = (
  permissions: string[],
  administrationScope: CurrentActor['administrationScope'] = 'SELF',
) =>
  ({
    organizationId: '11111111-1111-4111-8111-111111111111',
    userId: '22222222-2222-4222-8222-222222222222',
    organizationMembershipId: '33333333-3333-4333-8333-333333333333',
    email: 'stage-two@example.test',
    displayName: 'Stage Two',
    mustChangePassword: false,
    permissions,
    administrationScope,
    managedDepartmentIds: [],
    administrationTier: 0,
  }) satisfies CurrentActor;

const project = {
  id: '44444444-4444-4444-8444-444444444444',
  code: 'P-002',
  name: 'Stage Two Project',
  stageStates: [{ status: 'IN_PROGRESS' }],
  stageSteps: [],
  requiredDocuments: [],
  stageOneDocuments: [],
};

const service = (prisma: unknown, projectActor?: CurrentActor) => {
  const supplied = prisma as Record<string, Record<string, unknown>>;
  return new ProjectStageTwoService(
    {
      ...supplied,
      projectRequiredDocument: {
        findMany: async () => [],
        ...supplied.projectRequiredDocument,
      },
      projectStageOneDocument: {
        findMany: async () => [],
        ...supplied.projectStageOneDocument,
      },
      entityAttachment: {
        findMany: async () => [],
        ...supplied.entityAttachment,
      },
    } as unknown as PrismaService,
    {
      projectWhere: () => ({ organizationId: actor([]).organizationId }),
      actorForProject: vi.fn().mockResolvedValue(projectActor),
    } as unknown as BusinessEntityPolicy,
    { write: async () => ({}) } as unknown as AuditService,
  );
};

const definitionInput = {
  name: 'Hồ sơ tiến độ',
  workstreamKey: 'PLAN' as const,
  description: 'Gantt tổng thể',
  position: 4,
  initialMatrix: true as const,
  active: true,
};

const definitionFixture = (
  options: {
    initialMatrix?: boolean;
    logicalDocument?: boolean;
    legacyVersion?: boolean;
    currentFile?: boolean;
    currentVersion?: number;
    historical?: boolean;
  } = {},
) => {
  const definition = {
    id: '77777777-7777-4777-8777-777777777777',
    organizationId: actor([]).organizationId,
    projectId: project.id,
    stageKey: 'STAGE_2',
    workstreamKey: 'PLAN',
    documentType: definitionInput.name,
    documentName: definitionInput.name,
    normalizedName: 'hồ sơ tiến độ',
    notes: definitionInput.description,
    position: definitionInput.position,
    initialMatrix: options.initialMatrix ?? true,
    required: false,
    status: 'MISSING',
    currentFileAssetId: options.currentFile ? 'file-1' : null,
    currentVersion: options.currentVersion ?? 0,
    supersededAt: options.historical ? new Date('2026-08-22') : null,
    supersededBy: options.historical ? actor([]).userId : null,
  };
  const tx = {
    project: { findFirst: vi.fn().mockResolvedValue({ id: project.id }) },
    $queryRaw: vi.fn().mockResolvedValue([{ id: project.id }]),
    projectRequiredDocument: {
      findMany: vi
        .fn()
        .mockResolvedValue(options.historical ? [definition] : []),
      findFirst: vi.fn().mockResolvedValue(definition),
      create: vi.fn(async ({ data }) => ({ ...definition, ...data })),
      update: vi.fn(async ({ data }) => ({ ...definition, ...data })),
    },
    projectStageOneDocument: {
      findFirst: vi
        .fn()
        .mockResolvedValue(
          options.logicalDocument ? { id: 'logical-1' } : null,
        ),
    },
    projectRequiredDocumentVersion: {
      findFirst: vi
        .fn()
        .mockResolvedValue(options.legacyVersion ? { id: 'version-1' } : null),
    },
    activity: { create: vi.fn() },
  };
  return {
    definition,
    tx,
    commands: service({
      $transaction: (run: (client: typeof tx) => unknown) => run(tx),
    }),
  };
};

describe('project Stage 2 schema', () => {
  it('exposes baseline planning and import ownership fields to Stage 2 services', () => {
    const models = new Map(
      Prisma.dmmf.datamodel.models.map((model) => [model.name, model.fields]),
    );

    expect(models.get('Task')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'code',
          type: 'String',
          isRequired: false,
        }),
        expect.objectContaining({
          name: 'baselineVersion',
          type: 'Int',
          isRequired: false,
        }),
        expect.objectContaining({
          name: 'allocatedBudget',
          type: 'Decimal',
          isRequired: false,
        }),
      ]),
    );
    expect(models.get('ImportJob')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'projectId',
          type: 'String',
          isRequired: false,
        }),
        expect.objectContaining({
          name: 'fileAssetId',
          type: 'String',
          isRequired: false,
        }),
        expect.objectContaining({
          name: 'project',
          type: 'Project',
          isRequired: false,
        }),
        expect.objectContaining({
          name: 'fileAsset',
          type: 'FileAsset',
          isRequired: false,
        }),
      ]),
    );
    expect(models.get('ProjectRequiredDocument')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'required',
          hasDefaultValue: true,
          default: false,
        }),
      ]),
    );
  });
});

describe('Stage 2 plan boundary', () => {
  it('publishes the Stage 2 workspace route to every Project reader', () => {
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS,
        ProjectStageTwoController.prototype.get,
      ),
    ).toEqual(['project.read']);
  });

  it('advertises and enforces the same file permissions for Stage 2 imports', async () => {
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS,
        ProjectStageTwoController.prototype.preview,
      ),
    ).toEqual(['project.read', 'import.create', 'file.read', 'file.download']);
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS,
        ProjectStageTwoController.prototype.confirm,
      ),
    ).toEqual([
      'project.read',
      'import.confirm',
      'task.create',
      'file.read',
      'file.download',
    ]);

    const get = (permissions: string[]) =>
      service({
        project: { findFirst: async () => project, findMany: async () => [] },
        task: { findMany: async () => [] },
        projectMember: { findMany: async () => [] },
        department: { findMany: async () => [] },
      }).get(actor(permissions), project.id, 1);
    await expect(
      get([
        'project.read',
        'task.read',
        'import.create',
        'import.confirm',
        'task.create',
        'file.read',
      ]),
    ).resolves.toMatchObject({
      permittedCommands: { previewImport: false, confirmImport: false },
    });
    await expect(
      get([
        'project.read',
        'task.read',
        'import.create',
        'import.confirm',
        'task.create',
        'file.read',
        'file.download',
      ]),
    ).resolves.toMatchObject({
      permittedCommands: { previewImport: true, confirmImport: true },
    });
  });

  it('returns documents without querying plan rows for a Project-only reader', async () => {
    const findPlan = vi.fn().mockResolvedValue([]);
    const result = await service({
      project: { findFirst: async () => project, findMany: async () => [] },
      task: { findMany: findPlan },
      projectMember: { findMany: async () => [] },
      department: { findMany: async () => [] },
    }).get(actor(['project.read']), project.id, 1);

    expect(findPlan).not.toHaveBeenCalled();
    expect(result.plan).toEqual([]);
    expect(result.permittedCommands).toMatchObject({
      viewPlan: false,
      addPlanRows: false,
      editPlanRows: false,
      deletePlanRows: false,
    });
  });

  it('does not borrow Stage 2 task commands from another Project', async () => {
    const findPlan = vi.fn();
    const globalActor = {
      ...actor(['project.read', 'task.read', 'task.create']),
      permissionSources: [
        {
          permission: 'project.read',
          roleId: 'project-reader',
          roleName: 'Project reader',
          scopeType: 'ORGANIZATION' as const,
          departmentId: null,
        },
        ...['task.read', 'task.create'].map((permission) => ({
          permission,
          roleId: 'task-role',
          roleName: 'Task role',
          scopeType: 'SELF' as const,
          departmentId: null,
        })),
      ],
    } satisfies CurrentActor;
    const scopedActor = {
      ...globalActor,
      permissions: ['project.read'],
    } satisfies CurrentActor;

    const result = await service(
      {
        project: { findFirst: async () => project, findMany: async () => [] },
        task: { findMany: findPlan },
        projectMember: { findMany: async () => [] },
        department: { findMany: async () => [] },
      },
      scopedActor,
    ).get(globalActor, project.id, 1);

    expect(findPlan).not.toHaveBeenCalled();
    expect(result.permittedCommands).toMatchObject({
      viewPlan: false,
      addPlanRows: false,
    });
  });
  it('initializes the exact four optional document defaults once and preserves later edits', async () => {
    let initializedAt: Date | null = null;
    const definitions: Record<string, unknown>[] = [
      {
        id: 'definition-existing',
        documentType: 'Kế hoạch & khảo sát dự án',
        documentName: 'Kế hoạch & khảo sát dự án',
        required: true,
        position: 0,
        notes: null,
        supersededAt: null,
      },
    ];
    const tx = {
      project: { findFirst: vi.fn().mockResolvedValue({ id: project.id }) },
      $queryRaw: vi.fn().mockResolvedValue([{ id: project.id }]),
      projectStageState: {
        findUniqueOrThrow: vi.fn(async () => ({
          documentDefinitionsInitializedAt: initializedAt,
        })),
        updateMany: vi.fn(async () => {
          if (initializedAt) return { count: 0 };
          initializedAt = new Date('2026-08-14T00:00:00.000Z');
          return { count: 1 };
        }),
      },
      projectRequiredDocument: {
        findMany: vi.fn(async () => definitions),
        updateMany: vi.fn(async () => {
          for (const definition of definitions) definition.required = false;
          return { count: 1 };
        }),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const definition = {
            id: `definition-${definitions.length + 1}`,
            notes: null,
            supersededAt: null,
            ...data,
          };
          return definition;
        }),
      },
      activity: { create: vi.fn() },
    };
    const audit = { write: vi.fn() };
    const commands = new ProjectStageTwoService(
      {
        $transaction: (run: (transaction: typeof tx) => unknown) => run(tx),
      } as never,
      {
        projectWhere: () => ({ organizationId: actor([]).organizationId }),
      } as never,
      audit as never,
    );
    const editor = actor(['project.update']);

    await expect(
      commands.initializeDocumentDefinitions(editor, project.id),
    ).resolves.toEqual({ initialized: true });
    expect(
      definitions.map(({ documentName, position, required }) => ({
        documentName,
        position,
        required,
      })),
    ).toEqual([
      {
        documentName: 'Kế hoạch & khảo sát dự án',
        position: 0,
        required: false,
      },
      {
        documentName: 'Thiết kế, sản phẩm & BOQ',
        position: 1,
        required: false,
      },
      {
        documentName: 'Thẩm định & phê duyệt',
        position: 2,
        required: false,
      },
      { documentName: 'Hồ sơ khác', position: 3, required: false },
    ]);

    definitions[0]!.documentName = 'Tên đã đổi';
    definitions[0]!.supersededAt = new Date('2026-08-15T00:00:00.000Z');
    definitions[0]!.required = true;
    await expect(
      commands.initializeDocumentDefinitions(editor, project.id),
    ).resolves.toEqual({ initialized: false });
    expect(definitions).toHaveLength(4);
    expect(definitions[0]).toMatchObject({
      documentName: 'Tên đã đổi',
      required: false,
      supersededAt: expect.any(Date),
    });
    expect(tx.activity.create).toHaveBeenCalledOnce();
    expect(audit.write).toHaveBeenCalledOnce();
    expect(tx.projectRequiredDocument.updateMany).toHaveBeenCalledTimes(2);
    expect(tx.projectRequiredDocument.updateMany).toHaveBeenLastCalledWith({
      where: { id: { in: ['definition-existing'] }, required: true },
      data: { required: false },
    });
  });

  it('accepts only a bounded optional Step 1 document definition', async () => {
    const valid = plainToInstance(StageTwoDocumentDefinitionDto, {
      name: '  Hồ sơ tiến độ  ',
      workstreamKey: 'PLAN',
      description: '  Gantt tổng thể  ',
      position: 3,
      initialMatrix: true,
      active: true,
    });
    expect(await validate(valid)).toEqual([]);
    expect(valid).toMatchObject({
      name: 'Hồ sơ tiến độ',
      description: 'Gantt tổng thể',
    });

    const invalid = plainToInstance(StageTwoDocumentDefinitionDto, {
      name: '',
      workstreamKey: 'SURVEY',
      position: -1,
      initialMatrix: 'yes',
      active: 'yes',
    });
    expect(await validate(invalid)).not.toEqual([]);

    const workflow = plainToInstance(StageTwoDocumentDefinitionDto, {
      ...definitionInput,
      initialMatrix: false,
    });
    expect(await validate(workflow)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'initialMatrix' }),
      ]),
    );
  });

  it.each(['createDocumentDefinition', 'updateDocumentDefinition'] as const)(
    'never lets %s persist a non-Matrix Stage 2 definition',
    async (command) => {
      const { commands, definition, tx } = definitionFixture();
      const input = { ...definitionInput, initialMatrix: false } as never;

      await expect(
        command === 'createDocumentDefinition'
          ? commands.createDocumentDefinition(
              actor(['project.document.manage']),
              project.id,
              input,
            )
          : commands.updateDocumentDefinition(
              actor(['project.document.manage']),
              project.id,
              definition.id,
              input,
            ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.projectRequiredDocument.create).not.toHaveBeenCalled();
      expect(tx.projectRequiredDocument.update).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['a linked logical document', { logicalDocument: true }],
    ['legacy version history', { legacyVersion: true }],
    ['a current file', { currentFile: true }],
    ['a version counter', { currentVersion: 1 }],
  ] as const)(
    'rejects updating a legacy Workflow Stage 2 definition to Matrix after %s exists',
    async (_name, history) => {
      const { commands, definition, tx } = definitionFixture({
        initialMatrix: false,
        ...history,
      });

      await expect(
        commands.updateDocumentDefinition(
          actor(['project.document.manage']),
          project.id,
          definition.id,
          definitionInput,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(tx.projectRequiredDocument.update).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['a linked logical document', { logicalDocument: true }],
    ['legacy version history', { legacyVersion: true }],
    ['a current file', { currentFile: true }],
    ['a version counter', { currentVersion: 1 }],
  ] as const)(
    'rejects restoring a legacy Workflow Stage 2 definition as Matrix after %s exists',
    async (_name, history) => {
      const { commands, tx } = definitionFixture({
        initialMatrix: false,
        historical: true,
        ...history,
      });

      await expect(
        commands.createDocumentDefinition(
          actor(['project.document.manage']),
          project.id,
          definitionInput,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(tx.projectRequiredDocument.update).not.toHaveBeenCalled();
    },
  );

  it('validates a bounded full batch and rejects malformed row contracts', async () => {
    const valid = plainToInstance(StageTwoPlanBatchDto, {
      rows: [
        {
          code: ' cv-01 ',
          description: ' Công việc ',
          departmentId: '55555555-5555-4555-8555-555555555555',
          startDate: '2026-08-14',
          finishDate: '2026-08-15',
          allocatedBudget: '1000.5',
        },
      ],
      removedRows: [],
    });
    expect(await validate(valid)).toEqual([]);
    expect(valid.rows[0]).toMatchObject({
      code: 'CV-01',
      description: 'Công việc',
      allocatedBudget: '1000.5',
    });

    const invalid = plainToInstance(StageTwoPlanBatchDto, {
      rows: [
        {
          id: 'not-a-uuid',
          code: '',
          description: '',
          departmentId: 'not-a-uuid',
          startDate: '14/08/2026',
          finishDate: '2026-08-15',
          allocatedBudget: '-1',
        },
      ],
      removedRows: [{ id: 'not-a-uuid', version: 0 }],
    });
    expect(await validate(invalid)).not.toEqual([]);
  });

  it('rejects null allocated budget instead of coercing it to zero', async () => {
    const input = plainToInstance(StageTwoPlanBatchDto, {
      rows: [
        {
          code: 'CV-NULL',
          description: 'Không ép null thành số',
          departmentId: '55555555-5555-4555-8555-555555555555',
          startDate: '2026-08-14',
          finishDate: '2026-08-15',
          allocatedBudget: null,
        },
      ],
      removedRows: [],
    });

    expect(await validate(input)).not.toEqual([]);
  });

  it('does not persist a plan after membership is removed while waiting for the Project lock', async () => {
    let membershipActive = true;
    const create = vi.fn();
    const tx = {
      project: {
        findFirst: vi.fn(async () =>
          membershipActive ? { id: project.id } : null,
        ),
      },
      $queryRaw: vi.fn(async () => {
        membershipActive = false;
        return [{ id: project.id }];
      }),
      task: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        create,
      },
      department: { count: vi.fn().mockResolvedValue(1) },
      activity: { create: vi.fn() },
    };
    const commands = service({
      project: {
        findFirst: vi.fn().mockResolvedValue(project),
        findMany: vi.fn().mockResolvedValue([]),
      },
      task: { findMany: vi.fn().mockResolvedValue([]) },
      projectMember: { findMany: vi.fn().mockResolvedValue([]) },
      department: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: vi.fn((run) => run(tx)),
    });

    await expect(
      commands.savePlan(
        actor(['project.read', 'task.read', 'task.create']),
        project.id,
        {
          rows: [
            {
              code: 'CV-01',
              description: 'Công việc',
              departmentId: '55555555-5555-4555-8555-555555555555',
              startDate: '2026-08-14',
              finishDate: '2026-08-15',
            },
          ],
          removedRows: [],
        },
      ),
    ).rejects.toThrow('Project not found');
    expect(create).not.toHaveBeenCalled();
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.project.findFirst.mock.invocationCallOrder[0]!,
    );
  });

  it('builds the authorized six-column XLSX template with no sample financial data', async () => {
    const prisma = {
      project: { findFirst: async () => ({ id: project.id }) },
      department: {
        findMany: async () => [
          {
            id: '55555555-5555-4555-8555-555555555555',
            code: 'DESIGN',
            name: 'Thiết kế',
          },
        ],
      },
    };
    const bytes = await service(prisma).template(
      actor(['project.read', 'task.create', 'estimate.read']),
      project.id,
    );
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes as never);
    const worksheet = workbook.worksheets[0]!;
    expect(
      STAGE_TWO_PLAN_HEADERS.map((_, index) =>
        worksheet.getCell(1, index + 1).text.trim(),
      ),
    ).toEqual(STAGE_TWO_PLAN_HEADERS);
    expect(worksheet.actualRowCount).toBe(1);
  });

  it('never selects or returns allocated budget without estimate.read', async () => {
    const findMany = async (input: Record<string, unknown>) => {
      expect(JSON.stringify(input)).not.toContain('allocatedBudget');
      return [
        {
          id: '66666666-6666-4666-8666-666666666666',
          code: 'CV-01',
          description: 'Công việc',
          departmentId: '55555555-5555-4555-8555-555555555555',
          startDate: new Date('2026-08-14T00:00:00.000Z'),
          dueDate: new Date('2026-08-15T00:00:00.000Z'),
          version: 1,
          department: {
            id: '55555555-5555-4555-8555-555555555555',
            name: 'Thiết kế',
          },
        },
      ];
    };
    const projectOptionsFindMany = vi
      .fn()
      .mockResolvedValue([
        { id: project.id, code: project.code, name: project.name },
      ]);
    const result = await service({
      project: {
        findFirst: async () => project,
        findMany: projectOptionsFindMany,
      },
      task: { findMany },
      projectMember: { findMany: async () => [] },
      department: { findMany: async () => [] },
    }).get(actor(['project.read', 'task.read']), project.id, 1);
    expect(JSON.stringify(result)).not.toContain('allocatedBudget');
    expect(result.capabilities).toEqual({
      canSwitchProject: true,
      canManageProjectAccess: false,
      canReadDocuments: true,
      canUploadDocuments: false,
      canSubmitDocuments: false,
      canManageDocumentTypes: false,
      canCompleteStep: false,
      canReopenStep: false,
      canPreviewFiles: false,
      canDownloadFiles: false,
      canDeleteProjectDocuments: false,
      canDeleteProject: false,
      canManageKeyDossier: false,
      canDeleteKeyDossierItem: false,
      canDeleteAttachment: false,
      canUploadWorkflowDocuments: false,
      canUploadKeyDossierAttachments: false,
      canReadFinance: false,
      canManageFinance: false,
    });
    expect(result.options.projects).toEqual([
      { id: project.id, code: project.code, name: project.name },
    ]);
    expect(projectOptionsFindMany).toHaveBeenCalledWith({
      where: { organizationId: actor([]).organizationId },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: { id: true, code: true, name: true },
    });
  });

  it('returns the persisted upload timestamp for the Stage 2 actual-file list', async () => {
    const createdAt = new Date('2026-08-14T03:04:05.000Z');
    const findFirst = vi.fn(
      async (input: {
        select: { stageOneDocuments: { select: Record<string, unknown> } };
      }) => {
        expect(input.select.stageOneDocuments.select.createdAt).toBe(true);
        return {
          ...project,
          stageOneDocuments: [
            {
              id: 'document-1',
              requiredDocumentId: 'definition-1',
              documentType: 'Kế hoạch tiến độ',
              displayName: 'Kế hoạch tiến độ',
              status: 'UPLOADED',
              currentVersion: 1,
              currentFileAssetId: 'file-1',
              createdAt,
              submittedOfficer: null,
              currentFileAsset: {
                id: 'file-1',
                originalFilename: 'plan.pdf',
                mimeType: 'application/pdf',
                sizeBytes: 21_474_836_480n,
              },
            },
          ],
        };
      },
    );
    const result = await service({
      project: { findFirst, findMany: async () => [] },
      task: { findMany: async () => [] },
      projectMember: { findMany: async () => [] },
      department: { findMany: async () => [] },
    }).get(actor(['project.read', 'task.read', 'file.read']), project.id, 1);

    expect(result.documents[0]).toMatchObject({
      createdAt,
      currentFileAsset: { sizeBytes: '21474836480' },
    });
    expect(() => JSON.stringify(result)).not.toThrow();

    const restricted = await service({
      project: { findFirst, findMany: async () => [] },
      task: { findMany: async () => [] },
      projectMember: { findMany: async () => [] },
      department: { findMany: async () => [] },
    }).get(actor(['project.read', 'task.read']), project.id, 1);
    expect(JSON.stringify(restricted.documents)).not.toMatch(
      /file-1|plan\.pdf/,
    );
    expect(
      findFirst.mock.calls[1]?.[0]?.select.stageOneDocuments.select
        .currentFileAsset,
    ).toBe(false);
  });

  it('normalizes Decimal money for an authorized plan reader', async () => {
    const result = await service({
      project: { findFirst: async () => project, findMany: async () => [] },
      task: {
        findMany: async () => [
          {
            id: '66666666-6666-4666-8666-666666666666',
            code: 'CV-01',
            description: 'Công việc',
            departmentId: '55555555-5555-4555-8555-555555555555',
            startDate: new Date('2026-08-14T00:00:00.000Z'),
            dueDate: new Date('2026-08-15T00:00:00.000Z'),
            allocatedBudget: new Prisma.Decimal('1000.50'),
            version: 1,
            department: {
              id: '55555555-5555-4555-8555-555555555555',
              name: 'Thiết kế',
            },
          },
        ],
      },
      projectMember: { findMany: async () => [] },
      department: { findMany: async () => [] },
    }).get(
      actor(['project.read', 'task.read', 'estimate.read']),
      project.id,
      1,
    );
    expect(result.plan[0]).toMatchObject({ allocatedBudget: '1000.50' });
  });

  it('lets project membership make a Project Task visible to entity policy', () => {
    const where = new BusinessEntityPolicy({} as PrismaService).taskWhere(
      actor(['task.read']),
    );
    expect(JSON.stringify(where)).toContain('project');
    expect(JSON.stringify(where)).toContain('members');
  });
});
