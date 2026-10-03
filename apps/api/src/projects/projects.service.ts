import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, ProjectPhase, TaskStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { CurrentActor } from '../access-control/current-actor';
import {
  projectPermissionApplies,
  projectWhereForPermissions,
} from '../access-control/business-entity.policy';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma.service';
import { presentPublicActivity } from '../activities/activity.presenter';
import {
  CreateProjectDto,
  DeleteProjectDto,
  UpdateProjectDto,
} from './projects.dto';
import { initializeNewProjectStageOne } from './project-stage-one.service';
import {
  parseVisualProjectStage,
  type VisualProjectStage,
  initialStageStates,
  persistedProjectStage,
  visualProjectStage,
  visualProjectStageKey,
  visualProjectStageWhere,
} from './project-stage';
import {
  isProjectType,
  isStageOneFinancialDocument,
  requiredDocumentCompletionPolicy,
  routeProject,
  visibleStageOneDocumentWhere,
} from './project-stage-one.rules';
const phases: ProjectPhase[] = [
  'SURVEY',
  'REQUIREMENT',
  'DESIGN',
  'PRODUCT_SELECTION',
  'QUOTATION',
  'CONTRACT',
  'PROCUREMENT',
  'PRODUCTION',
  'SHIPPING',
  'INSTALLATION',
  'INSPECTION',
  'HANDOVER',
  'WARRANTY',
  'AFTER_SALES',
];
const overviewStages = [
  {
    stageKey: 'STAGE_1',
    stage: 'STAGE_ONE',
    title: 'GĐ 1 — KHỞI TẠO, HỒ SƠ DỰ ÁN & PHÊ DUYỆT',
    objective:
      'Hoàn thiện thông tin khởi tạo, hồ sơ chủ chốt và quy trình phê duyệt ban đầu.',
  },
  {
    stageKey: 'STAGE_2',
    stage: 'STAGE_TWO',
    title: 'GĐ 2 — THIẾT KẾ, SẢN PHẨM & DỰ TOÁN',
    objective:
      'Quản lý khảo sát, thiết kế, lựa chọn sản phẩm, vật liệu, kích thước, BOQ, dự toán và phê duyệt.',
  },
  {
    stageKey: 'STAGE_3',
    stage: 'STAGE_THREE',
    title: 'GĐ 3 — THƯƠNG MẠI, HỢP ĐỒNG & MUA HÀNG',
    objective:
      'Quản lý báo giá, thương lượng, hợp đồng khách hàng, nhà cung cấp, RFQ, PO, PI và kế hoạch mua hàng.',
  },
  {
    stageKey: 'STAGE_4',
    stage: 'STAGE_FOUR',
    title: 'GĐ 4 — SẢN XUẤT, LOGISTICS, KHO & LẮP ĐẶT',
    objective:
      'Quản lý sản xuất, QC, vận chuyển, hải quan, nhập kho, giao hàng, lắp đặt và tiến độ thực hiện.',
  },
  {
    stageKey: 'STAGE_5',
    stage: 'STAGE_FIVE',
    title: 'GĐ 5 — NGHIỆM THU, BÀN GIAO & BẢO HÀNH',
    objective:
      'Quản lý nghiệm thu, punch list, bàn giao, quyết toán, tài sản khách hàng, bảo hành và hậu mãi.',
  },
] as const;
const stageOneStepDefinitions = [
  ['ASSIGNMENT', 'Tiếp nhận & Phân công'],
  ['SURVEY', 'Khảo sát & Thiết lập bộ máy'],
  ['PROPOSAL', 'Lập & Thẩm định hồ sơ đề xuất'],
  ['FINANCIAL_PLANNING', 'Xác định nguồn vốn & Kế hoạch'],
  ['KICKOFF_APPROVAL', 'Phê duyệt dự án'],
] as const;

function visibleStageStatus(status?: TaskStatus, hasStarted = false) {
  if (status === 'CANCELLED') return 'Tạm dừng';
  if (status === 'BLOCKED') return 'Cần xử lý';
  if (['DONE', 'NOT_APPLICABLE', 'BYPASSED_WITH_APPROVAL'].includes(status!))
    return 'Hoàn thành';
  if (['TODO', 'IN_PROGRESS', 'IN_REVIEW'].includes(status!) || hasStarted)
    return 'Đang thực hiện';
  return 'Chưa bắt đầu';
}

