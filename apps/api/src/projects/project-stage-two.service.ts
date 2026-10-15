import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import ExcelJS from 'exceljs';
import { Prisma } from '@prisma/client';
import { isDeepStrictEqual } from 'node:util';
import { BusinessEntityPolicy } from '../access-control/business-entity.policy';
import { CurrentActor } from '../access-control/current-actor';
import { AuditService } from '../audit/audit.service';
import { readEnvironment } from '../config/env';
import { hiddenProjectFileIds } from '../files/project-file';
import { PrismaService } from '../prisma.service';
import { uploadConstraints } from '../uploads/uploads.service';
import {
  STAGE_TWO_BASELINE_VERSION,
  STAGE_TWO_PLAN_ENTITY,
  STAGE_TWO_PLAN_HEADERS,
  STAGE_TWO_PLAN_WORKSTREAM,
  type StageTwoDocumentDefinitionDto,
  type StageTwoPlanBatchDto,
} from './project-stage-two.dto';
import {
  canReadProjectFileMetadata,
  documentCapabilities,
} from './project-stage-one.service';

const tabs = [
  { step: 1, label: 'KẾ HOẠCH & KHẢO SÁT' },
  { step: 2, label: 'THIẾT KẾ, SẢN PHẨM & BOQ' },
  { step: 3, label: 'THẨM ĐỊNH & PHÊ DUYỆT' },
] as const;

export const STAGE_TWO_DOCUMENT_DEFAULTS = [
  'Kế hoạch & khảo sát dự án',
  'Thiết kế, sản phẩm & BOQ',
  'Thẩm định & phê duyệt',
  'Hồ sơ khác',
] as const;

const own = (value: object, key: PropertyKey) =>
  Object.prototype.hasOwnProperty.call(value, key);

const normalizeDocumentName = (name: string) =>
  name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi');

const planDate = (value: string) => {
  const parts = value.split('-').map(Number);
  if (parts.length !== 3) throw new BadRequestException('Plan date is invalid');
  const [year, month, day] = parts as [number, number, number];
  const result = new Date(Date.UTC(year, month - 1, day));
  if (result.toISOString().slice(0, 10) !== value)
    throw new BadRequestException('Plan date is invalid');
  return result;
};

