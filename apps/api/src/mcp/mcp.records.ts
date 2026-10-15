import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import { actorsForPermission } from '../access-control/current-actor';
import {
  projectPermissionApplies,
  projectWhereForPermissions,
} from '../access-control/business-entity.policy';
import { PrismaService } from '../prisma.service';
import { Prisma } from '@prisma/client';
import { ProjectChatPolicy } from '../access-control/project-chat.policy';
import { ProjectsService } from '../projects/projects.service';
import { TasksService } from '../tasks/tasks.service';
import { CustomersService } from '../customers/customers.service';
import { CommercialService } from '../commercial/commercial.service';
import { ContractsService } from '../contracts/contracts.service';
import { ProcurementService } from '../procurement/procurement.service';
import { LogisticsService } from '../logistics/logistics.service';
import { ProductionService } from '../production/production.service';
import { InstallationService } from '../installation/installation.service';
import { AfterSalesService } from '../after-sales/after-sales.service';
import { ProjectAiService } from '../project-chat/project-ai.service';
import { McpBusinessTools, projectReference } from './mcp.business';
import { McpPrincipal, mcpDigest } from './mcp.oauth';

export const recordPermissions = {
  task: 'task.read',
  customer: 'crm.customer.read',
  contact: 'crm.contact.read',
  estimate: 'estimate.read',
  quotation: 'quotation.read',
  contract: 'contract.read',
  receivable: 'receivable.read',
  purchase_request: 'purchase_request.read',
  rfq: 'procurement.rfq.read',
  proforma_invoice: 'procurement.proforma_invoice.read',
  purchase_order: 'procurement.purchase_order.read',
  supplier_payable: 'supplier_payable.read',
  supplier_payment: 'supplier_payment.read',
  ai_thread: 'ai.invoke',
  shipment: 'logistics.shipment.read',
  production_order: 'production.read',
  installation_plan: 'installation.read',
  inspection: 'inspection.read',
  handover: 'handover.read',
  warranty_asset: 'warranty.read',
} as const;
export const recordType = z.enum(
  Object.keys(recordPermissions) as [
    keyof typeof recordPermissions,
    ...(keyof typeof recordPermissions)[],
  ],
);
export const recordPage = projectReference.extend({
  record_type: recordType,
  page: z.number().int().positive().default(1),
  page_size: z.number().int().min(1).max(100).default(20),
});
export const recordIdentity = projectReference.extend({
  record_type: recordType,
  record_id: z.string().uuid(),
});
const uuid = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
const taskChanges = z
  .object({
    title: z.string().trim().min(1).max(300).optional(),
    description: z.string().min(1).max(10000).optional(),
    priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
    status: z.enum(['TODO', 'IN_PROGRESS', 'BLOCKED', 'IN_REVIEW']).optional(),
    due_date: z.string().datetime().optional(),
  })
  .strict();
export const taskCreate = z
  .object({
    project: uuid,
    operation_id: uuid,
    ...taskChanges.required({ title: true }).shape,
  })
  .strict();
export const taskUpdate = z
  .object({
    project: uuid,
    task_id: uuid,
    operation_id: uuid,
    expected_version: z.number().int().positive(),
    changes: taskChanges.refine((v) => Object.keys(v).length > 0),
  })
  .strict();