function nextStageAction(status: string) {
  if (status === 'Hoàn thành') return 'Xem kết quả giai đoạn';
  if (status === 'Cần xử lý') return 'Xử lý công việc đang bị chặn';
  if (status === 'Tạm dừng') return 'Xem công việc đã tạm dừng';
  if (status === 'Đang thực hiện') return 'Tiếp tục giai đoạn';
  return 'Bắt đầu giai đoạn';
}
@Injectable()
export class ProjectsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}
  private visibleWhere(
    actor: CurrentActor,
    requiredPermissions: string | readonly string[] = 'project.read',
  ): Prisma.ProjectWhereInput {
    return projectWhereForPermissions(actor, requiredPermissions);
  }
  private include() {
    return {
      customer: { select: { id: true, displayName: true } },
      primaryContact: { select: { id: true, displayName: true } },
      projectManager: { select: { id: true, displayName: true } },
      salesOwner: { select: { id: true, displayName: true } },
      members: {
        include: {
          user: {
            select: { id: true, displayName: true, email: true, status: true },
          },
        },
      },
      departments: {
        include: { department: { select: { id: true, name: true } } },
      },
      opportunity: { select: { id: true, name: true } },
    } as const;
  }
  private financialOmit(actor: CurrentActor) {
    return {
      ...(!actor.permissions.includes('estimate.read') && {
        estimatedValue: true,
      }),
      ...(!actor.permissions.includes('contract.read') && {
        contractedValue: true,
      }),
    } as const;
  }
  private permissionApplies(
    actor: CurrentActor,
    permission: string,
    project: object,
  ) {
    const target = project as {
      projectOwnerId?: string | null;
      projectManagerId?: string | null;
      members?: { userId: string }[];
      departments?: { departmentId: string }[];
    };
    return projectPermissionApplies(actor, permission, {
      projectOwnerId: target.projectOwnerId ?? null,
      projectManagerId: target.projectManagerId ?? null,
      members: target.members ?? [],
      departments: target.departments ?? [],
    });
  }
  private hasUnscopedPermission(actor: CurrentActor, permission: string) {
    if (!actor.permissions.includes(permission)) return false;
    return (
      actor.permissionSources === undefined ||
      actor.permissionSources.some(
        (source) =>
          source.permission === permission &&
          ['SYSTEM', 'ORGANIZATION'].includes(source.scopeType),
      )
    );
  }
  async list(
    actor: CurrentActor,
    q: {
      page: number;
      pageSize: number;
      search?: string;
      customerId?: string;
      phase?: ProjectPhase;
      status?: 'PLANNING' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED';
      health?: 'ON_TRACK' | 'AT_RISK' | 'OFF_TRACK';
      projectManagerId?: string;
      departmentId?: string;
      from?: Date;
      to?: Date;
      sort?:
        | 'code'
        | 'name'
        | 'updatedAt'
        | 'expectedCompletionDate'
        | 'estimatedValue';
      direction?: 'asc' | 'desc';
      currentStage?: VisualProjectStage;
      mine?: boolean;
      active?: boolean;
      commitment?: 'POTENTIAL' | 'SIGNED';
    },
  ) {
    if (q.commitment && !actor.permissions.includes('contract.read'))
      throw new ForbiddenException('Contract permission required');
    if (
      q.sort === 'estimatedValue' &&
      !this.hasUnscopedPermission(actor, 'estimate.read')
    )
      throw new ForbiddenException('Estimate permission required');
    const where: Prisma.ProjectWhereInput = {
      AND: [
        this.visibleWhere(actor),
        q.active ? { status: { in: ['PLANNING', 'ACTIVE'] } } : {},
        q.commitment
          ? this.visibleWhere(actor, ['project.read', 'contract.read'])
          : {},
        q.commitment
          ? {
              contracts: {
                [q.commitment === 'SIGNED' ? 'some' : 'none']: {
                  status: {
                    in: ['SIGNED', 'ACTIVE', 'SUSPENDED', 'COMPLETED'],
                  },
                },
              },
            }
          : {},
        q.mine
          ? {
              OR: [
                { projectOwnerId: actor.userId },
                { projectManagerId: actor.userId },
                { members: { some: { userId: actor.userId } } },
              ],
            }
          : {},
        q.currentStage ? visualProjectStageWhere(q.currentStage) : {},
        q.search
          ? {
              OR: [
                { code: { contains: q.search, mode: 'insensitive' } },
                { name: { contains: q.search, mode: 'insensitive' } },
                {
                  customer: {
                    displayName: { contains: q.search, mode: 'insensitive' },
                  },
                },
              ],
            }
          : {},
      ],
      customerId: q.customerId,
      phase: q.phase,
      status: q.status,
      healthStatus: q.health,
      projectManagerId: q.projectManagerId,
      departments: q.departmentId
        ? { some: { departmentId: q.departmentId } }
        : undefined,
      expectedCompletionDate:
        q.from || q.to ? { gte: q.from, lte: q.to } : undefined,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.project.findMany({
        where,
        include: {
          ...this.include(),
          stageStates: { select: { stage: true, status: true } },
          contracts: actor.permissions.includes('contract.read')
            ? { select: { status: true } }
            : false,
        },
        omit: this.financialOmit(actor),
        orderBy: [
          {
            [q.sort ?? 'updatedAt']: q.direction ?? 'desc',
          },
          { id: 'asc' },
        ],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.project.count({ where }),
    ]);
    return {
      items: items.map(({ stageStates, contracts, ...item }) => ({
        ...this.redactFinancials(actor, item),
        ...(this.permissionApplies(actor, 'contract.read', item) && {
          commitment: (contracts ?? []).some((contract) =>
            ['SIGNED', 'ACTIVE', 'SUSPENDED', 'COMPLETED'].includes(
              contract.status,
            ),
          )
            ? 'SIGNED'
            : 'POTENTIAL',
        }),
        canDeleteProject: this.permissionApplies(actor, 'project.delete', item),
        currentStage: visualProjectStage(
          item.phase,
          stageStates,
          item.entryStage,
        ),
        stages: stageStates.flatMap(({ stage, status }) => {
          const stageKey = visualProjectStageKey(stage);
          return stageKey ? [{ stageKey, status }] : [];
        }),
      })),
      page: q.page,
      pageSize: q.pageSize,
      total,
      totalPages: Math.ceil(total / q.pageSize),
    };
  }
  async dashboard(actor: CurrentActor, now = new Date()) {
    const where = this.visibleWhere(actor);
    const scopedProjectIds = (permission: string) =>
      this.prisma.project
        .findMany({
          where: this.visibleWhere(actor, ['project.read', permission]),
          select: { id: true },
        })
        .then((projects) => projects.map(({ id }) => id));
    const estimatedValues = actor.permissions.includes('estimate.read')
      ? this.prisma.project.groupBy({
          by: ['currency'],
          where: this.visibleWhere(actor, ['project.read', 'estimate.read']),
          _sum: { estimatedValue: true },
        })
      : Promise.resolve(undefined);
    const contractProjectIds = actor.permissions.includes('contract.read')
      ? scopedProjectIds('contract.read')
      : undefined;
    const receivableProjectIds = actor.permissions.includes('receivable.read')
      ? scopedProjectIds('receivable.read')
      : undefined;
    const payableProjectIds = actor.permissions.includes(
      'supplier_payable.read',
    )
      ? scopedProjectIds('supplier_payable.read')
      : undefined;
    const approvalProjectIds = actor.permissions.includes(
      'project.stage1.review',
    )
      ? scopedProjectIds('project.stage1.review')
      : undefined;
    const warrantyProjectIds = actor.permissions.includes('warranty.read')
      ? scopedProjectIds('warranty.read')
      : undefined;
    const ticketProjectIds = actor.permissions.includes('service_ticket.read')
      ? scopedProjectIds('service_ticket.read')
      : undefined;
    const contractValues = actor.permissions.includes('contract.read')
      ? contractProjectIds!.then((ids) =>
          this.prisma.contract.groupBy({
            by: ['currency'],
            where: {
              organizationId: actor.organizationId,
              projectId: { in: ids },
              status: { in: ['SIGNED', 'ACTIVE', 'SUSPENDED', 'COMPLETED'] },
            },
            _sum: { currentValue: true },
          }),
        )
      : undefined;
    const receivedValues = actor.permissions.includes('receivable.read')
      ? receivableProjectIds!.then((ids) =>
          this.prisma.customerPayment.groupBy({
            by: ['currency'],
            where: {
              organizationId: actor.organizationId,
              projectId: { in: ids },
            },
            _sum: { amount: true },
          }),
        )
      : undefined;
    const receivableValues = actor.permissions.includes('receivable.read')
      ? receivableProjectIds!.then((ids) =>
          this.prisma.customerPaymentSchedule.groupBy({
            by: ['currency'],
            where: {
              organizationId: actor.organizationId,
              projectId: { in: ids },
            },
            _sum: { outstandingAmount: true },
          }),
        )
      : undefined;
    const payableValues = actor.permissions.includes('supplier_payable.read')
      ? payableProjectIds!.then((ids) =>
          this.prisma.supplierPayable.groupBy({
            by: ['currency'],
            where: {
              organizationId: actor.organizationId,
              projectId: { in: ids },
            },
            _sum: { outstandingAmount: true },
          }),
        )
      : undefined;
    const pendingApprovals = actor.permissions.includes('project.stage1.review')
      ? approvalProjectIds!.then((ids) =>
          this.prisma.projectStageApproval.count({
            where: {
              projectId: { in: ids },
              stage: 'STAGE_ONE',
              status: 'PENDING',
              reviewedBy: actor.userId,
            },
          }),
        )
      : undefined;
    const dueWarrantyAssets = actor.permissions.includes('warranty.read')
      ? warrantyProjectIds!.then((ids) =>
          this.prisma.warrantyAsset.count({
            where: {
              organizationId: actor.organizationId,
              projectId: { in: ids },
              status: { in: ['ACTIVE', 'EXPIRING'] },
              warrantyEnd: {
                lte: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
              },
            },
          }),
        )
      : undefined;
    const dueServiceTickets = actor.permissions.includes('service_ticket.read')
      ? ticketProjectIds!.then((ids) =>
          this.prisma.serviceTicket.count({
            where: {
              organizationId: actor.organizationId,
              projectId: { in: ids },
              status: { notIn: ['CLOSED', 'CANCELLED'] },
              slaDueAt: {
                lte: new Date(now.getTime() + 24 * 60 * 60 * 1000),
              },
            },
          }),
        )
      : undefined;
    const [
      total,
      active,
      needsAttention,
      completed,
      byCurrency,
      contracts,
      received,
      receivables,
      payables,
      approvals,
      warranties,
      tickets,
    ] = await Promise.all([
      this.prisma.project.count({ where }),
      this.prisma.project.count({
        where: { AND: [where, { status: 'ACTIVE' }] },
      }),
      this.prisma.project.count({
        where: {
          AND: [
            where,
            {
              status: { notIn: ['COMPLETED', 'CANCELLED'] },
            },
            {
              OR: [
                { healthStatus: { in: ['AT_RISK', 'OFF_TRACK'] } },
                { status: 'ON_HOLD' },
                { expectedCompletionDate: { lt: now } },
              ],
            },
          ],
        },
      }),
      this.prisma.project.count({
        where: { AND: [where, { status: 'COMPLETED' }] },
      }),
      estimatedValues,
      contractValues,
      receivedValues,
      receivableValues,
      payableValues,
      pendingApprovals,
      dueWarrantyAssets,
      dueServiceTickets,
    ]);
    const portfolio = {
      total,
      active,
      needsAttention,
      completed,
      permittedCommands: {
        create: actor.permissions.includes('project.create'),
      },
    };
    if (
      !byCurrency &&
      !contracts &&
      !received &&
      !receivables &&
      !payables &&
      approvals === undefined &&
      warranties === undefined &&
      tickets === undefined
    )
      return portfolio;
    return {
      ...portfolio,
      ...(byCurrency && {
        estimatedValues: byCurrency.flatMap(({ currency, _sum }) =>
          _sum.estimatedValue
            ? [{ currency, value: _sum.estimatedValue.toString() }]
            : [],
        ),
      }),
      ...(contracts && {
        contractValues: contracts.flatMap(({ currency, _sum }) =>
          _sum.currentValue
            ? [{ currency, value: _sum.currentValue.toString() }]
            : [],
        ),
      }),
      ...(received && {
        receivedValues: received.flatMap(({ currency, _sum }) =>
          _sum.amount ? [{ currency, value: _sum.amount.toString() }] : [],
        ),
      }),
      ...(receivables && {
        receivableValues: receivables.flatMap(({ currency, _sum }) =>
          _sum.outstandingAmount
            ? [{ currency, value: _sum.outstandingAmount.toString() }]
            : [],
        ),
      }),
      ...(payables && {
        payableValues: payables.flatMap(({ currency, _sum }) =>
          _sum.outstandingAmount
            ? [{ currency, value: _sum.outstandingAmount.toString() }]
            : [],
        ),
      }),
      ...(approvals !== undefined && { pendingApprovals: approvals }),
      ...(warranties !== undefined && { dueWarrantyAssets: warranties }),
      ...(tickets !== undefined && { dueServiceTickets: tickets }),
    };
  }
  async get(actor: CurrentActor, id: string) {
    const item = await this.prisma.project.findFirst({
      where: { ...this.visibleWhere(actor), id },
      include: this.include(),
      omit: this.financialOmit(actor),
    });
    if (!item) throw new NotFoundException('Project not found');
    return this.redactFinancials(actor, item);
  }

  private async lockProjectFor(
    tx: Pick<Prisma.TransactionClient, 'project' | '$queryRaw'>,
    actor: CurrentActor,
    id: string,
    requiredPermissions: string | readonly string[],
  ) {
    await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "Project"
      WHERE "id" = ${id}::uuid
        AND "organizationId" = ${actor.organizationId}::uuid
        AND "deletedAt" IS NULL
      FOR UPDATE
    `;
    const project = await tx.project.findFirst({
      where: { ...this.visibleWhere(actor, requiredPermissions), id },
      select: { id: true, phase: true },
    });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  private parsedStage(stageKey: string) {
    const stage = parseVisualProjectStage(stageKey);
    if (!stage) throw new BadRequestException('Invalid Project stage');
    return { stageKey: stage, stage: persistedProjectStage(stage) };
  }

  private readableStageStatus(status: string) {
    return status === 'TODO' ? 'IN_PROGRESS' : status;
  }

  private stageApplicable(
    projectType: string | null,
    stageKey: VisualProjectStage,
  ) {
    const type = projectType ?? undefined;
    return (
      isProjectType(type) &&
      routeProject({ projectType: type }).applicableStages.includes(stageKey)
    );
  }

  private async stageProject(
    client: Pick<Prisma.TransactionClient, 'project'>,
    actor: CurrentActor,
    id: string,
    stageKey: VisualProjectStage,
    requiredPermissions: string | readonly string[] = 'project.read',
  ) {
    const project = await client.project.findFirst({
      where: { ...this.visibleWhere(actor, requiredPermissions), id },
      select: {
        id: true,
        code: true,
        name: true,
        customer: { select: { id: true, displayName: true } },
        location: true,
        projectType: true,
        projectOwnerId: true,
        salesOwnerId: true,
        projectManagerId: true,
        projectOwner: { select: { id: true, displayName: true } },
        salesOwner: { select: { id: true, displayName: true } },
        projectManager: { select: { id: true, displayName: true } },
        entryStage: true,
        phase: true,
        status: true,
        healthStatus: true,
        expectedCompletionDate: true,
        members: { select: { userId: true } },
        departments: { select: { departmentId: true } },
        stageStates: {
          select: {
            id: true,
            stage: true,
            status: true,
            decisionReason: true,
            decisionBy: true,
            decisionAt: true,
            decisionApprovalId: true,
            version: true,
          },
        },
        requiredDocuments: {
          where: {
            stageKey,
            supersededAt: null,
            ...visibleStageOneDocumentWhere(
              actor.permissions.includes('project.stage1.finance.read'),
            ),
          },
          select: {
            id: true,
            stageKey: true,
            workstreamKey: true,
            documentType: true,
            documentName: true,
            required: true,
            status: true,
            ownerUserId: true,
            dueDate: true,
            currentVersion: true,
          },
        },
      },
    });
    if (!project) throw new NotFoundException('Project not found');
    const documents = project.requiredDocuments ?? [];
    return {
      ...project,
      requiredDocuments: this.permissionApplies(
        actor,
        'project.stage1.finance.read',
        project,
      )
        ? documents
        : documents.filter(
            (document) => !isStageOneFinancialDocument(document),
          ),
    };
  }

  async stage(actor: CurrentActor, id: string, rawStageKey: string) {
    const { stageKey, stage } = this.parsedStage(rawStageKey);
    const [project, projects] = await Promise.all([
      this.stageProject(this.prisma, actor, id, stageKey),
      this.prisma.project.findMany({
        where: this.visibleWhere(actor),
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        select: { id: true, code: true, name: true },
      }),
    ]);
    const state = project.stageStates.find((item) => item.stage === stage) ?? {
      id: null,
      stage,
      status: 'NOT_INITIALIZED' as const,
      decisionReason: null,
      decisionBy: null,
      decisionAt: null,
      decisionApprovalId: null,
      version: 0,
    };
    const stateStatus = this.readableStageStatus(state.status);
    const can = (permission: string) =>
      this.permissionApplies(actor, permission, project);
    const applicable = this.stageApplicable(project.projectType, stageKey);
    const readOnly =
      ['NOT_APPLICABLE', 'BYPASSED_WITH_APPROVAL'].includes(stateStatus) ||
      !applicable;
    return {
      project: {
        id: project.id,
        code: project.code,
        name: project.name,
        customer: project.customer,
        location: project.location,
        projectType: project.projectType,
        projectOwner: project.projectOwner,
        salesOwner: project.salesOwner,
        projectManager: project.projectManager,
        entryStage: visualProjectStageKey(project.entryStage),
        currentStage: visualProjectStage(
          project.phase,
          project.stageStates,
          project.entryStage,
        ),
        status: project.status,
        healthStatus: project.healthStatus,
        expectedCompletionDate: project.expectedCompletionDate,
      },
      state: {
        stageKey,
        status: stateStatus,
        readOnly,
        decisionReason: state.decisionReason,
        decisionBy: state.decisionBy,
        decisionAt: state.decisionAt,
        decisionApprovalId: state.decisionApprovalId,
      },
      templateApplicability: {
        projectType: project.projectType,
        applicable,
      },
      requiredDocuments: (project.requiredDocuments ?? []).map((document) => {
        const { currentFileAssetId: _hidden, ...visible } =
          document as typeof document & {
            currentFileAssetId?: string | null;
          };
        void _hidden;
        return {
          ...visible,
          completionPolicy: requiredDocumentCompletionPolicy(
            document.documentType,
          ),
        };
      }),
      options: { projects },
      capabilities: {
        canSwitchProject: can('project.read'),
        canManageProjectAccess: can('project.manage_members'),
      },
      permittedCommands: {
        initialize:
          can('project.update') &&
          applicable &&
          stateStatus === 'NOT_INITIALIZED',
        decide: can('project.stage.bypass') && stateStatus !== 'DONE',
      },
    };
  }

  async initializeStage(actor: CurrentActor, id: string, rawStageKey: string) {
    if (!actor.permissions.includes('project.update'))
      throw new ForbiddenException('Insufficient permission');
    const { stageKey, stage } = this.parsedStage(rawStageKey);
    return this.prisma.$transaction(async (tx) => {
      const project = await this.stageProject(tx, actor, id, stageKey, [
        'project.read',
        'project.update',
      ]);
      const state = project.stageStates.find((item) => item.stage === stage);
      if (!this.stageApplicable(project.projectType, stageKey))
        throw new UnprocessableEntityException({
          message: 'Project stage is not applicable to this Project type',
          code: 'STAGE_NOT_APPLICABLE',
          blockers: [
            {
              code: 'STAGE_NOT_APPLICABLE',
              stageKey,
              projectType: project.projectType,
            },
          ],
        });
      if (
        state &&
        ['DONE', 'NOT_APPLICABLE', 'BYPASSED_WITH_APPROVAL'].includes(
          state.status,
        )
      )
        return {
          initialized: false,
          stageKey,
          status: state.status,
          requirements: project.requiredDocuments ?? [],
        };
      const assignedOwners = [
        ['PROJECT_OWNER', project.projectOwnerId],
        ['SALES_OWNER', project.salesOwnerId],
        ['PROJECT_MANAGER', project.projectManagerId],
      ].filter((owner): owner is [string, string] => Boolean(owner[1]));
      if (assignedOwners.length) {
        const activeOwnerIds = new Set(
          (
            await tx.user.findMany({
              where: {
                id: { in: assignedOwners.map(([, userId]) => userId) },
                status: 'active',
                organizationMembers: {
                  some: {
                    organizationId: actor.organizationId,
                    status: 'active',
                  },
                },
              },
              select: { id: true },
            })
          ).map(({ id: userId }) => userId),
        );
        const blockers = assignedOwners.flatMap(([role, userId]) =>
          activeOwnerIds.has(userId)
            ? []
            : [{ code: 'INACTIVE_PROJECT_OWNER', role, userId }],
        );
        if (blockers.length)
          throw new UnprocessableEntityException({
            message: 'Configured Project owner is not active',
            code: 'INACTIVE_PROJECT_OWNER',
            blockers,
          });
      }
      let initialized = false;
      if (!state) {
        const created = await tx.projectStageState.createMany({
          data: [{ projectId: id, stage, status: 'IN_PROGRESS' }],
          skipDuplicates: true,
        });
        initialized = Boolean(created.count);
        if (!initialized) {
          const concurrent = await tx.projectStageState.findUnique({
            where: { projectId_stage: { projectId: id, stage } },
            select: { id: true, status: true, version: true },
          });
          if (!concurrent || concurrent.status !== 'NOT_INITIALIZED')
            return {
              initialized: false,
              stageKey,
              status: this.readableStageStatus(
                concurrent?.status ?? 'NOT_INITIALIZED',
              ),
              requirements: project.requiredDocuments ?? [],
            };
          initialized = Boolean(
            (
              await tx.projectStageState.updateMany({
                where: {
                  id: concurrent.id,
                  status: 'NOT_INITIALIZED',
                  version: concurrent.version,
                },
                data: { status: 'IN_PROGRESS', version: { increment: 1 } },
              })
            ).count,
          );
        }
      } else if (state.status !== 'NOT_INITIALIZED')
        return {
          initialized: false,
          stageKey,
          status: this.readableStageStatus(state.status),
          requirements: project.requiredDocuments ?? [],
        };
      else
        initialized = Boolean(
          (
            await tx.projectStageState.updateMany({
              where: {
                id: state.id,
                status: 'NOT_INITIALIZED',
                version: state.version,
              },
              data: { status: 'IN_PROGRESS', version: { increment: 1 } },
            })
          ).count,
        );
      if (!initialized) {
        const winner = await tx.projectStageState.findUnique({
          where: { projectId_stage: { projectId: id, stage } },
          select: { status: true },
        });
        if (!winner || winner.status === 'NOT_INITIALIZED')
          throw new ConflictException('Project stage changed');
        return {
          initialized: false,
          stageKey,
          status: this.readableStageStatus(winner.status),
          requirements: project.requiredDocuments ?? [],
        };
      }
      await tx.activity.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          event: 'PROJECT_STAGE_INITIALIZED',
          entityType: 'Project',
          entityId: id,
          metadata: { stageKey },
        },
      });
      return {
        initialized,
        stageKey,
        status: 'IN_PROGRESS' as const,
        requirements: project.requiredDocuments ?? [],
      };
    });
  }

  async decideStage(
    actor: CurrentActor,
    id: string,
    rawStageKey: string,
    data: {
      decision: 'NOT_APPLICABLE' | 'BYPASSED_WITH_APPROVAL';
      reason: string;
      approvalId?: string;
    },
  ) {
    if (!actor.permissions.includes('project.stage.bypass'))
      throw new ForbiddenException('Insufficient permission');
    const reason = data.reason.trim();
    if (!reason) throw new BadRequestException('Decision reason is required');
    const { stageKey, stage } = this.parsedStage(rawStageKey);
    return this.prisma.$transaction(async (tx) => {
      const project = await this.stageProject(tx, actor, id, stageKey, [
        'project.read',
        'project.stage.bypass',
      ]);
      if (data.approvalId) {
        const approval = await tx.projectStageApproval.findFirst({
          where: {
            id: data.approvalId,
            projectId: id,
            stage,
            status: 'APPROVED',
          },
          select: { id: true },
        });
        if (!approval) throw new NotFoundException('Approval not found');
      }
      const decidedAt = new Date();
      const approvalId = data.approvalId ?? null;
      const decisionData = {
        status: data.decision,
        decisionReason: reason,
        decisionBy: actor.userId,
        decisionAt: decidedAt,
        decisionApprovalId: approvalId,
      } as const;
      const sameDecision = (state: {
        status: string;
        decisionReason?: string | null;
        decisionApprovalId?: string | null;
      }) =>
        state.status === data.decision &&
        state.decisionReason === reason &&
        state.decisionApprovalId === approvalId;
      let state = project.stageStates.find((item) => item.stage === stage);
      let written = false;
      let createConflict = false;
      if (!state) {
        written = Boolean(
          (
            await tx.projectStageState.createMany({
              data: [{ projectId: id, stage, ...decisionData }],
              skipDuplicates: true,
            })
          ).count,
        );
        if (!written) {
          createConflict = true;
          state =
            (await tx.projectStageState.findUnique({
              where: { projectId_stage: { projectId: id, stage } },
              select: {
                id: true,
                stage: true,
                status: true,
                decisionReason: true,
                decisionBy: true,
                decisionAt: true,
                decisionApprovalId: true,
                version: true,
              },
            })) ?? undefined;
        }
      }
      if (!written) {
        if (!state) throw new ConflictException('Project stage changed');
        if (sameDecision(state))
          return { status: state.status, reason, unchanged: true };
        if (createConflict)
          throw new ConflictException('Project stage decision conflict');
        const updated = await tx.projectStageState.updateMany({
          where: {
            id: state.id,
            version: state.version,
            status: { not: 'DONE' },
          },
          data: {
            ...decisionData,
            version: { increment: 1 },
          },
        });
        written = Boolean(updated.count);
      }
      if (!written) {
        const winner = await tx.projectStageState.findUnique({
          where: { projectId_stage: { projectId: id, stage } },
          select: {
            status: true,
            decisionReason: true,
            decisionBy: true,
            decisionAt: true,
            decisionApprovalId: true,
          },
        });
        if (winner && sameDecision(winner))
          return { status: winner.status, reason, unchanged: true };
        throw new ConflictException('Project stage changed');
      }
      await tx.activity.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          event: 'PROJECT_STAGE_APPLICABILITY_DECIDED',
          entityType: 'Project',
          entityId: id,
          metadata: { stageKey, decision: data.decision, reason },
        },
      });
      return {
        status: data.decision,
        reason,
        decidedBy: actor.userId,
        decidedAt,
        approvalId,
      };
    });
  }
  private redactFinancials<T extends object>(actor: CurrentActor, item: T) {
    const financials = item as T & {
      estimatedValue?: unknown;
      contractedValue?: unknown;
    };
    const { estimatedValue, contractedValue, ...rest } = financials;
    return {
      ...rest,
      ...(this.permissionApplies(actor, 'estimate.read', financials) &&
      'estimatedValue' in financials
        ? { estimatedValue }
        : {}),
      ...(this.permissionApplies(actor, 'contract.read', financials) &&
      'contractedValue' in financials
        ? { contractedValue }
        : {}),
    };
  }
  async timeline(actor: CurrentActor, id: string) {
    await this.get(actor, id);
    return (
      await this.prisma.activity.findMany({
        where: {
          organizationId: actor.organizationId,
          entityType: 'Project',
          entityId: id,
        },
        include: { actor: { select: { id: true, displayName: true } } },
        orderBy: { createdAt: 'desc' },
      })
    ).map(presentPublicActivity);
  }
  async operationsSummary(actor: CurrentActor, id: string) {
    await this.get(actor, id);
    const scope = { organizationId: actor.organizationId, projectId: id };
    const [
      inventory,
      workOrders,
      openPunchItems,
      criticalPunchItems,
      inspection,
      acceptance,
      handover,
      warrantyAssets,
      expiringWarrantyAssets,
      openServiceTickets,
      slaRiskTickets,
      openWarrantyClaims,
      activeWarrantyReplacements,
    ] = await Promise.all([
      this.prisma.inventoryTransactionLine.aggregate({
        where: { transaction: scope },
        _sum: {
          onHandDelta: true,
          availableDelta: true,
          reservedDelta: true,
          qualityHoldDelta: true,
          issuedDelta: true,
          installedDelta: true,
        },
      }),
      this.prisma.installationWorkOrder.groupBy({
        by: ['status'],
        where: scope,
        _count: true,
        orderBy: { status: 'asc' },
      }),
      this.prisma.punchItem.count({
        where: { ...scope, status: { notIn: ['RESOLVED', 'CLOSED'] } },
      }),
      this.prisma.punchItem.count({
        where: {
          ...scope,
          severity: 'CRITICAL',
          status: { notIn: ['RESOLVED', 'CLOSED'] },
        },
      }),
      this.prisma.inspection.findFirst({
        where: scope,
        select: { status: true },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.acceptanceRecord.findFirst({
        where: scope,
        select: { status: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.handover.findFirst({
        where: scope,
        select: {
          status: true,
          _count: {
            select: {
              checklist: { where: { required: true, completedAt: null } },
              documents: true,
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.warrantyAsset.count({ where: scope }),
      this.prisma.warrantyAsset.count({
        where: {
          ...scope,
          status: { in: ['ACTIVE', 'EXPIRING'] },
          warrantyEnd: {
            lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        },
      }),
      this.prisma.serviceTicket.count({
        where: { ...scope, status: { notIn: ['CLOSED', 'CANCELLED'] } },
      }),
      this.prisma.serviceTicket.count({
        where: {
          ...scope,
          status: { notIn: ['CLOSED', 'CANCELLED'] },
          slaDueAt: {
            lte: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        },
      }),
      this.prisma.warrantyClaim.count({
        where: {
          ...scope,
          status: { notIn: ['RESOLVED', 'CLOSED', 'REJECTED', 'CANCELLED'] },
        },
      }),
      this.prisma.warrantyReplacement.count({
        where: {
          ...scope,
          status: { notIn: ['COMPLETED', 'REJECTED', 'CANCELLED'] },
        },
      }),
    ]);
    return {
      inventory: inventory._sum,
      installationWorkOrders: workOrders,
      openPunchItems,
      criticalPunchItems,
      inspectionStatus: inspection?.status ?? null,
      acceptanceStatus: acceptance?.status ?? null,
      handover: handover
        ? {
            status: handover.status,
            incompleteRequiredChecklist: handover._count.checklist,
            documentCount: handover._count.documents,
          }
        : null,
      warrantyAssets,
      expiringWarrantyAssets,
      openServiceTickets,
      slaRiskTickets,
      openWarrantyClaims,
      activeWarrantyReplacements,
    };
  }
  async workspaceSummary(actor: CurrentActor, id: string) {
    const project = await this.get(actor, id);
    const [stageOneSteps, stageStates] = await Promise.all([
      this.prisma.projectStageStep.findMany({
        where: { projectId: id, stage: 'STAGE_ONE' },
        select: { step: true, status: true, updatedAt: true },
      }),
      this.prisma.projectStageState.findMany({
        where: { projectId: id },
        select: {
          stage: true,
          status: true,
          completedAt: true,
          updatedAt: true,
        },
      }),
    ]);
    const stageOneCompleted = stageOneSteps.filter(
      ({ status }) => status === 'DONE',
    ).length;
    const stageOneHasStarted = stageOneSteps.some(({ status }) =>
      ['DONE', 'IN_PROGRESS', 'IN_REVIEW'].includes(status),
    );
    const firstIncompleteStep = stageOneStepDefinitions
      .map(([step, label]) => ({
        label,
        status: stageOneSteps.find((item) => item.step === step)?.status,
      }))
      .find(({ status }) => status !== 'DONE');
    const stages = overviewStages.map((definition, index) => {
      const state = stageStates.find(({ stage }) => stage === definition.stage);
      const stageOneBlocked =
        index === 0 && stageOneSteps.some(({ status }) => status === 'BLOCKED');
      const persistedStateIsTerminal =
        state &&
        [
          'DONE',
          'NOT_APPLICABLE',
          'BYPASSED_WITH_APPROVAL',
          'BLOCKED',
          'CANCELLED',
        ].includes(state.status);
      const sourceStatus =
        index === 0 && !persistedStateIsTerminal
          ? stageOneBlocked
            ? 'BLOCKED'
            : stageOneCompleted === 5
              ? 'DONE'
              : state?.status
          : state?.status;
      const status = visibleStageStatus(
        sourceStatus,
        index === 0 && stageOneHasStarted,
      );
      const stepUpdatedAt =
        index === 0
          ? stageOneSteps.reduce<Date | null>(
              (latest, step) =>
                !latest || step.updatedAt > latest ? step.updatedAt : latest,
              null,
            )
          : null;
      const stateUpdatedAt = state
        ? !state.completedAt || state.updatedAt > state.completedAt
          ? state.updatedAt
          : state.completedAt
        : null;
      const updatedAt =
        stepUpdatedAt && (!stateUpdatedAt || stepUpdatedAt > stateUpdatedAt)
          ? stepUpdatedAt
          : stateUpdatedAt;
      return {
        stageKey: definition.stageKey,
        title: definition.title,
        objective: definition.objective,
        status,
        completedSteps: index === 0 ? stageOneCompleted : null,
        totalSteps: index === 0 ? 5 : null,
        progressPercent:
          index === 0 ? Math.round((stageOneCompleted / 5) * 100) : null,
        updatedAt,
        nextAction:
          index === 0 &&
          firstIncompleteStep &&
          ['Chưa bắt đầu', 'Đang thực hiện'].includes(status)
            ? `${status === 'Chưa bắt đầu' ? 'Bắt đầu' : 'Tiếp tục'} ${firstIncompleteStep.label}`
            : nextStageAction(status),
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
        salesOwner: project.salesOwner,
        projectManager: project.projectManager,
        entryStage: project.entryStage,
        currentStage: visualProjectStage(
          project.phase,
          stageStates,
          project.entryStage,
        ),
        status: project.status,
        healthStatus: project.healthStatus,
        expectedCompletionDate: project.expectedCompletionDate,
      },
      stages,
    };
  }
  async create(actor: CurrentActor, data: CreateProjectDto) {
    if (!actor.permissions.includes('estimate.create'))
      throw new ForbiddenException('Financial field permission required');
    const command = {
      ...data,
      name: data.name.trim(),
      idempotencyKey: data.idempotencyKey.trim(),
      estimatedInvestmentAmount: new Prisma.Decimal(
        data.estimatedInvestmentAmount,
      ).toFixed(2),
      customerId: data.customerId.toLowerCase(),
      primaryContactId: data.primaryContactId?.toLowerCase() ?? null,
    };
    const response = (project: { id: string; code: string }) => ({
      id: project.id,
      code: project.code,
      stageOneUrl: `/projects/${project.id}/stage-1?step=1`,
    });
    const existing = await this.findCreatedProject(
      actor,
      command.idempotencyKey,
    );
    if (existing) {
      this.assertSameCreateCommand(existing, command);
      return response(existing);
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const concurrent = await this.findCreatedProject(
          actor,
          command.idempotencyKey,
          tx,
        );
        if (concurrent) {
          this.assertSameCreateCommand(concurrent, command);
          return response(concurrent);
        }
        await this.references(
          actor,
          {
            customerId: command.customerId,
            primaryContactId: command.primaryContactId ?? undefined,
          },
          tx,
        );
        const id = randomUUID();
        const project = await tx.project.create({
          data: {
            id,
            code: `PRJ-${id.replaceAll('-', '').toUpperCase()}`,
            name: command.name,
            customerId: command.customerId,
            primaryContactId: command.primaryContactId,
            estimatedValue: new Prisma.Decimal(
              command.estimatedInvestmentAmount,
            ),
            currency: 'VND',
            entryStage: 'STAGE_ONE',
            creationIdempotencyKey: command.idempotencyKey,
            organizationId: actor.organizationId,
            createdBy: actor.userId,
            updatedBy: actor.userId,
          },
        });
        await tx.projectMember.create({
          data: {
            organizationId: actor.organizationId,
            projectId: project.id,
            userId: actor.userId,
            role: 'OWNER',
            createdBy: actor.userId,
          },
        });
        await tx.projectStageState.createMany({
          data: initialStageStates('STAGE_1').map((state) => ({
            ...state,
            projectId: project.id,
          })),
        });
        await initializeNewProjectStageOne(
          tx,
          actor,
          project.id,
          command.fundingSource,
        );
        await tx.activity.create({
          data: {
            organizationId: actor.organizationId,
            actorId: actor.userId,
            event: 'PROJECT_CREATED',
            entityType: 'Project',
            entityId: project.id,
          },
        });
        await this.audit.write(tx, actor, {
          action: 'PROJECT_CREATED',
          entityType: 'Project',
          entityId: project.id,
          afterData: {
            id: project.id,
            code: project.code,
            name: command.name,
            estimatedInvestmentAmount: command.estimatedInvestmentAmount,
            currency: 'VND',
            fundingSource: command.fundingSource,
            customerId: command.customerId,
            primaryContactId: command.primaryContactId,
          },
          metadata: { idempotencyKey: command.idempotencyKey },
        });
        return response(project);
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const winner = await this.findCreatedProject(
          actor,
          command.idempotencyKey,
        );
        if (winner) {
          this.assertSameCreateCommand(winner, command);
          return response(winner);
        }
        throw new ConflictException('Project code already exists');
      }
      throw error;
    }
  }
  async update(actor: CurrentActor, id: string, data: UpdateProjectDto) {
    this.assertFinancialWrite(actor, data, 'update');
    const requiredPermissions = [
      'project.update',
      ...(data.estimatedValue !== undefined ? ['estimate.update'] : []),
      ...(data.contractedValue !== undefined ? ['contract.update'] : []),
    ];
    return this.prisma.$transaction(async (tx) => {
      await this.lockProjectFor(tx, actor, id, requiredPermissions);
      await this.references(actor, data, tx);
      const project = await tx.project.update({
        where: { id },
        data: {
          ...this.dates(data),
          updatedBy: actor.userId,
          version: { increment: 1 },
        },
        include: this.include(),
        omit: this.financialOmit(actor),
      });
      return this.redactFinancials(actor, project);
    });
  }
  async remove(actor: CurrentActor, id: string, input: DeleteProjectDto) {
    if (!actor.permissions.includes('project.delete'))
      throw new ForbiddenException('Insufficient permission');
    const reason = input.reason?.trim();
    const code = input.code?.trim();
    if (!reason || reason.length > 1000 || !code)
      throw new BadRequestException('Mã dự án và lý do xóa là bắt buộc.');
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT "id" FROM "Project"
        WHERE "id" = ${id}::uuid
          AND "organizationId" = ${actor.organizationId}::uuid
        FOR UPDATE
      `);
      if (!locked.length) throw new NotFoundException('Project not found');
      const project = await tx.project.findFirst({
        where: { id, organizationId: actor.organizationId },
        include: {
          members: { select: { userId: true } },
          departments: { select: { departmentId: true } },
        },
      });
      if (!project || !this.permissionApplies(actor, 'project.delete', project))
        throw new NotFoundException('Project not found');
      if (project.code !== code)
        throw new BadRequestException('Mã dự án xác nhận không chính xác.');
      if (project.deletedAt)
        return {
          deleted: true,
          alreadyDeleted: true,
          id: project.id,
          status: 'DELETED' as const,
        };
      const deletedAt = new Date();
      await tx.project.update({
        where: { id },
        data: {
          deletedAt,
          deletedBy: actor.userId,
          deleteReason: reason,
          updatedBy: actor.userId,
          version: { increment: 1 },
        },
      });
      await this.audit.write(tx, actor, {
        action: 'PROJECT_DELETED',
        entityType: 'Project',
        entityId: project.id,
        beforeData: { status: project.status, deletedAt: null },
        afterData: {
          status: 'DELETED',
          deletedAt,
          deletedBy: actor.userId,
          deleteReason: reason,
        },
        metadata: { projectId: project.id, code: project.code },
      });
      return {
        deleted: true,
        alreadyDeleted: false,
        id: project.id,
        status: 'DELETED' as const,
      };
    });
  }
  members(actor: CurrentActor, id: string) {
    return this.get(actor, id).then((item) => item.members);
  }
  async addMember(
    actor: CurrentActor,
    id: string,
    userId: string,
    role?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockProjectFor(tx, actor, id, 'project.manage_members');
      if (
        !(await tx.user.findFirst({
          where: {
            id: userId,
            status: 'active',
            organizationMembers: {
              some: { organizationId: actor.organizationId, status: 'active' },
            },
          },
        }))
      )
        throw new NotFoundException('Active project member not found');
      const member = await tx.projectMember.upsert({
        where: { projectId_userId: { projectId: id, userId } },
        create: {
          organizationId: actor.organizationId,
          projectId: id,
          userId,
          role,
          createdBy: actor.userId,
        },
        update: { role },
      });
      await tx.activity.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          event: 'PROJECT_MEMBER_ADDED',
          entityType: 'Project',
          entityId: id,
          metadata: { userId },
        },
      });
      return member;
    });
  }
  async removeMember(actor: CurrentActor, id: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockProjectFor(tx, actor, id, 'project.manage_members');
      const result = await tx.projectMember.deleteMany({
        where: { organizationId: actor.organizationId, projectId: id, userId },
      });
      if (!result.count)
        throw new NotFoundException('Project member not found');
      return { deleted: true };
    });
  }
  departments(actor: CurrentActor, id: string) {
    return this.get(actor, id).then((item) => item.departments);
  }
  async addDepartment(actor: CurrentActor, id: string, departmentId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockProjectFor(tx, actor, id, 'project.manage_departments');
      if (
        !(await tx.department.findFirst({
          where: {
            id: departmentId,
            organizationId: actor.organizationId,
            status: 'active',
          },
        }))
      )
        throw new NotFoundException('Department not found');
      return tx.projectDepartment.upsert({
        where: { projectId_departmentId: { projectId: id, departmentId } },
        create: {
          organizationId: actor.organizationId,
          projectId: id,
          departmentId,
          createdBy: actor.userId,
        },
        update: {},
      });
    });
  }
  async removeDepartment(
    actor: CurrentActor,
    id: string,
    departmentId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockProjectFor(tx, actor, id, 'project.manage_departments');
      const result = await tx.projectDepartment.deleteMany({
        where: {
          organizationId: actor.organizationId,
          projectId: id,
          departmentId,
        },
      });
      if (!result.count)
        throw new NotFoundException('Project department not found');
      return { deleted: true };
    });
  }
  async changePhase(actor: CurrentActor, id: string, phase: ProjectPhase) {
    return this.prisma.$transaction(async (tx) => {
      const project = await this.lockProjectFor(
        tx,
        actor,
        id,
        'project.change_phase',
      );
      if (phases.indexOf(phase) !== phases.indexOf(project.phase) + 1)
        throw new UnprocessableEntityException(
          'Invalid project phase transition',
        );
      const updated = await tx.project.update({
        where: { id },
        data: { phase, updatedBy: actor.userId, version: { increment: 1 } },
        include: this.include(),
        omit: this.financialOmit(actor),
      });
      await tx.activity.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          event: 'PROJECT_PHASE_CHANGED',
          entityType: 'Project',
          entityId: id,
          metadata: { from: project.phase, to: phase },
        },
      });
      return this.redactFinancials(actor, updated);
    });
  }
  private assertFinancialWrite(
    actor: CurrentActor,
    data: { estimatedValue?: unknown; contractedValue?: unknown },
    action: 'create' | 'update',
  ) {
    if (
      (data.estimatedValue !== undefined &&
        !actor.permissions.includes(`estimate.${action}`)) ||
      (data.contractedValue !== undefined &&
        !actor.permissions.includes(`contract.${action}`))
    )
      throw new ForbiddenException('Financial field permission required');
  }
  private dates<T extends UpdateProjectDto>(data: T) {
    return {
      ...data,
      startDate: data.startDate ? new Date(data.startDate) : undefined,
      expectedCompletionDate: data.expectedCompletionDate
        ? new Date(data.expectedCompletionDate)
        : undefined,
    };
  }
  private findCreatedProject(
    actor: CurrentActor,
    idempotencyKey: string,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    return db.project.findFirst({
      where: {
        organizationId: actor.organizationId,
        createdBy: actor.userId,
        deletedAt: null,
        creationIdempotencyKey: idempotencyKey,
      },
      select: {
        id: true,
        code: true,
        name: true,
        estimatedValue: true,
        customerId: true,
        primaryContactId: true,
        stageOnePlan: { select: { fundingSource: true } },
      },
    });
  }
  private assertSameCreateCommand(
    project: NonNullable<
      Awaited<ReturnType<ProjectsService['findCreatedProject']>>
    >,
    command: {
      name: string;
      estimatedInvestmentAmount: string;
      fundingSource?: CreateProjectDto['fundingSource'];
      customerId: string;
      primaryContactId: string | null;
    },
  ) {
    if (
      project.name !== command.name ||
      project.estimatedValue?.toFixed(2) !==
        command.estimatedInvestmentAmount ||
      (project.stageOnePlan?.fundingSource ?? undefined) !==
        command.fundingSource ||
      project.customerId !== command.customerId ||
      project.primaryContactId !== command.primaryContactId
    )
      throw new ConflictException(
        'Idempotency key was already used with a different Project payload',
      );
  }
  private async references(
    actor: CurrentActor,
    data: {
      customerId?: string;
      primaryContactId?: string;
      projectOwnerId?: string;
      salesOwnerId?: string;
      designOwnerId?: string;
      projectManagerId?: string;
    },
    db: Pick<Prisma.TransactionClient, 'customer' | 'contact' | 'user'> = this
      .prisma,
  ) {
    if (
      data.customerId &&
      !(await db.customer.findFirst({
        where: {
          id: data.customerId,
          organizationId: actor.organizationId,
          deletedAt: null,
        },
      }))
    )
      throw new NotFoundException('Customer not found');
    if (
      data.primaryContactId &&
      !(await db.contact.findFirst({
        where: {
          id: data.primaryContactId,
          organizationId: actor.organizationId,
          customerId: data.customerId,
          deletedAt: null,
        },
      }))
    )
      throw new NotFoundException('Primary contact not found');
    for (const userId of [
      data.projectOwnerId,
      data.salesOwnerId,
      data.designOwnerId,
      data.projectManagerId,
    ].filter((id): id is string => !!id))
      if (
        !(await db.user.findFirst({
          where: {
            id: userId,
            status: 'active',
            organizationMembers: {
              some: { organizationId: actor.organizationId, status: 'active' },
            },
          },
        }))
      )
        throw new NotFoundException('Project user not found');
  }
}