@Injectable()
export class ProjectStageTwoService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(BusinessEntityPolicy) private readonly policy: BusinessEntityPolicy,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private require(actor: CurrentActor, permission: string) {
    if (!actor.permissions.includes(permission))
      throw new ForbiddenException('Insufficient permission');
  }

  private async project(
    actor: CurrentActor,
    projectId: string,
    requiredPermissions: string | readonly string[] = 'project.read',
  ) {
    const projectActor =
      actor.permissionSources === undefined
        ? actor
        : await this.policy.actorForProject(actor, projectId);
    const canReadFiles = canReadProjectFileMetadata(projectActor);
    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        ...this.policy.projectWhere(actor, requiredPermissions),
      },
      select: {
        id: true,
        code: true,
        name: true,
        customer: { select: { id: true, displayName: true } },
        location: true,
        projectType: true,
        status: true,
        phase: true,
        stageStates: {
          where: { stage: 'STAGE_TWO' },
          select: { status: true },
          take: 1,
        },
        stageSteps: {
          where: { stage: 'STAGE_TWO', step: 'ASSIGNMENT' },
          select: { status: true },
          take: 1,
        },
        requiredDocuments: {
          where: {
            stageKey: 'STAGE_2',
            workstreamKey: STAGE_TWO_PLAN_WORKSTREAM,
          },
          orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
          select: {
            id: true,
            workstreamKey: true,
            documentType: true,
            documentName: true,
            notes: true,
            position: true,
            initialMatrix: true,
            required: true,
            supersededAt: true,
          },
        },
        stageOneDocuments: {
          where: {
            stageKey: 'STAGE_2',
            workstreamKey: STAGE_TWO_PLAN_WORKSTREAM,
            currentFileAssetId: { not: null },
            currentFileAsset: { deletedAt: null },
          },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            createdAt: true,
            requiredDocumentId: true,
            documentType: true,
            displayName: true,
            status: true,
            currentVersion: true,
            currentFileAssetId: canReadFiles,
            submittedOfficer: {
              select: { id: true, displayName: true, email: true },
            },
            currentFileAsset: canReadFiles
              ? {
                  select: {
                    id: true,
                    originalFilename: true,
                    mimeType: true,
                    sizeBytes: true,
                  },
                }
              : false,
          },
        },
      },
    });
    if (!project) throw new NotFoundException('Project not found');
    return { project, projectActor };
  }

  async get(actor: CurrentActor, projectId: string, step = 1) {
    this.require(actor, 'project.read');
    if (Number(step) !== 1)
      throw new BadRequestException('Only Stage 2 Step 1 is available');
    const { project, projectActor } = await this.project(actor, projectId);
    const canReadFiles = canReadProjectFileMetadata(projectActor);
    const hiddenFileIds = new Set(
      await hiddenProjectFileIds(this.prisma, actor, projectId),
    );
    const canReadPlan = projectActor.permissions.includes('task.read');
    const finance = projectActor.permissions.includes('estimate.read');
    const [plan, projects, members, departments] = await Promise.all([
      canReadPlan
        ? this.prisma.task.findMany({
            where: {
              organizationId: actor.organizationId,
              projectId,
              relatedEntityType: STAGE_TWO_PLAN_ENTITY,
              baselineVersion: STAGE_TWO_BASELINE_VERSION,
              deletedAt: null,
            },
            orderBy: [{ startDate: 'asc' }, { code: 'asc' }],
            select: {
              id: true,
              code: true,
              description: true,
              departmentId: true,
              startDate: true,
              dueDate: true,
              version: true,
              department: { select: { id: true, code: true, name: true } },
              ...(finance && { allocatedBudget: true }),
            },
          })
        : Promise.resolve([]),
      this.prisma.project.findMany({
        where: this.policy.projectWhere(actor, 'project.read'),
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        select: { id: true, code: true, name: true },
      }),
      this.prisma.projectMember.findMany({
        where: {
          organizationId: actor.organizationId,
          projectId,
          user: {
            status: 'active',
            organizationMembers: {
              some: { organizationId: actor.organizationId, status: 'active' },
            },
          },
        },
        orderBy: { user: { displayName: 'asc' } },
        select: {
          role: true,
          user: { select: { id: true, displayName: true, email: true } },
        },
      }),
      canReadPlan
        ? this.prisma.department.findMany({
            where: { organizationId: actor.organizationId, status: 'active' },
            orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
            select: { id: true, code: true, name: true },
          })
        : Promise.resolve([]),
    ]);
    const documents = project.stageOneDocuments.map((document) => {
      const { currentFileAsset, currentFileAssetId, ...visible } = document;
      const canReadCurrentFile =
        canReadFiles && !hiddenFileIds.has(String(currentFileAssetId));
      return {
        ...visible,
        ...(canReadCurrentFile && {
          currentFileAssetId,
          currentFileAsset: currentFileAsset
            ? {
                ...currentFileAsset,
                sizeBytes: currentFileAsset.sizeBytes.toString(),
              }
            : currentFileAsset,
        }),
      };
    });
    return {
      project: {
        id: project.id,
        code: project.code,
        name: project.name,
        customer: project.customer,
        location: project.location,
        projectType: project.projectType,
        status: project.status,
        phase: project.phase,
      },
      selectedStep: 1 as const,
      tabs,
      state: {
        status: project.stageStates[0]?.status ?? 'NOT_INITIALIZED',
        stepOneStatus: project.stageSteps[0]?.status ?? 'TODO',
      },
      plan: plan.map((row) => ({
        id: row.id,
        code: row.code,
        description: row.description,
        departmentId: row.departmentId,
        department: row.department,
        startDate: row.startDate?.toISOString().slice(0, 10) ?? null,
        finishDate: row.dueDate?.toISOString().slice(0, 10) ?? null,
        version: row.version,
        ...(finance && {
          allocatedBudget: row.allocatedBudget?.toFixed(2) ?? null,
        }),
      })),
      documentDefinitions: project.requiredDocuments.map((definition) => ({
        id: definition.id,
        name: definition.documentName,
        workstreamKey: definition.workstreamKey,
        description: definition.notes ?? undefined,
        position: definition.position,
        initialMatrix: definition.initialMatrix,
        active: definition.supersededAt === null,
        required: false,
        files: documents.filter(
          ({ requiredDocumentId }) => requiredDocumentId === definition.id,
        ),
      })),
      documents,
      options: {
        projects,
        members: members.map(({ role, user }) => ({ ...user, role })),
        departments,
      },
      uploadConstraints: uploadConstraints(
        readEnvironment().UPLOAD_MAX_FILE_BYTES,
      ),
      capabilities: documentCapabilities(projectActor),
      permittedCommands: {
        viewPlan: canReadPlan,
        addPlanRows:
          canReadPlan && projectActor.permissions.includes('task.create'),
        editPlanRows:
          canReadPlan && projectActor.permissions.includes('task.update'),
        deletePlanRows:
          canReadPlan && projectActor.permissions.includes('task.delete'),
        downloadTemplate:
          canReadPlan &&
          projectActor.permissions.includes('task.create') &&
          finance,
        previewImport:
          canReadPlan &&
          projectActor.permissions.includes('import.create') &&
          projectActor.permissions.includes('file.read') &&
          projectActor.permissions.includes('file.download'),
        confirmImport:
          canReadPlan &&
          projectActor.permissions.includes('import.confirm') &&
          projectActor.permissions.includes('task.create') &&
          projectActor.permissions.includes('file.read') &&
          projectActor.permissions.includes('file.download'),
        completeStep:
          canReadPlan && projectActor.permissions.includes('project.update'),
        manageDocumentDefinitions: projectActor.permissions.includes(
          'project.document.manage',
        ),
        uploadDocuments:
          projectActor.permissions.includes('file.upload') &&
          projectActor.permissions.includes('project.document.manage'),
        viewAllocatedBudget: canReadPlan && finance,
        editAllocatedBudget:
          canReadPlan &&
          finance &&
          projectActor.permissions.includes('estimate.update'),
      },
    };
  }

  private definitionResponse(definition: {
    id: string;
    documentName: string;
    workstreamKey: string;
    notes: string | null;
    position: number;
    initialMatrix: boolean;
    required: boolean;
    supersededAt: Date | null;
  }) {
    return {
      id: definition.id,
      name: definition.documentName,
      workstreamKey: definition.workstreamKey,
      description: definition.notes ?? undefined,
      position: definition.position,
      initialMatrix: definition.initialMatrix,
      active: definition.supersededAt === null,
      required: false,
      files: [],
    };
  }

  private async assertMatrixReclassificationAllowed(
    tx: Prisma.TransactionClient,
    definition: {
      id: string;
      initialMatrix: boolean;
      currentFileAssetId: string | null;
      currentVersion: number;
    },
  ) {
    if (definition.initialMatrix) return;
    const [logicalDocument, legacyVersion] = await Promise.all([
      tx.projectStageOneDocument.findFirst({
        where: { requiredDocumentId: definition.id },
        select: { id: true },
      }),
      tx.projectRequiredDocumentVersion.findFirst({
        where: { requirementId: definition.id },
        select: { id: true },
      }),
    ]);
    if (
      logicalDocument ||
      legacyVersion ||
      definition.currentFileAssetId ||
      definition.currentVersion > 0
    )
      throw new ConflictException(
        'Document definition context cannot change after files or history exist',
      );
  }

  async initializeDocumentDefinitions(actor: CurrentActor, projectId: string) {
    this.require(actor, 'project.update');
    return this.prisma.$transaction(async (tx) => {
      await this.lockProject(tx, actor, projectId, 'project.update');
      const state = await tx.projectStageState.findUniqueOrThrow({
        where: { projectId_stage: { projectId, stage: 'STAGE_TWO' } },
        select: { documentDefinitionsInitializedAt: true },
      });
      const existing = await tx.projectRequiredDocument.findMany({
        where: {
          organizationId: actor.organizationId,
          projectId,
          stageKey: 'STAGE_2',
          workstreamKey: STAGE_TWO_PLAN_WORKSTREAM,
        },
      });
      const requiredIds = existing
        .filter(({ required }) => required)
        .map(({ id }) => id);
      if (requiredIds.length)
        await tx.projectRequiredDocument.updateMany({
          where: { id: { in: requiredIds }, required: true },
          data: { required: false },
        });
      if (state.documentDefinitionsInitializedAt) return { initialized: false };
      const definitions: { id: string; position: number }[] = [];
      for (const [position, name] of STAGE_TWO_DOCUMENT_DEFAULTS.entries()) {
        const normalizedName = normalizeDocumentName(name);
        const current = existing.find(
          (definition) =>
            definition.documentType === name ||
            normalizeDocumentName(definition.documentName) === normalizedName,
        );
        if (current) {
          definitions.push({ id: current.id, position: current.position });
          continue;
        }
        const definition = await tx.projectRequiredDocument.create({
          data: {
            organizationId: actor.organizationId,
            projectId,
            stageKey: 'STAGE_2',
            workstreamKey: STAGE_TWO_PLAN_WORKSTREAM,
            documentType: name,
            documentName: name,
            normalizedName,
            required: false,
            position,
            initialMatrix: true,
            ownerRole: 'PROJECT_MANAGER',
            status: 'MISSING',
          },
        });
        existing.push(definition);
        definitions.push({ id: definition.id, position });
      }
      const marked = await tx.projectStageState.updateMany({
        where: {
          projectId,
          stage: 'STAGE_TWO',
          documentDefinitionsInitializedAt: null,
        },
        data: { documentDefinitionsInitializedAt: new Date() },
      });
      if (!marked.count)
        throw new ConflictException('Stage 2 document definitions changed');
      await tx.activity.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          event: 'PROJECT_STAGE_TWO_DOCUMENT_DEFINITIONS_INITIALIZED',
          entityType: 'Project',
          entityId: projectId,
          metadata: { definitions },
        },
      });
      await this.audit.write(tx, actor, {
        action: 'PROJECT_STAGE_TWO_DOCUMENT_DEFINITIONS_INITIALIZED',
        entityType: 'Project',
        entityId: projectId,
        afterData: { definitions },
      });
      return { initialized: true };
    });
  }

  async createDocumentDefinition(
    actor: CurrentActor,
    projectId: string,
    input: StageTwoDocumentDefinitionDto,
  ) {
    this.require(actor, 'project.document.manage');
    if (input.initialMatrix !== true)
      throw new BadRequestException(
        'Stage 2 document definitions must use Matrix context',
      );
    return this.prisma.$transaction(async (tx) => {
      await this.lockProject(tx, actor, projectId, 'project.document.manage');
      const name = input.name.trim().replace(/\s+/g, ' ');
      const description = input.description?.trim() || undefined;
      const normalizedName = normalizeDocumentName(name);
      const candidates = await tx.projectRequiredDocument.findMany({
        where: {
          projectId,
          organizationId: actor.organizationId,
          stageKey: 'STAGE_2',
          workstreamKey: STAGE_TWO_PLAN_WORKSTREAM,
        },
      });
      if (
        candidates.some(
          (candidate) =>
            candidate.supersededAt === null &&
            (candidate.documentType === name ||
              normalizeDocumentName(candidate.documentName) === normalizedName),
        )
      )
        throw new ConflictException('Document definition already exists');
      const historical =
        candidates.find(({ documentType }) => documentType === name) ??
        candidates.find(
          ({ documentName }) =>
            normalizeDocumentName(documentName) === normalizedName,
        );
      if (historical?.status === 'SUPERSEDED')
        throw new ConflictException(
          'Superseded document history cannot be restored',
        );
      if (historical)
        await this.assertMatrixReclassificationAllowed(tx, historical);
      const definitionData = {
        workstreamKey: STAGE_TWO_PLAN_WORKSTREAM,
        documentType: name,
        documentName: name,
        notes: description,
        position: input.position,
        initialMatrix: input.initialMatrix,
        normalizedName,
        required: false,
        supersededAt: input.active
          ? null
          : (historical?.supersededAt ?? new Date()),
        supersededBy: input.active
          ? null
          : (historical?.supersededBy ?? actor.userId),
      };
      const definition = historical
        ? await tx.projectRequiredDocument.update({
            where: { id: historical.id },
            data: definitionData,
          })
        : await tx.projectRequiredDocument.create({
            data: {
              organizationId: actor.organizationId,
              projectId,
              stageKey: 'STAGE_2',
              status: 'MISSING',
              ownerRole: 'PROJECT_MANAGER',
              ...definitionData,
            },
          });
      const action = historical ? 'UPDATED' : 'CREATED';
      const after = this.definitionResponse(definition);
      await tx.activity.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          event: `PROJECT_STAGE_TWO_DOCUMENT_DEFINITION_${action}`,
          entityType: 'ProjectRequiredDocument',
          entityId: definition.id,
          metadata: {
            projectId,
            workstreamKey: STAGE_TWO_PLAN_WORKSTREAM,
            position: definition.position,
          },
        },
      });
      await this.audit.write(tx, actor, {
        action: `PROJECT_STAGE_TWO_DOCUMENT_DEFINITION_${action}`,
        entityType: 'ProjectRequiredDocument',
        entityId: definition.id,
        beforeData: historical
          ? this.definitionResponse(historical)
          : undefined,
        afterData: after,
        metadata: { projectId },
      });
      return after;
    });
  }

  async updateDocumentDefinition(
    actor: CurrentActor,
    projectId: string,
    definitionId: string,
    input: StageTwoDocumentDefinitionDto,
  ) {
    this.require(actor, 'project.document.manage');
    if (input.initialMatrix !== true)
      throw new BadRequestException(
        'Stage 2 document definitions must use Matrix context',
      );
    return this.prisma.$transaction(async (tx) => {
      await this.lockProject(tx, actor, projectId, 'project.document.manage');
      const before = await tx.projectRequiredDocument.findFirst({
        where: {
          id: definitionId,
          projectId,
          organizationId: actor.organizationId,
          stageKey: 'STAGE_2',
          workstreamKey: STAGE_TWO_PLAN_WORKSTREAM,
        },
      });
      if (!before) throw new NotFoundException('Document definition not found');
      if (before.status === 'SUPERSEDED')
        throw new ConflictException(
          'Superseded document history cannot be changed',
        );
      await this.assertMatrixReclassificationAllowed(tx, before);
      const name = input.name.trim().replace(/\s+/g, ' ');
      const description = input.description?.trim() || undefined;
      const normalizedName = normalizeDocumentName(name);
      const candidates = await tx.projectRequiredDocument.findMany({
        where: {
          id: { not: definitionId },
          projectId,
          organizationId: actor.organizationId,
          stageKey: 'STAGE_2',
          workstreamKey: STAGE_TWO_PLAN_WORKSTREAM,
        },
        select: {
          documentType: true,
          documentName: true,
          supersededAt: true,
        },
      });
      if (
        candidates.some(
          (candidate) =>
            candidate.documentType === name ||
            (input.active &&
              candidate.supersededAt === null &&
              normalizeDocumentName(candidate.documentName) === normalizedName),
        )
      )
        throw new ConflictException('Document definition already exists');
      const beforeResponse = this.definitionResponse(before);
      const nextResponse = {
        ...beforeResponse,
        name,
        workstreamKey: STAGE_TWO_PLAN_WORKSTREAM,
        description,
        position: input.position,
        initialMatrix: input.initialMatrix,
        active: input.active,
        required: false,
      };
      if (isDeepStrictEqual(beforeResponse, nextResponse))
        return beforeResponse;
      const definition = await tx.projectRequiredDocument.update({
        where: { id: definitionId },
        data: {
          documentName: name,
          documentType: name,
          workstreamKey: STAGE_TWO_PLAN_WORKSTREAM,
          notes: description,
          position: input.position,
          initialMatrix: input.initialMatrix,
          normalizedName,
          required: false,
          supersededAt: input.active
            ? null
            : (before.supersededAt ?? new Date()),
          supersededBy: input.active
            ? null
            : (before.supersededBy ?? actor.userId),
        },
      });
      const after = this.definitionResponse(definition);
      await tx.activity.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          event: 'PROJECT_STAGE_TWO_DOCUMENT_DEFINITION_UPDATED',
          entityType: 'ProjectRequiredDocument',
          entityId: definitionId,
          metadata: {
            projectId,
            workstreamKey: STAGE_TWO_PLAN_WORKSTREAM,
            position: definition.position,
          },
        },
      });
      await this.audit.write(tx, actor, {
        action: 'PROJECT_STAGE_TWO_DOCUMENT_DEFINITION_UPDATED',
        entityType: 'ProjectRequiredDocument',
        entityId: definitionId,
        beforeData: beforeResponse,
        afterData: after,
        metadata: { projectId },
      });
      return after;
    });
  }

  async template(actor: CurrentActor, projectId: string) {
    this.require(actor, 'project.read');
    this.require(actor, 'task.create');
    this.require(actor, 'estimate.read');
    await this.project(actor, projectId, [
      'project.read',
      'task.create',
      'estimate.read',
    ]);
    const departments = await this.prisma.department.findMany({
      where: { organizationId: actor.organizationId, status: 'active' },
      orderBy: [{ displayOrder: 'asc' }, { code: 'asc' }],
      select: { id: true, code: true, name: true },
    });
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Galaxy OS';
    const sheet = workbook.addWorksheet('Kế hoạch GĐ 2');
    sheet.addRow([...STAGE_TWO_PLAN_HEADERS]);
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.autoFilter = { from: 'A1', to: 'F1' };
    sheet.columns = [
      { width: 18 },
      { width: 48 },
      { width: 22 },
      { width: 16, style: { numFmt: 'yyyy-mm-dd' } },
      { width: 16, style: { numFmt: 'yyyy-mm-dd' } },
      { width: 22, style: { numFmt: '#,##0.00' } },
    ];
    sheet.getRow(1).font = { bold: true };
    const options = workbook.addWorksheet('Phòng ban');
    options.state = 'veryHidden';
    options.addRow(['Mã phòng ban', 'Tên phòng ban', 'ID']);
    departments.forEach(({ id, code, name }) =>
      options.addRow([code, name, id]),
    );
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  private async lockProject(
    tx: Prisma.TransactionClient,
    actor: CurrentActor,
    projectId: string,
    requiredPermissions?: string | readonly string[],
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

  async savePlan(
    actor: CurrentActor,
    projectId: string,
    input: StageTwoPlanBatchDto,
  ) {
    this.require(actor, 'project.read');
    this.require(actor, 'task.read');
    const rows = input.rows ?? [];
    const removedRows = input.removedRows ?? [];
    const ids = rows.flatMap(({ id }) => (id ? [id] : []));
    const removedIds = removedRows.map(({ id }) => id);
    const codes = rows.map(({ code }) => code);
    if (
      new Set(ids).size !== ids.length ||
      new Set(removedIds).size !== removedIds.length ||
      ids.some((id) => removedIds.includes(id)) ||
      new Set(codes).size !== codes.length
    )
      throw new BadRequestException('Plan batch contains duplicates');
    if (rows.some(({ id, version }) => Boolean(id) !== Boolean(version)))
      throw new BadRequestException('Persisted plan rows require a version');
    if (rows.some(({ startDate, finishDate }) => startDate > finishDate))
      throw new BadRequestException('Finish date must not precede start date');
    const normalized = rows.map((row) => ({
      row,
      startDate: planDate(row.startDate),
      dueDate: planDate(row.finishDate),
      allocatedBudget:
        row.allocatedBudget === undefined
          ? null
          : new Prisma.Decimal(row.allocatedBudget),
    }));
    if (rows.some(({ id }) => !id)) this.require(actor, 'task.create');
    if (ids.length) this.require(actor, 'task.update');
    if (removedIds.length) this.require(actor, 'task.delete');
    const financialWrite = rows.some((row) => own(row, 'allocatedBudget'));
    if (financialWrite) {
      this.require(actor, 'estimate.read');
      this.require(actor, 'estimate.update');
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await this.lockProject(tx, actor, projectId, [
          'project.read',
          'task.read',
          ...(rows.some(({ id }) => !id) ? ['task.create'] : []),
          ...(ids.length ? ['task.update'] : []),
          ...(removedIds.length ? ['task.delete'] : []),
          ...(financialWrite ? ['estimate.read', 'estimate.update'] : []),
        ]);
        const persisted = await tx.task.findMany({
          where: {
            id: { in: [...ids, ...removedIds] },
            organizationId: actor.organizationId,
            projectId,
            relatedEntityType: STAGE_TWO_PLAN_ENTITY,
            baselineVersion: STAGE_TWO_BASELINE_VERSION,
            deletedAt: null,
          },
          select: { id: true, version: true },
        });
        if (persisted.length !== ids.length + removedIds.length)
          throw new ConflictException('Plan changed; reload and try again');
        const versions = new Map(
          persisted.map((item) => [item.id, item.version]),
        );
        if (
          rows.some(({ id, version }) => id && versions.get(id) !== version) ||
          removedRows.some(({ id, version }) => versions.get(id) !== version)
        )
          throw new ConflictException('Plan changed; reload and try again');
        const departmentIds = [
          ...new Set(rows.map(({ departmentId }) => departmentId)),
        ];
        if (
          departmentIds.length &&
          (await tx.department.count({
            where: {
              id: { in: departmentIds },
              organizationId: actor.organizationId,
              status: 'active',
            },
          })) !== departmentIds.length
        )
          throw new BadRequestException('Department is not active');
        if (
          codes.length &&
          (await tx.task.count({
            where: {
              organizationId: actor.organizationId,
              projectId,
              relatedEntityType: STAGE_TWO_PLAN_ENTITY,
              baselineVersion: STAGE_TWO_BASELINE_VERSION,
              deletedAt: null,
              code: { in: codes },
              id: { notIn: [...ids, ...removedIds] },
            },
          }))
        )
          throw new ConflictException('Plan code already exists');

        for (const { id, version } of removedRows) {
          const removed = await tx.task.updateMany({
            where: {
              id,
              organizationId: actor.organizationId,
              projectId,
              relatedEntityType: STAGE_TWO_PLAN_ENTITY,
              baselineVersion: STAGE_TWO_BASELINE_VERSION,
              deletedAt: null,
              version,
            },
            data: {
              deletedAt: new Date(),
              updatedBy: actor.userId,
              version: { increment: 1 },
            },
          });
          if (!removed.count)
            throw new ConflictException('Plan changed; reload and try again');
        }
        for (const item of normalized) {
          const { row, startDate, dueDate, allocatedBudget } = item;
          const data = {
            code: row.code,
            title: row.description,
            description: row.description,
            departmentId: row.departmentId,
            startDate,
            dueDate,
            ...(financialWrite &&
              own(row, 'allocatedBudget') && { allocatedBudget }),
          };
          if (row.id) {
            const updated = await tx.task.updateMany({
              where: {
                id: row.id,
                organizationId: actor.organizationId,
                projectId,
                relatedEntityType: STAGE_TWO_PLAN_ENTITY,
                baselineVersion: STAGE_TWO_BASELINE_VERSION,
                deletedAt: null,
                version: row.version,
              },
              data: {
                ...data,
                updatedBy: actor.userId,
                version: { increment: 1 },
              },
            });
            if (!updated.count)
              throw new ConflictException('Plan changed; reload and try again');
          } else
            await tx.task.create({
              data: {
                organizationId: actor.organizationId,
                projectId,
                relatedEntityType: STAGE_TWO_PLAN_ENTITY,
                relatedEntityId: projectId,
                baselineVersion: STAGE_TWO_BASELINE_VERSION,
                ...data,
                allocatedBudget: financialWrite ? allocatedBudget : null,
                createdBy: actor.userId,
                updatedBy: actor.userId,
              },
            });
        }
        if (!rows.length && !removedRows.length) return;
        const summary = {
          created: rows.filter(({ id }) => !id).length,
          updated: ids.length,
          removed: removedRows.length,
          codes,
        };
        await tx.activity.create({
          data: {
            organizationId: actor.organizationId,
            actorId: actor.userId,
            event: 'PROJECT_STAGE_TWO_PLAN_SAVED',
            entityType: 'Project',
            entityId: projectId,
            metadata: summary,
          },
        });
        await this.audit.write(tx, actor, {
          action: 'PROJECT_STAGE_TWO_PLAN_SAVED',
          entityType: 'Project',
          entityId: projectId,
          afterData: summary,
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException('Plan code already exists');
      throw error;
    }
    return this.get(actor, projectId, 1);
  }

  async completeStepOne(actor: CurrentActor, projectId: string) {
    this.require(actor, 'project.update');
    return this.prisma.$transaction(async (tx) => {
      await this.lockProject(tx, actor, projectId, 'project.update');
      const state = await tx.projectStageState.findUnique({
        where: { projectId_stage: { projectId, stage: 'STAGE_TWO' } },
        select: { status: true },
      });
      if (
        !state ||
        [
          'NOT_INITIALIZED',
          'NOT_APPLICABLE',
          'BYPASSED_WITH_APPROVAL',
          'CANCELLED',
        ].includes(state.status)
      )
        throw new ConflictException('Stage 2 is not active');
      const prior = await tx.activity.findFirst({
        where: {
          organizationId: actor.organizationId,
          entityType: 'Project',
          entityId: projectId,
          event: 'PROJECT_STAGE_TWO_STEP_ONE_COMPLETED',
        },
        select: { id: true },
      });
      const result = {
        completed: true as const,
        step: 1 as const,
        nextStep: 2 as const,
        stageCompleted: false as const,
      };
      if (prior) return result;
      await tx.projectStageStep.upsert({
        where: {
          projectId_stage_step: {
            projectId,
            stage: 'STAGE_TWO',
            step: 'ASSIGNMENT',
          },
        },
        create: {
          projectId,
          stage: 'STAGE_TWO',
          step: 'ASSIGNMENT',
          status: 'DONE',
        },
        update: { status: 'DONE', version: { increment: 1 } },
      });
      await tx.activity.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          event: 'PROJECT_STAGE_TWO_STEP_ONE_COMPLETED',
          entityType: 'Project',
          entityId: projectId,
          metadata: { step: 1, nextStep: 2 },
        },
      });
      await this.audit.write(tx, actor, {
        action: 'PROJECT_STAGE_TWO_STEP_ONE_COMPLETED',
        entityType: 'Project',
        entityId: projectId,
        afterData: result,
      });
      return result;
    });
  }
}
