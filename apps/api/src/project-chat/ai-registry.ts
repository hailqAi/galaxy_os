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
  constructor(
    readonly code: string,
    readonly httpStatus: number | null = null,
  ) {
    super(code);
  }
}
export const activationEvidence = z
  .object({
    revision: z.string().min(1).max(100),
    provider: z.enum(['google_gemini', 'mistral', 'kira']),
    requestedModel: z.string().max(100),
    returnedModel: z.string().max(200).nullable(),
    capability: z.enum(['text', 'image', 'pdf']),
    fixtureVersion: z.literal('galaxy-ai-activation-v1'),
    testedAt: z.string().datetime(),
    requestId: z.string().uuid(),
    result: z.string().regex(/^[A-Z_]{1,80}$/),
    httpStatus: z.number().int().min(100).max(599).nullable(),
    usage: z
      .object({
        input_tokens: z.number().int().nonnegative(),
        output_tokens: z.number().int().nonnegative(),
        thought_tokens: z.number().int().nonnegative().optional(),
      })
      .nullable(),
  })
  .strict();
export type ActivationEvidence = z.infer<typeof activationEvidence>;
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
      .string()
      .regex(/^[A-Z_]{1,80}$/)
      .default('NOT_RUN'),
    tests: z.array(activationEvidence).max(3).default([]),
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
type ConfigMetadata = {
  loadStatus?: 'LOADED' | 'CREDENTIAL_NOT_LOADED';
  fileDigest?: string;
  invalidProviders?: AiProvider[];
};
export type AiConfig = Partial<Record<AiProvider, AiSettings>> & ConfigMetadata;
function unloaded(): AiConfig {
  return Object.defineProperty({}, 'loadStatus', {
    value: 'CREDENTIAL_NOT_LOADED',
  });
}

