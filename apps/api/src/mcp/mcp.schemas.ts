import { z } from 'zod';

export const MCP_SCOPES = [
  'galaxy.jobs.read',
  'galaxy.jobs.write',
  'galaxy.events',
  'galaxy.data.read',
  'galaxy.data.write',
];
export const MCP_EVENT = 'galaxy.ai_job.created';
export const jobId = z.string().uuid();
export const httpsUrl = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === 'https:' && !url.username && !url.password && !url.hash
    );
  });
export const fileReference = z
  .object({
    download_url: httpsUrl,
    file_id: z.string().min(1).max(512),
    mime_type: z.string().min(1).max(200).optional(),
    file_name: z.string().min(1).max(255).optional(),
  })
  .strict();
export const resultInput = z
  .object({
    job_id: jobId,
    attempt: z.number().int().positive(),
    submission_id: z.string().min(1).max(200),
    artifact_id: jobId.optional(),
    supersede_failed_artifact_ids: z.array(jobId).min(1).optional(),
    sequence: z.number().int().nonnegative().optional(),
    content: z.string().min(1).max(120000).optional(),
    files: z.array(fileReference).optional(),
    finalize: z.boolean(),
  })
  .strict()
  .refine((value) => !value.artifact_id || value.files?.length === 1, {
    message:
      'Refreshing an artifact requires exactly one native file reference.',
  })
  .refine(
    (value) =>
      !value.supersede_failed_artifact_ids ||
      (!!value.artifact_id &&
        new Set(value.supersede_failed_artifact_ids).size ===
          value.supersede_failed_artifact_ids.length &&
        !value.supersede_failed_artifact_ids.includes(value.artifact_id)),
    {
      message:
        'Replacing failed references requires one distinct artifact_id and unique failed receipt ids.',
    },
  )
  .refine(
    (value) => (value.content !== undefined) === (value.sequence !== undefined),
    {
      message: 'Text parts require both sequence and content.',
    },
  );
export const jobStages = z.enum([
  'WAITING_SUBSCRIPTION',
  'WAITING_NOTIFICATION',
  'NOTIFIED',
  'PROCESSING',
  'RECEIVING_FILES',
  'NEEDS_INPUT',
  'COMPLETED',
  'ERROR',
  'CANCELLED',
]);
export const progressInput = z
  .object({
    job_id: jobId,
    attempt: z.number().int().positive(),
    operation_id: z.string().min(1).max(200),
    stage: z.enum(['PROCESSING', 'NEEDS_INPUT', 'RECEIVING_FILES', 'ERROR']),
    message: z.string().max(4000).optional(),
  })
  .strict();
export const eventArguments = z
  .object({ project_id: jobId.optional() })
  .strict();
export const subscriptionIdentity = z
  .object({
    name: z.literal(MCP_EVENT),
    arguments: eventArguments.default({}),
    delivery: z.object({ mode: z.literal('webhook'), url: httpsUrl }).strict(),
  })
  .strict();
export const subscriptionInput = z
  .object({
    name: z.literal(MCP_EVENT),
    arguments: eventArguments.default({}),
    delivery: z
      .object({
        mode: z.literal('webhook'),
        url: httpsUrl,
        secret: z.string().refine((value) => {
          if (!/^whsec_[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
          const bytes = Buffer.from(value.slice(6), 'base64');
          return (
            bytes.length >= 24 &&
            bytes.length <= 64 &&
            bytes.toString('base64').replace(/=+$/, '') ===
              value.slice(6).replace(/=+$/, '')
          );
        }),
      })
      .strict(),
    cursor: z.null().optional(),
    ttlMs: z.number().int().positive().nullable().optional(),
  })
  .strict();
export const mcpJob = z
  .object({
    version: z.literal(1),
    state: jobStages,
    originalMessageId: jobId,
    actor: z
      .object({
        userId: jobId,
        organizationId: jobId,
        organizationMembershipId: jobId,
      })
      .strict(),
    context: z.record(z.string(), z.unknown()),
    sourceIds: z.array(jobId),
    requestedOutputs: z.array(z.string()),
    createdAt: z.string().datetime(),
    progress: z.string().optional(),
    updatedAt: z.string().datetime().optional(),
    errorCode: z.string().optional(),
    submissionId: z.string().optional(),
    resultChecksum: z.string().optional(),
    notificationGeneration: z.number().int().nonnegative().default(0),
  })
  .strict();
export type McpJob = z.infer<typeof mcpJob>;

export const mcpArtifactOutput = z
  .object({
    toolKey: z.string(),
    sourceId: jobId,
    fileAssetId: jobId,
    version: z.string(),
    filename: z.string(),
    sizeBytes: z.number().int().positive(),
    format: z.string(),
    provenance: z.literal('AI_DRAFT'),
    downloadUrl: z
      .string()
      .regex(
        /^\/api\/v1\/project-chat\/projects\/[a-f0-9-]+\/ai\/files\/[a-f0-9-]+\/download$/,
      ),
    predecessor: z.null(),
    diff: z.null(),
  })
  .strict();

export function jobMetadata(usage: unknown): McpJob | null {
  const parsed = z.object({ mcp: mcpJob }).safeParse(usage);
  return parsed.success ? parsed.data.mcp : null;
}