@Injectable()
export class McpRecordsService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(ProjectsService) private readonly projects: ProjectsService,
    @Inject(McpBusinessTools) private readonly business: McpBusinessTools,
    @Inject(TasksService) private readonly tasks: TasksService,
    @Inject(CustomersService) private readonly customers: CustomersService,
    @Inject(CommercialService) private readonly commercial: CommercialService,
    @Inject(ContractsService) private readonly contracts: ContractsService,
    @Inject(ProcurementService)
    private readonly procurement: ProcurementService,
    @Inject(LogisticsService) private readonly logistics: LogisticsService,
    @Inject(ProductionService) private readonly production: ProductionService,
    @Inject(InstallationService)
    private readonly installation: InstallationService,
    @Inject(AfterSalesService) private readonly afterSales: AfterSalesService,
    @Inject(ProjectAiService) private readonly ai: ProjectAiService,
    @Inject(ProjectChatPolicy) private readonly access: ProjectChatPolicy,
  ) {}
  private async target(
    principal: McpPrincipal,
    input: { project: string; record_type: z.infer<typeof recordType> },
  ) {
    const permission = recordPermissions[input.record_type];
    if (!principal.actor.permissions.includes(permission))
      throw new ForbiddenException('MCP_PERMISSION_REQUIRED');
    const resolved = await this.business.resolve(principal, input.project);
    if (!resolved.id)
      throw new NotFoundException('MCP_PROJECT_REQUIRES_SELECTION');
    if (
      !(await this.db.project.findFirst({
        where: {
          AND: [
            { id: resolved.id },
            projectWhereForPermissions(principal.actor, [
              'project.read',
              permission,
            ]),
          ],
        },
        select: { id: true },
      }))
    )
      throw new NotFoundException('MCP_RECORD_NOT_FOUND');
    return this.projects.get(principal.actor, resolved.id);
  }
  private taskWhere(principal: McpPrincipal, projectId: string) {
    return {
      projectId,
      OR: actorsForPermission(principal.actor, 'task.read').map((actor) =>
        this.tasks.visibleWhere(actor),
      ),
    };
  }
  private async taskTarget(
    principal: McpPrincipal,
    project: string,
    permission: string,
  ) {
    if (!principal.actor.permissions.includes(permission))
      throw new ForbiddenException('MCP_PERMISSION_REQUIRED');
    const target = await this.target(principal, {
      project,
      record_type: 'task',
    });
    if (
      !(await this.db.project.findFirst({
        where: {
          AND: [
            { id: target.id },
            projectWhereForPermissions(principal.actor, [
              'project.read',
              'task.read',
              permission,
            ]),
          ],
        },
        select: { id: true },
      }))
    )
      throw new NotFoundException('MCP_RECORD_NOT_FOUND');
    return target;
  }
  private taskAuthority(
    principal: McpPrincipal,
    projectId: string,
    permission: string,
  ) {
    return async (tx: Prisma.TransactionClient) => {
      const actor = await this.access.freshActor(tx, principal.actor);
      if (
        !actor.permissions.includes(permission) ||
        !actor.permissions.includes('task.read') ||
        !actor.permissions.includes('project.read')
      )
        throw new ForbiddenException('MCP_PERMISSION_REQUIRED');
      const project = await tx.project.findFirst({
        where: {
          AND: [
            { id: projectId },
            projectWhereForPermissions(actor, [
              'project.read',
              'task.read',
              permission,
            ]),
          ],
        },
        include: {
          members: { select: { userId: true } },
          departments: { select: { departmentId: true } },
        },
      });
      if (!project) throw new NotFoundException('MCP_RECORD_NOT_FOUND');
      actor.permissions = actor.permissions.filter(
        (code) =>
          code !== 'estimate.read' ||
          projectPermissionApplies(actor, code, project),
      );
      return {
        actor,
        visibility: {
          AND: [
            this.taskWhere({ ...principal, actor }, projectId),
            {
              OR: actorsForPermission(actor, permission).map((source) =>
                this.tasks.visibleWhere(source),
              ),
            },
          ],
        },
      };
    };
  }
  async createTask(principal: McpPrincipal, input: z.infer<typeof taskCreate>) {
    const project = await this.taskTarget(
      principal,
      input.project,
      'task.create',
    );
    const { operation_id, project: _target, due_date, ...data } = input;
    void _target;
    return {
      project_id: project.id,
      operation_id,
      task: this.taskResult(
        principal,
        project,
        await this.tasks.create(
          principal.actor,
          { ...data, projectId: project.id, dueDate: due_date },
          {
            id: operation_id,
            digest: mcpDigest(JSON.stringify(['CREATE_TASK', input])),
            authorize: this.taskAuthority(principal, project.id, 'task.create'),
          },
        ),
      ),
    };
  }
  async updateTask(principal: McpPrincipal, input: z.infer<typeof taskUpdate>) {
    const project = await this.taskTarget(
      principal,
      input.project,
      'task.update',
    );
    const { due_date, ...data } = input.changes;
    const visibility = {
      AND: [
        this.taskWhere(principal, project.id),
        {
          OR: actorsForPermission(principal.actor, 'task.update').map((actor) =>
            this.tasks.visibleWhere(actor),
          ),
        },
      ],
    };
    return {
      project_id: project.id,
      operation_id: input.operation_id,
      task: this.taskResult(
        principal,
        project,
        await this.tasks.update(
          principal.actor,
          input.task_id,
          { ...data, dueDate: due_date },
          {
            id: input.operation_id,
            digest: mcpDigest(JSON.stringify(['UPDATE_TASK', input])),
            expectedVersion: input.expected_version,
            authorize: this.taskAuthority(principal, project.id, 'task.update'),
          },
          visibility,
        ),
      ),
    };
  }
  private taskResult(
    principal: McpPrincipal,
    project: Awaited<ReturnType<ProjectsService['get']>>,
    task: Awaited<ReturnType<TasksService['create']>>,
  ) {
    if (task.projectId !== project.id)
      throw new NotFoundException('MCP_RECORD_NOT_FOUND');
    const { allocatedBudget, ...rest } = task;
    void allocatedBudget;
    return projectPermissionApplies(principal.actor, 'estimate.read', project)
      ? task
      : rest;
  }
  private page(items: unknown[], input: z.infer<typeof recordPage>) {
    const start = (input.page - 1) * input.page_size;
    return {
      items: items.slice(start, start + input.page_size),
      total: items.length,
      page: input.page,
      pageSize: input.page_size,
      totalPages: Math.ceil(items.length / input.page_size),
    };
  }
  async list(principal: McpPrincipal, input: z.infer<typeof recordPage>) {
    const project = await this.target(principal, input),
      actor = {
        ...principal.actor,
        permissions: principal.actor.permissions.filter(
          (code) =>
            code !== 'bank_information.read' ||
            projectPermissionApplies(principal.actor, code, project),
        ),
      };
    const query = {
      projectId: project.id,
      page: input.page,
      pageSize: input.page_size,
    };
    let result: {
      items: unknown[];
      total?: number;
      page?: number;
      pageSize?: number;
    };
    switch (input.record_type) {
      case 'task': {
        const listed = await this.tasks.list(
          actor,
          query,
          this.taskWhere(principal, project.id),
        );
        result = {
          ...listed,
          items: listed.items.map((item) => {
            const { allocatedBudget, ...rest } = item;
            void allocatedBudget;
            return projectPermissionApplies(actor, 'estimate.read', project)
              ? item
              : rest;
          }),
        };
        break;
      }
      case 'customer': {
        const { contacts, ...customer } = await this.customers.get(
          actor,
          project.customerId,
        );
        void contacts;
        result = this.page([customer], input);
        break;
      }
      case 'contact':
        result = this.page(
          (await this.customers.get(actor, project.customerId)).contacts,
          input,
        );
        break;
      case 'estimate':
        result = this.page(
          await this.commercial.listEstimates(actor, project.id),
          input,
        );
        break;
      case 'quotation':
        result = this.page(
          await this.commercial.listQuotations(actor, project.id),
          input,
        );
        break;
      case 'contract':
        result = this.page(await this.contracts.list(actor, project.id), input);
        break;
      case 'receivable':
        result = this.page(
          await this.contracts.receivables(actor, project.id),
          input,
        );
        break;
      case 'purchase_request':
        result = await this.procurement.list(actor, query);
        break;
      case 'rfq':
        result = await this.procurement.listRFQs(actor, query);
        break;
      case 'proforma_invoice':
        result = await this.procurement.listProformaInvoices(actor, query);
        break;
      case 'purchase_order':
        result = {
          items: await this.procurement.listPurchaseOrders(actor, project.id, {
            page: input.page,
            pageSize: input.page_size,
          }),
          page: input.page,
          pageSize: input.page_size,
        };
        break;
      case 'supplier_payable':
        result = {
          items: await this.procurement.listSupplierPayables(actor, query),
          page: input.page,
          pageSize: input.page_size,
        };
        break;
      case 'supplier_payment':
        result = {
          items: await this.procurement.listSupplierPayments(actor, query),
          page: input.page,
          pageSize: input.page_size,
        };
        break;
      case 'ai_thread':
        result = this.page(
          (await this.ai.list(actor, project.id)).conversations,
          input,
        );
        break;
      case 'shipment':
        result = await this.logistics.list(actor, query);
        break;
      case 'production_order': {
        const items = await this.production.list(actor, query);
        result = {
          items,
          page: input.page,
          pageSize: input.page_size,
        };
        break;
      }
      case 'installation_plan':
        result = this.page(
          await this.installation.plans(actor, project.id),
          input,
        );
        break;
      case 'inspection':
        result = this.page(
          await this.afterSales.inspections(actor, project.id),
          input,
        );
        break;
      case 'handover':
        result = this.page(
          await this.afterSales.handovers(actor, project.id),
          input,
        );
        break;
      case 'warranty_asset':
        result = this.page(
          await this.afterSales.warrantyAssets(actor, project.id),
          input,
        );
        break;
    }
    return {
      ...result,
      next_page:
        result.total === undefined
          ? result.items.length === input.page_size
            ? input.page + 1
            : null
          : input.page * input.page_size < result.total
            ? input.page + 1
            : null,
      project_id: project.id,
      record_type: input.record_type,
      queried_at: new Date().toISOString(),
      authority: 'WORKING_DATA_ONLY',
    };
  }
  async get(principal: McpPrincipal, input: z.infer<typeof recordIdentity>) {
    const project = await this.target(principal, input),
      actor = {
        ...principal.actor,
        permissions: principal.actor.permissions.filter(
          (code) =>
            code !== 'bank_information.read' ||
            projectPermissionApplies(principal.actor, code, project),
        ),
      },
      id = input.record_id;
    let record: unknown;
    switch (input.record_type) {
      case 'task': {
        const result = await this.tasks.get(
          actor,
          id,
          this.taskWhere(principal, project.id),
        );
        const { allocatedBudget, ...rest } = result;
        void allocatedBudget;
        record = projectPermissionApplies(actor, 'estimate.read', project)
          ? result
          : rest;
        break;
      }
      case 'estimate':
        record = await this.commercial.getEstimate(actor, project.id, id);
        break;
      case 'quotation':
        record = await this.commercial.getQuotation(actor, project.id, id);
        break;
      case 'contract':
        record = await this.contracts.get(actor, project.id, id);
        break;
      case 'purchase_request':
        record = await this.procurement.get(actor, id);
        break;
      case 'rfq':
        record = await this.procurement.getRFQ(actor, id);
        break;
      case 'proforma_invoice':
        record = await this.procurement.getProformaInvoice(actor, id);
        break;
      case 'purchase_order':
        record = await this.procurement.getPurchaseOrder(
          actor,
          id,
          'procurement.purchase_order.read',
        );
        break;
      case 'supplier_payable':
        record = await this.procurement.getSupplierPayable(
          actor,
          id,
          'supplier_payable.read',
        );
        break;
      case 'supplier_payment':
        record = await this.procurement.getSupplierPayment(
          actor,
          id,
          'supplier_payment.read',
        );
        break;
      case 'ai_thread':
        record = await this.ai.history(actor, project.id, id);
        break;
      case 'shipment':
        record = await this.logistics.get(actor, id);
        break;
      case 'production_order':
        record = await this.production.get(actor, id);
        break;
      case 'inspection':
        record = await this.afterSales.inspection(actor, id);
        break;
      case 'handover':
        record = await this.afterSales.handover(actor, id);
        break;
      default: {
        let page: number | null = 1;
        do {
          const result = await this.list(principal, {
            ...input,
            page,
            page_size: 100,
          });
          record = result.items.find(
            (value) =>
              value !== null &&
              typeof value === 'object' &&
              'id' in value &&
              value.id === id,
          );
          page = result.next_page;
        } while (!record && page !== null);
        if (!record) throw new NotFoundException('MCP_RECORD_NOT_FOUND');
      }
    }
    if (
      record !== null &&
      typeof record === 'object' &&
      'projectId' in record &&
      record.projectId !== project.id
    )
      throw new NotFoundException('MCP_RECORD_NOT_FOUND');
    return {
      record,
      record_type: input.record_type,
      project_id: project.id,
      queried_at: new Date().toISOString(),
      authority: 'WORKING_DATA_ONLY',
    };
  }
}
