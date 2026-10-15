import type { AiContext } from './project-ai';

export type AiRequestPin = {
  execution?: 'AUTO' | 'MCP_EVENTS';
  conversationKey: string;
  clientKey: string;
  question: string;
  scope: string;
  model: string;
  reasoning: string;
  searchMode: 'AUTO' | 'WEB' | 'PROJECT_ONLY';
  runMode?: 'NORMAL' | 'DEEP';
  outputFormat?: 'xlsx' | 'docx' | 'pdf' | 'pptx';
  publicQuery?: string;
  sourceIds: string[];
  context?: AiContext;
  conversationId?: string;
};
export type AiDraft = {
  execution?: 'AUTO' | 'MCP_EVENTS';
  version: 1;
  conversationId?: string;
  conversationKey?: string;
  question: string;
  sourceIds: string[];
  request?: AiRequestPin;
  outputFormat?: AiRequestPin['outputFormat'];
  pendingFiles?: PendingAiFile[];
};
export type PendingAiFile = {
  key: string;
  sessionId?: string;
  originalFilename: string;
  declaredSize: string;
};

const uuid = (value: unknown) =>
  typeof value === 'string' &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
    value,
  );
const text = (value: unknown, limit: number) =>
  typeof value === 'string' && value.length <= limit;
const fields = (
  value: unknown,
  keys: string[],
): value is Record<string, unknown> =>
  Boolean(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.keys(value).every((key) => keys.includes(key)),
  );
const sources = (value: unknown, mcp = false) =>
  Array.isArray(value) &&
  (mcp || value.length <= 3) &&
  new Set(value).size === value.length &&
  value.every(uuid);

export function readAiDraft(raw: string | null): AiDraft | undefined {
  if (!raw || raw.length > 1_100_000) return;
  try {
    const draft: unknown = JSON.parse(raw);
    if (
      !fields(draft, [
        'version',
        'conversationId',
        'conversationKey',
        'question',
        'sourceIds',
        'request',
        'pendingFiles',
        'outputFormat',
        'execution',
      ]) ||
      draft.version !== 1 ||
      !text(draft.question, 256000) ||
      (draft.execution !== undefined &&
        !['AUTO', 'MCP_EVENTS'].includes(String(draft.execution))) ||
      !sources(
        draft.sourceIds,
        draft.execution === 'MCP_EVENTS' || draft.execution === 'AUTO',
      ) ||
      (draft.outputFormat !== undefined &&
        (typeof draft.outputFormat !== 'string' ||
          !['xlsx', 'docx', 'pdf', 'pptx'].includes(draft.outputFormat))) ||
      (draft.conversationId !== undefined && !uuid(draft.conversationId)) ||
      (draft.conversationKey !== undefined && !uuid(draft.conversationKey))
    )
      return;
    if (draft.pendingFiles !== undefined) {
      if (
        !Array.isArray(draft.pendingFiles) ||
        (draft.execution === undefined && draft.pendingFiles.length > 3) ||
        new Set(draft.pendingFiles.map((file) => file?.key)).size !==
          draft.pendingFiles.length ||
        draft.pendingFiles.some(
          (file) =>
            !fields(file, [
              'key',
              'sessionId',
              'originalFilename',
              'declaredSize',
            ]) ||
            !uuid(file.key) ||
            (file.sessionId !== undefined && !uuid(file.sessionId)) ||
            !text(file.originalFilename, 240) ||
            !file.originalFilename ||
            typeof file.declaredSize !== 'string' ||
            !/^[1-9]\d{0,10}$/.test(file.declaredSize) ||
            Number(file.declaredSize) > 10_000_000_000,
        )
      )
        return;
    }
    const request = draft.request;
    if (request !== undefined) {
      if (
        !fields(request, [
          'conversationKey',
          'clientKey',
          'conversationId',
          'question',
          'scope',
          'model',
          'reasoning',
          'searchMode',
          'runMode',
          'outputFormat',
          'publicQuery',
          'sourceIds',
          'context',
          'execution',
        ]) ||
        !uuid(request.conversationKey) ||
        !uuid(request.clientKey) ||
        !text(request.question, 256000) ||
        !request.question ||
        !text(request.scope, 60) ||
        !text(request.model, 200) ||
        (request.execution === undefined && !request.model) ||
        (request.execution !== undefined &&
          !['AUTO', 'MCP_EVENTS'].includes(String(request.execution))) ||
        !sources(
          request.sourceIds,
          request.execution === 'MCP_EVENTS' || request.execution === 'AUTO',
        ) ||
        (request.outputFormat !== undefined &&
          (typeof request.outputFormat !== 'string' ||
            !['xlsx', 'docx', 'pdf', 'pptx'].includes(request.outputFormat))) ||
        typeof request.reasoning !== 'string' ||
        typeof request.searchMode !== 'string' ||
        !['default', 'none', 'low', 'medium', 'high', 'xhigh', 'max'].includes(
          String(request.reasoning),
        ) ||
        !['AUTO', 'WEB', 'PROJECT_ONLY'].includes(String(request.searchMode)) ||
        (request.runMode !== undefined &&
          (typeof request.runMode !== 'string' ||
            !['NORMAL', 'DEEP'].includes(request.runMode))) ||
        (request.conversationId !== undefined &&
          (!uuid(request.conversationId) ||
            request.conversationId !== draft.conversationId)) ||
        (request.publicQuery !== undefined &&
          (request.searchMode !== 'WEB' || !text(request.publicQuery, 400)))
      )
        return;
      if (request.context !== undefined) {
        if (
          !fields(request.context, [
            'roomId',
            'productLineId',
            'fileAssetId',
            'fileVersion',
          ]) ||
          Object.entries(request.context).some(([key, value]) =>
            key === 'fileVersion'
              ? !Number.isSafeInteger(value) || Number(value) < 1
              : !uuid(value),
          )
        )
          return;
      }
    }
    return draft as AiDraft;
  } catch {
    return;
  }
}
