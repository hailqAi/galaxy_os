import { z } from 'zod';
import type { CurrentActor } from '../access-control/current-actor';
import { createHash } from 'node:crypto';
import { chatGptInputItem, chatGptFunctionCall } from './ai-chatgpt-plan';
import {
  toolSourceSchema,
  toolSourcesSchema,
  memoryCitationSchema,
  toolInputs,
  pdfCoverageLedger,
  xlsxCoverageLedger,
  type ToolSource,
  type ToolName,
} from './ai-tools';
import { AiError, consumedContextSchema, requestMetadata } from './ai-registry';
import { memoryDigest } from './project-ai-memory.service';

export const artifactImageSourcesSchema = z
  .array(
    z
      .object({
        sourceId: z.string().uuid(),
        version: z.string().min(1).max(100),
        checksum: z.string().regex(/^[a-f0-9]{64}$/),
        page: z.number().int().positive().max(2_147_483_647).nullable(),
        imageChecksum: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict(),
  )
  .max(3);

export const runProgressSchema = z.object({
  toolSources: toolSourcesSchema,
  toolPermissions: toolSourceSchema.shape.permissions,
  memoryCitations: z.array(memoryCitationSchema).max(64),
  sourceCitations: z.array(z.string().regex(/^[ST]_[a-f0-9]{24}$/)).max(64),
  documentReadIssues: z
    .array(
      z
        .object({
          sourceId: z.string().uuid(),
          version: z.string().min(1).max(100),
          checksum: z.string().regex(/^[a-f0-9]{64}$/),
          page: z.number().int().positive().max(2_147_483_647).nullable(),
          code: z.enum([
            'PDF_SCAN_REQUIRES_VISION',
            'SOURCE_TEXT_UNAVAILABLE',
            'INPUT_BUDGET_EXCEEDED',
            'TOOL_CONTEXT_LIMIT',
            'XLSX_COVERAGE_PENDING',
            'TOOL_OUTPUT_TOO_LARGE',
            'WORKBOOK_READ_UNAVAILABLE',
          ]),
        })
        .strict(),
    )
    .max(20)
    .optional(),
  execution: consumedContextSchema.optional(),
  toolExecutions: z
    .array(
      z
        .object({
          name: z.enum(Object.keys(toolInputs) as [ToolName, ...ToolName[]]),
          callId: z.string().min(1).max(200),
          status: z.enum(['OK', 'ERROR']),
          errorCode: z.string().max(100).optional(),
          durationMs: z.number().nonnegative(),
          reused: z.boolean().optional(),
        })
        .strict(),
    )
    // Recent forty plus at most 120 existing media-proof receipts; not a run total.
    .max(40 + 120),
  siwcRequests: z
    .array(
      z
        .object({
          sequence: z.number().int().nonnegative().optional(),
          startedAt: z.iso.datetime(),
          durationMs: z.number().nonnegative(),
          requestId: z.string().max(200).nullable(),
          model: z.string().max(200),
          requestedModel: z.string().max(200),
          requestedEffort: z.string().max(20),
          sentModel: z.string().max(200),
          sentEffort: z.string().max(20).nullable(),
          observedModel: z.string().max(200),
          observedEffort: z.string().max(20).nullable(),
          status: z.enum(['ACCEPTED', 'MISMATCH']),
          evidenceLevel: z.enum(['PROVIDER_REPORTED', 'REQUEST_ACCEPTED']),
        })
        .strict(),
    )
    .max(10),
  publicWeb: z
    .object({
      status: z.literal('LIVE_TOOL_VERIFIED'),
      queryAuthorizationHash: z.string().regex(/^[a-f0-9]{64}$/),
      searches: z.number().int().positive(),
      actions: z.array(z.record(z.string(), z.json())).max(640),
      citations: z
        .array(
          z
            .object({
              url: z.string().url().max(2048),
              title: z.string().max(1000),
            })
            .strict(),
        )
        .max(20),
      requestId: z.string().max(200).nullable(),
      pageReads: z
        .array(
          z
            .object({
              url: z.string().url().max(2048),
              status: z.enum(['READ_PAGE', 'NOT_READ']),
              errorCode: z.string().max(100).nullable(),
            })
            .strict(),
        )
        .max(20),
      policyVersion: z.string().max(100).optional(),
      subject: z.string().max(100).optional(),
      topic: z.string().max(100).optional(),
      queries: z
        .array(
          z
            .object({
              queryAuthorizationHash: z.string().regex(/^[a-f0-9]{64}$/),
              requestId: z.string().max(200).nullable(),
              searches: z.number().int().positive(),
              subject: z.string().max(100).optional(),
              topic: z.string().max(100).optional(),
            })
            .strict(),
        )
        .max(10)
        .optional(),
    })
    .strict()
    .optional(),
  siwcMedia: z
    .array(
      z
        .object({
          callId: z.string().min(1).max(200),
          sourceIndexId: z.string().uuid(),
          handle: z.string().regex(/^T_[a-f0-9]{24}$/),
          mime: z.enum(['application/pdf', 'image/png', 'image/jpeg']),
          bytes: z.number().int().positive().max(8_000_000),
          sentHash: z.string().regex(/^[a-f0-9]{64}$/),
          representation: z.enum(['original', 'image']),
          page: z.number().int().positive().max(2_147_483_647).nullable(),
          status: z.enum(['PREPARED', 'ACCEPTED']),
          requestId: z.string().max(200).nullable().optional(),
          requestedModel: z.string().max(200).optional(),
          requestedEffort: z.string().max(20).optional(),
          observedModel: z.string().max(200).optional(),
          observedEffort: z.string().max(20).nullable().optional(),
        })
        .strict(),
    )
    .max(120)
    .optional(),
  artifacts: z
    .array(
      z
        .object({
          toolKey: z.string().min(1).max(200),
          sourceId: z.string().uuid(),
          fileAssetId: z.string().uuid(),
          version: z.string().min(1).max(100),
          filename: z.string().min(1).max(240),
          sizeBytes: z.number().int().positive().max(10_000_000_000),
          format: z.enum(['docx', 'xlsx', 'pptx', 'pdf']),
          provenance: z.literal('AI_DRAFT'),
          downloadUrl: z
            .string()
            .regex(
              /^\/api\/v1\/project-chat\/projects\/[a-f0-9-]+\/ai\/files\/[a-f0-9-]+\/download$/,
            ),
          predecessor: z
            .object({
              sourceId: z.string().uuid(),
              version: z.string().max(100),
            })
            .strict()
            .nullable(),
          diff: z
            .object({
              added: z.array(z.string()),
              removed: z.array(z.string()),
              coverage: z.string(),
              truncated: z.boolean().optional(),
            })
            .strict()
            .nullable(),
          imageSources: artifactImageSourcesSchema.optional(),
        })
        .strict(),
    )
    .max(3)
    .optional(),
});

export function assertTaskSource(usage: unknown, sourceId: string) {
  const pin = requestMetadata(usage);
  if (pin?.version !== 4 || pin.task?.taskType !== 'CONVERT_DOCUMENT') return;
  if (pin.task.primarySourceIds.includes(sourceId)) return;
  const artifacts = runProgressSchema.shape.artifacts.safeParse(
    usage && typeof usage === 'object' && 'artifacts' in usage
      ? usage.artifacts
      : undefined,
  );
  if (
    artifacts.success &&
    artifacts.data?.some((file) => file.sourceId === sourceId)
  )
    return;
  throw new AiError('SOURCE_NOT_SELECTED');
}

export const sourceMediaSchema = z
  .object({
    type: z.literal('source_media'),
    sourceId: z.string().uuid(),
    version: z.string().min(1).max(100),
    checksum: z.string().regex(/^[a-f0-9]{64}$/),
    mime: z.enum(['application/pdf', 'image/png', 'image/jpeg']),
    sentHash: z.string().regex(/^[a-f0-9]{64}$/),
    representation: z.enum(['original', 'image']),
    page: z.number().int().positive().max(2_147_483_647).nullable(),
  })
  .strict();
export type SourceMediaRef = z.infer<typeof sourceMediaSchema>;

const checkpointItem = z.union([
  chatGptInputItem.refine(
    (item) =>
      !('type' in item && item.type === 'reasoning') &&
      !(
        'content' in item &&
        Array.isArray(item.content) &&
        item.content.some(
          (part) => part.type === 'input_file' || part.type === 'input_image',
        )
      ),
  ),
  z
    .object({
      role: z.literal('user'),
      content: z
        .array(
          z.union([
            z
              .object({
                type: z.literal('input_text'),
                text: z.string().min(1).max(256000),
              })
              .strict(),
            sourceMediaSchema,
          ]),
        )
        .min(1)
        .max(4),
    })
    .strict(),
]);
const checkpointInput = z
  .array(checkpointItem)
  .min(1)
  .max(64)
  .refine((items) => Buffer.byteLength(JSON.stringify(items)) <= 280000);
const checkpointSchema = z
  .object({
    proofDigest: z.string().regex(/^[a-f0-9]{64}$/),
    stage: z.enum(['READY', 'TOOLS', 'FINAL']),
    input: checkpointInput,
    pendingCalls: z.array(chatGptFunctionCall).max(40),
    final: z
      .object({
        text: z.string().min(1).max(512000),
        model: z.string().min(1).max(200),
        reasoningEffort: z.string().max(20).nullable(),
        usage: z.json().nullable(),
      })
      .strict()
      .nullable(),
  })
  .strict()
  .refine((checkpoint) =>
    checkpoint.stage === 'FINAL'
      ? Boolean(checkpoint.final) && checkpoint.pendingCalls.length === 0
      : !checkpoint.final &&
        (checkpoint.stage === 'TOOLS' || !checkpoint.pendingCalls.length),
  );
export type RunCheckpoint = z.infer<typeof checkpointSchema>;

export function runProofDigest(input: RunCheckpoint['input'], value: unknown) {
  const progress = runProgressSchema.parse(value);
  const parts = input.flatMap((item) =>
    'role' in item && item.role === 'user' && Array.isArray(item.content)
      ? item.content.filter((part) => part.type === 'source_media')
      : [],
  );
  const receipts = progress.siwcMedia ?? [];
  if (parts.length !== receipts.length) throw new AiError('RUN_STATE_INVALID');
  for (const [position, part] of parts.entries()) {
    const receipt = receipts[position]!;
    const file = progress.toolSources.find(
      (source) => source.handle === receipt.handle,
    )?.file;
    const call = input.find(
      (item) =>
        'type' in item &&
        item.type === 'function_call' &&
        item.call_id === receipt.callId,
    );
    let args: z.infer<typeof toolInputs.read_project_source> | null = null;
    if (call && 'arguments' in call) {
      try {
        const parsed = toolInputs.read_project_source.safeParse(
          JSON.parse(call.arguments),
        );
        if (parsed.success) args = parsed.data;
      } catch {
        throw new AiError('RUN_STATE_INVALID');
      }
    }
    if (
      !file ||
      !call ||
      !('name' in call) ||
      call.name !== 'read_project_source' ||
      call.namespace !== 'galaxy' ||
      !args ||
      args.sourceId !== part.sourceId ||
      args.representation !== part.representation ||
      (file.representation === 'PDF_PAGE' && (args.page ?? 1) !== part.page) ||
      !progress.toolExecutions.some(
        (execution) =>
          execution.callId === receipt.callId &&
          execution.name === 'read_project_source' &&
          execution.status === 'OK',
      ) ||
      !input.some(
        (item) =>
          'type' in item &&
          item.type === 'function_call_output' &&
          item.call_id === receipt.callId,
      ) ||
      !['PDF_ORIGINAL', 'PDF_PAGE', 'IMAGE_ORIGINAL'].includes(
        file.representation ?? '',
      ) ||
      receipt.sourceIndexId !== part.sourceId ||
      file.sourceIndexId !== part.sourceId ||
      file.version !== part.version ||
      file.checksum !== part.checksum ||
      receipt.mime !== part.mime ||
      receipt.sentHash !== part.sentHash ||
      receipt.representation !== part.representation ||
      (file.representation === 'PDF_ORIGINAL') !==
        (part.representation === 'original') ||
      (file.representation === 'PDF_ORIGINAL') !==
        (part.mime === 'application/pdf') ||
      (file.representation === 'PDF_PAGE' ? file.page : null) !== part.page ||
      (file.representation === 'PDF_PAGE' && receipt.page !== part.page)
    )
      throw new AiError('RUN_STATE_INVALID');
  }
  const proofs: unknown[] = [
    input,
    progress.toolSources,
    progress.toolPermissions,
    progress.memoryCitations,
    progress.sourceCitations,
    progress.execution ?? null,
    receipts,
  ];
  const localImages = (progress.artifacts ?? [])
    .filter((artifact) => artifact.imageSources?.length)
    .map((artifact) => [
      artifact.toolKey,
      artifact.sourceId,
      artifact.version,
      artifact.imageSources,
    ]);
  if (localImages.length) proofs.push(localImages);
  if (progress.documentReadIssues?.length)
    proofs.push(progress.documentReadIssues);
  return createHash('sha256').update(JSON.stringify(proofs)).digest('hex');
}

export function snapshotRunInput(
  input: unknown[],
  mediaRefs: Omit<SourceMediaRef, 'type'>[],
) {
  let mediaPosition = 0;
  const saved = input
    .filter(
      (item) =>
        !(
          item &&
          typeof item === 'object' &&
          'type' in item &&
          item.type === 'reasoning'
        ),
    )
    .map((item) => {
      if (
        !item ||
        typeof item !== 'object' ||
        !('role' in item) ||
        item.role !== 'user' ||
        !('content' in item) ||
        !Array.isArray(item.content)
      )
        return item;
      return {
        ...item,
        content: item.content.map((part: unknown) => {
          if (
            !part ||
            typeof part !== 'object' ||
            !('type' in part) ||
            (part.type !== 'input_file' && part.type !== 'input_image')
          )
            return part;
          const data =
            'file_data' in part
              ? part.file_data
              : 'image_url' in part
                ? part.image_url
                : null;
          if (
            typeof data !== 'string' ||
            !/^data:(application\/pdf|image\/(png|jpeg));base64,/.test(data)
          )
            throw new AiError('RUN_STATE_INVALID');
          const sha = createHash('sha256')
            .update(Buffer.from(data.slice(data.indexOf(',') + 1), 'base64'))
            .digest('hex');
          const ref = mediaRefs[mediaPosition++];
          if (
            !ref ||
            ref.sentHash !== sha ||
            !data.startsWith('data:' + ref.mime + ';')
          )
            throw new AiError('RUN_STATE_INVALID');
          return sourceMediaSchema.parse({ type: 'source_media', ...ref });
        }),
      };
    });
  if (mediaPosition !== mediaRefs.length)
    throw new AiError('RUN_STATE_INVALID');
  return checkpointInput.parse(saved);
}

const actorIds = z
  .object({
    userId: z.string().uuid(),
    organizationId: z.string().uuid(),
    organizationMembershipId: z.string().uuid(),
    sessionId: z.string().uuid(),
  })
  .strict();

export function snapshotActor(actor: CurrentActor) {
  return actorIds.parse({
    userId: actor.userId,
    organizationId: actor.organizationId,
    organizationMembershipId: actor.organizationMembershipId,
    sessionId: actor.sessionId,
  });
}

export function restoreActor(value: unknown): CurrentActor {
  return {
    ...actorIds.parse(value),
    email: '',
    displayName: '',
    mustChangePassword: false,
    permissions: [],
    permissionSources: [],
    administrationScope: 'SELF',
    managedDepartmentIds: [],
    administrationTier: 0,
  };
}

export const runWorkflowSchema = z
  .object({
    version: z.literal(1),
    mode: z.enum(['NORMAL', 'DEEP']),
    actor: actorIds,
    queuedAt: z.iso.datetime(),
    deadlineAt: z.iso.datetime().nullable(),
    heartbeatAt: z.iso.datetime().nullable(),
    phase: z.enum([
      'QUEUED',
      'READING',
      'RETRIEVING',
      'REQUESTING',
      'TOOLS',
      'VERIFYING',
      'FINISHED',
    ]),
    attempts: z.number().int().min(0).max(3),
    providerRounds: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    toolCalls: z.number().int().nonnegative().optional(),
    recentToolResults: z
      .array(
        z
          .object({
            fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
            repeats: z.number().int().min(1).max(3),
          })
          .strict(),
      )
      .max(40)
      .optional(),
    dispatchState: z.enum(['SAFE', 'DISPATCHING']),
    checkpoint: checkpointSchema.optional(),
  })
  .strict()
  .refine(
    (run) =>
      run.deadlineAt === null ||
      Date.parse(run.deadlineAt) - Date.parse(run.queuedAt) ===
        (run.mode === 'DEEP' ? 1_800_000 : 300_000),
  );
export type RunWorkflow = z.infer<typeof runWorkflowSchema>;

export function recordToolProgress(
  run: RunWorkflow,
  name: string,
  args: string,
  output: unknown,
  versions: unknown[],
): boolean {
  const parse = (value: unknown): unknown => {
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  };
  const stable = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(stable)
      : value && typeof value === 'object'
        ? Object.fromEntries(
            Object.entries(value)
              .filter(
                ([key]) =>
                  ![
                    'createdAt',
                    'computedAt',
                    'durationMs',
                    'callId',
                    'requestId',
                    'reused',
                  ].includes(key),
              )
              .map(([key, item]) => [key, stable(item)]),
          )
        : value;
  const fingerprint = memoryDigest([
    name,
    parse(args),
    stable(parse(output)),
    [...new Set(versions.map((version) => memoryDigest(version)))].sort(),
  ]);
  const recent = run.recentToolResults ?? [];
  const prior = recent.find((item) => item.fingerprint === fingerprint);
  const repeats = Math.min(3, (prior?.repeats ?? 0) + 1);
  run.recentToolResults = [
    ...recent.filter((item) => item.fingerprint !== fingerprint),
    { fingerprint, repeats },
  ].slice(-40);
  return repeats < 3;
}

export function runExpired(run: RunWorkflow | null): boolean {
  return !!run?.deadlineAt && Date.parse(run.deadlineAt) <= Date.now();
}

// The caller rechecks the saved run's source ACL/version proofs before reuse.
export function reusedSourceRead(
  args: unknown,
  sources: ToolSource[],
): string | undefined {
  const read = toolInputs.read_project_source.parse(args);
  if (
    read.representation !== 'text' ||
    read.cursor ||
    (read.startLine ?? 1) !== 1
  )
    return;
  const source = sources.find(
    (source) =>
      source.file?.sourceIndexId === read.sourceId &&
      source.file.page === (read.page ?? 1) &&
      source.file.representation === 'PDF_TEXT_PAGE' &&
      source.file.textPageCoverage?.complete,
  );
  if (!source?.file) return;
  return JSON.stringify({
    status: 'ALREADY_DELIVERED',
    sourceId: read.sourceId,
    version: source.file.version,
    checksum: source.file.checksum,
    page: source.file.page,
    text: source.text,
    coverage: source.file.textPageCoverage,
    next: 'This data has already been provided. Resolve a specific missing requirement or create/verify the requested output; do not repeat this read.',
  });
}

export function canResumeDeadlineRun(
  status: string,
  errorCode: string | null,
  run: RunWorkflow | null,
): boolean {
  return (
    ((status === 'PARTIAL' && errorCode === 'RUN_DEADLINE') ||
      (status === 'FAILED' &&
        ['TOOL_ROUND_LIMIT', 'TOOL_CALL_LIMIT'].includes(errorCode ?? ''))) &&
    !!run &&
    run.attempts < 3 &&
    !!run.checkpoint &&
    (run.checkpoint.stage === 'READY' || run.checkpoint.stage === 'FINAL') &&
    run.checkpoint.pendingCalls.length === 0
  );
}

export function queuedRun(
  actor: CurrentActor,
  mode: RunWorkflow['mode'],
): RunWorkflow {
  const now = new Date();
  return {
    version: 1,
    mode,
    actor: snapshotActor(actor),
    queuedAt: now.toISOString(),
    deadlineAt: null,
    heartbeatAt: null,
    phase: 'QUEUED',
    attempts: 0,
    providerRounds: 0,
    dispatchState: 'SAFE',
  };
}

export function workflowMetadata(value: unknown): RunWorkflow | null {
  const parsed = z.object({ workflow: runWorkflowSchema }).safeParse(value);
  return parsed.success ? parsed.data.workflow : null;
}

export function partialRunText(
  completedTools: number,
  sources: ToolSource[] = [],
  savedFinalText: string | null = null,
  queued = false,
) {
  if (savedFinalText) return savedFinalText;
  if (queued)
    return 'Lượt chat đã hết thời gian trong hàng đợi và chưa bắt đầu xử lý; chưa hoàn tất yêu cầu. Câu hỏi đã được lưu, chưa gửi yêu cầu tới nhà cung cấp.';
  const coverage = [
    ...pdfCoverageLedger(sources).map(
      (row) =>
        `${row.label}: ${row.pagesTotal === null ? 'độ bao phủ trang chưa xác minh' : `đã trích đủ chữ ${row.completeTextPages.length}/${row.pagesTotal} trang`}.`,
    ),
    ...xlsxCoverageLedger(sources).map(
      (row) =>
        `${row.label}: ${row.textCoverage === 'UNKNOWN' ? 'độ bao phủ sheet chưa xác minh' : `đã trích đủ ${row.sheets.filter((sheet) => sheet.textCoverage === 'FULL').length}/${row.sheets.length} sheet`}.`,
    ),
  ];
  return [
    'Đã hết ngân sách thời gian của lượt này. Kết quả hiện có là một phần; chưa hoàn tất yêu cầu.',
    completedTools
      ? `Đã hoàn thành ${completedTools} lần gọi công cụ.`
      : 'Chưa có bước công cụ nào hoàn tất.',
    ...coverage,
    ...(sources.length ? ['Các nguồn và file đã tạo được giữ kèm theo.'] : []),
    ...(sources.some((source) => source.file)
      ? [
          'Phạm vi AI đã đọc chưa xác minh; phần tài liệu chưa có bằng chứng đọc vẫn chưa được kiểm tra.',
        ]
      : []),
  ].join('\n\n');
}
