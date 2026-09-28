import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
  ValidationPipe,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { BusinessEntityPolicy } from '../access-control/business-entity.policy';
import { REQUIRED_PERMISSIONS } from '../access-control/access.decorators';
import { CurrentActor } from '../access-control/current-actor';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma.service';
import { ProjectProductsService } from './project-products.service';
import { ProjectProductsController } from './project-products.controller';
import {
  CreateProjectRequiredDocumentDto,
  ProjectDocumentsQuery,
  UpdateProjectRequiredDocumentDto,
} from './project-products.dto';
import { ProjectApproverResolver } from './project-approver-resolver.service';

const actor = {
  organizationId: 'organization',
  userId: 'actor',
  organizationMembershipId: 'membership',
  email: 'actor@example.test',
  displayName: 'Actor',
  mustChangePassword: false,
  permissions: [
    'project.product.submit_technical',
    'project.product.approve_technical',
  ],
  administrationScope: 'SELF',
  managedDepartmentIds: [],
  administrationTier: 0,
} satisfies CurrentActor;
const fileActor = {
  ...actor,
  permissions: [
    ...actor.permissions,
    'file.read',
    'project.stage1.finance.read',
    'estimate.read',
  ],
} satisfies CurrentActor;
const policy = {
  projectWhere: vi.fn(() => ({ organizationId: actor.organizationId })),
} as unknown as BusinessEntityPolicy;
const approvers = {
  resolve: vi.fn().mockResolvedValue([]),
} as unknown as ProjectApproverResolver;
const auditService = { write: vi.fn() } as unknown as AuditService;
const validation = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

function withProjectLock<T extends Record<string, unknown>>(tx: T) {
  if (!('$queryRaw' in tx))
    Object.assign(tx, {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'project' }]),
    });
  if (!('project' in tx))
    Object.assign(tx, {
      project: { findFirst: vi.fn().mockResolvedValue({ id: 'project' }) },
    });
  return tx;
}

