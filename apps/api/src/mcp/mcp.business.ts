import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { projectWhereForPermissions } from '../access-control/business-entity.policy';
import { PrismaService } from '../prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { McpOAuth, McpPrincipal, mcpDigest } from './mcp.oauth';
import { FilesService } from '../files/files.service';
import { SearchService } from '../search/search.service';
import { MarketingService } from '../marketing/marketing.service';
import { ContentStatus } from '@prisma/client';
import { readTextPage, hasTextBytes } from './mcp.text';
import { ProjectAiService } from '../project-chat/project-ai.service';
import {
  memoryQuerySchema,
  memoryWriteSchema,
  memoryChangeSchema,
} from '../project-chat/project-chat.dto';
import { McpJobsService } from './mcp.jobs.service';

export const projectFilters = z
  .object({
    search: z.string().trim().min(1).max(200).optional(),
    status: z
      .enum(['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'])
      .optional(),
    customer_id: z.string().uuid().optional(),
    mine: z.boolean().optional(),
    active: z.boolean().optional(),
  })
  .strict();

export const noteUpdate = z
  .object({
    project: z.string().uuid(),
    memory_id: z.string().uuid(),
    expected_version: z.number().int().positive(),
    operation_id: z.string().uuid(),
    ...memoryChangeSchema.omit({ clientKey: true, expectedVersion: true })
      .shape,
  })
  .strict();
export const jobPage = z
  .object({
    project: z.string().trim().min(1).max(200).optional(),
    cursor: z.string().uuid().optional(),
    limit: z.number().int().min(1).max(50).default(20),
  })
  .strict();
export const projectPage = projectFilters.extend({
  page: z.number().int().positive().default(1),
  page_size: z.number().int().min(1).max(100).default(20),
});
export const projectReference = z
  .object({
    project: z.string().trim().min(1).max(200),
  })
  .strict();
export const emptyInput = z.object({}).strict();
export const workspaceRecords = z
  .object({
    record_type: z.enum(['campaign', 'marketing_content']),
    page: z.number().int().positive().default(1),
    page_size: z.number().int().min(1).max(100).default(20),
    status: z.enum(ContentStatus).optional(),
  })
  .strict();
export const workspaceRecord = z
  .object({
    record_type: z.enum(['campaign', 'marketing_content']),
    record_id: z.string().uuid(),
  })
  .strict();
export const filePage = z
  .object({
    project: z.string().trim().min(1).max(200),
    search: z.string().trim().min(1).max(200).optional(),
    page: z.number().int().positive().default(1),
    page_size: z.number().int().min(1).max(100).default(20),
  })
  .strict();
export const fileRead = z
  .object({
    file_id: z.string().uuid(),
    version: z.number().int().positive(),
    text_offset: z
      .number()
      .int()
      .nonnegative()
      .safe()
      .default(0)
      .describe(
        'UTF-8 byte cursor returned by the preceding text page; start at 0.',
      ),
    text_limit: z.number().int().min(1).max(32768).default(8192),
  })
  .strict();
export const projectMemory = projectReference.extend(memoryQuerySchema.shape);
export const searchInput = z
  .object({
    query: z.string().trim().min(2).max(100),
    entity_types: z
      .array(
        z.enum([
          'Customer',
          'Contact',
          'Lead',
          'Opportunity',
          'Project',
          'Task',
          'File',
        ]),
      )
      .optional(),
    page: z.number().int().positive().default(1),
    page_size: z.number().int().min(1).max(20).default(5),
  })
  .strict();
export const projectNote = z
  .object({
    project: z
      .string()
      .uuid()
      .describe(
        'Resolved Project UUID returned by galaxy_get_project. Stable destination for retries.',
      ),
    operation_id: z.string().uuid(),
    content: z.string().min(1).max(8000),
    category: z
      .enum(['NOTE', 'REQUIREMENT', 'TECHNICAL', 'DECISION', 'ISSUE'])
      .default('NOTE'),
    verification: z
      .enum(['UNVERIFIED', 'USER_CONFIRMED'])
      .default('UNVERIFIED'),
    visibility: z.enum(['PRIVATE', 'SHARED']).default('PRIVATE'),
  })
  .strict();

