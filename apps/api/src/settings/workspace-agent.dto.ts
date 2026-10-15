import { z } from 'zod';
export const workspaceBindingInput = z
  .object({
    id: z.string().uuid(),
    projectId: z.string().uuid(),
    requestedModel: z.string().min(1).max(200),
    configuredModel: z.string().min(1).max(200),
    maxRunsPerDay: z.number().int().min(1).max(20).default(3),
    effort: z.enum(['default', 'low', 'medium', 'high', 'xhigh']),
    agentId: z
      .string()
      .regex(/^agt_[A-Za-z0-9_-]+$/)
      .max(200),
    channelId: z
      .string()
      .regex(/^agtch_[A-Za-z0-9_-]+$/)
      .max(200),
  })
  .strict();
export const workspaceConfigInput = z
  .object({
    expectedVersion: z.string().uuid().nullable(),
    workspaceId: z.string().min(1).max(200),
    accessToken: z
      .string()
      .min(16)
      .max(32000)
      .regex(/^[!-~]+$/)
      .optional(),
    bindings: z.array(workspaceBindingInput).min(1).max(20),
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.bindings.map((b) => b.id)).size === value.bindings.length &&
      new Set(value.bindings.map((b) => b.channelId)).size ===
        value.bindings.length &&
      new Set(value.bindings.map((b) => b.agentId)).size ===
        value.bindings.length,
    'Duplicate binding, agent or channel',
  );
export type WorkspaceConfigInput = z.infer<typeof workspaceConfigInput>;