describe('ProjectProductsService', () => {
  it.each(['documents', 'documentHistory'])(
    'allows Project readers to use the %s document read route',
    (method) => {
      const handler = Reflect.get(
        ProjectProductsController.prototype,
        method,
      ) as object;
      expect(Reflect.getMetadata(REQUIRED_PERMISSIONS, handler)).toEqual([
        'project.read',
      ]);
    },
  );
  it('accepts an exact requirement id for compatibility lookups', async () => {
    const requirementId = '40000000-0000-4000-8000-000000000391';

    await expect(
      validation.transform(
        { page: 1, pageSize: 1, requirementId },
        { type: 'query', metatype: ProjectDocumentsQuery },
      ),
    ).resolves.toMatchObject({ page: 1, pageSize: 1, requirementId });
    await expect(
      validation.transform(
        { page: 1, pageSize: 1, requirementId: 'not-a-uuid' },
        { type: 'query', metatype: ProjectDocumentsQuery },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('scopes compatibility lookups to the exact Project requirement', async () => {
    const requirementId = '40000000-0000-4000-8000-000000000391';
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = {
      project: { findFirst: vi.fn().mockResolvedValue({ id: 'project' }) },
      projectRequiredDocument: {
        findMany,
        count: vi.fn().mockResolvedValue(0),
      },
      user: { findMany: vi.fn().mockResolvedValue([]) },
      fileAsset: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: vi.fn((queries) => Promise.all(queries)),
    } as unknown as PrismaService;

    await new ProjectProductsService(
      prisma,
      policy,
      approvers,
      auditService,
    ).documents(actor, 'project', { page: 1, pageSize: 1, requirementId });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: requirementId }),
      }),
    );
  });

  it('lists active definitions and lifecycle-superseded history, not archived rows', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = {
      project: { findFirst: vi.fn().mockResolvedValue({ id: 'project' }) },
      projectRequiredDocument: {
        findMany,
        count: vi.fn().mockResolvedValue(0),
      },
      user: { findMany: vi.fn().mockResolvedValue([]) },
      fileAsset: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: vi.fn((queries) => Promise.all(queries)),
    } as unknown as PrismaService;

    await new ProjectProductsService(
      prisma,
      policy,
      approvers,
      auditService,
    ).documents(actor, 'project', { page: 1, pageSize: 20 });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ supersededAt: null }, { status: 'SUPERSEDED' }],
        }),
      }),
    );
  });

  it('does not hydrate foreign owners or corrupt current-file pointers', async () => {
    const items = [
      {
        id: 'document-other-project-file',
        documentType: 'SURVEY_REPORT',
        ownerUserId: 'foreign-owner',
        currentFileAssetId: 'same-org-other-project-file',
      },
      {
        id: 'document-cross-org-file',
        documentType: 'SURVEY_REPORT',
        ownerUserId: null,
        currentFileAssetId: 'cross-org-file',
      },
      {
        id: 'document-valid-file',
        documentType: 'SURVEY_REPORT',
        ownerUserId: 'active-owner',
        currentFileAssetId: 'same-project-file',
      },
    ];
    const findOwners = vi
      .fn()
      .mockResolvedValue([{ id: 'active-owner', displayName: 'Active Owner' }]);
    const findFiles = vi.fn().mockResolvedValue([
      {
        id: 'same-project-file',
        originalFilename: 'visible.pdf',
        storedFilename: 'internal-name',
        storageKey: 'private/storage/key',
        checksum: 'private-checksum',
        sizeBytes: 9_007_199_254_740_993n,
        createdAt: new Date('2026-08-12T00:00:00.000Z'),
      },
    ]);
    const prisma = {
      project: { findFirst: vi.fn().mockResolvedValue({ id: 'project' }) },
      projectRequiredDocument: {
        findMany: vi.fn().mockResolvedValue(items),
        count: vi.fn().mockResolvedValue(items.length),
      },
      user: { findMany: findOwners },
      fileAsset: { findMany: findFiles },
      $transaction: vi.fn((queries) => Promise.all(queries)),
    } as unknown as PrismaService;

    const result = await new ProjectProductsService(
      prisma,
      policy,
      approvers,
      auditService,
    ).documents(fileActor, 'project', { page: 1, pageSize: 20 });

    expect(result.items).toEqual([
      expect.objectContaining({
        id: 'document-other-project-file',
        owner: null,
        currentFile: null,
      }),
      expect.objectContaining({
        id: 'document-cross-org-file',
        owner: null,
        currentFile: null,
      }),
      expect.objectContaining({
        id: 'document-valid-file',
        owner: { id: 'active-owner', displayName: 'Active Owner' },
        currentFile: expect.objectContaining({
          id: 'same-project-file',
          originalFilename: 'visible.pdf',
          sizeBytes: '9007199254740993',
        }),
      }),
    ]);
    expect(JSON.stringify(result)).not.toMatch(
      /internal-name|private\/storage\/key|private-checksum/,
    );
    expect(findFiles).toHaveBeenCalledWith({
      where: {
        id: {
          in: [
            'same-org-other-project-file',
            'cross-org-file',
            'same-project-file',
          ],
          notIn: [],
        },
        organizationId: actor.organizationId,
        deletedAt: null,
        attachments: { some: { projectId: 'project' } },
        NOT: { attachments: { some: { entityType: 'ChatRoom' } } },
      },
      select: {
        id: true,
        originalFilename: true,
        mimeType: true,
        sizeBytes: true,
        uploadedById: true,
        createdAt: true,
      },
    });
    expect(findOwners).toHaveBeenCalledWith({
      where: {
        id: { in: ['foreign-owner', 'active-owner'] },
        status: 'active',
        organizationMembers: {
          some: { organizationId: actor.organizationId, status: 'active' },
        },
      },
      select: { id: true, displayName: true },
    });
  });

  it('accepts only nullable owner and ISO due date document updates', async () => {
    await expect(
      validation.transform(
        {
          ownerUserId: null,
          dueDate: null,
        },
        { type: 'body', metatype: UpdateProjectRequiredDocumentDto },
      ),
    ).resolves.toEqual({ ownerUserId: null, dueDate: null });
    await expect(
      validation.transform(
        {
          dueDate: '2026-08-31T00:00:00.000Z',
        },
        { type: 'body', metatype: UpdateProjectRequiredDocumentDto },
      ),
    ).resolves.toEqual({ dueDate: '2026-08-31T00:00:00.000Z' });
    for (const field of ['stageKey', 'required', 'documentName', 'notes'])
      await expect(
        validation.transform(
          { [field]: field === 'required' ? false : 'unexpected' },
          { type: 'body', metatype: UpdateProjectRequiredDocumentDto },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects required Project document definitions at the API boundary', async () => {
    await expect(
      validation.transform(
        {
          stageKey: 'STAGE_1',
          workstreamKey: 'WORKFLOW_STEP_1',
          documentType: 'PROJECT_DOSSIER',
          documentName: 'Hồ sơ dự án',
          required: true,
        },
        { type: 'body', metatype: CreateProjectRequiredDocumentDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('persists generic Project document definitions as optional', async () => {
    const create = vi.fn(async ({ data }) => ({ id: 'document', ...data }));
    const tx = {
      projectRequiredDocument: { create },
      activity: { create: vi.fn() },
    };
    const prisma = {
      project: { findFirst: vi.fn().mockResolvedValue({ id: 'project' }) },
      $transaction: vi.fn((work) => work(withProjectLock(tx))),
    } as unknown as PrismaService;

    await new ProjectProductsService(
      prisma,
      policy,
      approvers,
      auditService,
    ).createDocument(actor, 'project', {
      stageKey: 'STAGE_1',
      workstreamKey: 'WORKFLOW_STEP_1',
      documentType: 'PROJECT_DOSSIER',
      documentName: 'Hồ sơ dự án',
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ required: false }),
    });
  });

  it('does not create a financial definition outside finance scope', async () => {
    const create = vi.fn();
    const tx = {
      project: { findFirst: vi.fn().mockResolvedValue(null) },
      projectRequiredDocument: { create },
      activity: { create: vi.fn() },
    };
    const prisma = {
      project: { findFirst: vi.fn().mockResolvedValue({ id: 'project' }) },
      $transaction: vi.fn((work) => work(withProjectLock(tx))),
    } as unknown as PrismaService;
    const scopedPolicy = {
      projectWhere: vi.fn().mockReturnValue({}),
      hasProjectPermissions: vi.fn().mockResolvedValue(false),
    } as unknown as BusinessEntityPolicy;
    const scopedActor = {
      ...actor,
      permissions: [
        'project.document.manage',
        'project.stage1.finance.read',
        'project.stage1.finance.manage',
      ],
      permissionSources: [
        {
          permission: 'project.document.manage',
          roleId: 'document-role',
          roleName: 'Documents',
          scopeType: 'ORGANIZATION' as const,
          departmentId: null,
        },
        ...['project.stage1.finance.read', 'project.stage1.finance.manage'].map(
          (permission) => ({
            permission,
            roleId: 'finance-role',
            roleName: 'Finance',
            scopeType: 'SELF' as const,
            departmentId: null,
          }),
        ),
      ],
    } satisfies CurrentActor;

    await expect(
      new ProjectProductsService(
        prisma,
        scopedPolicy,
        approvers,
        auditService,
      ).createDocument(scopedActor, 'project', {
        stageKey: 'STAGE_1',
        workstreamKey: 'FINANCIAL_PLANNING',
        documentType: 'PRELIMINARY_FINANCIAL_PLAN',
        documentName: 'Kế hoạch tài chính sơ bộ',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(create).not.toHaveBeenCalled();
  });

  it('requires finance manage permission for a financial upload target', async () => {
    const prisma = {
      project: { findFirst: vi.fn().mockResolvedValue({ id: 'project' }) },
      projectRequiredDocument: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'document',
          projectId: 'project',
          documentType: 'PRELIMINARY_FINANCIAL_PLAN',
        }),
      },
    } as unknown as PrismaService;

    await expect(
      new ProjectProductsService(
        prisma,
        policy,
        approvers,
        auditService,
      ).assertDocumentUpload(
        {
          ...actor,
          permissions: ['file.upload', 'project.document.manage'],
        },
        'project',
        'document',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    await expect(
      new ProjectProductsService(
        prisma,
        policy,
        approvers,
        auditService,
      ).assertDocumentUpload(
        {
          ...actor,
          permissions: [
            'project.document.manage',
            'file.upload',
            'project.stage1.finance.manage',
          ],
        },
        'project',
        'document',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects an archived definition as an upload target', async () => {
    const prisma = {
      project: { findFirst: vi.fn().mockResolvedValue({ id: 'project' }) },
      projectRequiredDocument: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'document',
          projectId: 'project',
          documentType: 'SURVEY_REPORT',
          status: 'MISSING',
          supersededAt: new Date(),
        }),
      },
    } as unknown as PrismaService;

    await expect(
      new ProjectProductsService(
        prisma,
        policy,
        approvers,
        auditService,
      ).assertDocumentUpload(
        {
          ...actor,
          permissions: ['file.upload', 'project.document.manage'],
        },
        'project',
        'document',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not expose a project outside actor scope', async () => {
    const prisma = {
      project: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    await expect(
      new ProjectProductsService(prisma, policy, approvers, auditService).list(
        actor,
        'project-b',
        {
          page: 1,
          pageSize: 20,
        },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not create a product after membership is removed while waiting for the Project lock', async () => {
    const scopedActor = {
      ...actor,
      permissions: ['project.product.create'],
      permissionSources: [
        {
          permission: 'project.product.create',
          roleId: 'product-role',
          roleName: 'Products',
          scopeType: 'SELF' as const,
          departmentId: null,
        },
      ],
    } satisfies CurrentActor;
    let membershipActive = true;
    const create = vi.fn().mockResolvedValue({ id: 'line' });
    const tx = {
      $queryRaw: vi.fn(async () => {
        membershipActive = false;
        return [{ id: 'project' }];
      }),
      project: {
        findFirst: vi.fn(async () =>
          membershipActive ? { id: 'project' } : null,
        ),
      },
      projectProductLine: { create },
      activity: { create: vi.fn() },
    };
    const prisma = {
      project: {
        findFirst: vi.fn(async () =>
          membershipActive ? { id: 'project' } : null,
        ),
      },
      $transaction: vi.fn((work) => work(withProjectLock(tx))),
    } as unknown as PrismaService;
    const scopedPolicy = {
      projectWhere: vi.fn().mockReturnValue({
        members: { some: { userId: scopedActor.userId } },
      }),
    } as unknown as BusinessEntityPolicy;

    await expect(
      new ProjectProductsService(
        prisma,
        scopedPolicy,
        approvers,
        auditService,
      ).create(scopedActor, 'project', {
        code: 'P-1',
        customProductName: 'Custom sofa',
        quantity: 1,
        unit: 'cái',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(create).not.toHaveBeenCalled();
  });

  it('does not update a product after membership is removed while waiting for the Project lock', async () => {
    const scopedActor = {
      ...actor,
      permissions: ['project.product.update'],
      permissionSources: [
        {
          permission: 'project.product.update',
          roleId: 'product-role',
          roleName: 'Products',
          scopeType: 'SELF' as const,
          departmentId: null,
        },
      ],
    } satisfies CurrentActor;
    const line = {
      id: 'line',
      code: 'P-1',
      locationId: null,
      positionName: null,
      currentRevision: 1,
      revisions: [
        {
          id: 'revision',
          revision: 1,
          lockedAt: null,
          productId: null,
          variantId: null,
          supplierId: null,
          customProductName: 'Custom sofa',
          quantity: new Prisma.Decimal(1),
          unit: 'cái',
          approvals: [],
        },
      ],
    };
    let membershipActive = true;
    const updateLine = vi.fn();
    const updateRevision = vi.fn();
    const tx = {
      $queryRaw: vi.fn(async () => {
        membershipActive = false;
        return [{ id: 'project' }];
      }),
      project: {
        findFirst: vi.fn(async () =>
          membershipActive ? { id: 'project' } : null,
        ),
      },
      projectProductLine: {
        findFirst: vi.fn().mockResolvedValue(line),
        update: updateLine,
        findUniqueOrThrow: vi.fn().mockResolvedValue(line),
      },
      projectProductRevision: { update: updateRevision },
      activity: { create: vi.fn() },
    };
    const prisma = {
      project: {
        findFirst: vi.fn(async () =>
          membershipActive ? { id: 'project' } : null,
        ),
      },
      projectProductLine: { findFirst: vi.fn().mockResolvedValue(line) },
      $transaction: vi.fn((work) => work(withProjectLock(tx))),
    } as unknown as PrismaService;
    const scopedPolicy = {
      projectWhere: vi.fn().mockReturnValue({
        members: { some: { userId: scopedActor.userId } },
      }),
    } as unknown as BusinessEntityPolicy;

    await expect(
      new ProjectProductsService(
        prisma,
        scopedPolicy,
        approvers,
        auditService,
      ).update(scopedActor, 'project', 'line', { finish: 'Oak' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(updateLine).not.toHaveBeenCalled();
    expect(updateRevision).not.toHaveBeenCalled();
  });

  it('does not create a location after department access is removed while waiting for the Project lock', async () => {
    const scopedActor = {
      ...actor,
      permissions: ['project.location.manage'],
      managedDepartmentIds: ['department'],
      permissionSources: [
        {
          permission: 'project.location.manage',
          roleId: 'location-role',
          roleName: 'Locations',
          scopeType: 'DEPARTMENT' as const,
          departmentId: 'department',
          managedDepartmentIds: ['department'],
        },
      ],
    } satisfies CurrentActor;
    let departmentActive = true;
    const create = vi.fn().mockResolvedValue({ id: 'location' });
    const tx = {
      $queryRaw: vi.fn(async () => {
        departmentActive = false;
        return [{ id: 'project' }];
      }),
      project: {
        findFirst: vi.fn(async () =>
          departmentActive ? { id: 'project' } : null,
        ),
      },
      projectLocation: { create },
    };
    const prisma = {
      project: {
        findFirst: vi.fn(async () =>
          departmentActive ? { id: 'project' } : null,
        ),
      },
      projectLocation: { create },
      $transaction: vi.fn((work) => work(withProjectLock(tx))),
    } as unknown as PrismaService;
    const scopedPolicy = {
      projectWhere: vi.fn().mockReturnValue({
        departments: { some: { departmentId: 'department' } },
      }),
    } as unknown as BusinessEntityPolicy;

    await expect(
      new ProjectProductsService(
        prisma,
        scopedPolicy,
        approvers,
        auditService,
      ).createLocation(scopedActor, 'project', {
        type: 'ROOM',
        code: 'R-1',
        name: 'Room 1',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(create).not.toHaveBeenCalled();
  });

  it('does not create a required document after department access is removed while waiting for the Project lock', async () => {
    const scopedActor = {
      ...actor,
      permissions: ['project.document.manage'],
      managedDepartmentIds: ['department'],
      permissionSources: [
        {
          permission: 'project.document.manage',
          roleId: 'document-role',
          roleName: 'Documents',
          scopeType: 'DEPARTMENT' as const,
          departmentId: 'department',
          managedDepartmentIds: ['department'],
        },
      ],
    } satisfies CurrentActor;
    let departmentActive = true;
    const create = vi.fn().mockResolvedValue({ id: 'document' });
    const tx = {
      $queryRaw: vi.fn(async () => {
        departmentActive = false;
        return [{ id: 'project' }];
      }),
      project: {
        findFirst: vi.fn(async () =>
          departmentActive ? { id: 'project' } : null,
        ),
      },
      projectRequiredDocument: { create },
      activity: { create: vi.fn() },
    };
    const prisma = {
      project: {
        findFirst: vi.fn(async () =>
          departmentActive ? { id: 'project' } : null,
        ),
      },
      $transaction: vi.fn((work) => work(withProjectLock(tx))),
    } as unknown as PrismaService;
    const scopedPolicy = {
      projectWhere: vi.fn().mockReturnValue({
        departments: { some: { departmentId: 'department' } },
      }),
      hasProjectPermissions: vi.fn().mockResolvedValue(true),
    } as unknown as BusinessEntityPolicy;

    await expect(
      new ProjectProductsService(
        prisma,
        scopedPolicy,
        approvers,
        auditService,
      ).createDocument(scopedActor, 'project', {
        stageKey: 'STAGE_3',
        workstreamKey: 'COMMERCIAL',
        documentType: 'CONTRACT',
        documentName: 'Contract',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(create).not.toHaveBeenCalled();
  });

  it('does not update a required document after membership is removed while waiting for the Project lock', async () => {
    const scopedActor = {
      ...actor,
      permissions: ['project.document.manage'],
      permissionSources: [
        {
          permission: 'project.document.manage',
          roleId: 'document-role',
          roleName: 'Documents',
          scopeType: 'SELF' as const,
          departmentId: null,
        },
      ],
    } satisfies CurrentActor;
    const document = {
      id: 'document',
      projectId: 'project',
      documentType: 'SURVEY_REPORT',
      status: 'DRAFT',
      ownerUserId: null,
      dueDate: new Date('2026-08-31T00:00:00.000Z'),
    };
    let membershipActive = true;
    const update = vi.fn().mockResolvedValue({ ...document, dueDate: null });
    const tx = {
      $queryRaw: vi.fn(async () => {
        membershipActive = false;
        return [{ id: 'locked' }];
      }),
      project: {
        findFirst: vi.fn(async () =>
          membershipActive ? { id: 'project' } : null,
        ),
      },
      projectRequiredDocument: {
        findFirst: vi.fn().mockResolvedValue(document),
        update,
      },
      activity: { create: vi.fn() },
      auditLog: { create: vi.fn() },
    };
    const prisma = {
      project: {
        findFirst: vi.fn(async () =>
          membershipActive ? { id: 'project' } : null,
        ),
      },
      projectRequiredDocument: {
        findFirst: vi.fn().mockResolvedValue(document),
      },
      $transaction: vi.fn((work) => work(withProjectLock(tx))),
    } as unknown as PrismaService;
    const scopedPolicy = {
      projectWhere: vi.fn().mockReturnValue({
        members: { some: { userId: scopedActor.userId } },
      }),
      hasProjectPermissions: vi.fn().mockResolvedValue(true),
    } as unknown as BusinessEntityPolicy;

    await expect(
      new ProjectProductsService(
        prisma,
        scopedPolicy,
        approvers,
        auditService,
      ).updateDocument(scopedActor, 'project', 'document', { dueDate: null }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects a variant outside the selected product', async () => {
    const findVariant = vi.fn().mockResolvedValue(null);
    const tx = {
      product: { findFirst: vi.fn().mockResolvedValue({ id: 'product' }) },
      productVariant: { findFirst: findVariant },
    };
    const prisma = {
      $transaction: vi.fn((work) => work(withProjectLock(tx))),
    } as unknown as PrismaService;
    await expect(
      new ProjectProductsService(
        prisma,
        policy,
        approvers,
        auditService,
      ).create(actor, 'project', {
        code: 'P-1',
        productId: 'product',
        variantId: 'other-variant',
        quantity: 1,
        unit: 'cái',
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(findVariant).toHaveBeenCalledWith({
      where: {
        id: 'other-variant',
        productId: 'product',
        product: { organizationId: actor.organizationId },
        activeStatus: 'active',
      },
    });
  });

  it('rejects a foreign variant paired with a custom product', async () => {
    const findVariant = vi.fn().mockResolvedValue({ id: 'foreign-variant' });
    const transaction = vi.fn().mockResolvedValue({});
    const prisma = {
      project: { findFirst: vi.fn().mockResolvedValue({ id: 'project' }) },
      productVariant: { findFirst: findVariant },
      $transaction: transaction,
    } as unknown as PrismaService;

    await expect(
      new ProjectProductsService(
        prisma,
        policy,
        approvers,
        auditService,
      ).create(actor, 'project', {
        code: 'P-1',
        customProductName: 'Custom sofa',
        variantId: 'foreign-variant',
        quantity: 1,
        unit: 'cái',
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(findVariant).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects a location from another project', async () => {
    const tx = {
      projectLocation: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const prisma = {
      $transaction: vi.fn((work) => work(withProjectLock(tx))),
    } as unknown as PrismaService;
    await expect(
      new ProjectProductsService(
        prisma,
        policy,
        approvers,
        auditService,
      ).create(actor, 'project', {
        code: 'P-1',
        locationId: 'other-location',
        customProductName: 'Custom sofa',
        quantity: 1,
        unit: 'cái',
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('keeps an approved revision immutable', async () => {
    const tx = {
      projectProductLine: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'line',
          currentRevision: 1,
          revisions: [{ id: 'revision', revision: 1, lockedAt: new Date() }],
        }),
      },
    };
    const service = new ProjectProductsService(
      {
        $transaction: vi.fn((work) => work(withProjectLock(tx))),
      } as unknown as PrismaService,
      policy,
      approvers,
      auditService,
    );
    await expect(
      service.update(actor, 'project', 'line', { finish: 'Oak' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('prevents the revision creator from self-approving', async () => {
    const tx = {
      projectProductLine: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'line',
          currentRevision: 1,
          revisions: [
            {
              id: 'revision',
              revision: 1,
              createdBy: actor.userId,
              approvals: [
                {
                  id: 'approval',
                  type: 'TECHNICAL',
                  status: 'PENDING',
                  submittedBy: 'other',
                },
              ],
            },
          ],
        }),
      },
    };
    const service = new ProjectProductsService(
      {
        $transaction: vi.fn((work) => work(withProjectLock(tx))),
      } as unknown as PrismaService,
      policy,
      approvers,
      auditService,
    );
    await expect(
      service.decide(actor, 'project', 'line', 'TECHNICAL', {
        decision: 'APPROVED',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('creates a new editable revision from a locked revision', async () => {
    const line = {
      id: 'line',
      currentRevision: 1,
      revisions: [
        {
          revision: 1,
          lockedAt: new Date(),
          quantity: new Prisma.Decimal(1),
          unit: 'cái',
        },
      ],
    };
    const tx = {
      projectProductRevision: {
        create: vi.fn().mockResolvedValue({ revision: 2 }),
      },
      projectProductLine: {
        findFirst: vi.fn().mockResolvedValue(line),
        update: vi.fn(),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'line' }),
      },
      activity: { create: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn((work) => work(withProjectLock(tx))),
    } as unknown as PrismaService;
    const service = new ProjectProductsService(
      prisma,
      policy,
      approvers,
      auditService,
    );
    await expect(
      service.revise(actor, 'project', 'line'),
    ).resolves.toMatchObject({ revision: 2 });
    expect(tx.projectProductLine.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ currentRevision: 2 }),
      }),
    );
  });

  it('blocks required document review until a project file is linked', async () => {
    const document = {
      id: 'document',
      projectId: 'project',
      documentType: 'SURVEY_REPORT',
      status: 'DRAFT',
      currentFileAssetId: null,
    };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'document' }]),
      projectRequiredDocument: {
        findFirst: vi.fn().mockResolvedValue(document),
      },
    };
    const prisma = {
      project: { findFirst: vi.fn().mockResolvedValue({ id: 'project' }) },
      projectRequiredDocument: {
        findFirst: vi.fn().mockResolvedValue(document),
      },
      $transaction: vi.fn((work) => work(withProjectLock(tx))),
    } as unknown as PrismaService;
    const service = new ProjectProductsService(
      prisma,
      policy,
      approvers,
      auditService,
    );

    await expect(
      service.submitDocument(actor, 'project', 'document'),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('hides Stage 1 financial documents without finance permission', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = {
      project: { findFirst: vi.fn().mockResolvedValue({ id: 'project' }) },
      projectRequiredDocument: {
        findMany,
        count: vi.fn().mockResolvedValue(0),
        findFirst: vi.fn().mockResolvedValue({
          id: 'finance-document',
          projectId: 'project',
          documentType: 'PRELIMINARY_FINANCIAL_PLAN',
        }),
      },
      user: { findMany: vi.fn().mockResolvedValue([]) },
      fileAsset: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: vi.fn((queries) => Promise.all(queries)),
    } as unknown as PrismaService;
    const service = new ProjectProductsService(
      prisma,
      policy,
      approvers,
      auditService,
    );

    await service.documents(actor, 'project', { page: 1, pageSize: 20 });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          NOT: {
            OR: [
              { documentType: 'PRELIMINARY_FINANCIAL_PLAN' },
              {
                stageKey: 'STAGE_1',
                workstreamKey: 'FINANCIAL_PLANNING',
              },
            ],
          },
        }),
      }),
    );
    await expect(
      service.documentHistory(actor, 'project', 'finance-document'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns the template-owned completion policy with each document row', async () => {
    const rows = [
      {
        id: 'supporting-document',
        documentType: 'PROPOSAL',
        ownerUserId: null,
        currentFileAssetId: null,
      },
      {
        id: 'approval-document',
        documentType: 'KICKOFF_APPROVAL',
        ownerUserId: null,
        currentFileAssetId: null,
      },
    ];
    const prisma = {
      project: { findFirst: vi.fn().mockResolvedValue({ id: 'project' }) },
      projectRequiredDocument: {
        findMany: vi.fn().mockResolvedValue(rows),
        count: vi.fn().mockResolvedValue(rows.length),
      },
      user: { findMany: vi.fn().mockResolvedValue([]) },
      fileAsset: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: vi.fn((queries) => Promise.all(queries)),
    } as unknown as PrismaService;

    await expect(
      new ProjectProductsService(
        prisma,
        policy,
        approvers,
        auditService,
      ).documents(actor, 'project', { page: 1, pageSize: 20 }),
    ).resolves.toMatchObject({
      items: [
        { id: 'supporting-document', completionPolicy: 'FILE_PRESENT' },
        { id: 'approval-document', completionPolicy: 'APPROVED' },
      ],
    });
  });

  it('returns document status without FileAsset identifiers to a Project-only reader', async () => {
    const fileAsset = {
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'secret-file',
          originalFilename: 'secret.pdf',
          sizeBytes: 8n,
          createdAt: new Date(),
        },
      ]),
    };
    const row = {
      id: 'document',
      documentType: 'PROPOSAL',
      ownerUserId: null,
      status: 'UPLOADED',
      currentVersion: 1,
      currentFileAssetId: 'secret-file',
    };
    const documents = new ProjectProductsService(
      {
        project: { findFirst: vi.fn().mockResolvedValue({ id: 'project' }) },
        projectRequiredDocument: {
          findMany: vi.fn().mockResolvedValue([row]),
          count: vi.fn().mockResolvedValue(1),
        },
        user: { findMany: vi.fn().mockResolvedValue([]) },
        fileAsset,
        $transaction: vi.fn((queries) => Promise.all(queries)),
      } as unknown as PrismaService,
      policy,
      approvers,
      auditService,
    );

    const result = await documents.documents(actor, 'project', {
      page: 1,
      pageSize: 20,
    });

    expect(result.items[0]).toMatchObject({
      id: 'document',
      status: 'UPLOADED',
      currentVersion: 1,
      currentFile: null,
    });
    expect(JSON.stringify(result)).not.toMatch(/secret-file|secret\.pdf/);
    expect(fileAsset.findMany).not.toHaveBeenCalled();
  });

  it('allows a superseded document to enter the replacement-file flow', async () => {
    const update = vi.fn().mockResolvedValue({
      id: 'document',
      currentFileAssetId: 'replacement-file',
      currentVersion: 1,
      status: 'DRAFT',
      notes: null,
    });
    const createVersion = vi.fn();
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'file' }]),
      project: { findFirst: vi.fn().mockResolvedValue({ id: 'project' }) },
      fileAsset: { findFirst: vi.fn().mockResolvedValue({ id: 'file' }) },
      projectRequiredDocument: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'document',
          projectId: 'project',
          documentType: 'SURVEY_REPORT',
          status: 'SUPERSEDED',
          currentVersion: 0,
        }),
        update,
      },
      projectRequiredDocumentVersion: { create: createVersion },
      activity: { create: vi.fn() },
      auditLog: { create: vi.fn() },
    };
    const prisma = {
      project: { findFirst: vi.fn().mockResolvedValue({ id: 'project' }) },
      projectRequiredDocument: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'document',
          projectId: 'project',
          documentType: 'SURVEY_REPORT',
          status: 'SUPERSEDED',
          currentVersion: 0,
        }),
      },
      fileAsset: { findFirst: vi.fn().mockResolvedValue({ id: 'file' }) },
      $transaction: vi.fn((work) => work(withProjectLock(tx))),
    } as unknown as PrismaService;

    await new ProjectProductsService(
      prisma,
      policy,
      approvers,
      auditService,
    ).linkDocumentFile(fileActor, 'project', 'document', 'replacement-file');
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          supersededAt: null,
          supersededBy: null,
        }),
      }),
    );
    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(createVersion).toHaveBeenCalledWith({
      data: {
        requirementId: 'document',
        version: 1,
        fileAssetId: 'replacement-file',
        status: 'DRAFT',
        notes: null,
        createdBy: fileActor.userId,
      },
    });
  });

  it('does not link a required document after membership is removed while waiting for the Project lock', async () => {
    const linkActor = {
      ...fileActor,
      permissions: [...fileActor.permissions, 'project.document.manage'],
    } satisfies CurrentActor;
    const document = {
      id: 'document',
      projectId: 'project',
      documentType: 'SURVEY_REPORT',
      status: 'MISSING',
      currentFileAssetId: null,
      currentVersion: 0,
      notes: null,
      supersededAt: null,
    };
    let membershipActive = true;
    const update = vi.fn().mockResolvedValue({
      ...document,
      currentFileAssetId: 'replacement-file',
      currentVersion: 1,
      status: 'DRAFT',
    });
    const findFile = vi.fn().mockResolvedValue({ id: 'replacement-file' });
    const tx = {
      project: {
        findFirst: vi.fn(async () =>
          membershipActive ? { id: 'project' } : null,
        ),
      },
      $queryRaw: vi.fn(async () => {
        membershipActive = false;
        return [{ id: 'locked' }];
      }),
      fileAsset: { findFirst: findFile },
      projectRequiredDocument: {
        findFirst: vi.fn().mockResolvedValue(document),
        update,
      },
      projectRequiredDocumentVersion: { create: vi.fn() },
      activity: { create: vi.fn() },
    };
    const projectWhere = vi.fn().mockReturnValue({
      members: { some: { userId: linkActor.userId } },
    });
    const prisma = {
      project: {
        findFirst: vi.fn(async () =>
          membershipActive ? { id: 'project' } : null,
        ),
      },
      projectRequiredDocument: {
        findFirst: vi.fn().mockResolvedValue(document),
      },
      $transaction: vi.fn((run) => run(withProjectLock(tx))),
    } as unknown as PrismaService;

    await expect(
      new ProjectProductsService(
        prisma,
        { projectWhere } as unknown as BusinessEntityPolicy,
        approvers,
        auditService,
      ).linkDocumentFile(linkActor, 'project', 'document', 'replacement-file'),
    ).rejects.toThrow('Project not found');
    expect(findFile).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(projectWhere).toHaveBeenLastCalledWith(
      linkActor,
      'project.document.manage',
    );
  });

  it('links an exact actor-owned upload session without read or download permission', async () => {
    const uploadActor = {
      ...actor,
      permissions: ['file.upload', 'project.document.manage'],
    } satisfies CurrentActor;
    const findFile = vi.fn().mockResolvedValue({ id: 'replacement-file' });
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'locked' }]),
      project: { findFirst: vi.fn().mockResolvedValue({ id: 'project' }) },
      fileAsset: { findFirst: findFile },
      projectRequiredDocument: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'document',
          projectId: 'project',
          documentType: 'SURVEY_REPORT',
          status: 'MISSING',
          currentFileAssetId: null,
          currentVersion: 0,
          notes: null,
          supersededAt: null,
        }),
        update: vi.fn().mockResolvedValue({
          id: 'document',
          status: 'DRAFT',
          currentFileAssetId: 'replacement-file',
          currentVersion: 1,
          notes: null,
        }),
      },
      projectRequiredDocumentVersion: { create: vi.fn() },
      activity: { create: vi.fn() },
    } as never;

    await expect(
      new ProjectProductsService(
        {} as PrismaService,
        policy,
        approvers,
        auditService,
      ).linkUploadFileInTransaction(
        uploadActor,
        'project',
        'document',
        'replacement-file',
        tx,
      ),
    ).resolves.toMatchObject({ currentFileAssetId: 'replacement-file' });
    expect(findFile).toHaveBeenCalledWith({
      where: {
        id: 'replacement-file',
        organizationId: uploadActor.organizationId,
        uploadedById: uploadActor.userId,
        deletedAt: null,
        uploadSession: {
          is: {
            actorId: uploadActor.userId,
            projectId: 'project',
            requiredDocumentId: 'document',
            stageOneDocumentId: null,
            status: 'AVAILABLE',
            expiresAt: { gt: expect.any(Date) },
          },
        },
      },
      select: { id: true },
    });
  });

  it('rejects linkage when an active upload target is archived before submit', async () => {
    const update = vi.fn();
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'file' }]),
      project: { findFirst: vi.fn().mockResolvedValue({ id: 'project' }) },
      fileAsset: { findFirst: vi.fn().mockResolvedValue({ id: 'file' }) },
      projectRequiredDocument: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'document',
          projectId: 'project',
          documentType: 'SURVEY_REPORT',
          status: 'MISSING',
          supersededAt: new Date(),
          currentVersion: 0,
        }),
        update,
      },
    };
    const prisma = {
      project: { findFirst: vi.fn().mockResolvedValue({ id: 'project' }) },
      projectRequiredDocument: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'document',
          projectId: 'project',
          documentType: 'SURVEY_REPORT',
          status: 'MISSING',
          supersededAt: null,
          currentVersion: 0,
        }),
      },
      $transaction: vi.fn((work) => work(withProjectLock(tx))),
    } as unknown as PrismaService;

    await expect(
      new ProjectProductsService(
        prisma,
        policy,
        approvers,
        auditService,
      ).linkDocumentFile(fileActor, 'project', 'document', 'replacement-file'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(update).not.toHaveBeenCalled();
  });

  it('revalidates required-document state after taking the row lock', async () => {
    const update = vi.fn();
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'locked' }]),
      project: { findFirst: vi.fn().mockResolvedValue({ id: 'project' }) },
      fileAsset: { findFirst: vi.fn().mockResolvedValue({ id: 'file' }) },
      projectRequiredDocument: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'document',
          projectId: 'project',
          documentType: 'SURVEY_REPORT',
          status: 'APPROVED',
          currentVersion: 1,
        }),
        update,
      },
    };
    const prisma = {
      project: { findFirst: vi.fn().mockResolvedValue({ id: 'project' }) },
      projectRequiredDocument: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'document',
          projectId: 'project',
          documentType: 'SURVEY_REPORT',
          status: 'DRAFT',
          currentVersion: 0,
        }),
      },
      $transaction: vi.fn((work) => work(withProjectLock(tx))),
    } as unknown as PrismaService;

    await expect(
      new ProjectProductsService(
        prisma,
        policy,
        approvers,
        auditService,
      ).linkDocumentFile(fileActor, 'project', 'document', 'replacement-file'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(update).not.toHaveBeenCalled();
  });

  it('checks the locked document submission before allowing a review decision', async () => {
    const updateMany = vi.fn();
    const document = {
      id: 'document',
      projectId: 'project',
      documentType: 'SURVEY_REPORT',
      documentName: 'Survey report',
      status: 'PENDING_REVIEW',
      currentVersion: 1,
      ownerUserId: 'owner',
    };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'document' }]),
      projectRequiredDocument: {
        findFirst: vi.fn().mockResolvedValue(document),
        updateMany,
      },
      activity: {
        findFirst: vi.fn().mockResolvedValue({ actorId: actor.userId }),
      },
    };
    const prisma = {
      project: { findFirst: vi.fn().mockResolvedValue({ id: 'project' }) },
      projectRequiredDocument: {
        findFirst: vi.fn().mockResolvedValue(document),
      },
      $transaction: vi.fn((work) => work(withProjectLock(tx))),
    } as unknown as PrismaService;

    await expect(
      new ProjectProductsService(
        prisma,
        policy,
        approvers,
        auditService,
      ).decideDocument(actor, 'project', 'document', { decision: 'APPROVED' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('keys each review cycle from its persisted submission activity', async () => {
    const createMany = vi.fn();
    const document = {
      id: 'document',
      projectId: 'project',
      documentType: 'SURVEY_REPORT',
      documentName: 'Survey report',
      status: 'DRAFT',
      currentFileAssetId: 'file',
      currentVersion: 1,
    };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'document' }]),
      projectRequiredDocument: {
        findFirst: vi.fn().mockResolvedValue(document),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          ...document,
          status: 'PENDING_REVIEW',
        }),
      },
      activity: {
        create: vi.fn().mockResolvedValue({ id: 'submission-2' }),
      },
      notification: { createMany },
    };
    const prisma = {
      project: { findFirst: vi.fn().mockResolvedValue({ id: 'project' }) },
      projectRequiredDocument: {
        findFirst: vi.fn().mockResolvedValue(document),
      },
      $transaction: vi.fn((work) => work(withProjectLock(tx))),
    } as unknown as PrismaService;
    const resolver = {
      resolve: vi.fn().mockResolvedValue([{ id: 'reviewer' }]),
    } as unknown as ProjectApproverResolver;

    await new ProjectProductsService(
      prisma,
      policy,
      resolver,
      auditService,
    ).submitDocument(actor, 'project', 'document');

    expect(createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            idempotencyKey:
              'project-document-review:document:submission-2:reviewer',
          }),
        ],
      }),
    );
  });

  it('does not submit a financial document to a reviewer who cannot decide it', async () => {
    const financialActor = {
      ...actor,
      permissions: [
        ...actor.permissions,
        'project.stage1.finance.read',
        'project.stage1.finance.manage',
      ],
    } satisfies CurrentActor;
    const document = {
      id: 'document',
      projectId: 'project',
      documentType: 'PRELIMINARY_FINANCIAL_PLAN',
      documentName: 'Kế hoạch tài chính sơ bộ',
      status: 'DRAFT',
      currentFileAssetId: 'file',
      currentVersion: 1,
    };
    const createMany = vi.fn();
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'document' }]),
      projectRequiredDocument: {
        findFirst: vi.fn().mockResolvedValue(document),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      notification: { createMany },
    };
    const prisma = {
      project: { findFirst: vi.fn().mockResolvedValue({ id: 'project' }) },
      projectRequiredDocument: {
        findFirst: vi.fn().mockResolvedValue(document),
      },
      $transaction: vi.fn((work) => work(withProjectLock(tx))),
    } as unknown as PrismaService;
    const resolve = vi
      .fn()
      .mockImplementation((_org, _project, permission) =>
        Promise.resolve(
          permission === 'project.document.review'
            ? [{ id: 'general-reviewer' }]
            : [],
        ),
      );

    await expect(
      new ProjectProductsService(
        prisma,
        policy,
        { resolve } as unknown as ProjectApproverResolver,
        auditService,
      ).submitDocument(financialActor, 'project', 'document'),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(resolve).toHaveBeenCalledWith(
      actor.organizationId,
      'project',
      'project.stage1.finance.read',
      actor.userId,
      tx,
    );
    expect(resolve).toHaveBeenCalledWith(
      actor.organizationId,
      'project',
      'project.stage1.finance.manage',
      actor.userId,
      tx,
    );
    expect(createMany).not.toHaveBeenCalled();
  });

  it('requires a rejected document to receive a replacement before resubmission', async () => {
    const document = {
      id: 'document',
      projectId: 'project',
      documentType: 'SURVEY_REPORT',
      documentName: 'Survey report',
      status: 'REJECTED',
      currentFileAssetId: 'file',
      currentVersion: 1,
    };
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'document' }]),
      projectRequiredDocument: {
        findFirst: vi.fn().mockResolvedValue(document),
        updateMany,
      },
    };
    const prisma = {
      project: { findFirst: vi.fn().mockResolvedValue({ id: 'project' }) },
      projectRequiredDocument: {
        findFirst: vi.fn().mockResolvedValue(document),
      },
      $transaction: vi.fn((work) => work(withProjectLock(tx))),
    } as unknown as PrismaService;

    await expect(
      new ProjectProductsService(
        prisma,
        policy,
        approvers,
        auditService,
      ).submitDocument(actor, 'project', 'document'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'document', status: 'DRAFT' },
      data: { status: 'PENDING_REVIEW' },
    });
  });

  it('keys a decision notification to the reviewed submission cycle', async () => {
    const createMany = vi.fn();
    const document = {
      id: 'document',
      projectId: 'project',
      documentType: 'SURVEY_REPORT',
      documentName: 'Survey report',
      status: 'PENDING_REVIEW',
      currentVersion: 1,
      ownerUserId: 'owner',
    };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'document' }]),
      projectRequiredDocument: {
        findFirst: vi.fn().mockResolvedValue(document),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          ...document,
          status: 'APPROVED',
        }),
      },
      activity: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: 'submission-2', actorId: 'submitter' }),
        create: vi.fn(),
      },
      notification: { createMany },
    };
    const prisma = {
      project: { findFirst: vi.fn().mockResolvedValue({ id: 'project' }) },
      projectRequiredDocument: {
        findFirst: vi.fn().mockResolvedValue(document),
      },
      $transaction: vi.fn((work) => work(withProjectLock(tx))),
    } as unknown as PrismaService;

    await new ProjectProductsService(
      prisma,
      policy,
      approvers,
      auditService,
    ).decideDocument(actor, 'project', 'document', { decision: 'APPROVED' });

    expect(createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            idempotencyKey:
              'project-document-decision:document:submission-2:owner',
          }),
        ]),
      }),
    );
  });

  it('claims approval submission once before creating side effects', async () => {
    const line = {
      id: 'line',
      code: 'P-1',
      locationId: 'location',
      positionName: 'position',
      currentRevision: 1,
      revisions: [
        {
          id: 'revision',
          revision: 1,
          lockedAt: null,
          quantity: new Prisma.Decimal(1),
        },
      ],
    };
    const tx = {
      projectProductLine: { findFirst: vi.fn().mockResolvedValue(line) },
      projectProductRevision: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const prisma = {
      $transaction: vi.fn((work) => work(withProjectLock(tx))),
    } as unknown as PrismaService;
    const service = new ProjectProductsService(
      prisma,
      policy,
      approvers,
      auditService,
    );

    await expect(
      service.submit(actor, 'project', 'line', 'TECHNICAL'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(approvers.resolve).not.toHaveBeenCalled();
  });

  it('clears the catalog choice when switching to a custom product', async () => {
    const line = {
      id: 'line',
      currentRevision: 1,
      revisions: [
        {
          id: 'revision',
          revision: 1,
          productId: 'product',
          variantId: 'variant',
          quantity: new Prisma.Decimal(1),
        },
      ],
    };
    const tx = {
      projectProductLine: {
        findFirst: vi.fn().mockResolvedValue(line),
        update: vi.fn(),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'line' }),
      },
      projectProductRevision: { update: vi.fn() },
      activity: { create: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn((work) => work(withProjectLock(tx))),
    } as unknown as PrismaService;
    const service = new ProjectProductsService(
      prisma,
      policy,
      approvers,
      auditService,
    );

    await service.update(actor, 'project', 'line', {
      customProductName: 'Custom sofa',
    });

    expect(tx.projectProductRevision.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ productId: null, variantId: null }),
      }),
    );
  });

  it('claims a pending decision before changing revision state', async () => {
    const line = {
      id: 'line',
      currentRevision: 1,
      revisions: [
        {
          id: 'revision',
          revision: 1,
          createdBy: 'creator',
          approvals: [
            {
              id: 'approval',
              type: 'TECHNICAL',
              status: 'PENDING',
              submittedBy: 'submitter',
            },
          ],
        },
      ],
    };
    const tx = {
      projectProductLine: { findFirst: vi.fn().mockResolvedValue(line) },
      projectProductApproval: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const prisma = {
      $transaction: vi.fn((work) => work(withProjectLock(tx))),
    } as unknown as PrismaService;
    const service = new ProjectProductsService(
      prisma,
      policy,
      approvers,
      auditService,
    );

    await expect(
      service.decide(actor, 'project', 'line', 'TECHNICAL', {
        decision: 'APPROVED',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.projectProductApproval.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'approval', status: 'PENDING' },
      }),
    );
  });

  it('records owner and due-date changes in Activity and Audit', async () => {
    const dueDate = new Date('2026-08-31T00:00:00.000Z');
    const before = {
      id: 'document',
      projectId: 'project',
      documentType: 'SURVEY_REPORT',
      status: 'DRAFT',
      ownerUserId: null,
      dueDate: null,
    };
    const updated = { ...before, ownerUserId: 'owner', dueDate };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'document' }]),
      user: { findFirst: vi.fn().mockResolvedValue({ id: 'owner' }) },
      projectRequiredDocument: {
        findFirst: vi.fn().mockResolvedValue(before),
        update: vi.fn().mockResolvedValue(updated),
      },
      activity: { create: vi.fn() },
      auditLog: { create: vi.fn() },
    };
    const prisma = {
      project: { findFirst: vi.fn().mockResolvedValue({ id: 'project' }) },
      projectRequiredDocument: { findFirst: vi.fn().mockResolvedValue(before) },
      user: { findFirst: vi.fn().mockResolvedValue({ id: 'owner' }) },
      $transaction: vi.fn((work) => work(withProjectLock(tx))),
    } as unknown as PrismaService;
    const audit = { write: vi.fn() };
    const service = new ProjectProductsService(
      prisma,
      policy,
      approvers,
      auditService,
    );
    Object.assign(service, { audit });

    await service.updateDocument(actor, 'project', 'document', {
      ownerUserId: 'owner',
      dueDate: dueDate.toISOString(),
    });

    expect(tx.activity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: actor.userId,
        event: 'PROJECT_DOCUMENT_UPDATED',
      }),
    });
    expect(audit.write).toHaveBeenCalledWith(tx, actor, {
      action: 'PROJECT_DOCUMENT_UPDATED',
      entityType: 'ProjectRequiredDocument',
      entityId: 'document',
      beforeData: { ownerUserId: null, dueDate: null },
      afterData: { ownerUserId: 'owner', dueDate },
    });
  });

  it('returns the locked document without side effects when owner and due date are unchanged', async () => {
    const dueDate = new Date('2026-08-31T00:00:00.000Z');
    const current = {
      id: 'document',
      projectId: 'project',
      documentType: 'SURVEY_REPORT',
      status: 'DRAFT',
      ownerUserId: 'owner',
      dueDate,
    };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'document' }]),
      user: { findFirst: vi.fn().mockResolvedValue({ id: 'owner' }) },
      projectRequiredDocument: {
        findFirst: vi.fn().mockResolvedValue(current),
        update: vi.fn().mockResolvedValue(current),
      },
      activity: { create: vi.fn() },
    };
    const prisma = {
      project: { findFirst: vi.fn().mockResolvedValue({ id: 'project' }) },
      projectRequiredDocument: {
        findFirst: vi.fn().mockResolvedValue(current),
      },
      user: { findFirst: vi.fn().mockResolvedValue({ id: 'owner' }) },
      $transaction: vi.fn((work) => work(withProjectLock(tx))),
    } as unknown as PrismaService;
    const audit = { write: vi.fn() };
    const service = new ProjectProductsService(
      prisma,
      policy,
      approvers,
      audit as unknown as AuditService,
    );

    await expect(
      service.updateDocument(actor, 'project', 'document', {
        ownerUserId: 'owner',
        dueDate: dueDate.toISOString(),
      }),
    ).resolves.toBe(current);

    expect(tx.projectRequiredDocument.update).not.toHaveBeenCalled();
    expect(tx.activity.create).not.toHaveBeenCalled();
    expect(audit.write).not.toHaveBeenCalled();
  });

  it('clears a nullable owner and due date without changing other fields', async () => {
    const current = {
      id: 'document',
      projectId: 'project',
      documentType: 'SURVEY_REPORT',
      status: 'DRAFT',
      ownerUserId: 'owner',
      dueDate: new Date('2026-08-31T00:00:00.000Z'),
    };
    const update = vi.fn().mockResolvedValue({
      ...current,
      ownerUserId: null,
      dueDate: null,
    });
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'document' }]),
      projectRequiredDocument: {
        findFirst: vi.fn().mockResolvedValue(current),
        update,
      },
      activity: { create: vi.fn() },
    };
    const prisma = {
      project: { findFirst: vi.fn().mockResolvedValue({ id: 'project' }) },
      projectRequiredDocument: {
        findFirst: vi.fn().mockResolvedValue(current),
      },
      $transaction: vi.fn((work) => work(withProjectLock(tx))),
    } as unknown as PrismaService;

    await new ProjectProductsService(
      prisma,
      policy,
      approvers,
      auditService,
    ).updateDocument(actor, 'project', 'document', {
      ownerUserId: null,
      dueDate: null,
    });

    expect(update).toHaveBeenCalledWith({
      where: { id: 'document' },
      data: { ownerUserId: null, dueDate: null },
    });
  });

  it('requires a non-blank not-applicable reason', async () => {
    const document = {
      id: 'document',
      projectId: 'project',
      documentType: 'SURVEY_REPORT',
      status: 'MISSING',
    };
    const prisma = {
      project: { findFirst: vi.fn().mockResolvedValue({ id: 'project' }) },
      projectRequiredDocument: {
        findFirst: vi.fn().mockResolvedValue(document),
      },
      $transaction: vi.fn(),
    } as unknown as PrismaService;

    await expect(
      new ProjectProductsService(
        prisma,
        policy,
        approvers,
        auditService,
      ).markDocumentNotApplicable(actor, 'project', 'document', {
        reason: '   ',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('derives not-applicable actor and time on the server and audits the decision', async () => {
    const before = {
      id: 'document',
      projectId: 'project',
      documentType: 'SURVEY_REPORT',
      status: 'MISSING',
      currentFileAssetId: null,
      notApplicableReason: null,
      markedBy: null,
      markedAt: null,
    };
    const update = vi.fn(async ({ data }) => ({ ...before, ...data }));
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'document' }]),
      projectRequiredDocument: {
        findFirst: vi.fn().mockResolvedValue(before),
        update,
      },
      activity: { create: vi.fn() },
      auditLog: { create: vi.fn() },
    };
    const prisma = {
      project: { findFirst: vi.fn().mockResolvedValue({ id: 'project' }) },
      projectRequiredDocument: { findFirst: vi.fn().mockResolvedValue(before) },
      $transaction: vi.fn((work) => work(withProjectLock(tx))),
    } as unknown as PrismaService;
    const audit = { write: vi.fn() };
    const service = new ProjectProductsService(
      prisma,
      policy,
      approvers,
      auditService,
    );
    Object.assign(service, { audit });

    await service.markDocumentNotApplicable(actor, 'project', 'document', {
      reason: '  Customer supplies this record.  ',
    });

    expect(update).toHaveBeenCalledWith({
      where: { id: 'document' },
      data: {
        status: 'NOT_APPLICABLE',
        notApplicableReason: 'Customer supplies this record.',
        markedBy: actor.userId,
        markedAt: expect.any(Date),
      },
    });
    expect(audit.write).toHaveBeenCalledWith(
      tx,
      actor,
      expect.objectContaining({
        action: 'PROJECT_DOCUMENT_NOT_APPLICABLE',
        beforeData: expect.objectContaining({ status: 'MISSING' }),
        afterData: expect.objectContaining({
          status: 'NOT_APPLICABLE',
          markedBy: actor.userId,
          markedAt: expect.any(Date),
        }),
      }),
    );
  });

  it.each([
    ['DRAFT', 'file'],
    ['MISSING', null],
  ] as const)(
    'restores an audited user decision to %s with Activity and Audit',
    async (status, currentFileAssetId) => {
      const before = {
        id: 'document',
        projectId: 'project',
        documentType: 'SURVEY_REPORT',
        status: 'NOT_APPLICABLE',
        currentFileAssetId,
        notApplicableReason: 'Customer supplies this record.',
        markedBy: 'reviewer',
        markedAt: new Date('2026-08-10T00:00:00.000Z'),
      };
      const updated = {
        ...before,
        status,
        notApplicableReason: null,
        markedBy: null,
        markedAt: null,
      };
      const tx = {
        $queryRaw: vi.fn().mockResolvedValue([{ id: 'document' }]),
        projectRequiredDocument: {
          findFirst: vi.fn().mockResolvedValue(before),
          update: vi.fn().mockResolvedValue(updated),
        },
        activity: { create: vi.fn() },
        auditLog: { create: vi.fn() },
      };
      const prisma = {
        project: { findFirst: vi.fn().mockResolvedValue({ id: 'project' }) },
        projectRequiredDocument: {
          findFirst: vi.fn().mockResolvedValue(before),
        },
        $transaction: vi.fn((work) => work(withProjectLock(tx))),
      } as unknown as PrismaService;
      const audit = { write: vi.fn() };
      const service = new ProjectProductsService(
        prisma,
        policy,
        approvers,
        auditService,
      );
      Object.assign(service, { audit });

      await (
        service as unknown as {
          restoreDocumentApplicability(
            actor: CurrentActor,
            projectId: string,
            requirementId: string,
          ): Promise<unknown>;
        }
      ).restoreDocumentApplicability(actor, 'project', 'document');

      expect(tx.projectRequiredDocument.update).toHaveBeenCalledWith({
        where: { id: 'document' },
        data: {
          status,
          notApplicableReason: null,
          markedBy: null,
          markedAt: null,
        },
      });
      expect(tx.activity.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          actorId: actor.userId,
          event: 'PROJECT_DOCUMENT_APPLICABILITY_RESTORED',
        }),
      });
      expect(audit.write).toHaveBeenCalledWith(
        tx,
        actor,
        expect.objectContaining({
          action: 'PROJECT_DOCUMENT_APPLICABILITY_RESTORED',
          beforeData: expect.objectContaining({ status: 'NOT_APPLICABLE' }),
          afterData: expect.objectContaining({ status }),
        }),
      );
    },
  );

  it('rejects restore for a routing or otherwise unaudited not-applicable state', async () => {
    const document = {
      id: 'document',
      projectId: 'project',
      documentType: 'SURVEY_REPORT',
      status: 'NOT_APPLICABLE',
      currentFileAssetId: null,
      notApplicableReason: 'ROUTING_NOT_APPLICABLE',
      markedBy: null,
      markedAt: null,
    };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'document' }]),
      projectRequiredDocument: {
        findFirst: vi.fn().mockResolvedValue(document),
      },
    };
    const prisma = {
      project: { findFirst: vi.fn().mockResolvedValue({ id: 'project' }) },
      projectRequiredDocument: {
        findFirst: vi.fn().mockResolvedValue(document),
      },
      $transaction: vi.fn((work) => work(withProjectLock(tx))),
    } as unknown as PrismaService;
    const service = new ProjectProductsService(
      prisma,
      policy,
      approvers,
      auditService,
    );

    await expect(
      (
        service as unknown as {
          restoreDocumentApplicability(
            actor: CurrentActor,
            projectId: string,
            requirementId: string,
          ): Promise<unknown>;
        }
      ).restoreDocumentApplicability(actor, 'project', 'document'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('returns sanitized current and prior-version business history', async () => {
    const current = {
      id: 'document',
      projectId: 'project',
      documentType: 'SURVEY_REPORT',
      status: 'APPROVED',
      currentFileAssetId: 'file-2',
      currentVersion: 2,
      notes: 'Current note',
      approvedBy: 'cross-organization-approver',
      approvedAt: new Date('2026-08-11T09:00:00.000Z'),
      storageKey: 'must-not-leak',
    };
    const versions = [
      {
        id: 'version-1',
        requirementId: 'document',
        version: 1,
        fileAssetId: 'file-1',
        status: 'DRAFT',
        notes: 'Prior note',
        createdBy: 'replacer',
        createdAt: new Date('2026-08-10T09:00:00.000Z'),
      },
    ];
    const prisma = {
      project: { findFirst: vi.fn().mockResolvedValue({ id: 'project' }) },
      projectRequiredDocument: {
        findFirst: vi.fn().mockResolvedValue(current),
      },
      projectRequiredDocumentVersion: {
        findMany: vi.fn().mockResolvedValue(versions),
      },
      fileAsset: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'file-1',
            originalFilename: 'survey-v1.pdf',
            uploadedById: 'uploader-1',
            createdAt: new Date('2026-08-09T09:00:00.000Z'),
            storageKey: 'hidden-1',
            checksum: 'hidden-1',
            sizeBytes: 123,
          },
          {
            id: 'file-2',
            originalFilename: 'survey-v2.pdf',
            uploadedById: 'uploader-2',
            createdAt: new Date('2026-08-11T08:00:00.000Z'),
            storageKey: 'hidden-2',
            checksum: 'hidden-2',
            sizeBytes: 456,
          },
        ]),
      },
      user: {
        findMany: vi.fn(({ where }) =>
          Promise.resolve(
            where.organizationMembers
              ? [
                  { id: 'uploader-2', displayName: 'Uploader Two' },
                  { id: 'replacer', displayName: 'Replacement Actor' },
                ]
              : [
                  { id: 'uploader-2', displayName: 'Uploader Two' },
                  { id: 'replacer', displayName: 'Replacement Actor' },
                  {
                    id: 'cross-organization-approver',
                    displayName: 'Cross-organization approver',
                  },
                ],
          ),
        ),
      },
    } as unknown as PrismaService;

    const documents = new ProjectProductsService(
      prisma,
      policy,
      approvers,
      auditService,
    );
    const history = await documents.documentHistory(
      fileActor,
      'project',
      'document',
    );

    expect(history).toEqual({
      current: {
        downloadId: 'file-2',
        filename: 'survey-v2.pdf',
        version: 2,
        status: 'APPROVED',
        note: 'Current note',
        uploader: { id: 'uploader-2', displayName: 'Uploader Two' },
        timestamp: new Date('2026-08-11T08:00:00.000Z'),
        approval: {
          actor: null,
          timestamp: new Date('2026-08-11T09:00:00.000Z'),
        },
      },
      versions: [
        {
          id: 'version-1',
          downloadId: 'file-1',
          filename: 'survey-v1.pdf',
          version: 1,
          actor: { id: 'replacer', displayName: 'Replacement Actor' },
          timestamp: new Date('2026-08-10T09:00:00.000Z'),
          status: 'DRAFT',
        },
      ],
    });
    expect(JSON.stringify(history)).not.toMatch(
      /storageKey|checksum|sizeBytes|hidden-[12]/,
    );
    expect(prisma.fileAsset.findMany).toHaveBeenCalledOnce();
    expect(prisma.user.findMany).toHaveBeenCalledOnce();
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: {
        id: {
          in: [
            'uploader-1',
            'uploader-2',
            'replacer',
            'cross-organization-approver',
          ],
        },
        status: 'active',
        organizationMembers: {
          some: { organizationId: actor.organizationId, status: 'active' },
        },
      },
      select: { id: true, displayName: true },
    });
    expect(prisma.projectRequiredDocumentVersion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { requirementId: 'document', version: { not: 2 } },
      }),
    );

    const restricted = await documents.documentHistory(
      actor,
      'project',
      'document',
    );
    expect(restricted.current).toMatchObject({
      version: 2,
      status: 'APPROVED',
      downloadId: null,
      filename: null,
    });
    expect(restricted.versions[0]).toMatchObject({
      version: 1,
      status: 'DRAFT',
      downloadId: null,
      filename: null,
    });
    expect(JSON.stringify(restricted)).not.toMatch(
      /file-[12]|survey-v[12]\.pdf/,
    );
    expect(prisma.fileAsset.findMany).toHaveBeenCalledOnce();
  });
});
