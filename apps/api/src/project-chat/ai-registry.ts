import {
  closeSync,
  constants,
  fstatSync,
  openSync,
  readFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { readCredentials } from '../../../../scripts/ai-credentials.cjs';

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
  {
    id: 'openrouter/free',
    provider: 'openrouter',
    label: 'OpenRouter — Tự chọn model miễn phí',
    providerLabel: 'OpenRouter',
    host: 'openrouter.ai',
    keyName: 'OPENROUTER_API_KEY',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    reasoning: ['default'],
    contextLimit: null,
    outputLimit: 8192,
    nativeMedia: true,
  },
] as const;
export type AiProvider = (typeof AI_MODELS)[number]['provider'];
export type ProviderEvidence = {
  gatewayRequestId: string | null;
  upstreamProvider: string | null;
  returnedModel: string | null;
  catalogueVerifiedAt: string | null;
  cost: {
    status: 'KNOWN' | 'UNKNOWN';
    value: number | null;
    source: 'usage.cost' | null;
    details: Record<string, number | null> | null;
  };
};
export class AiError extends Error {
  constructor(
    readonly code: string,
    readonly httpStatus: number | null = null,
    readonly upstream: {
      code?: string;
      requestId?: string;
      param?: string;
      detail?: string;
      retryAfterMs?: number;
      limitSource?: 'OPENROUTER' | 'UPSTREAM' | 'UNKNOWN';
      rateLimit?: {
        limit: number | null;
        remaining: number | null;
        reset: number | null;
      };
    } = {},
    readonly adapterStage: string | null = null,
    readonly providerEvidence: ProviderEvidence | null = null,
  ) {
    super(code);
  }
}
export const activationEvidence = z
  .object({
    revision: z.string().min(1).max(100),
    provider: z.enum(['google_gemini', 'mistral', 'kira', 'openrouter']),
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
    OPENROUTER_API_KEY: z.string().min(1).max(4096).optional(),
    costMode: z.literal('FREE_ONLY').optional(),
    paused: z.boolean().default(false),
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
    dataPolicy: z.enum(['SYNTHETIC_PUBLIC_APPROVED', 'PROJECT_AUTHORIZED']),
    projectPolicy: z
      .object({
        organizationId: z.string().uuid(),
        revision: z.string().min(1).max(100),
        decisionReference: z.string().min(1).max(300),
        approvedAt: z.string().datetime(),
      })
      .strict()
      .optional(),
    maxRequestsPerDay: z
      .number()
      .int()
      .min(1)
      .max(100000)
      .nullable()
      .default(null),
    maxConcurrent: z.number().int().min(1).max(4).default(1),
    maxOutputTokens: z.number().int().min(256).max(65536).default(8192),
    policyRevision: z.string().max(100).optional(),
    approvedInputs: z
      .array(
        z
          .object({
            organizationId: z.string(),
            projectId: z.string(),
            ownerId: z.string().optional(),
            questionHash: z.string().regex(/^[a-f0-9]{64}$/),
          })
          .strict(),
      )
      .max(1000)
      .default([]),
    policyAudit: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            actorId: z.string().uuid(),
            organizationId: z.string().uuid(),
            projectId: z.string().uuid(),
            at: z.string().datetime(),
            kind: z.enum(['INPUT', 'SOURCE', 'PROJECT']),
            action: z.enum(['APPROVE', 'REVOKE']),
            target: z.string().max(200),
            version: z.string().max(200).optional(),
          })
          .strict(),
      )
      .max(2000)
      .default([]),
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
  .strict()
  .refine(
    (state) =>
      ![
        state.GEMINI_API_KEY,
        state.MISTRAL_API_KEY,
        state.KIRA_API_KEY,
        state.OPENROUTER_API_KEY,
      ].some(
        (key) =>
          key &&
          [
            state.revision,
            state.lastTest,
            ...state.tests.map((test) => test.result),
          ].includes(key),
      ),
  );
