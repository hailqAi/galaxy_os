import { z } from 'zod';
import { AiError } from './ai-registry';
import { toolDefinitions, toolInputs, type ToolName } from './ai-tools';

// Official SIWC wire contract, separate from API-key codecs. Not a live grant
// or a registered dispatcher until Galaxy app eligibility/lifecycle is verified.
const text = z.string().min(1).max(32000);
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
const message = z.object({
  type: z.literal('message'),
  role: z.literal('assistant').default('assistant'),
  content: z
    .array(
      z.object({ type: z.literal('output_text'), text: z.string().max(32000) }),
    )
    .max(32),
});
const inputItem = z.union([
  z
    .object({ role: z.enum(['user', 'assistant', 'developer']), content: text })
    .strict(),
  call.strict(),
  reasoning.strict(),
  message.strict(),
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
    input: z.array(inputItem).min(1).max(64),
    tools: z.array(toolName).max(16).default([]),
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

export function chatGptRequest(value: unknown) {
  const input = request.parse(value);
  if (Buffer.byteLength(JSON.stringify(input)) > 256000)
    throw new AiError('TOOL_CONTEXT_LIMIT');
  return {
    model: input.model,
    input: input.input,
    store: false,
    stream: true,
    ...(input.instructions ? { instructions: input.instructions } : {}),
    ...(input.tools.length
      ? {
          tools: [
            {
              type: 'namespace',
              name: 'galaxy',
              description: 'Authorized Galaxy Project tools',
              tools: toolDefinitions(input.tools).map((definition) => ({
                type: 'function',
                ...definition.function,
              })),
            },
          ],
        }
      : {}),
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
        // Kept for stateless continuation, never user-visible answer text.
        reasoning,
      ]),
    )
    .max(64),
  usage: z
    .object({
      input_tokens: z.number().int().nonnegative(),
      output_tokens: z.number().int().nonnegative(),
    })
    .optional(),
});
function streamError(
  value: unknown,
  response: Response,
  stage: string | null = null,
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
    );
  } catch {
    signal.throwIfAborted();
    return streamError({}, response);
  } finally {
    timeout.removeEventListener('abort', abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function readChatGptStream(
  response: Response,
  signal: AbortSignal,
) {
  if (!response.ok) throw await httpError(response, signal);
  if (!response.body) throw new AiError('CHATGPT_HTTP_ERROR', response.status);
  if (!response.headers.get('content-type')?.startsWith('text/event-stream'))
    throw new AiError('CHATGPT_STREAM_REQUIRED');
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let buffer = '',
    bytes = 0;
  let terminal: z.infer<typeof completed> | undefined;
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
      bytes += part.value.byteLength;
      if (bytes > 512000) throw new AiError('CHATGPT_RESPONSE_TOO_LARGE');
      buffer += decoder.decode(part.value, { stream: true });
      let separator: RegExpExecArray | null;
      while ((separator = /\r?\n\r?\n/.exec(buffer))) {
        const frame = buffer.slice(0, separator.index);
        buffer = buffer.slice(separator.index + separator[0].length);
        const data = frame
          .split(/\r?\n/)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).replace(/^ /, ''))
          .join('\n');
        if (!data || data === '[DONE]') continue;
        const event = z
          .object({
            type: z.string(),
            response: z.unknown().optional(),
            code: z.string().nullable().optional(),
            param: z.string().nullable().optional(),
          })
          .parse(JSON.parse(data));
        if (event.type === 'response.failed') {
          const failure = z
            .object({ error: z.unknown().optional() })
            .parse(event.response);
          throw streamError(failure.error, response);
        }
        if (event.type === 'error') throw streamError(event, response);
        if (event.type === 'response.incomplete')
          throw new AiError('CHATGPT_RESPONSE_INCOMPLETE');
        if (event.type === 'response.completed') {
          terminal = completed.parse(event.response);
          break;
        }
      }
    }
    if (!terminal) throw new AiError('STREAM_INTERRUPTED');
    const calls = terminal.output.filter(
      (item) => item.type === 'function_call',
    );
    if (new Set(calls.map((item) => item.call_id)).size !== calls.length)
      throw new AiError('INVALID_TOOL_CALL');
    for (const item of calls)
      toolInputs[item.name].parse(JSON.parse(item.arguments));
    return {
      model: terminal.model,
      text: terminal.output
        .flatMap((item) =>
          item.type === 'message' ? item.content.map((part) => part.text) : [],
        )
        .join(''),
      calls,
      usage: terminal.usage ?? null,
      continuation: terminal.output,
      requestId: response.headers.get('x-request-id')?.slice(0, 200) ?? null,
    };
  } finally {
    signal.removeEventListener('abort', abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