// Đọc tại mỗi gate: thay khóa/policy không cần restart Web hoặc API.
export function readAiConfig(
  env: Record<string, string | undefined> = process.env,
): AiConfig {
  const path = env.GALAXY_AI_CONFIG_FILE;
  if (!path || !path.startsWith('/')) return unloaded();
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
      return unloaded();
    const raw = readFileSync(fd, 'utf8');
    const document: unknown = JSON.parse(raw);
    const root = z
      .object({ providers: z.record(z.string(), z.unknown()) })
      .strict()
      .safeParse(document);
    if (!root.success) return unloaded();
    const result: AiConfig = Object.defineProperties(
      {},
      {
        loadStatus: { value: 'LOADED' },
        fileDigest: { value: createHash('sha256').update(raw).digest('hex') },
        invalidProviders: { value: [] },
      },
    );
    for (const model of AI_MODELS) {
      const parsed = settings.safeParse(root.data.providers[model.provider]);
      if (parsed.success) result[model.provider] = parsed.data;
      else if (root.data.providers[model.provider] !== undefined)
        result.invalidProviders!.push(model.provider);
    }
    return result;
  } catch {
    return unloaded();
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

export function configuredModel(
  config: Partial<Record<AiProvider, unknown>> & ConfigMetadata,
  id: string,
) {
  const model = AI_MODELS.find((m) => m.id === id);
  if (!model) throw new AiError('MODEL_NOT_AVAILABLE');
  if (config.loadStatus === 'CREDENTIAL_NOT_LOADED')
    throw new AiError('CREDENTIAL_NOT_LOADED');
  if (config.invalidProviders?.includes(model.provider))
    throw new AiError('INVALID_CONFIG');
  const result = settings.safeParse(config[model.provider]);
  if (!result.success) throw new AiError('MISSING_CREDENTIAL');
  const state = result.data;
  const key = state[model.keyName];
  if (!key || !state.replacementConfirmed)
    throw new AiError('MISSING_CREDENTIAL');
  if (!state.enabled) throw new AiError('MODEL_DISABLED');
  if (state.maxOutputTokens > model.outputLimit)
    throw new AiError('INVALID_CONFIG');
  const execution = Object.fromEntries(
    Object.entries(state).filter(
      ([key]) =>
        ![
          'tests',
          'lastTest',
          'modelAccessVerified',
          'textLiveVerified',
          'imageLiveVerified',
          'pdfLiveVerified',
        ].includes(key),
    ),
  );
  const verified = (capability: 'text' | 'image' | 'pdf') =>
    state.tests.some(
      (test) =>
        test.revision === state.revision &&
        test.provider === model.provider &&
        test.requestedModel === model.id &&
        test.capability === capability &&
        test.result === 'PASS',
    );
  return {
    ...model,
    ...state,
    fileDigest: config.fileDigest,
    modelAccessVerified: (['text', 'image', 'pdf'] as const).some(verified),
    textLiveVerified: verified('text'),
    imageLiveVerified: verified('image'),
    pdfLiveVerified: verified('pdf'),
    key,
    model: model.id,
    configDigest: createHash('sha256')
      .update(JSON.stringify(execution))
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
    throw new AiError('EGRESS_POLICY_DENIED');
}
export function modelChoices(
  config: Partial<Record<AiProvider, unknown>> & ConfigMetadata,
  organizationId: string,
  projectId: string,
) {
  return AI_MODELS.map((model) => {
    const parsed = settings.safeParse(config[model.provider]);
    const state = parsed.success ? parsed.data : undefined;
    let providerReason: string | null = null;
    let ready: ConfiguredModel | undefined;
    try {
      ready = configuredModel(config, model.id);
    } catch (error) {
      providerReason = error instanceof AiError ? error.code : 'INVALID_CONFIG';
    }
    const sourcePolicy = state?.approvedProjects.some(
      (p) => p.organizationId === organizationId && p.projectId === projectId,
    )
      ? 'APPROVED_PROJECT'
      : 'DENIED';
    const reason =
      providerReason ??
      (sourcePolicy === 'DENIED' ? 'EGRESS_POLICY_DENIED' : null);
    return {
      id: model.id,
      provider: model.provider,
      label: model.label,
      providerLabel: model.providerLabel,
      host: model.host,
      available: reason === null,
      providerReady: providerReason === null,
      providerReason,
      sourcePolicy,
      configLoaded: config.loadStatus !== 'CREDENTIAL_NOT_LOADED',
      reason,
      published: true,
      adapterImplemented: true,
      accountVisible: ready?.modelAccessVerified ?? false,
      adminEnabled: state?.enabled ?? false,
      credentialConfigured: Boolean(
        state?.[model.keyName] && state.replacementConfirmed,
      ),
      revision: state?.revision ?? null,
      dataPolicy: 'SYNTHETIC_PUBLIC_APPROVED',
      textLiveVerified: ready?.textLiveVerified ?? false,
      lastTest:
        state?.tests
          .filter(
            (t) =>
              t.revision === state.revision && t.requestedModel === model.id,
          )
          .at(-1)?.result ?? 'NOT_RUN',
      capabilities: {
        text: true,
        documentTextFallback: ['text/plain'],
        imageInput: model.nativeMedia && Boolean(ready?.imageLiveVerified),
        pdfInput: model.nativeMedia && Boolean(ready?.pdfLiveVerified),
        nativeMediaImplemented: model.nativeMedia,
        structuredOutput:
          model.provider !== 'kira' ? 'DOCUMENTED' : 'PROMPT_AND_VALIDATION',
        reasoningModes: [...model.reasoning],
        streaming: false,
        contextLimit: model.contextLimit,
        outputLimit: model.outputLimit,
        evidence: ready?.textLiveVerified
          ? 'LIVE_TEXT_VERIFIED'
          : 'DOCUMENTED_NOT_LIVE',
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

export const aiContextSchema = z
  .object({
    roomId: z.string().uuid().optional(),
    productLineId: z.string().uuid().optional(),
    fileAssetId: z.string().uuid().optional(),
    fileVersion: z.number().int().positive().optional(),
  })
  .strict()
  .refine(
    (v) =>
      [v.roomId, v.productLineId, v.fileAssetId].filter(Boolean).length <= 1 &&
      Boolean(v.fileAssetId) === Boolean(v.fileVersion),
  );
export type AiContext = z.infer<typeof aiContextSchema>;

const requestSchema = z.object({
  version: z.literal(1),
  provider: z.enum(['google_gemini', 'mistral', 'kira']),
  model: z.string(),
  revision: z.string(),
  configDigest: z.string(),
  reasoning: z.string(),
  dataClassification: z.literal('SYNTHETIC_PUBLIC_APPROVED'),
  sourceIds: z.array(z.string()).default([]),
  context: aiContextSchema.optional(),
});
export type AiRequestMetadata = z.infer<typeof requestSchema>;
export function requestMetadata(value: unknown): AiRequestMetadata | null {
  const parsed = z.object({ request: requestSchema }).safeParse(value);
  return parsed.success ? parsed.data.request : null;
}
