import {
  closeSync,
  constants,
  fstatSync,
  openSync,
  readFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { z } from 'zod';

export const AI_MODELS = [
  {
    id: 'gemini-3.8-flash',
    provider: 'google_gemini',
    label: 'Gemini 3.8 Flash',
    providerLabel: 'Google Gemini',
    host: 'generativelanguage.googleapis.com',
    keyName: 'GEMINI_API_KEY',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/interactions',
    reasoning: ['default', 'low', 'medium', 'high'],
    contextLimit: 1048576,
    outputLimit: 65536,
    nativeMedia: true,
  },
  {
    id: 'mistral-medium-3-5',
    provider: 'mistral',
    label: 'Mistral Medium 3.5',
    providerLabel: 'Mistral',
    host: 'api.mistral.ai',
    keyName: 'MISTRAL_API_KEY',
    endpoint: 'https://api.mistral.ai/v1/chat/completions',
    reasoning: ['default', 'none', 'high'],
    contextLimit: null,
    outputLimit: 32768,
    nativeMedia: false,
  },
  {
    id: 'kira-3.5-pro',
    provider: 'kira',
    label: 'Kira 3.5 Pro',
    providerLabel: 'Kira',
    host: 'kiraai.vn',
    keyName: 'KIRA_API_KEY',
    endpoint: 'https://kiraai.vn/api/v1/chat/completions',
    reasoning: ['default'],
    contextLimit: null,
    outputLimit: 8192,
    nativeMedia: false,
  },
] as const;
export type AiProvider = (typeof AI_MODELS)[number]['provider'];
export class AiError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
const settings = z
  .object({
    revision: z.string().min(1).max(100),
    GEMINI_API_KEY: z.string().min(1).max(4096).optional(),
    MISTRAL_API_KEY: z.string().min(1).max(4096).optional(),
    KIRA_API_KEY: z.string().min(1).max(4096).optional(),
    replacementConfirmed: z.boolean().default(false),
    enabled: z.boolean().default(false),
    modelAccessVerified: z.boolean().default(false),
    textLiveVerified: z.boolean().default(false),
    imageLiveVerified: z.boolean().default(false),
    pdfLiveVerified: z.boolean().default(false),
    lastTest: z
      .enum([
        'NOT_RUN',
        'PASS',
        'INVALID_KEY',
        'MODEL_UNAVAILABLE',
        'RATE_LIMITED',
        'TEMPORARY_ERROR',
      ])
      .default('NOT_RUN'),
    dataPolicy: z.literal('SYNTHETIC_PUBLIC_APPROVED'),
    maxRequestsPerDay: z
      .number()
      .int()
      .min(1)
      .max(100000)
      .nullable()
      .default(null),
    maxConcurrent: z.number().int().min(1).max(4).default(1),
    maxOutputTokens: z.number().int().min(256).max(65536).default(8192),
    approvedProjects: z
      .array(
        z
          .object({
            organizationId: z.string().min(1),
            projectId: z.string().min(1),
          })
          .strict(),
      )
      .max(100)
      .default([]),
    approvedSources: z
      .array(
        z
          .object({ id: z.string().min(1), version: z.string().min(1) })
          .strict(),
      )
      .max(1000)
      .default([]),
  })
  .strict();
export type AiSettings = z.infer<typeof settings>;
export type AiConfig = Partial<Record<AiProvider, AiSettings>>;

// Đọc tại mỗi gate: thay khóa/policy không cần restart Web hoặc API.
export function readAiConfig(
  env: Record<string, string | undefined> = process.env,
): AiConfig {
  const path = env.GALAXY_AI_CONFIG_FILE;
  if (!path || !path.startsWith('/')) return {};
  let fd: number | undefined;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = fstatSync(fd);
    if (
      !stat.isFile() ||
      stat.size > 262144 ||
      stat.mode & 0o077 ||
      stat.uid !== process.getuid?.()
    )
      return {};
    const document: unknown = JSON.parse(readFileSync(fd, 'utf8'));
    const root = z
      .object({ providers: z.record(z.string(), z.unknown()) })
      .strict()
      .safeParse(document);
    if (!root.success) return {};
    const result: AiConfig = {};
    for (const model of AI_MODELS) {
      const parsed = settings.safeParse(root.data.providers[model.provider]);
      if (parsed.success) result[model.provider] = parsed.data;
    }
    return result;
  } catch {
    return {};
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

export function configuredModel(
  config: Partial<Record<AiProvider, unknown>>,
  id: string,
) {
  const model = AI_MODELS.find((m) => m.id === id);
  if (!model) throw new AiError('MODEL_UNAVAILABLE');
  const result = settings.safeParse(config[model.provider]);
  if (!result.success) throw new AiError('NOT_CONFIGURED');
  const state = result.data;
  const key = state[model.keyName];
  if (!key || !state.replacementConfirmed) throw new AiError('NOT_CONFIGURED');
  if (!state.enabled) throw new AiError('MODEL_DISABLED');
  if (state.maxOutputTokens > model.outputLimit)
    throw new AiError('INVALID_CONFIG');
  return {
    ...model,
    ...state,
    key,
    model: model.id,
    configDigest: createHash('sha256')
      .update(JSON.stringify(state))
      .digest('hex'),
  };
}
export type ConfiguredModel = ReturnType<typeof configuredModel>;
export function assertEgress(
  config: ConfiguredModel,
  organizationId: string,
  projectId: string,
  classification: string | undefined,
  sources: { id: string; version: string }[],
) {
  if (
    classification !== config.dataPolicy ||
    !config.approvedProjects.some(
      (p) => p.organizationId === organizationId && p.projectId === projectId,
    ) ||
    sources.some(
      (s) =>
        !config.approvedSources.some(
          (a) => a.id === s.id && a.version === s.version,
        ),
    )
  )
    throw new AiError('DATA_POLICY_BLOCKED');
}
export function modelChoices(
  config: Partial<Record<AiProvider, unknown>>,
  organizationId: string,
  projectId: string,
) {
  return AI_MODELS.map((model) => {
    const parsed = settings.safeParse(config[model.provider]);
    const state = parsed.success ? parsed.data : undefined;
    let reason: string | null = null;
    try {
      assertEgress(
        configuredModel(config, model.id),
        organizationId,
        projectId,
        'SYNTHETIC_PUBLIC_APPROVED',
        [],
      );
    } catch (error) {
      reason = error instanceof AiError ? error.code : 'INVALID_CONFIG';
    }
    return {
      id: model.id,
      provider: model.provider,
      label: model.label,
      providerLabel: model.providerLabel,
      host: model.host,
      available: reason === null,
      reason,
      published: true,
      adapterImplemented: true,
      accountVisible: state?.modelAccessVerified ?? false,
      adminEnabled: state?.enabled ?? false,
      credentialConfigured: Boolean(
        state?.[model.keyName] && state.replacementConfirmed,
      ),
      revision: state?.revision ?? null,
      dataPolicy: 'SYNTHETIC_PUBLIC_APPROVED',
      textLiveVerified: state?.textLiveVerified ?? false,
      lastTest: state?.lastTest ?? 'NOT_RUN',
      capabilities: {
        text: true,
        documentTextFallback: ['text/plain'],
        imageInput: model.nativeMedia && Boolean(state?.imageLiveVerified),
        pdfInput: model.nativeMedia && Boolean(state?.pdfLiveVerified),
        nativeMediaImplemented: model.nativeMedia,
        structuredOutput:
          model.provider !== 'kira' ? 'DOCUMENTED' : 'PROMPT_AND_VALIDATION',
        reasoningModes: [...model.reasoning],
        streaming: false,
        contextLimit: model.contextLimit,
        outputLimit: model.outputLimit,
        evidence: 'DOCUMENTED_NOT_LIVE',
      },
      limits: {
        requestsPerDay: state?.maxRequestsPerDay ?? null,
        concurrent: state?.maxConcurrent ?? 1,
        outputTokens: state?.maxOutputTokens ?? 8192,
        inputBytes: 64000,
      },
    };
  });
}

const requestSchema = z.object({
  version: z.literal(1),
  provider: z.enum(['google_gemini', 'mistral', 'kira']),
  model: z.string(),
  revision: z.string(),
  configDigest: z.string(),
  reasoning: z.string(),
  dataClassification: z.literal('SYNTHETIC_PUBLIC_APPROVED'),
  sourceIds: z.array(z.string()).default([]),
});
export type AiRequestMetadata = z.infer<typeof requestSchema>;
export function requestMetadata(value: unknown): AiRequestMetadata | null {
  const parsed = z.object({ request: requestSchema }).safeParse(value);
  return parsed.success ? parsed.data.request : null;
}