export type AiSettings = z.infer<typeof settings>;
const webSettings = z
  .object({
    enabled: z.boolean().default(false),
    revision: z.string().min(1).max(100),
    organizationId: z.string().uuid(),
    decisionReference: z.string().min(1).max(300),
    creditsPerDay: z.number().int().min(0).max(1000),
    maxCallsPerRequest: z.number().int().min(1).max(3),
    accountPaidUsageDisabled: z.literal(true),
    subjects: z
      .array(
        z
          .object({
            id: z.string().min(1).max(80),
            label: z.string().min(1).max(100),
            query: z.string().min(1).max(200),
            domains: z
              .array(z.string().regex(/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i))
              .max(5),
          })
          .strict(),
      )
      .max(100),
  })
  .strict();
type ConfigMetadata = {
  web?: z.infer<typeof webSettings> & { credentialConfigured: boolean };
  webKey?: string;
  connections?: {
    llama_cloud?: {
      category: 'DOCUMENT_KNOWLEDGE';
      revision: string;
      enabled: boolean;
      credentialConfigured: boolean;
      credentialState: string;
      status: 'NOT_VERIFIED' | 'CREDENTIAL_PENDING';
    };
  };
  credentialSource?: 'json' | 'env';
  loadStatus?: 'LOADED' | 'CREDENTIAL_NOT_LOADED';
  fileDigest?: string;
  invalidProviders?: AiProvider[];
  credentialStates?: Partial<Record<AiProvider, string>>;
  credentialPresence?: Partial<Record<AiProvider, boolean>>;
};
export type AiConfig = Partial<Record<AiProvider, AiSettings>> & ConfigMetadata;
function unloaded(state = 'CREDENTIAL_NOT_LOADED'): AiConfig {
  return Object.defineProperties(
    {},
    {
      loadStatus: { value: 'CREDENTIAL_NOT_LOADED' },
      credentialStates: {
        value: Object.fromEntries(AI_MODELS.map((m) => [m.provider, state])),
      },
    },
  );
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
      return unloaded('STORE_UNREADABLE');
    const raw = readFileSync(fd, 'utf8');
    let document: unknown;
    try {
      document = JSON.parse(raw);
    } catch {
      return unloaded('STORE_INVALID_FORMAT');
    }
    const root = z
      .object({
        providers: z.record(z.string(), z.unknown()),
        tools: z.object({ web: webSettings.optional() }).strict().optional(),
        connections: z
          .object({
            llama_cloud: z
              .object({
                category: z.literal('DOCUMENT_KNOWLEDGE'),
                revision: z.string().min(1).max(100),
                enabled: z.boolean(),
                replacementConfirmed: z.boolean(),
              })
              .strict()
              .optional(),
          })
          .strict()
          .optional(),
        credentialSource: z
          .object({ mode: z.literal('env'), path: z.string().startsWith('/') })
          .strict()
          .optional(),
      })
      .strict()
      .safeParse(document);
    if (!root.success) return unloaded('STORE_INVALID_FORMAT');
    const secret = root.data.credentialSource
      ? readCredentials(root.data.credentialSource)
      : null;
    const result: AiConfig = Object.defineProperties(
      {},
      {
        loadStatus: { value: 'LOADED' },
        credentialSource: { value: secret ? 'env' : 'json' },
        fileDigest: { value: createHash('sha256').update(raw).digest('hex') },
        invalidProviders: { value: [] },
        credentialStates: { value: {} },
        credentialPresence: { value: {} },
      },
    );
    if (root.data.tools?.web) {
      const key =
        secret?.status === 'LOADED' ? secret.keys.TAVILY_API_KEY : undefined;
      result.web = { ...root.data.tools.web, credentialConfigured: !!key };
      Object.defineProperty(result, 'webKey', { value: key });
    }
    const connection = root.data.connections?.llama_cloud;
    if (connection)
      result.connections = {
        llama_cloud: {
          category: connection.category,
          revision: connection.revision,
          enabled: connection.enabled,
          credentialConfigured: Boolean(
            secret?.status === 'LOADED' &&
              secret.keys.LLAMA_CLOUD_API_KEY &&
              connection.replacementConfirmed,
          ),
          credentialState:
            secret?.status === 'LOADED'
              ? secret.keys.LLAMA_CLOUD_API_KEY
                ? 'LOADED'
                : 'CREDENTIAL_EMPTY'
              : (secret?.status ?? 'ENV_REQUIRED'),
          status:
            secret?.status === 'LOADED' &&
            secret.keys.LLAMA_CLOUD_API_KEY &&
            connection.replacementConfirmed
              ? 'NOT_VERIFIED'
              : 'CREDENTIAL_PENDING',
        },
      };
    const ids = Object.keys(root.data.providers);
    const missingState = ids.some(
      (id) => !AI_MODELS.some((m) => m.provider === id),
    )
      ? 'STORE_INVALID_FORMAT'
      : ids.length
        ? 'PROVIDER_ENTRY_MISSING'
        : 'EMPTY_STORE';
    for (const model of AI_MODELS) {
      const original = root.data.providers[model.provider];
      const entry =
        secret && original && typeof original === 'object'
          ? {
              ...Object.fromEntries(
                Object.entries(original).filter(
                  ([key]) => !AI_MODELS.some((m) => m.keyName === key),
                ),
              ),
              ...(secret.keys[model.keyName]
                ? { [model.keyName]: secret.keys[model.keyName] }
                : {}),
            }
          : original;
      const parsed = settings.safeParse(entry);
      if (parsed.success) result[model.provider] = parsed.data;
      else if (entry !== undefined)
        result.invalidProviders!.push(model.provider);
      const key =
        entry && typeof entry === 'object'
          ? (entry as Record<string, unknown>)[model.keyName]
          : undefined;
      result.credentialPresence![model.provider] =
        typeof key === 'string' && Boolean(key.trim());
      result.credentialStates![model.provider] =
        secret && secret.status !== 'LOADED'
          ? secret.status
          : entry === undefined
            ? missingState
            : entry &&
                typeof entry === 'object' &&
                (!key || (typeof key === 'string' && !key.trim()))
              ? 'CREDENTIAL_EMPTY'
              : parsed.success
                ? parsed.data.replacementConfirmed
                  ? 'LOADED'
                  : 'CREDENTIAL_NOT_CONFIRMED'
                : 'INVALID_CONFIG';
    }
    return result;
  } catch (error) {
    return unloaded(
      (error as NodeJS.ErrnoException).code === 'ENOENT'
        ? 'CREDENTIAL_NOT_LOADED'
        : 'STORE_UNREADABLE',
    );
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

export function configuredModel(
  config: Partial<Record<AiProvider, unknown>> & ConfigMetadata,
  id: string,
  historical = false,
) {
  if (!historical) assertLegacyProviderAllowed();
  const model = AI_MODELS.find((m) => m.id === id);
  if (!model) throw new AiError('MODEL_NOT_AVAILABLE');
  if (config.loadStatus === 'CREDENTIAL_NOT_LOADED')
    throw new AiError('CREDENTIAL_NOT_LOADED');
  if (config.invalidProviders?.includes(model.provider))
    throw new AiError('INVALID_CONFIG');
  if (
    config.credentialSource === 'env' &&
    config.credentialStates?.[model.provider] !== 'LOADED'
  )
    throw new AiError(
      config.credentialStates?.[model.provider] ?? 'CREDENTIAL_EMPTY',
    );
  const result = settings.safeParse(config[model.provider]);
  if (!result.success) throw new AiError('MISSING_CREDENTIAL');
  const state = result.data;
  const key = state[model.keyName];
  if (!key?.trim() || !state.replacementConfirmed)
    throw new AiError('MISSING_CREDENTIAL');
  if (
    model.provider === 'openrouter' &&
    (state.costMode !== 'FREE_ONLY' || config.credentialSource !== 'env')
  )
    throw new AiError('INVALID_CONFIG');
  if (!historical && state.paused) throw new AiError('PROVIDER_PAUSED');
  if (!state.enabled) throw new AiError('MODEL_DISABLED');
  if (state.maxOutputTokens > model.outputLimit)
    throw new AiError('INVALID_CONFIG');
  const execution = Object.fromEntries(
    Object.entries(state).filter(
      ([key]) =>
        ![
          'paused',
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

// Deployment policy is independent of provider credentials and Project egress ACL.
// An omitted value preserves old releases; new plan-only releases pin this env
// in their private manifest. Re-enabling keys requires an explicit policy change.
export function assertLegacyProviderAllowed(env = process.env) {
  if (env.GALAXY_AI_EXECUTION_POLICY === 'CHATGPT_PLAN_ONLY')
    throw new AiError('PAUSED_BY_USER');
  if (
    env.GALAXY_AI_EXECUTION_POLICY &&
    env.GALAXY_AI_EXECUTION_POLICY !== 'LEGACY_API_KEY'
  )
    throw new AiError('INVALID_EXECUTION_POLICY');
}
export function projectPolicy(
  config: Pick<ConfiguredModel, 'provider' | 'dataPolicy' | 'projectPolicy'>,
  organizationId: string,
) {
  return (
    config.provider === 'openrouter' &&
    config.dataPolicy === 'PROJECT_AUTHORIZED' &&
    config.projectPolicy?.organizationId === organizationId
  );
}
function revoked(
  config: ConfiguredModel,
  organizationId: string,
  projectId: string,
  kind: 'PROJECT' | 'SOURCE',
  target: string,
  version?: string,
) {
  return (
    config.policyAudit
      .filter(
        (row) =>
          row.organizationId === organizationId &&
          row.projectId === projectId &&
          row.kind === kind &&
          row.target === target &&
          (kind === 'PROJECT' || row.version === version),
      )
      .at(-1)?.action === 'REVOKE'
  );
}
export function assertInput(
  config: ConfiguredModel,
  organizationId: string,
  projectId: string,
  ownerId: string,
  question: string,
) {
  if (projectPolicy(config, organizationId)) {
    assertEgress(config, organizationId, projectId, undefined, []);
    return;
  }
  if (config.dataPolicy === 'PROJECT_AUTHORIZED')
    throw new AiError('INPUT_POLICY_DENIED');
  const questionHash = createHash('sha256').update(question).digest('hex');
  if (
    !config.approvedInputs.some(
      (input) =>
        input.organizationId === organizationId &&
        input.projectId === projectId &&
        (!input.ownerId || input.ownerId === ownerId) &&
        input.questionHash === questionHash,
    )
  )
    throw new AiError('INPUT_POLICY_DENIED');
}
export function assertEgress(
  config: ConfiguredModel,
  organizationId: string,
  projectId: string,
  classification: string | undefined,
  sources: { id: string; version: string }[],
) {
  if (projectPolicy(config, organizationId)) {
    if (
      revoked(config, organizationId, projectId, 'PROJECT', projectId) ||
      sources.some((source) =>
        revoked(
          config,
          organizationId,
          projectId,
          'SOURCE',
          source.id,
          source.version,
        ),
      )
    )
      throw new AiError('EGRESS_POLICY_DENIED');
    return;
  }
  if (config.dataPolicy === 'PROJECT_AUTHORIZED')
    throw new AiError('EGRESS_POLICY_DENIED');
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
  if (process.env.GALAXY_AI_EXECUTION_POLICY === 'CHATGPT_PLAN_ONLY') return [];
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
    let sourcePolicy = 'DENIED';
    if (ready) {
      try {
        assertEgress(ready, organizationId, projectId, ready.dataPolicy, []);
        sourcePolicy = 'APPROVED_PROJECT';
      } catch {
        /* Không nới quyền theo trạng thái provider. */
      }
    }
    const reason =
      providerReason ??
      (model.provider === 'openrouter' &&
      !(ready && projectPolicy(ready, organizationId))
        ? 'GENERAL_ONLY'
        : null) ??
      (sourcePolicy === 'DENIED' ? 'EGRESS_POLICY_DENIED' : null);
    return {
      id: model.id,
      paused: state?.paused ?? false,
      costMode: state?.costMode ?? null,
      provider: model.provider,
      label: model.label,
      providerLabel: model.providerLabel,
      host: model.host,
      available: reason === null,
      generalAvailable: providerReason === null,
      providerReady: providerReason === null,
      providerReason,
      sourcePolicy,
      configLoaded: config.loadStatus !== 'CREDENTIAL_NOT_LOADED',
      credentialPresent:
        config.credentialPresence?.[model.provider] ??
        Boolean(state?.[model.keyName]?.trim()),
      credentialSource: config.credentialSource ?? 'json',
      credentialState:
        config.credentialStates?.[model.provider] ??
        (state?.[model.keyName]?.trim() && state.replacementConfirmed
          ? 'LOADED'
          : 'MISSING_CREDENTIAL'),
      reason,
      published: true,
      adapterImplemented: true,
      accountVisible: ready?.modelAccessVerified ?? false,
      adminEnabled: state?.enabled ?? false,
      credentialConfigured: Boolean(
        state?.[model.keyName]?.trim() && state.replacementConfirmed,
      ),
      revision: state?.revision ?? null,
      dataPolicy: state?.dataPolicy ?? 'SYNTHETIC_PUBLIC_APPROVED',
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
        documentTextFallback: [
          'text/plain',
          'text/markdown',
          'application/pdf',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ],
        imageInput: model.nativeMedia && Boolean(ready?.imageLiveVerified),
        pdfInput:
          model.provider === 'openrouter'
            ? Boolean(ready)
            : model.nativeMedia && Boolean(ready?.pdfLiveVerified),
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

const legacyRequestSchema = z.object({
  toolRevision: z.literal('project-tools-v1').optional(),
  toolConfigDigest: z.string().optional(),
  mode: z.enum(['GENERAL', 'PROJECT', 'UNIFIED']).default('PROJECT'),
  version: z.literal(1),
  provider: z.enum([
    'google_gemini',
    'mistral',
    'kira',
    'openrouter',
    'chatgpt',
  ]),
  model: z.string(),
  revision: z.string(),
  configDigest: z.string(),
  reasoning: z.string(),
  nativeWebSearch: z.boolean().optional(),
  dataClassification: z.enum([
    'SYNTHETIC_PUBLIC_APPROVED',
    'PROJECT_AUTHORIZED',
  ]),
  sourceIds: z.array(z.string()).default([]),
  sourceVersions: z
    .array(
      z
        .object({
          id: z.string().uuid(),
          version: z.string(),
          derivativeDigest: z.string().regex(/^[a-f0-9]{64}$/),
        })
        .strict(),
    )
    .max(20)
    .optional(),
  historyAnswerIds: z.array(z.string().uuid()).optional(),
  context: aiContextSchema.optional(),
});
export const AI_PROJECT_POLICY_VERSION = 'project-ai-p1-v1' as const;
const requestScopeSchema = z
  .object({
    organizationId: z.string().uuid(),
    projectId: z.string().uuid(),
    actorId: z.string().uuid(),
    conversationId: z.string().uuid(),
  })
  .strict();
export type AiRequestScope = z.infer<typeof requestScopeSchema>;
export const taskContractSchema = z
  .object({
    version: z.literal(1),
    originalUserMessageId: z.string().uuid(),
    revision: z.number().int().positive(),
    taskType: z.enum([
      'LOOKUP',
      'SUMMARIZE',
      'CONVERT_DOCUMENT',
      'COMPARE',
      'RESEARCH',
      'EDIT_ARTIFACT',
      'GENERAL_QA',
    ]),
    requestedOutputs: z.array(z.enum(['xlsx', 'docx', 'pdf', 'pptx'])).max(1),
    primarySourceIds: z.array(z.string().uuid()).max(3),
    constraints: z.array(z.string().max(200)).max(8),
    missingInformation: z.array(z.string().max(200)).max(8),
    completionCriteria: z.array(z.string().max(200)).max(8),
  })
  .strict();
const requestSchema = z.discriminatedUnion('version', [
  legacyRequestSchema,
  legacyRequestSchema
    .extend({
      version: z.literal(2),
      provider: z.literal('chatgpt'),
      mode: z.literal('UNIFIED'),
      policyVersion: z.literal(AI_PROJECT_POLICY_VERSION),
      scope: requestScopeSchema,
      historyAnswerIds: z.array(z.string().uuid()),
    })
    .strict(),
  legacyRequestSchema
    .extend({
      version: z.literal(3),
      provider: z.literal('chatgpt'),
      mode: z.literal('UNIFIED'),
      policyVersion: z.literal(AI_PROJECT_POLICY_VERSION),
      scope: requestScopeSchema,
      historyAnswerIds: z.array(z.string().uuid()),
    })
    .strict(),
  legacyRequestSchema
    .extend({
      version: z.literal(4),
      provider: z.literal('chatgpt'),
      mode: z.literal('UNIFIED'),
      policyVersion: z.literal(AI_PROJECT_POLICY_VERSION),
      scope: requestScopeSchema,
      historyAnswerIds: z.array(z.string().uuid()),
      nativeWebSearch: z.literal(false),
      searchMode: z.enum(['AUTO', 'WEB', 'PROJECT_ONLY']),
      runMode: z.enum(['NORMAL', 'DEEP']).optional(),
      task: taskContractSchema.optional(),
      documentReadScope: z.literal('ALL').optional(),
      requiredDocuments: z
        .array(
          z
            .object({
              id: z.string().uuid(),
              version: z.string().min(1).max(100),
              checksum: z.string().regex(/^[a-f0-9]{64}$/),
              format: z.enum(['PDF', 'XLSX']),
            })
            .strict(),
        )
        .max(20)
        .optional(),
      originalSourceVersions: z
        .array(
          z
            .object({
              id: z.string().uuid(),
              version: z.string().max(100),
              checksum: z.string().regex(/^[a-f0-9]{64}$/),
            })
            .strict(),
        )
        .max(20)
        .optional(),
      publicQuery: z
        .object({
          query: z
            .string()
            .min(1)
            .max(400)
            .refine((query) => Boolean(query.trim())),
          authorizationHash: z.string().regex(/^[a-f0-9]{64}$/),
        })
        .strict()
        .optional(),
    })
    .strict()
    .refine((pin) =>
      pin.searchMode === 'WEB'
        ? Boolean(pin.publicQuery)
        : pin.searchMode !== 'PROJECT_ONLY' || !pin.publicQuery,
    )
    .refine((pin) => {
      if (!pin.originalSourceVersions) return true;
      const ids = [
        ...(pin.sourceVersions ?? []),
        ...pin.originalSourceVersions,
      ].map((source) => source.id);
      return (
        ids.length === pin.sourceIds.length &&
        new Set(ids).size === ids.length &&
        new Set(pin.sourceIds).size === pin.sourceIds.length &&
        ids.every((id) => pin.sourceIds.includes(id))
      );
    })
    .refine((pin) => {
      const required = pin.requiredDocuments ?? [];
      return (
        (!required.length || pin.documentReadScope === 'ALL') &&
        new Set(required.map((source) => source.id)).size === required.length &&
        required.every((source) =>
          pin.originalSourceVersions?.some(
            (original) =>
              original.id === source.id &&
              original.version === source.version &&
              original.checksum === source.checksum,
          ),
        )
      );
    }),
]);
export type AiRequestMetadata = z.infer<typeof requestSchema>;
export function requestMetadata(value: unknown): AiRequestMetadata | null {
  const parsed = z.object({ request: requestSchema }).safeParse(value);
  return parsed.success ? parsed.data.request : null;
}
export const contextLedgerSchema = z
  .object({
    estimator: z.literal('UTF8_BYTE_PROXY_V1'),
    estimatedTextTokens: z.number().int().nonnegative(),
    overheadTokenEstimate: z.null(),
    opaqueContinuationBytes: z.number().int().min(0).max(256000),
    opaqueContinuationTokenEstimate: z.null(),
    unattributedMediaBytes: z.number().int().nonnegative(),
    components: z
      .array(
        z
          .object({
            kind: z.enum([
              'INSTRUCTIONS',
              'CONTEXT',
              'QUESTION',
              'HISTORY',
              'SUMMARY',
              'MEMORY',
              'TOOL_SCHEMAS',
              'TOOL_CALLS',
              'TOOL_OUTPUT',
              'SOURCE',
              'CONTINUATION',
              'PACKED_HISTORY_MEMORY',
            ]),
            sourceId: z.string().uuid().nullable(),
            textBytes: z.number().int().nonnegative(),
            estimatedTokens: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .max(128),
    sources: z
      .array(
        z
          .object({
            sourceId: z.string().uuid(),
            textBytes: z.number().int().nonnegative(),
            estimatedTextTokens: z.number().int().nonnegative(),
            mediaBytes: z.number().int().nonnegative(),
            mediaTokenEstimate: z.null(),
          })
          .strict(),
      )
      .max(64),
    capacity: z
      .object({
        publishedModelContextTokens: z.number().int().positive().nullable(),
        publishedModelOutputTokens: z.number().int().positive().nullable(),
        publishedEvidence: z.string().url().nullable(),
        routeAccountContextTokens: z.number().int().positive().nullable(),
        routeEvidence: z.string().min(1).max(1000),
        galaxyTextBytesLimit: z.literal(256000),
        galaxyMediaBytesLimit: z.literal(8000000),
        galaxyInputItemsLimit: z.literal(64),
        reasoningReserveTokens: z.null(),
        outputReserveTokens: z.number().int().nonnegative().nullable(),
      })
      .strict(),
  })
  .strict()
  .refine(
    (ledger) =>
      ledger.estimatedTextTokens ===
        ledger.components.reduce(
          (sum, component) => sum + component.estimatedTokens,
          0,
        ) &&
      ledger.components.every(
        (component) => component.estimatedTokens === component.textBytes,
      ) &&
      ledger.sources.every(
        (source) => source.estimatedTextTokens === source.textBytes,
      ),
  );

const budgetSchema = z
  .object({
    status: z.enum(['VERIFIED', 'UNVERIFIED']),
    inputTokens: z.number().int().nonnegative().nullable(),
    inputLimit: z.number().int().positive().nullable(),
    tokenizerVersion: z.string().min(1).max(200).nullable(),
    ledger: contextLedgerSchema.optional(),
    bytes: z
      .number()
      .int()
      .min(1)
      .max(256000 + 256000 + Math.ceil(8_000_000 / 3) * 4),
    items: z.number().int().min(1).max(64),
    textBytes: z.number().int().min(1).max(256000).optional(),
    media: z
      .array(
        z
          .object({
            kind: z.enum(['input_file', 'input_image']),
            bytes: z.number().int().min(1).max(8_000_000),
            estimatedTokens: z.null(),
            evidence: z.literal('UNKNOWN'),
          })
          .strict(),
      )
      .max(256)
      .optional(),
  })
  .strict()
  .refine((b) => {
    if (b.ledger?.opaqueContinuationBytes && b.status !== 'UNVERIFIED')
      return false;
    if (b.textBytes === undefined && b.media === undefined)
      return b.bytes <= 256000;
    if (b.textBytes === undefined || b.media === undefined) return false;
    return (
      b.media.reduce((sum, part) => sum + part.bytes, 0) <= 8_000_000 &&
      b.bytes <=
        b.textBytes +
          (b.ledger?.opaqueContinuationBytes ?? 0) +
          b.media.reduce(
            (sum, part) => sum + 4 * Math.ceil(part.bytes / 3),
            0,
          ) &&
      ((!b.media.length && !b.ledger?.opaqueContinuationBytes) ||
        b.status === 'UNVERIFIED')
    );
  })
  .refine((b) =>
    b.status === 'VERIFIED'
      ? b.inputTokens !== null &&
        b.inputLimit !== null &&
        b.tokenizerVersion !== null &&
        b.inputTokens <= b.inputLimit
      : b.inputTokens === null &&
        b.inputLimit === null &&
        b.tokenizerVersion === null,
  );
export const consumedContextSchema = z
  .object({
    scope: requestScopeSchema,
    answerId: z.string().uuid(),
    invokeGrantId: z.string().uuid(),
    policyVersion: z.literal(AI_PROJECT_POLICY_VERSION),
    usedHistoryAnswerIds: z.array(z.string().uuid()).max(64),
    historyVersions: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            version: z.string().regex(/^[a-f0-9]{64}$/),
          })
          .strict(),
      )
      .max(64),
    memoryRevisionIds: z.array(z.string().uuid()).max(64),
    summaryRevisionIds: z.array(z.string().uuid()).max(64),
    historyCompleteness: z.enum(['COMPLETE', 'PARTIAL']).optional(),
    budget: budgetSchema,
  })
  .strict()
  .refine(
    (e) =>
      new Set(e.usedHistoryAnswerIds).size === e.usedHistoryAnswerIds.length &&
      new Set([...e.memoryRevisionIds, ...e.summaryRevisionIds]).size ===
        e.memoryRevisionIds.length + e.summaryRevisionIds.length &&
      e.historyVersions.length === e.usedHistoryAnswerIds.length &&
      e.historyVersions.every((r, i) => r.id === e.usedHistoryAnswerIds[i]),
  );
export type AiConsumedContext = z.infer<typeof consumedContextSchema>;
export function executionMetadata(value: unknown): AiConsumedContext | null {
  const parsed = z
    .object({ execution: consumedContextSchema })
    .safeParse(value);
  return parsed.success ? parsed.data.execution : null;
}
