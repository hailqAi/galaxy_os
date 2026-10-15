import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  Prisma,
  ProjectProductApprovalStatus,
  ProjectProductApprovalType,
} from '@prisma/client';
import { BusinessEntityPolicy } from '../access-control/business-entity.policy';
import { CurrentActor } from '../access-control/current-actor';
import { AuditService } from '../audit/audit.service';
import {
  findProjectFile,
  findProjectFiles,
  type ProjectFileClient,
} from '../files/project-file';
import { PrismaService } from '../prisma.service';
import {
  CreateProjectLocationDto,
  CreateProjectProductDto,
  CreateProjectRequiredDocumentDto,
  ProjectDocumentDecisionDto,
  ProjectDocumentNotApplicableDto,
  ProjectDocumentsQuery,
  ProjectProductDecisionDto,
  ProjectProductsQuery,
  UpdateProjectRequiredDocumentDto,
  UpdateProjectProductDto,
} from './project-products.dto';
import { ProjectApproverResolver } from './project-approver-resolver.service';
import {
  isStageOneFinancialDocument,
  requiredDocumentCompletionPolicy,
  visibleStageOneDocumentWhere,
} from './project-stage-one.rules';
import { canReadProjectFileMetadata } from './project-stage-one.service';

@Injectable()
export class ProjectProductsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(BusinessEntityPolicy) private readonly policy: BusinessEntityPolicy,
    @Inject(ProjectApproverResolver)
    private readonly approvers: ProjectApproverResolver,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private async project(
    actor: CurrentActor,
    projectId: string,
    requiredPermissions?: string | readonly string[],
    db: Pick<Prisma.TransactionClient, 'project'> = this.prisma,
  ) {
    const project = await db.project.findFirst({
      where: {
        id: projectId,
        ...this.policy.projectWhere(actor, requiredPermissions),
      },
      select: { id: true, projectManagerId: true },
    });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  async assertDocumentUpload(
    actor: CurrentActor,
    projectId: string,
    requirementId: string,
    db: Pick<
      Prisma.TransactionClient,
      'project' | 'projectRequiredDocument'
    > = this.prisma,
  ) {
    if (
      !actor.permissions.includes('file.upload') ||
      !actor.permissions.includes('project.document.manage')
    )
      throw new ForbiddenException('Required permission is missing');
    const document = await this.document(
      actor,
      projectId,
      requirementId,
      true,
      ['file.upload', 'project.document.manage'],
      db,
    );
    if (
      isStageOneFinancialDocument(document) &&
      actor.permissionSources !== undefined &&
      !(await this.policy.hasProjectPermissions(
        actor,
        projectId,
        ['project.stage1.finance.read', 'project.stage1.finance.manage'],
        db,
      ))
    )
      throw new NotFoundException('Required document not found');
    return document;
  }

  async list(
    actor: CurrentActor,
    projectId: string,
    query: ProjectProductsQuery,
  ) {
    await this.project(actor, projectId, 'project.product.view');
    const approvalStatus = query.approvalStatus as
      | ProjectProductApprovalStatus
      | undefined;
    const approval = query.approvalStatus
      ? {
          OR: [
            { customerApprovalStatus: approvalStatus },
            { technicalApprovalStatus: approvalStatus },
            { commercialApprovalStatus: approvalStatus },
          ],
        }
      : {};
    const where: Prisma.ProjectProductLineWhereInput = {
      organizationId: actor.organizationId,
      projectId,
      deletedAt: null,
      locationId: query.locationId,
      lifecycleStatus: query.lifecycleStatus as never,
      blocker: query.blocked ? { not: null } : undefined,
      OR: query.search
        ? [
            { code: { contains: query.search, mode: 'insensitive' } },
            {
              revisions: {
                some: {
                  OR: [
                    {
                      customProductName: {
                        contains: query.search,
                        mode: 'insensitive',
                      },
                    },
                    {
                      product: {
                        name: {
                          contains: query.search,
                          mode: 'insensitive',
                        },
                      },
                    },
                  ],
                },
              },
            },
          ]
        : undefined,
      revisions: {
        some: {
          supplierId: query.supplierId,
          product: query.brandId ? { brandId: query.brandId } : undefined,
          ...approval,
        },
      },
    };
    const orderBy = {
      [query.sort ?? 'updatedAt']: query.direction ?? 'desc',
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.projectProductLine.findMany({
        where,
        include: this.includeCurrent(),
        orderBy: orderBy as Prisma.ProjectProductLineOrderByWithRelationInput,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.projectProductLine.count({ where }),
    ]);
    return {
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }

  async get(
    actor: CurrentActor,
    projectId: string,
    lineId: string,
    requiredPermission = 'project.product.view',
  ) {
    await this.project(actor, projectId, requiredPermission);
    const item = await this.prisma.projectProductLine.findFirst({
      where: {
        id: lineId,
        projectId,
        organizationId: actor.organizationId,
        deletedAt: null,
      },
      include: {
        ...this.includeCurrent(),
        revisions: {
          include: {
            product: { include: { brand: true } },
            variant: true,
            supplier: true,
            approvals: { orderBy: { createdAt: 'desc' } },
          },
          orderBy: { revision: 'desc' },
        },
      },
    });
    if (!item) throw new NotFoundException('Project product not found');
    return item;
  }

  async create(
    actor: CurrentActor,
    projectId: string,
    data: CreateProjectProductDto,
  ) {
    this.assertProductChoice(data);
    return this.prisma.$transaction(async (tx) => {
      await this.lockScopedProject(
        tx,
        actor,
        projectId,
        'project.product.create',
      );
      await this.references(actor, projectId, data, tx);
      const line = await tx.projectProductLine.create({
        data: {
          organizationId: actor.organizationId,
          projectId,
          locationId: data.locationId,
          positionName: data.positionName,
          code: data.code,
          createdBy: actor.userId,
          updatedBy: actor.userId,
          revisions: {
            create: {
              ...this.revisionData(data),
              revision: 1,
              quantity: data.quantity,
              unit: data.unit,
              createdBy: actor.userId,
            },
          },
        },
        include: this.includeCurrent(),
      });
      await this.activity(tx, actor, line.id, 'PROJECT_PRODUCT_CREATED');
      return line;
    });
  }

  async update(
    actor: CurrentActor,
    projectId: string,
    lineId: string,
    data: UpdateProjectProductDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const line = await this.lockedProduct(
        tx,
        actor,
        projectId,
        lineId,
        'project.product.update',
      );
      const current = line.revisions.find(
        ({ revision }) => revision === line.currentRevision,
      )!;
      if (current.lockedAt)
        throw new ConflictException('Approved revision is immutable');
      const merged = {
        ...current,
        ...data,
        productId:
          data.customProductName !== undefined
            ? undefined
            : (data.productId ?? current.productId ?? undefined),
        variantId:
          data.customProductName !== undefined
            ? undefined
            : (data.variantId ?? current.variantId ?? undefined),
        customProductName:
          data.productId !== undefined
            ? undefined
            : (data.customProductName ??
              current.customProductName ??
              undefined),
      };
      this.assertProductChoice(merged);
      await this.references(
        actor,
        projectId,
        {
          ...merged,
          variantId: merged.variantId ?? undefined,
          supplierId: merged.supplierId ?? undefined,
        },
        tx,
      );
      await tx.projectProductLine.update({
        where: { id: lineId },
        data: {
          code: data.code,
          locationId: data.locationId,
          positionName: data.positionName,
          updatedBy: actor.userId,
        },
      });
      await tx.projectProductRevision.update({
        where: { id: current.id },
        data: {
          ...this.revisionData(data),
          ...(data.customProductName !== undefined && {
            productId: null,
            variantId: null,
          }),
          ...(data.productId !== undefined && {
            customProductName: null,
            customDescription: null,
          }),
        },
      });
      await this.activity(tx, actor, lineId, 'PROJECT_PRODUCT_UPDATED');
      return tx.projectProductLine.findUniqueOrThrow({
        where: { id: lineId },
        include: this.includeCurrent(),
      });
    });
  }

  async revise(actor: CurrentActor, projectId: string, lineId: string) {
    return this.prisma.$transaction(async (tx) => {
      const line = await this.lockedProduct(
        tx,
        actor,
        projectId,
        lineId,
        'project.product.revise',
      );
      const current = line.revisions.find(
        ({ revision }) => revision === line.currentRevision,
      )!;
      if (!current.lockedAt)
        throw new ConflictException('Edit the current draft instead');
      const revision = line.currentRevision + 1;
      const copy = await tx.projectProductRevision.create({
        data: {
          productLineId: lineId,
          revision,
          productId: current.productId,
          variantId: current.variantId,
          supplierId: current.supplierId,
          customProductName: current.customProductName,
          customDescription: current.customDescription,
          material: current.material,
          finish: current.finish,
          color: current.color,
          width: current.width,
          depth: current.depth,
          height: current.height,
          length: current.length,
          diameter: current.diameter,
          dimensionUnit: current.dimensionUnit,
          customDimensionNote: current.customDimensionNote,
          quantity: current.quantity,
          unit: current.unit,
          countryOfOrigin: current.countryOfOrigin,
          factoryName: current.factoryName,
          customerApprovalDueAt: current.customerApprovalDueAt,
          technicalApprovalDueAt: current.technicalApprovalDueAt,
          commercialApprovalDueAt: current.commercialApprovalDueAt,
          createdBy: actor.userId,
        },
      });
      await tx.projectProductLine.update({
        where: { id: lineId },
        data: {
          currentRevision: revision,
          lifecycleStatus: 'SHORTLISTING',
          updatedBy: actor.userId,
        },
      });
      await this.activity(
        tx,
        actor,
        lineId,
        'PROJECT_PRODUCT_REVISION_CREATED',
      );
      return copy;
    });
  }

  async submit(
    actor: CurrentActor,
    projectId: string,
    lineId: string,
    type: ProjectProductApprovalType,
  ) {
    this.require(actor, `project.product.submit_${type.toLowerCase()}`);
    const permission = `project.product.submit_${type.toLowerCase()}`;
    const field = this.statusField(type);
    return this.prisma.$transaction(async (tx) => {
      const line = await this.lockedProduct(
        tx,
        actor,
        projectId,
        lineId,
        permission,
      );
      const revision = line.revisions.find(
        (item) => item.revision === line.currentRevision,
      )!;
      if (revision.lockedAt) throw new ConflictException('Revision is locked');
      if (!line.locationId || !line.positionName || revision.quantity.lte(0))
        throw new UnprocessableEntityException(
          'Location, position and quantity are required',
        );
      const claimed = await tx.projectProductRevision.updateMany({
        where: {
          id: revision.id,
          [field]: { in: ['DRAFT', 'REJECTED'] },
        },
        data: { [field]: 'PENDING' },
      });
      if (!claimed.count)
        throw new ConflictException('Approval is already pending or decided');
      const approval = await tx.projectProductApproval.create({
        data: {
          organizationId: actor.organizationId,
          projectId,
          productLineId: lineId,
          revisionId: revision.id,
          type,
          status: 'PENDING',
          submittedBy: actor.userId,
          submittedAt: new Date(),
        },
      });
      const recipients = await this.approvers.resolve(
        actor.organizationId,
        projectId,
        `project.product.approve_${type.toLowerCase()}`,
        actor.userId,
        tx,
      );
      if (!recipients.length)
        throw new UnprocessableEntityException(
          'No eligible project approver found',
        );
      await tx.notification.createMany({
        data: recipients.map(({ id: recipientId }) => ({
          organizationId: actor.organizationId,
          recipientId,
          actorId: actor.userId,
          type: 'PROJECT_PRODUCT_APPROVAL_REQUESTED',
          title: `${type}: ${line.code}`,
          entityType: 'ProjectProductLine',
          entityId: lineId,
          projectId,
          href: `/projects/${projectId}/products/${lineId}`,
          idempotencyKey: `project-product-approval:${approval.id}:${recipientId}`,
        })),
        skipDuplicates: true,
      });
      await this.activity(
        tx,
        actor,
        lineId,
        `PROJECT_PRODUCT_${type}_SUBMITTED`,
      );
      return approval;
    });
  }

  async decide(
    actor: CurrentActor,
    projectId: string,
    lineId: string,
    type: ProjectProductApprovalType,
    data: ProjectProductDecisionDto,
  ) {
    this.require(actor, `project.product.approve_${type.toLowerCase()}`);
    const permission = `project.product.approve_${type.toLowerCase()}`;
    if (
      type === 'CUSTOMER' &&
      (!data.approvedByExternalName || !data.approvalMethod)
    )
      throw new UnprocessableEntityException(
        'External approver and method are required',
      );
    const field = this.statusField(type);
    return this.prisma.$transaction(async (tx) => {
      const line = await this.lockedProduct(
        tx,
        actor,
        projectId,
        lineId,
        permission,
      );
      const revision = line.revisions.find(
        (item) => item.revision === line.currentRevision,
      )!;
      const pending = revision.approvals.find(
        (item) => item.type === type && item.status === 'PENDING',
      );
      if (!pending) throw new ConflictException('Approval is not pending');
      if (
        pending.submittedBy === actor.userId ||
        revision.createdBy === actor.userId
      )
        throw new ForbiddenException('Submitter cannot approve own revision');
      if (data.evidenceFileAssetId)
        await this.assertFile(actor, projectId, data.evidenceFileAssetId, tx);
      const claimed = await tx.projectProductApproval.updateMany({
        where: { id: pending.id, status: 'PENDING' },
        data: {
          status: data.decision,
          notes: data.notes,
          decidedBy: actor.userId,
          decidedAt: new Date(),
          approvedByExternalName: data.approvedByExternalName,
          approvalMethod: data.approvalMethod,
          evidenceFileAssetId: data.evidenceFileAssetId,
        },
      });
      if (!claimed.count)
        throw new ConflictException('Approval is already decided');
      const updated = await tx.projectProductRevision.update({
        where: { id: revision.id },
        data: { [field]: data.decision },
      });
      const approved = [
        updated.customerApprovalStatus,
        updated.technicalApprovalStatus,
        updated.commercialApprovalStatus,
      ].every((status) =>
        ['APPROVED', 'APPROVED_WITH_COMMENTS', 'NOT_REQUIRED'].includes(status),
      );
      if (approved) {
        await tx.projectProductRevision.update({
          where: { id: revision.id },
          data: { lockedAt: new Date() },
        });
        await tx.projectProductLine.update({
          where: { id: lineId },
          data: { lifecycleStatus: 'READY_FOR_ESTIMATE' },
        });
      }
      await this.activity(
        tx,
        actor,
        lineId,
        `PROJECT_PRODUCT_${type}_${data.decision}`,
      );
      if (revision.createdBy !== actor.userId)
        await tx.notification.create({
          data: {
            organizationId: actor.organizationId,
            recipientId: revision.createdBy,
            actorId: actor.userId,
            type: 'PROJECT_PRODUCT_APPROVAL_DECIDED',
            title: `${type}: ${data.decision}`,
            entityType: 'ProjectProductLine',
            entityId: lineId,
          },
        });
      return updated;
    });
  }

  async locations(actor: CurrentActor, projectId: string) {
    await this.project(actor, projectId, 'project.product.view');
    return this.prisma.projectLocation.findMany({
      where: { projectId, active: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async createLocation(
    actor: CurrentActor,
    projectId: string,
    data: CreateProjectLocationDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockScopedProject(
        tx,
        actor,
        projectId,
        'project.location.manage',
      );
      if (data.parentId) {
        const parent = await tx.projectLocation.findFirst({
          where: { id: data.parentId, projectId, active: true },
        });
        if (!parent) throw new UnprocessableEntityException('Invalid parent');
      }
      return tx.projectLocation.create({
        data: { ...data, projectId },
      });
    });
  }

  async documents(
    actor: CurrentActor,
    projectId: string,
    query: ProjectDocumentsQuery,
  ) {
    await this.project(actor, projectId, 'project.read');
    const projectActor =
      actor.permissionSources === undefined
        ? actor
        : await this.policy.actorForProject(actor, projectId);
    const canReadFiles = canReadProjectFileMetadata(projectActor);
    const where: Prisma.ProjectRequiredDocumentWhereInput = {
      id: query.requirementId,
      organizationId: actor.organizationId,
      projectId,
      stageKey: query.stageKey,
      workstreamKey: query.workstreamKey,
      status: query.status,
      required:
        query.required === undefined ? undefined : query.required === 'true',
      ownerUserId: query.ownerUserId,
      currentFileAssetId: query.missingFile ? null : undefined,
      dueDate: query.overdue ? { lt: new Date() } : undefined,
      documentName: query.search
        ? { contains: query.search, mode: 'insensitive' }
        : undefined,
      ...visibleStageOneDocumentWhere(
        projectActor.permissions.includes('project.stage1.finance.read'),
      ),
      OR: [{ supersededAt: null }, { status: 'SUPERSEDED' }],
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.projectRequiredDocument.findMany({
        where,
        orderBy: {
          [query.sort ?? 'updatedAt']: query.direction ?? 'desc',
        },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.projectRequiredDocument.count({ where }),
    ]);
    const [owners, files] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          id: { in: items.flatMap(({ ownerUserId }) => ownerUserId ?? []) },
          status: 'active',
          organizationMembers: {
            some: { organizationId: actor.organizationId, status: 'active' },
          },
        },
        select: { id: true, displayName: true },
      }),
      canReadFiles
        ? findProjectFiles(
            this.prisma,
            actor,
            projectId,
            items.flatMap(({ currentFileAssetId }) => currentFileAssetId ?? []),
          )
        : Promise.resolve([]),
    ]);
    const filesById = new Map(
      files.map(
        ({
          id,
          originalFilename,
          mimeType,
          sizeBytes,
          uploadedById,
          createdAt,
        }) => [
          id,
          {
            id,
            originalFilename,
            mimeType,
            sizeBytes: sizeBytes.toString(),
            uploadedById,
            createdAt,
          },
        ],
      ),
    );
    return {
      items: items.map((item) => {
        const { currentFileAssetId, ...visible } = item;
        const currentFile = filesById.get(String(currentFileAssetId)) ?? null;
        return {
          ...visible,
          ...(currentFile && { currentFileAssetId }),
          completionPolicy: requiredDocumentCompletionPolicy(item.documentType),
          owner: owners.find(({ id }) => id === item.ownerUserId) ?? null,
          currentFile,
        };
      }),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }

  async createDocument(
    actor: CurrentActor,
    projectId: string,
    data: CreateProjectRequiredDocumentDto,
  ) {
    const financial = isStageOneFinancialDocument(data);
    const requiredPermissions = [
      'project.document.manage',
      ...(financial
        ? ['project.stage1.finance.read', 'project.stage1.finance.manage']
        : []),
    ];
    this.assertFinancialDocument(actor, data, true);
    return this.prisma.$transaction(async (tx) => {
      await this.lockScopedProject(tx, actor, projectId, requiredPermissions);
      await this.assertDocumentOwner(actor, projectId, data.ownerUserId, tx);
      const document = await tx.projectRequiredDocument.create({
        data: {
          ...data,
          organizationId: actor.organizationId,
          projectId,
          required: false,
          status: 'MISSING',
        },
      });
      await this.documentActivity(
        tx,
        actor,
        document.id,
        'PROJECT_DOCUMENT_CREATED',
      );
      return document;
    });
  }

  async updateDocument(
    actor: CurrentActor,
    projectId: string,
    requirementId: string,
    data: UpdateProjectRequiredDocumentDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const current = await this.lockedDocument(
        tx,
        actor,
        projectId,
        requirementId,
        'project.document.manage',
      );
      if (!['MISSING', 'DRAFT', 'REJECTED'].includes(current.status))
        throw new ConflictException(
          'Only draft or rejected requirements can be updated',
        );
      await this.assertDocumentOwner(actor, projectId, data.ownerUserId, tx);
      const dueDate =
        data.dueDate === undefined
          ? undefined
          : data.dueDate === null
            ? null
            : new Date(data.dueDate);
      if (
        (data.ownerUserId === undefined ||
          data.ownerUserId === current.ownerUserId) &&
        (dueDate === undefined ||
          dueDate?.getTime() === current.dueDate?.getTime())
      )
        return current;
      const update = {
        ...(data.ownerUserId !== undefined
          ? { ownerUserId: data.ownerUserId }
          : {}),
        ...(dueDate !== undefined ? { dueDate } : {}),
      };
      const updated = await tx.projectRequiredDocument.update({
        where: { id: requirementId },
        data: update,
      });
      await this.documentActivity(
        tx,
        actor,
        requirementId,
        'PROJECT_DOCUMENT_UPDATED',
      );
      await this.audit.write(tx, actor, {
        action: 'PROJECT_DOCUMENT_UPDATED',
        entityType: 'ProjectRequiredDocument',
        entityId: requirementId,
        beforeData: {
          ownerUserId: current.ownerUserId,
          dueDate: current.dueDate,
        },
        afterData: {
          ownerUserId: updated.ownerUserId,
          dueDate: updated.dueDate,
        },
      });
      return updated;
    });
  }

  async linkDocumentFile(
    actor: CurrentActor,
    projectId: string,
    requirementId: string,
    fileAssetId: string,
  ) {
    return this.prisma.$transaction((tx) =>
      this.linkDocumentFileInTransaction(
        actor,
        projectId,
        requirementId,
        fileAssetId,
        tx,
      ),
    );
  }

  async linkDocumentFileInTransaction(
    actor: CurrentActor,
    projectId: string,
    requirementId: string,
    fileAssetId: string,
    tx: Prisma.TransactionClient,
    note?: string,
  ) {
    return this.linkDocumentFileTransaction(
      actor,
      projectId,
      requirementId,
      fileAssetId,
      tx,
      note,
      false,
    );
  }

  async linkUploadFileInTransaction(
    actor: CurrentActor,
    projectId: string,
    requirementId: string,
    fileAssetId: string,
    tx: Prisma.TransactionClient,
  ) {
    return this.linkDocumentFileTransaction(
      actor,
      projectId,
      requirementId,
      fileAssetId,
      tx,
      undefined,
      true,
    );
  }

  private async linkDocumentFileTransaction(
    actor: CurrentActor,
    projectId: string,
    requirementId: string,
    fileAssetId: string,
    tx: Prisma.TransactionClient,
    note: string | undefined,
    uploadSessionOwned: boolean,
  ) {
    const requiredPermissions = uploadSessionOwned
      ? ['file.upload', 'project.document.manage']
      : 'project.document.manage';
    await this.lockScopedProject(tx, actor, projectId, requiredPermissions);
    const locked = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT "id" FROM "FileAsset"
      WHERE "id" = ${fileAssetId}::uuid
        AND "organizationId" = ${actor.organizationId}::uuid
        AND "deletedAt" IS NULL
      FOR UPDATE
    `);
    if (!locked.length)
      throw new UnprocessableEntityException('Invalid evidence file');
    if (uploadSessionOwned)
      await this.assertUploadSessionFile(
        actor,
        projectId,
        requirementId,
        fileAssetId,
        tx,
      );
    else await this.assertFile(actor, projectId, fileAssetId, tx);
    const current = await this.lockedDocumentRow(
      tx,
      actor,
      projectId,
      requirementId,
    );
    if (
      !['MISSING', 'DRAFT', 'REJECTED', 'SUPERSEDED'].includes(current.status)
    )
      throw new ConflictException('Current document state is immutable');
    if (current.currentFileAssetId === fileAssetId) return current;
    if (current.currentVersion)
      await tx.projectRequiredDocumentVersion.upsert({
        where: {
          requirementId_version: {
            requirementId,
            version: current.currentVersion,
          },
        },
        create: {
          requirementId,
          version: current.currentVersion,
          fileAssetId: current.currentFileAssetId,
          status: current.status,
          notes: current.notes,
          createdBy: actor.userId,
        },
        update: {
          fileAssetId: current.currentFileAssetId,
          status: current.status,
          notes: current.notes,
        },
      });
    const updated = await tx.projectRequiredDocument.update({
      where: { id: requirementId },
      data: {
        currentFileAssetId: fileAssetId,
        currentVersion: { increment: 1 },
        status: 'DRAFT',
        notes: note ?? null,
        approvedAt: null,
        approvedBy: null,
        supersededAt: null,
        supersededBy: null,
      },
    });
    await tx.projectRequiredDocumentVersion.create({
      data: {
        requirementId,
        version: updated.currentVersion,
        fileAssetId,
        status: updated.status,
        notes: updated.notes,
        createdBy: actor.userId,
      },
    });
    await this.documentActivity(
      tx,
      actor,
      requirementId,
      'PROJECT_DOCUMENT_FILE_LINKED',
    );
    await this.audit.write(tx, actor, {
      action: 'PROJECT_DOCUMENT_FILE_LINKED',
      entityType: 'ProjectRequiredDocument',
      entityId: requirementId,
      beforeData: {
        currentFileAssetId: current.currentFileAssetId,
        currentVersion: current.currentVersion,
        status: current.status,
      },
      afterData: {
        currentFileAssetId: updated.currentFileAssetId,
        currentVersion: updated.currentVersion,
        status: updated.status,
      },
    });
    return updated;
  }

  private async lockScopedProject(
    tx: Prisma.TransactionClient,
    actor: CurrentActor,
    projectId: string,
    requiredPermissions: string | readonly string[],
  ) {
    const locked = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT "id" FROM "Project"
      WHERE "id" = ${projectId}::uuid
        AND "organizationId" = ${actor.organizationId}::uuid
        AND "deletedAt" IS NULL
      FOR UPDATE
    `);
    if (!locked.length) throw new NotFoundException('Project not found');
    const scoped = await tx.project.findFirst({
      where: {
        id: projectId,
        ...this.policy.projectWhere(actor, requiredPermissions),
      },
      select: { id: true },
    });
    if (!scoped) throw new NotFoundException('Project not found');
  }

  private async lockedProduct(
    tx: Prisma.TransactionClient,
    actor: CurrentActor,
    projectId: string,
    lineId: string,
    requiredPermission: string,
  ) {
    await this.lockScopedProject(tx, actor, projectId, requiredPermission);
    const line = await tx.projectProductLine.findFirst({
      where: {
        id: lineId,
        projectId,
        organizationId: actor.organizationId,
        deletedAt: null,
      },
      include: this.includeCurrent(),
    });
    if (!line) throw new NotFoundException('Project product not found');
    return line;
  }

  async submitDocument(
    actor: CurrentActor,
    projectId: string,
    requirementId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const document = await this.lockedDocument(
        tx,
        actor,
        projectId,
        requirementId,
        'project.document.manage',
      );
      if (!document.currentFileAssetId)
        throw new UnprocessableEntityException(
          'A file is required before review',
        );
      const claimed = await tx.projectRequiredDocument.updateMany({
        where: {
          id: requirementId,
          status: 'DRAFT',
        },
        data: { status: 'PENDING_REVIEW' },
      });
      if (!claimed.count)
        throw new ConflictException('Document is not ready for review');
      const reviewerPermissions = [
        'project.document.review',
        ...(isStageOneFinancialDocument(document)
          ? ['project.stage1.finance.read', 'project.stage1.finance.manage']
          : []),
      ];
      const [reviewers = [], ...eligibility] = await Promise.all(
        reviewerPermissions.map((permission) =>
          this.approvers.resolve(
            actor.organizationId,
            projectId,
            permission,
            actor.userId,
            tx,
          ),
        ),
      );
      const eligibleIds = eligibility.map(
        (candidates) => new Set(candidates.map(({ id }) => id)),
      );
      const recipients = reviewers.filter(({ id }) =>
        eligibleIds.every((ids) => ids.has(id)),
      );
      if (!recipients.length)
        throw new UnprocessableEntityException(
          'No eligible document approver found',
        );
      const submission = await this.documentActivity(
        tx,
        actor,
        requirementId,
        'PROJECT_DOCUMENT_SUBMITTED',
      );
      await tx.notification.createMany({
        data: recipients.map(({ id: recipientId }) => ({
          organizationId: actor.organizationId,
          recipientId,
          actorId: actor.userId,
          type: 'PROJECT_DOCUMENT_REVIEW_REQUESTED',
          title: document.documentName,
          entityType: 'ProjectRequiredDocument',
          entityId: requirementId,
          projectId,
          href: `/projects/${projectId}/documents/${requirementId}`,
          idempotencyKey: `project-document-review:${requirementId}:${submission.id}:${recipientId}`,
        })),
        skipDuplicates: true,
      });
      return tx.projectRequiredDocument.findUniqueOrThrow({
        where: { id: requirementId },
      });
    });
  }

  async decideDocument(
    actor: CurrentActor,
    projectId: string,
    requirementId: string,
    data: ProjectDocumentDecisionDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const document = await this.lockedDocument(
        tx,
        actor,
        projectId,
        requirementId,
        'project.document.review',
      );
      if (document.status !== 'PENDING_REVIEW')
        throw new ConflictException('Document is not pending review');
      const submission = await tx.activity.findFirst({
        where: {
          organizationId: actor.organizationId,
          entityType: 'ProjectRequiredDocument',
          entityId: requirementId,
          event: 'PROJECT_DOCUMENT_SUBMITTED',
        },
        orderBy: { createdAt: 'desc' },
      });
      if (submission?.actorId === actor.userId)
        throw new ForbiddenException('Submitter cannot review own document');
      const decidedAt = new Date();
      const claimed = await tx.projectRequiredDocument.updateMany({
        where: { id: requirementId, status: 'PENDING_REVIEW' },
        data: {
          status: data.decision,
          notes: data.notes,
          approvedAt: data.decision === 'APPROVED' ? decidedAt : null,
          approvedBy: data.decision === 'APPROVED' ? actor.userId : null,
        },
      });
      if (!claimed.count)
        throw new ConflictException('Document is not pending review');
      const recipientIds = [document.ownerUserId, submission?.actorId].filter(
        (id): id is string => !!id && id !== actor.userId,
      );
      if (recipientIds.length)
        await tx.notification.createMany({
          data: [...new Set(recipientIds)].map((recipientId) => ({
            organizationId: actor.organizationId,
            recipientId,
            actorId: actor.userId,
            type: 'PROJECT_DOCUMENT_REVIEW_DECIDED',
            title: `${document.documentName}: ${data.decision}`,
            entityType: 'ProjectRequiredDocument',
            entityId: requirementId,
            projectId,
            href: `/projects/${projectId}/documents/${requirementId}`,
            idempotencyKey: `project-document-decision:${requirementId}:${submission?.id ?? `legacy-${document.currentVersion}`}:${recipientId}`,
          })),
          skipDuplicates: true,
        });
      await this.documentActivity(
        tx,
        actor,
        requirementId,
        `PROJECT_DOCUMENT_${data.decision}`,
      );
      return tx.projectRequiredDocument.findUniqueOrThrow({
        where: { id: requirementId },
      });
    });
  }

  async markDocumentNotApplicable(
    actor: CurrentActor,
    projectId: string,
    requirementId: string,
    data: ProjectDocumentNotApplicableDto,
  ) {
    const reason = data.reason.trim();
    if (!reason)
      throw new BadRequestException('Not-applicable reason is required');
    return this.prisma.$transaction(async (tx) => {
      const before = await this.lockedDocument(
        tx,
        actor,
        projectId,
        requirementId,
        'project.document.review',
      );
      if (
        !['MISSING', 'DRAFT', 'PENDING_REVIEW', 'REJECTED'].includes(
          before.status,
        )
      )
        throw new ConflictException('Current document state is immutable');
      const updated = await tx.projectRequiredDocument.update({
        where: { id: requirementId },
        data: {
          status: 'NOT_APPLICABLE',
          notApplicableReason: reason,
          markedBy: actor.userId,
          markedAt: new Date(),
        },
      });
      await this.documentActivity(
        tx,
        actor,
        requirementId,
        'PROJECT_DOCUMENT_NOT_APPLICABLE',
      );
      await this.audit.write(tx, actor, {
        action: 'PROJECT_DOCUMENT_NOT_APPLICABLE',
        entityType: 'ProjectRequiredDocument',
        entityId: requirementId,
        beforeData: before,
        afterData: updated,
      });
      return updated;
    });
  }

  async restoreDocumentApplicability(
    actor: CurrentActor,
    projectId: string,
    requirementId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const before = await this.lockedDocument(
        tx,
        actor,
        projectId,
        requirementId,
        'project.document.review',
      );
      if (
        before.status !== 'NOT_APPLICABLE' ||
        !before.notApplicableReason?.trim() ||
        !before.markedBy ||
        !before.markedAt
      )
        throw new ConflictException(
          'Only an audited not-applicable decision can be restored',
        );
      const updated = await tx.projectRequiredDocument.update({
        where: { id: requirementId },
        data: {
          status: before.currentFileAssetId ? 'DRAFT' : 'MISSING',
          notApplicableReason: null,
          markedBy: null,
          markedAt: null,
        },
      });
      await this.documentActivity(
        tx,
        actor,
        requirementId,
        'PROJECT_DOCUMENT_APPLICABILITY_RESTORED',
      );
      await this.audit.write(tx, actor, {
        action: 'PROJECT_DOCUMENT_APPLICABILITY_RESTORED',
        entityType: 'ProjectRequiredDocument',
        entityId: requirementId,
        beforeData: before,
        afterData: updated,
      });
      return updated;
    });
  }

  async supersedeDocument(
    actor: CurrentActor,
    projectId: string,
    requirementId: string,
  ) {
    return this.documentStatus(
      actor,
      projectId,
      requirementId,
      {
        status: 'SUPERSEDED',
        supersededAt: new Date(),
        supersededBy: actor.userId,
      },
      'PROJECT_DOCUMENT_SUPERSEDED',
      ['APPROVED'],
      'project.document.manage',
    );
  }

  async documentHistory(
    actor: CurrentActor,
    projectId: string,
    requirementId: string,
  ) {
    const current = await this.document(
      actor,
      projectId,
      requirementId,
      false,
      'project.read',
    );
    const projectActor =
      actor.permissionSources === undefined
        ? actor
        : await this.policy.actorForProject(actor, projectId);
    const canReadFiles = canReadProjectFileMetadata(projectActor);
    const versions = await this.prisma.projectRequiredDocumentVersion.findMany({
      where: { requirementId, version: { not: current.currentVersion } },
      orderBy: { version: 'desc' },
      select: {
        id: true,
        version: true,
        fileAssetId: true,
        status: true,
        createdBy: true,
        createdAt: true,
      },
    });
    const fileIds = [
      ...(current.currentFileAssetId ? [current.currentFileAssetId] : []),
      ...versions.flatMap(({ fileAssetId }) => fileAssetId ?? []),
    ];
    const files = canReadFiles
      ? await findProjectFiles(this.prisma, actor, projectId, fileIds)
      : [];
    const userIds = [
      ...files.map(({ uploadedById }) => uploadedById),
      ...versions.map(({ createdBy }) => createdBy),
      ...(current.approvedBy ? [current.approvedBy] : []),
    ];
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: {
            id: { in: [...new Set(userIds)] },
            status: 'active',
            organizationMembers: {
              some: { organizationId: actor.organizationId, status: 'active' },
            },
          },
          select: { id: true, displayName: true },
        })
      : [];
    const fileById = new Map(files.map((file) => [file.id, file]));
    const userById = new Map(users.map((user) => [user.id, user]));
    const currentFile = current.currentFileAssetId
      ? fileById.get(current.currentFileAssetId)
      : undefined;
    return {
      current: {
        downloadId: currentFile?.id ?? null,
        filename: currentFile?.originalFilename ?? null,
        version: current.currentVersion,
        status: current.status,
        note: current.notes,
        uploader: currentFile
          ? (userById.get(currentFile.uploadedById) ?? null)
          : null,
        timestamp: currentFile?.createdAt ?? null,
        approval: current.approvedAt
          ? {
              actor: current.approvedBy
                ? (userById.get(current.approvedBy) ?? null)
                : null,
              timestamp: current.approvedAt,
            }
          : null,
      },
      versions: versions.map((version) => {
        const file = version.fileAssetId
          ? fileById.get(version.fileAssetId)
          : undefined;
        return {
          id: version.id,
          downloadId: file?.id ?? null,
          filename: file?.originalFilename ?? null,
          version: version.version,
          actor: userById.get(version.createdBy) ?? null,
          timestamp: version.createdAt,
          status: version.status,
        };
      }),
    };
  }

  private async document(
    actor: CurrentActor,
    projectId: string,
    requirementId: string,
    manage = false,
    requiredPermissions?: string | readonly string[],
    db: Pick<
      Prisma.TransactionClient,
      'project' | 'projectRequiredDocument'
    > = this.prisma,
  ) {
    await this.project(actor, projectId, requiredPermissions, db);
    const document = await db.projectRequiredDocument.findFirst({
      where: {
        id: requirementId,
        projectId,
        organizationId: actor.organizationId,
      },
    });
    if (!document) throw new NotFoundException('Required document not found');
    this.assertActiveDocumentDefinition(document);
    this.assertFinancialDocument(actor, document, manage);
    if (
      isStageOneFinancialDocument(document) &&
      actor.permissionSources !== undefined &&
      !(await this.policy.hasProjectPermissions(
        actor,
        projectId,
        manage
          ? ['project.stage1.finance.read', 'project.stage1.finance.manage']
          : 'project.stage1.finance.read',
        db,
      ))
    )
      throw new NotFoundException('Required document not found');
    return document;
  }

  private assertActiveDocumentDefinition(document: {
    status: string;
    supersededAt?: Date | null;
  }) {
    if (document.supersededAt && document.status !== 'SUPERSEDED')
      throw new NotFoundException('Required document not found');
  }

  private assertFinancialDocument(
    actor: CurrentActor,
    document: {
      stageKey?: string | null;
      workstreamKey?: string | null;
      documentType?: string | null;
    },
    manage: boolean,
  ) {
    if (
      isStageOneFinancialDocument(document) &&
      (!actor.permissions.includes('project.stage1.finance.read') ||
        (manage &&
          !actor.permissions.includes('project.stage1.finance.manage')))
    )
      throw new NotFoundException('Required document not found');
  }

  private documentStatus(
    actor: CurrentActor,
    projectId: string,
    requirementId: string,
    data: Prisma.ProjectRequiredDocumentUpdateInput,
    event: string,
    allowedStatuses: string[],
    requiredPermissions: string | readonly string[],
  ) {
    return this.prisma.$transaction(async (tx) => {
      const document = await this.lockedDocument(
        tx,
        actor,
        projectId,
        requirementId,
        requiredPermissions,
      );
      if (!allowedStatuses.includes(document.status))
        throw new ConflictException('Current document state is immutable');
      const updated = await tx.projectRequiredDocument.update({
        where: { id: requirementId },
        data,
      });
      await this.documentActivity(tx, actor, requirementId, event);
      return updated;
    });
  }

  private async lockedDocument(
    tx: Prisma.TransactionClient,
    actor: CurrentActor,
    projectId: string,
    requirementId: string,
    requiredPermissions: string | readonly string[],
  ) {
    await this.lockScopedProject(tx, actor, projectId, requiredPermissions);
    return this.lockedDocumentRow(tx, actor, projectId, requirementId);
  }

  private async lockedDocumentRow(
    tx: Prisma.TransactionClient,
    actor: CurrentActor,
    projectId: string,
    requirementId: string,
  ) {
    const locked = await tx.$queryRaw<
      { id: string }[]
    >`SELECT "id" FROM "ProjectRequiredDocument" WHERE "id" = ${requirementId}::uuid AND "projectId" = ${projectId}::uuid AND "organizationId" = ${actor.organizationId}::uuid FOR UPDATE`;
    if (!locked.length)
      throw new NotFoundException('Required document not found');
    const document = await tx.projectRequiredDocument.findFirst({
      where: {
        id: requirementId,
        projectId,
        organizationId: actor.organizationId,
      },
    });
    if (!document) throw new NotFoundException('Required document not found');
    this.assertActiveDocumentDefinition(document);
    this.assertFinancialDocument(actor, document, true);
    if (
      isStageOneFinancialDocument(document) &&
      actor.permissionSources !== undefined &&
      !(await this.policy.hasProjectPermissions(
        actor,
        projectId,
        ['project.stage1.finance.read', 'project.stage1.finance.manage'],
        tx,
      ))
    )
      throw new NotFoundException('Required document not found');
    return document;
  }

  private async assertDocumentOwner(
    actor: CurrentActor,
    projectId: string,
    ownerUserId: string | null | undefined,
    db: Prisma.TransactionClient,
  ) {
    if (
      ownerUserId &&
      !(await db.user.findFirst({
        where: {
          id: ownerUserId,
          status: 'active',
          organizationMembers: {
            some: { organizationId: actor.organizationId, status: 'active' },
          },
          projectMemberships: { some: { projectId } },
        },
      }))
    )
      throw new UnprocessableEntityException(
        'Document owner must be an active project member',
      );
  }

  private documentActivity(
    tx: Prisma.TransactionClient,
    actor: CurrentActor,
    requirementId: string,
    event: string,
  ) {
    return tx.activity.create({
      data: {
        organizationId: actor.organizationId,
        actorId: actor.userId,
        event,
        entityType: 'ProjectRequiredDocument',
        entityId: requirementId,
      },
    });
  }

  private async references(
    actor: CurrentActor,
    projectId: string,
    data: {
      locationId?: string | null;
      productId?: string | null;
      variantId?: string | null;
      supplierId?: string | null;
    },
    db: Prisma.TransactionClient,
  ) {
    if (data.locationId) {
      const location = await db.projectLocation.findFirst({
        where: { id: data.locationId, projectId, active: true },
      });
      if (!location) throw new UnprocessableEntityException('Invalid location');
    }
    if (data.productId) {
      const product = await db.product.findFirst({
        where: {
          id: data.productId,
          organizationId: actor.organizationId,
          activeStatus: 'active',
        },
      });
      if (!product) throw new UnprocessableEntityException('Invalid product');
    }
    if (data.variantId) {
      const variant = await db.productVariant.findFirst({
        where: {
          id: data.variantId,
          productId: data.productId!,
          product: { organizationId: actor.organizationId },
          activeStatus: 'active',
        },
      });
      if (!variant) throw new UnprocessableEntityException('Invalid variant');
    }
    if (data.supplierId) {
      const supplier = await db.supplier.findFirst({
        where: {
          id: data.supplierId,
          organizationId: actor.organizationId,
          activeStatus: 'active',
        },
      });
      if (!supplier) throw new UnprocessableEntityException('Invalid supplier');
    }
  }

  private assertProductChoice(data: {
    productId?: string | null;
    variantId?: string | null;
    customProductName?: string | null;
  }) {
    if (!data.productId && !data.customProductName)
      throw new UnprocessableEntityException(
        'Product or custom product is required',
      );
    if (data.productId && data.customProductName)
      throw new UnprocessableEntityException(
        'Choose Product or custom product, not both',
      );
    if (data.variantId && !data.productId)
      throw new UnprocessableEntityException(
        'Variant requires a catalog product',
      );
  }

  private require(actor: CurrentActor, permission: string) {
    if (!actor.permissions.includes(permission))
      throw new ForbiddenException('Insufficient permission');
  }

  private revisionData(data: UpdateProjectProductDto) {
    const revision = { ...data };
    delete revision.code;
    delete revision.locationId;
    delete revision.positionName;
    return revision;
  }

  private statusField(type: ProjectProductApprovalType) {
    return `${type.toLowerCase()}ApprovalStatus` as
      | 'customerApprovalStatus'
      | 'technicalApprovalStatus'
      | 'commercialApprovalStatus';
  }

  private includeCurrent() {
    return {
      location: true,
      revisions: {
        include: {
          product: { include: { brand: true } },
          variant: true,
          supplier: true,
          approvals: { orderBy: { createdAt: 'desc' as const } },
        },
        orderBy: { revision: 'desc' as const },
        take: 1,
      },
    } as const;
  }

  private async assertFile(
    actor: CurrentActor,
    projectId: string,
    fileId: string,
    db: ProjectFileClient = this.prisma,
  ) {
    const file = await findProjectFile(db, actor, projectId, fileId);
    if (!file) throw new UnprocessableEntityException('Invalid evidence file');
  }

  private async assertUploadSessionFile(
    actor: CurrentActor,
    projectId: string,
    requirementId: string,
    fileId: string,
    db: ProjectFileClient = this.prisma,
  ) {
    const file = await db.fileAsset.findFirst({
      where: {
        id: fileId,
        organizationId: actor.organizationId,
        uploadedById: actor.userId,
        deletedAt: null,
        uploadSession: {
          is: {
            actorId: actor.userId,
            projectId,
            requiredDocumentId: requirementId,
            stageOneDocumentId: null,
            status: 'AVAILABLE',
            expiresAt: { gt: new Date() },
          },
        },
      },
      select: { id: true },
    });
    if (!file) throw new UnprocessableEntityException('Invalid evidence file');
  }

  private activity(
    tx: Prisma.TransactionClient,
    actor: CurrentActor,
    lineId: string,
    event: string,
  ) {
    return tx.activity.create({
      data: {
        organizationId: actor.organizationId,
        actorId: actor.userId,
        event,
        entityType: 'ProjectProductLine',
        entityId: lineId,
      },
    });
  }
}