@Injectable()
export class McpBusinessTools {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(ProjectsService) private readonly projects: ProjectsService,
    @Inject(FilesService) private readonly files: FilesService,
    @Inject(ProjectAiService) private readonly ai: ProjectAiService,
    @Inject(McpOAuth) private readonly oauth: McpOAuth,
    @Inject(SearchService) private readonly searchService: SearchService,
    @Inject(McpJobsService) private readonly jobs: McpJobsService,
    @Inject(MarketingService) private readonly marketing: MarketingService,
  ) {}
  private require(principal: McpPrincipal, permission: string) {
    if (!principal.actor.permissions.includes(permission))
      throw new ForbiddenException('MCP_PERMISSION_REQUIRED');
  }
  workspace(principal: McpPrincipal) {
    const actor = principal.actor;
    return {
      identity: { user_id: actor.userId, display_name: actor.displayName },
      organization_id: actor.organizationId,
      granted_scopes: principal.scopes,
      permissions: actor.permissions,
      project_visibility: 'AUTHORIZED_PROJECTS',
      authority: 'WORKING_DATA_ONLY',
      queried_at: new Date().toISOString(),
    };
  }
  async listWorkspaceRecords(
    principal: McpPrincipal,
    input: z.infer<typeof workspaceRecords>,
  ) {
    this.require(
      principal,
      'marketing.' +
        (input.record_type === 'campaign' ? 'campaign' : 'content') +
        '.read',
    );
    if (input.record_type === 'marketing_content')
      return {
        ...(await this.marketing.listContent(principal.actor, {
          page: input.page,
          pageSize: input.page_size,
          status: input.status,
        })),
        record_type: input.record_type,
        scope: 'AUTHORIZED_ORGANIZATION_RECORDS',
        queried_at: new Date().toISOString(),
        authority: 'WORKING_DATA_ONLY',
      };
    const records = await this.marketing.listCampaigns(principal.actor);
    return {
      items: records.slice(
        (input.page - 1) * input.page_size,
        input.page * input.page_size,
      ),
      total: records.length,
      page: input.page,
      pageSize: input.page_size,
      record_type: input.record_type,
      scope: 'AUTHORIZED_ORGANIZATION_RECORDS',
      queried_at: new Date().toISOString(),
      authority: 'WORKING_DATA_ONLY',
    };
  }
  async getWorkspaceRecord(
    principal: McpPrincipal,
    input: z.infer<typeof workspaceRecord>,
  ) {
    this.require(
      principal,
      'marketing.' +
        (input.record_type === 'campaign' ? 'campaign' : 'content') +
        '.read',
    );
    let record: unknown;
    if (input.record_type === 'campaign')
      record = (await this.marketing.listCampaigns(principal.actor)).find(
        (value) => value.id === input.record_id,
      );
    else {
      const { publishingJobs, ...content } = await this.marketing.getContent(
        principal.actor,
        input.record_id,
      );
      void publishingJobs;
      record = content;
    }
    if (!record) throw new NotFoundException('MCP_RECORD_NOT_FOUND');
    return {
      record,
      record_type: input.record_type,
      scope: 'AUTHORIZED_ORGANIZATION_RECORDS',
      queried_at: new Date().toISOString(),
      authority: 'WORKING_DATA_ONLY',
      ...(input.record_type === 'marketing_content'
        ? { omitted_fields: ['publishingJobs.provider_diagnostics'] }
        : {}),
    };
  }
  search(principal: McpPrincipal, input: z.infer<typeof searchInput>) {
    return this.searchService.search(principal.actor, {
      q: input.query,
      entityTypes: input.entity_types,
      page: input.page,
      pageSize: input.page_size,
    });
  }
  count(principal: McpPrincipal, input: z.infer<typeof projectFilters>) {
    this.require(principal, 'project.read');
    const { customer_id: customerId, ...filters } = input;
    return this.projects.count(principal.actor, { ...filters, customerId });
  }
  list(principal: McpPrincipal, input: z.infer<typeof projectPage>) {
    this.require(principal, 'project.read');
    const { page_size: pageSize, customer_id: customerId, ...filters } = input;
    return this.projects.list(principal.actor, {
      ...filters,
      customerId,
      pageSize,
    });
  }
  async resolve(principal: McpPrincipal, reference: string) {
    this.require(principal, 'project.read');
    if (z.string().uuid().safeParse(reference).success) {
      const project = await this.projects.get(principal.actor, reference);
      return { id: project.id, candidates: [] };
    }
    const exact = await this.db.project.findMany({
      where: {
        AND: [
          projectWhereForPermissions(principal.actor, 'project.read'),
          {
            OR: [
              { name: { equals: reference, mode: 'insensitive' } },
              { code: { equals: reference, mode: 'insensitive' } },
            ],
          },
        ],
      },
      select: { id: true, name: true, code: true },
      orderBy: { id: 'asc' },
      take: 2,
    });
    if (exact.length === 1) return { id: exact[0]!.id, candidates: [] };
    const candidates = await this.projects.list(principal.actor, {
      search: reference,
      page: 1,
      pageSize: 20,
    });
    return {
      id: candidates.total === 1 ? candidates.items[0]!.id : null,
      candidates: candidates.items.map(({ id, name, code }) => ({
        id,
        name,
        code,
      })),
      total: candidates.total,
      next_page: candidates.totalPages > 1 ? 2 : null,
    };
  }
  async get(
    principal: McpPrincipal,
    input: z.infer<typeof projectReference>,
    summary = false,
  ) {
    const resolved = await this.resolve(principal, input.project);
    if (!resolved.id) return { resolution: 'NEEDS_SELECTION', ...resolved };
    const result = summary
      ? await this.projects.workspaceSummary(principal.actor, resolved.id)
      : { project: await this.projects.get(principal.actor, resolved.id) };
    return {
      ...result,
      resolution: 'RESOLVED',
      queried_at: new Date().toISOString(),
      authority: 'WORKING_DATA_ONLY',
    };
  }
  async listFiles(principal: McpPrincipal, input: z.infer<typeof filePage>) {
    this.require(principal, 'file.read');
    const resolved = await this.resolve(principal, input.project);
    if (!resolved.id) return { resolution: 'NEEDS_SELECTION', ...resolved };
    const query = {
      projectId: resolved.id,
      search: input.search,
      page: input.page,
      pageSize: input.page_size,
    };
    const records = await this.files.list(principal.actor, query);
    let privateChat;
    try {
      privateChat = await this.ai.privateFiles(
        principal.actor,
        resolved.id,
        query,
      );
    } catch (error) {
      if (
        !(error instanceof ForbiddenException) &&
        !(error instanceof NotFoundException)
      )
        throw error;
      privateChat = {
        items: [],
        total: null,
        error: 'PROJECT_CHAT_ACCESS_REQUIRED',
      };
    }
    return {
      project_id: resolved.id,
      items: [...records.items, ...privateChat.items],
      total:
        privateChat.total === null ? null : records.total + privateChat.total,
      pagination: 'INDEPENDENT_GROUP_PAGES',
      project_record_files: records,
      private_chat_files: privateChat,
      queried_at: new Date().toISOString(),
    };
  }
  async readFile(principal: McpPrincipal, input: z.infer<typeof fileRead>) {
    this.require(principal, 'file.read');
    this.require(principal, 'file.download');
    const { file, data } = await this.downloadFile(
      principal,
      input.file_id,
      input.version,
      input.text_offset,
    );
    let text: Awaited<ReturnType<typeof readTextPage>> | undefined,
      textError: string | undefined;
    if (hasTextBytes(file.mimeType)) {
      try {
        text = await readTextPage(data, input.text_offset, input.text_limit);
      } catch {
        textError = 'MCP_TEXT_ENCODING_UNSUPPORTED';
      }
    } else data.destroy();
    const ticket = randomBytes(32).toString('base64url'),
      expiresAt = new Date(Date.now() + 600000);
    await this.db.mcpGrant.create({
      data: {
        kind: 'DOWNLOAD',
        clientId: principal.clientId,
        authorizationId: principal.authorizationId,
        tokenHash: mcpDigest(ticket),
        issuer: this.oauth.origin(),
        resource: this.oauth.resource(),
        scopes: ['galaxy.data.read'],
        payload: {
          file_id: file.id,
          version: file.version,
          checksum: file.checksum,
        },
        expiresAt,
      },
    });
    return {
      file_id: file.id,
      version: file.version,
      file_name: file.originalFilename,
      mime_type: file.mimeType,
      size_bytes: file.sizeBytes.toString(),
      checksum: file.checksum,
      download_url: this.oauth.origin() + '/mcp/file?ticket=' + ticket,
      expires_at: expiresAt.toISOString(),
      authority: 'WORKING_DATA_ONLY',
      ...(text ? { text } : {}),
      ...(textError ? { text_error: textError } : {}),
    };
  }
  async download(ticket: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(ticket)) throw new NotFoundException();
    const row = await this.db.mcpGrant.findFirst({
      where: {
        kind: 'DOWNLOAD',
        tokenHash: mcpDigest(ticket),
        revokedAt: null,
        expiresAt: { gt: new Date() },
        issuer: this.oauth.origin(),
        resource: this.oauth.resource(),
        scopes: { has: 'galaxy.data.read' },
      },
    });
    if (!row?.authorizationId) throw new NotFoundException();
    const principal = await this.oauth.principal(row.authorizationId);
    if (!principal.scopes.includes('galaxy.data.read'))
      throw new NotFoundException();
    const pin = fileRead
      .extend({ checksum: z.string().nullable() })
      .strict()
      .parse(row.payload);
    const result = await this.downloadFile(
      principal,
      pin.file_id,
      pin.version,
      0,
    );
    if (result.file.checksum !== pin.checksum) {
      result.data.destroy();
      throw new NotFoundException();
    }
    return result;
  }
  private async downloadFile(
    principal: McpPrincipal,
    id: string,
    version: number,
    start: number,
  ) {
    const source = await this.db.chatAiSourceIndex.findFirst({
      where: {
        id,
        organizationId: principal.actor.organizationId,
        ownerId: principal.actor.userId,
        fileAssetId: { not: null },
      },
      select: { projectId: true },
    });
    return source
      ? this.ai.downloadFile(principal.actor, source.projectId, id, {
          version,
          start,
        })
      : this.files.download(
          principal.actor,
          id,
          ['file.read', 'file.download'],
          version,
          start,
        );
  }
  async memory(principal: McpPrincipal, input: z.infer<typeof projectMemory>) {
    const { project, ...query } = input;
    const resolved = await this.resolve(principal, project);
    if (!resolved.id) return { resolution: 'NEEDS_SELECTION', ...resolved };
    return {
      project_id: resolved.id,
      ...(await this.ai.memoryList(principal.actor, resolved.id, query)),
      authority: 'WORKING_DATA_ONLY',
      queried_at: new Date().toISOString(),
    };
  }
  async saveNote(principal: McpPrincipal, input: z.infer<typeof projectNote>) {
    const { project, operation_id, ...content } = input;
    const resolved = await this.resolve(principal, project);
    if (!resolved.id) return { resolution: 'NEEDS_SELECTION', ...resolved };
    const value = memoryWriteSchema.parse({
      ...content,
      clientKey: operation_id,
    });
    return {
      project_id: resolved.id,
      memory: await this.ai.memoryCreate(principal.actor, resolved.id, value),
    };
  }
  async updateNote(principal: McpPrincipal, input: z.infer<typeof noteUpdate>) {
    const { project, memory_id, expected_version, operation_id, ...content } =
      input;
    const target = await this.projects.get(principal.actor, project);
    return {
      project_id: target.id,
      memory: await this.ai.memoryUpdate(
        principal.actor,
        target.id,
        memory_id,
        {
          ...content,
          expectedVersion: expected_version,
          clientKey: operation_id,
        },
      ),
    };
  }
  async listJobs(principal: McpPrincipal, input: z.infer<typeof jobPage>) {
    const project = input.project
      ? await this.resolve(principal, input.project)
      : null;
    if (project && !project.id)
      return { resolution: 'NEEDS_SELECTION', ...project };
    return this.jobs.list(principal, {
      ...input,
      projectId: project?.id ?? undefined,
    });
  }
}
