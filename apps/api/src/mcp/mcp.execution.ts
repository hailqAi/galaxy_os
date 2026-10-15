import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { CurrentActor } from '../access-control/current-actor';
import { ProjectChatPolicy } from '../access-control/project-chat.policy';
import { ProjectAiService } from '../project-chat/project-ai.service';
import { ChatAiQuestionDto } from '../project-chat/project-chat.dto';
import {
  chooseExecution,
  executor,
  executionSelection,
} from '../project-chat/ai-execution';
import { ProjectsService } from '../projects/projects.service';
import { McpJobsService, createJobInput } from './mcp.jobs.service';
import { mcpDigest } from './mcp.oauth';

const executionInput = createJobInput
  .extend({
    requested_executor: executor,
    model: z.string().min(1).max(200).optional(),
    reasoning: z
      .enum(['default', 'none', 'low', 'medium', 'high', 'xhigh', 'max'])
      .optional(),
    searchMode: z.enum(['AUTO', 'WEB', 'PROJECT_ONLY']).optional(),
    publicQuery: z.string().min(1).max(400).optional(),
    runMode: z.enum(['NORMAL', 'DEEP']).optional(),
  })
  .strict();

@Injectable()
export class McpExecutionService {
  constructor(
    @Inject(ProjectAiService) private readonly ai: ProjectAiService,
    @Inject(McpJobsService) private readonly jobs: McpJobsService,
    @Inject(ProjectsService) private readonly projects: ProjectsService,
    @Inject(ProjectChatPolicy) private readonly access: ProjectChatPolicy,
  ) {}
  async create(
    actor: CurrentActor,
    projectId: string,
    conversationId: string,
    value: unknown,
    requestId?: string,
  ) {
    const parsed = executionInput.safeParse(value);
    if (!parsed.success)
      throw new BadRequestException('GALAXY_EXECUTION_INPUT_INVALID');
    const input = parsed.data;
    const receivedAt = new Date().toISOString(),
      routingTick = performance.now();
    const commandHash = mcpDigest(
      JSON.stringify([projectId, conversationId, input]),
    );
    const route = chooseExecution({
      requested: input.requested_executor,
      question: input.question,
      sourceCount: input.sourceIds.length,
      outputFormat: input.outputFormat,
      pinnedContext: Boolean(
        input.roomId || input.productLineId || input.fileAssetId,
      ),
    });
    const selection = {
      requested_executor: input.requested_executor,
      effective_executor: route.effective,
      context: route.context,
    };
    const routingDurationMs = performance.now() - routingTick;
    return this.ai.workspaceTransaction(
      actor,
      projectId,
      async (tx, grantId) => {
        const conversation = await tx.chatAiConversation.findFirst({
          where: {
            id: conversationId,
            organizationId: actor.organizationId,
            projectId,
            ownerId: actor.userId,
          },
        });
        if (!conversation) throw new NotFoundException();
        const existing = await tx.chatAiAnswer.findUnique({
          where: {
            conversationId_clientKey: {
              conversationId,
              clientKey: input.clientKey,
            },
          },
        });
        if (existing) {
          const usage = existing.usage as Prisma.JsonObject | null;
          if (
            existing.invokeGrantId !== grantId ||
            existing.ownerId !== actor.userId ||
            usage?.executionCommandHash !== commandHash
          )
            throw new ConflictException(
              'GALAXY_EXECUTION_IDEMPOTENCY_CONFLICT',
            );
          const saved = executionSelection.parse(usage.routeSelection);
          if (saved.effective_executor === 'SIWC') {
            const { requested_executor: _requested, ...question } = input;
            void _requested;
            await this.ai.ask(
              actor,
              projectId,
              conversationId,
              {
                ...question,
                runMode: input.runMode ?? 'NORMAL',
              } as ChatAiQuestionDto,
              { tx, grantId },
            );
          } else
            await this.ai.workspaceCheck(
              tx,
              actor,
              projectId,
              existing,
              grantId,
            );
          return {
            id: existing.id,
            status: existing.status,
            route: saved.effective_executor,
            ...saved,
          };
        }
        let answer: { id: string; status: string };
        if (route.effective === 'GALAXY_DATA') {
          const fresh = await this.access.freshActor(tx, actor);
          const result = await this.projects.count(fresh, route.filters, tx);
          const answerId = randomUUID();
          const text = `Có ${result.count} dự án${route.filters.status ? ' đang triển khai' : ''} tài khoản được phép xem. Phạm vi: Project chưa xóa${route.filters.status ? ', trạng thái ACTIVE' : ', mọi trạng thái'}; không gồm Lead hoặc Opportunity.`;
          answer = await tx.chatAiAnswer.create({
            data: {
              id: answerId,
              organizationId: actor.organizationId,
              projectId,
              conversationId,
              ownerId: actor.userId,
              invokeGrantId: grantId,
              clientKey: input.clientKey,
              payloadHash: commandHash,
              question: input.question,
              status: 'COMPLETED',
              answer: text,
              completedAt: new Date(),
              usage: {
                dataReceipt: {
                  ...result,
                  version: 1,
                  operation: 'COUNT_PROJECTS',
                  source_message_id: answerId,
                  requested_by: actor.userId,
                  project_id: projectId,
                  thread_id: conversationId,
                } as unknown as Prisma.InputJsonValue,
                routeSelection: selection,
                executionCommandHash: commandHash,
                toolPermissions: ['project.read'],
                workspaceSources: [],
              },
            },
          });
        } else if (route.effective === 'MCP_EVENTS') {
          const {
            requested_executor: _executor,
            model: _model,
            reasoning: _reasoning,
            searchMode: _searchMode,
            publicQuery: _query,
            runMode: _runMode,
            ...job
          } = input;
          void [_executor, _model, _reasoning, _searchMode, _query, _runMode];
          answer = await this.jobs.create(
            actor,
            projectId,
            conversationId,
            job,
            tx,
            requestId,
          );
        } else {
          if (!input.model)
            throw new ConflictException('SIWC_MODEL_OR_CONNECTION_REQUIRED');
          if (input.sourceIds.length > 3)
            throw new BadRequestException('SIWC_SELECTED_FILE_LIMIT');
          const { requested_executor: _requested, ...question } = input;
          void _requested;
          answer = await this.ai.ask(
            actor,
            projectId,
            conversationId,
            {
              ...question,
              runMode: input.runMode ?? 'NORMAL',
            } as ChatAiQuestionDto,
            { tx, grantId },
          );
        }
        const saved = await tx.chatAiAnswer.findUniqueOrThrow({
          where: { id: answer.id },
        });
        const usage = saved.usage as Prisma.InputJsonObject | null;
        await tx.chatAiAnswer.update({
          where: { id: answer.id },
          data: {
            usage: {
              ...usage,
              routeSelection: selection,
              executionCommandHash: commandHash,
              executionTrace: usage?.executionTrace ?? {
                request_id: requestId ?? null,
                message_id: answer.id,
                job_id: route.effective === 'MCP_EVENTS' ? answer.id : null,
                received_at: receivedAt,
                routing_duration_ms: routingDurationMs,
                prepared_at: new Date().toISOString(),
              },
            },
          },
        });
        return {
          id: answer.id,
          status: answer.status,
          route: route.effective,
          ...selection,
        };
      },
    );
  }
}
