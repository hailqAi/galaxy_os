import { z } from 'zod';
import { redact } from '../security-redaction';
import { AiError } from './ai-registry';
import { toolDefinitions, toolInputs, type ToolName } from './ai-tools';
import { validatedImageDimensions } from './ai-document';

// Official SIWC wire contract; grants and ownership are checked by the connection service.
const text = z.string().min(1).max(256000);
// Matches the existing bounded native-source reader; transport bytes are not tokens.
const mediaByteLimit = 8_000_000;
const mediaData = z
  .string()
  .min(1)
  .max(Math.ceil(mediaByteLimit / 3) * 4 + 40);
const toolName = z
  .enum(Object.keys(toolInputs) as [ToolName, ...ToolName[]])
  .refine((name) => name !== 'search_web', 'Keyed web search is paused');
const call = z.object({
  type: z.literal('function_call'),
  namespace: z.literal('galaxy'),
  name: toolName,
  call_id: z.string().min(1).max(200),
  arguments: text,
});
export const chatGptFunctionCall = call.strict();
const reasoning = z.object({
  type: z.literal('reasoning'),
  id: z.string().min(1).max(200),
  summary: z
    .array(
      z.object({
        type: z.literal('summary_text'),
        text: z.string().max(32000),
      }),
    )
    .max(32),
  encrypted_content: z.string().max(128000).nullable().optional(),
});
const annotation = z.object({
  type: z.literal('url_citation'),
  start_index: z.number().int().nonnegative(),
  end_index: z.number().int().nonnegative(),
  url: z
    .string()
    .url()
    .max(2048)
    .refine((url) => /^https?:\/\//.test(url)),
  title: z.string().max(1000),
});
const webSearch = z.object({
  type: z.literal('web_search_call'),
  id: z.string().min(1).max(200),
  status: z.enum(['in_progress', 'searching', 'completed', 'failed']),
  action: z.json().optional(),
});
const message = z.object({
  type: z.literal('message'),
  role: z.literal('assistant').default('assistant'),
  content: z
    .array(
      z
        .object({
          type: z.literal('output_text'),
          text: z.string().max(512000),
          annotations: z.array(annotation).max(100).optional(),
        })
        .refine((part) =>
          (part.annotations ?? []).every(
            (citation) =>
              citation.start_index < citation.end_index &&
              citation.end_index <= part.text.length,
          ),
        ),
    )
    .max(32),
});
function inlineBytes(data: string, mime: string) {
  const encoded = data.slice(`data:${mime};base64,`.length);
  const bytes = Buffer.from(encoded, 'base64');
  if (
    !data.startsWith(`data:${mime};base64,`) ||
    !bytes.length ||
    bytes.toString('base64') !== encoded
  )
    throw new AiError('UNSUPPORTED_FILE');
  return bytes;
}
const mediaPart = z.union([
  z.object({ type: z.literal('input_text'), text }).strict(),
  z
    .object({
      type: z.literal('input_image'),
      image_url: mediaData,
      detail: z.enum(['auto', 'low', 'high']),
    })
    .strict()
    .refine((part) => {
      const mime = part.image_url.startsWith('data:image/png;')
        ? 'image/png'
        : 'image/jpeg';
      validatedImageDimensions({
        mime,
        bytes: inlineBytes(part.image_url, mime),
      });
      return true;
    }),
  z
    .object({
      type: z.literal('input_file'),
      filename: z
        .string()
        .min(1)
        .max(200)
        .regex(/^[^/\\]+\.pdf$/i)
        .refine((name) => [...name].every((char) => char.charCodeAt(0) >= 32)),
      file_data: mediaData,
    })
    .strict()
    .refine((part) => {
      const bytes = inlineBytes(part.file_data, 'application/pdf');
      return (
        bytes.subarray(0, 5).toString() === '%PDF-' &&
        bytes.subarray(-1024).includes(Buffer.from('%%EOF'))
      );
    }),
]);
export const chatGptInputItem = z.union([
  z
    .object({ role: z.enum(['user', 'assistant', 'developer']), content: text })
    .strict(),
  z
    .object({
      role: z.literal('user'),
      content: z.array(mediaPart).min(1).max(4),
    })
    .strict(),
  chatGptFunctionCall,
  reasoning.strict(),
  message.strict(),
  webSearch.strict(),
  z
    .object({
      type: z.literal('function_call_output'),
      call_id: z.string().min(1).max(200),
      output: text,
    })
    .strict(),
]);
const request = z
  .object({
    model: z.string().min(1).max(200),
    instructions: text.optional(),
    input: z.array(chatGptInputItem).min(1).max(64),
    tools: z.array(toolName).max(16).default([]),
    reasoningEffort: z
      .enum(['none', 'low', 'medium', 'high', 'xhigh', 'max'])
      .optional(),
    nativeWebSearch: z.boolean().optional(),
  })
  .strict();

export function chatGptCatalog(value: unknown) {
  const result = z
    .object({
      models: z
        .array(
          z.object({
            slug: z.string().min(1).max(200),
            display_name: z.string().min(1).max(200),
            visibility: z.string(),
          }),
        )
        .max(200),
    })
    .parse(value);
  const visible = result.models.filter((model) => model.visibility === 'list');
  if (new Set(visible.map((model) => model.slug)).size !== visible.length)
    throw new AiError('INVALID_MODEL_CATALOG');
  return visible.map((model) => ({
    id: model.slug,
    label: model.display_name,
  }));
}

export function chatGptRequest(value: unknown, officeReady = false) {
  const input = request.parse(value);
  const inputAccounting = chatGptAccounting(input);
  if (
    inputAccounting.textBytes > 256000 ||
    inputAccounting.opaqueContinuationBytes > 256000
  )
    throw new AiError('TOOL_CONTEXT_LIMIT');
  const body = {
    model: input.model,
    input: input.input,
    store: false,
    stream: true,
    ...(input.reasoningEffort
      ? { reasoning: { effort: input.reasoningEffort } }
      : {}),
    ...(input.instructions ? { instructions: input.instructions } : {}),
    ...(input.tools.length || input.nativeWebSearch
      ? {
          tools: [
            ...(input.nativeWebSearch ? [{ type: 'web_search' }] : []),
            ...(input.tools.length
              ? [
                  {
                    type: 'namespace',
                    name: 'galaxy',
                    description: 'Authorized Galaxy Project tools',
                    tools: toolDefinitions(input.tools, officeReady).map(
                      (definition) => ({
                        type: 'function',
                        ...definition.function,
                      }),
                    ),
                  },
                ]
              : []),
          ],
        }
      : {}),
  };
  const accounting = chatGptAccounting(body);
  if (
    accounting.media.reduce((sum, part) => sum + part.bytes, 0) > mediaByteLimit
  )
    throw new AiError('MEDIA_INPUT_TOO_LARGE');
  if (accounting.textBytes > 256000) throw new AiError('TOOL_CONTEXT_LIMIT');
  return body;
}

export function chatGptAccounting(wire: { input: unknown[] }) {
  const media: {
    kind: 'input_file' | 'input_image';
    bytes: number;
    estimatedTokens: null;
    evidence: 'UNKNOWN';
  }[] = [];
  const mediaParts = new Set<object>();
  const opaqueParts = new Set<object>();
  let opaqueContinuationBytes = 0;
  for (const item of wire.input) {
    if (
      item &&
      typeof item === 'object' &&
      'type' in item &&
      item.type === 'reasoning'
    )
      opaqueParts.add(item);
    if (
      !item ||
      typeof item !== 'object' ||
      !('role' in item) ||
      item.role !== 'user' ||
      !('content' in item) ||
      !Array.isArray(item.content)
    )
      continue;
    for (const part of item.content)
      if (
        part &&
        typeof part === 'object' &&
        (part.type === 'input_file' || part.type === 'input_image')
      )
        mediaParts.add(part);
  }
  const textWire = JSON.stringify(
    wire,
    function (this: object, key, value: unknown) {
      if (
        opaqueParts.has(this) &&
        key === 'encrypted_content' &&
        typeof value === 'string'
      ) {
        opaqueContinuationBytes += Buffer.byteLength(JSON.stringify(value)) - 2;
        return '[opaque continuation; token cost unknown]';
      }
      if (
        mediaParts.has(this) &&
        (key === 'file_data' || key === 'image_url') &&
        typeof value === 'string'
      ) {
        const encoded = value.slice(value.indexOf(',') + 1);
        media.push({
          kind: key === 'file_data' ? 'input_file' : 'input_image',
          bytes:
            (encoded.length / 4) * 3 -
            (encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0),
          estimatedTokens: null,
          evidence: 'UNKNOWN',
        });
        return '[inline media; token cost unknown]';
      }
      return value;
    },
  );
  return {
    textWire,
    textBytes: Buffer.byteLength(textWire),
    media,
    opaqueContinuationBytes,
  };
}

const completed = z.object({
  status: z.literal('completed'),
  model: z.string().min(1).max(200),
  output: z
    .array(
      z.union([
        call,
        message,
        webSearch,
        // Kept for stateless continuation, never user-visible answer text.
        reasoning,
      ]),
    )
    .max(64),
  reasoning: z
    .object({ effort: z.string().max(100).nullable().optional() })
    .nullable()
    .optional(),
  usage: z
    .object({
      input_tokens: z.number().int().nonnegative(),
      output_tokens: z.number().int().nonnegative(),
    })
    .optional(),
});
export function chatGptDiagnostic(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  return String(redact(value))
    .replace(/\bBearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(
      /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
      '[REDACTED]',
    )
    .slice(0, 1000);
}
function streamError(
  value: unknown,
  response: Response,
  stage: string | null = null,
  detail?: unknown,
) {
  const code = z
    .object({
      code: z
        .string()
        .regex(/^[A-Za-z0-9_.-]{1,200}$/)
        .nullable()
        .optional(),
      param: z
        .string()
        .regex(/^[A-Za-z0-9_.[\]-]{1,200}$/)
        .nullable()
        .optional(),
    })
    .safeParse(value);
  const known: Record<string, string> = {
    subscription_sharing_usage_limit_exceeded: 'CHATGPT_USAGE_LIMIT',
    subscription_sharing_user_not_eligible: 'CHATGPT_NOT_ELIGIBLE',
    subscription_sharing_unsupported_capability: 'UNSUPPORTED_CAPABILITY',
    subscription_sharing_usage_unavailable: 'CHATGPT_TEMPORARILY_UNAVAILABLE',
    subscription_sharing_user_unavailable: 'CHATGPT_TEMPORARILY_UNAVAILABLE',
  };
  const upstreamCode = code.success ? code.data.code : undefined;
  const requestId = response.headers.get('x-request-id');
  return new AiError(
    code.success && code.data.code
      ? (known[code.data.code] ?? 'CHATGPT_RESPONSE_FAILED')
      : 'CHATGPT_RESPONSE_FAILED',
    response.status,
    {
      ...(upstreamCode && { code: upstreamCode }),
      ...(chatGptDiagnostic(detail) && { detail: chatGptDiagnostic(detail) }),
      ...(code.success && code.data.param && { param: code.data.param }),
      ...(requestId &&
        /^[A-Za-z0-9_.-]{1,200}$/.test(requestId) && { requestId }),
    },
    stage,
  );
}

async function httpError(response: Response, signal: AbortSignal) {
  if (!response.body) return streamError({}, response);
  const reader = response.body.getReader();
  const timeout = AbortSignal.any([signal, AbortSignal.timeout(5000)]);
  const abort = () => {
    void reader.cancel().catch(() => {});
  };
  timeout.addEventListener('abort', abort, { once: true });
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      timeout.throwIfAborted();
      const part = await reader.read();
      timeout.throwIfAborted();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 16384) return streamError({}, response);
      parts.push(part.value);
    }
    const body = z
      .object({ error: z.unknown().optional(), detail: z.unknown().optional() })
      .parse(JSON.parse(Buffer.concat(parts).toString('utf8')));
    return streamError(
      body.error ?? {},
      response,
      body.detail !== undefined ? 'ADMISSION' : null,
      body.detail,
    );
  } catch {
    signal.throwIfAborted();
    return streamError({}, response);
  } finally {
    timeout.removeEventListener('abort', abort);
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function readChatGptStream(
  response: Response,
  signal: AbortSignal,
) {
  if (!response.ok) throw await httpError(response, signal);
  if (!response.body) throw new AiError('CHATGPT_HTTP_ERROR', response.status);
  const contentType = response.headers.get('content-type');
  // Some SIWC responses omit this header; SSE framing and completion stay mandatory.
  if (contentType && !contentType.startsWith('text/event-stream'))
    throw new AiError('CHATGPT_STREAM_REQUIRED');
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let buffer = '';
  let terminal: z.infer<typeof completed> | undefined;
  let firstOutputAt: string | null = null;
  let firstOutputEvidence: 'TEXT_DELTA' | 'TERMINAL_TEXT' | null = null;
  const done = new Map<number, z.infer<typeof completed>['output'][number]>();
  const abort = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener('abort', abort, { once: true });
  try {
    while (!terminal) {
      signal.throwIfAborted();
      const part = await reader.read();
      signal.throwIfAborted();
      if (part.done) break;
      // SSE repeats output in deltas, done items and completion; bound retained data.
      for (
        let offset = 0;
        offset < part.value.byteLength && !terminal;
        offset += 16384
      ) {
        buffer += decoder.decode(part.value.subarray(offset, offset + 16384), {
          stream: true,
        });
        let separator: RegExpExecArray | null;
        while ((separator = /\r?\n\r?\n/.exec(buffer))) {
          const frame = buffer.slice(0, separator.index);
          buffer = buffer.slice(separator.index + separator[0].length);
          if (Buffer.byteLength(frame) > 512000)
            throw new AiError('CHATGPT_RESPONSE_TOO_LARGE');
          const data = frame
            .split(/\r?\n/)
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).replace(/^ /, ''))
            .join('\n');
          if (!data || data === '[DONE]') continue;
          const wire: unknown = JSON.parse(data);
          const event = z
            .object({
              type: z.string(),
              response: z.unknown().optional(),
              code: z.string().nullable().optional(),
              param: z.string().nullable().optional(),
            })
            .parse(wire);
          if (event.type === 'response.failed') {
            const failure = z
              .object({ error: z.unknown().optional() })
              .parse(event.response);
            throw streamError(failure.error, response);
          }
          if (event.type === 'error') throw streamError(event, response);
          if (event.type === 'response.incomplete')
            throw new AiError('CHATGPT_RESPONSE_INCOMPLETE');
          if (event.type === 'response.output_text.delta' && !firstOutputAt) {
            const delta = z.object({ delta: z.string() }).parse(wire).delta;
            if (delta.length) {
              firstOutputAt = new Date().toISOString();
              firstOutputEvidence = 'TEXT_DELTA';
            }
          }
          if (event.type === 'response.output_item.done') {
            const item = z
              .object({
                output_index: z.number().int().min(0).max(63),
                item: completed.shape.output.element,
              })
              .parse(wire);
            if (done.has(item.output_index))
              throw new AiError('INVALID_OUTPUT');
            done.set(item.output_index, item.item);
            if (Buffer.byteLength(JSON.stringify([...done.values()])) > 512000)
              throw new AiError('CHATGPT_RESPONSE_TOO_LARGE');
          }
          if (event.type === 'response.completed') {
            terminal = completed.parse(event.response);
            break;
          }
        }
        if (Buffer.byteLength(buffer) > 512000)
          throw new AiError('CHATGPT_RESPONSE_TOO_LARGE');
      }
    }
    if (!terminal) throw new AiError('STREAM_INTERRUPTED');
    for (const [index, item] of done)
      if (
        terminal.output.length &&
        JSON.stringify(terminal.output[index]) !== JSON.stringify(item)
      )
        throw new AiError('INVALID_OUTPUT');
    const output = terminal.output.length
      ? terminal.output
      : [...done.entries()]
          .sort(([a], [b]) => a - b)
          .map(([index, item], position) => {
            if (index !== position) throw new AiError('INVALID_OUTPUT');
            return item;
          });
    const calls = output.filter((item) => item.type === 'function_call');
    if (
      !firstOutputAt &&
      output.some(
        (item) =>
          item.type === 'message' &&
          item.content.some(
            (part) => part.type === 'output_text' && part.text.length,
          ),
      )
    ) {
      firstOutputAt = new Date().toISOString();
      firstOutputEvidence = 'TERMINAL_TEXT';
    }
    if (new Set(calls.map((item) => item.call_id)).size !== calls.length)
      throw new AiError('INVALID_TOOL_CALL');
    // Executors validate arguments so a bad call can receive its own error result.
    return {
      model: terminal.model,
      ...(firstOutputAt ? { firstOutputAt, firstOutputEvidence } : {}),
      ...(terminal.reasoning?.effort
        ? { reasoningEffort: terminal.reasoning.effort }
        : {}),
      ...(output.some((item) => item.type === 'web_search_call')
        ? {
            webSearches: output.filter(
              (item) =>
                item.type === 'web_search_call' && item.status === 'completed',
            ).length,
            webActions: output.flatMap((item) =>
              item.type === 'web_search_call'
                ? [
                    {
                      id: item.id,
                      status: item.status,
                      ...(item.action === undefined
                        ? {}
                        : { action: item.action }),
                    },
                  ]
                : [],
            ),
            webCitations: output.flatMap((item) =>
              item.type === 'message'
                ? item.content.flatMap((part) =>
                    (part.annotations ?? []).map(({ url, title }) => ({
                      url,
                      title,
                    })),
                  )
                : [],
            ),
          }
        : {}),
      text: output
        .flatMap((item) =>
          item.type === 'message' ? item.content.map((part) => part.text) : [],
        )
        .join(''),
      calls,
      usage: terminal.usage ?? null,
      continuation: output,
      requestId: response.headers.get('x-request-id')?.slice(0, 200) ?? null,
    };
  } finally {
    signal.removeEventListener('abort', abort);
    // Transport cleanup must not hold a validated result beyond the job deadline.
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
