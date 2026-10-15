import { z } from 'zod';
import { AiError } from './ai-registry';
import { toolDefinitions, toolInputs, type ToolName } from './ai-tools';

// Wire contracts only: no route/registry registration until persisted budget,
// request/source ACL, receipts and FileAsset publication are connected.
// The existing OpenRouter runner remains the only enabled tool dispatcher.
export function dispatchOpenAiCapability(): Promise<never> {
  return Promise.reject(new AiError('NEEDS_PROVIDER_CONFIGURATION_OR_BUDGET'));
}
type Capability =
  | 'responses'
  | 'generate_image'
  | 'edit_image'
  | 'transcribe_audio'
  | 'speak_response';
const model = z.string().regex(/^[a-zA-Z0-9._-]{1,100}$/);
const prompt = z.string().trim().min(1).max(16000);
const imageInput = z
  .object({
    model,
    prompt,
    size: z.enum(['1024x1024', '1024x1536', '1536x1024']),
    quality: z.enum(['low', 'medium', 'high']),
  })
  .strict();
const call = z.object({
  type: z.literal('function_call'),
  id: z.string().max(200).optional(),
  call_id: z.string().min(1).max(200),
  name: z.enum(Object.keys(toolInputs) as [ToolName, ...ToolName[]]),
  arguments: z.string().max(32000),
});
const reasoning = z
  .object({
    type: z.literal('reasoning'),
    id: z.string().min(1).max(200),
    encrypted_content: z.string().min(1).max(64000),
  })
  .transform((value) => ({ ...value, summary: [] }));
const message = z
  .object({ role: z.enum(['user', 'assistant']), content: prompt })
  .strict();
const functionOutput = z
  .object({
    type: z.literal('function_call_output'),
    call_id: z.string().min(1).max(200),
    output: z.string().max(32000),
  })
  .strict();
type Binary = { bytes: Buffer; mime: string };
function binary(source: Binary | undefined, kind: 'image' | 'audio') {
  if (!source || !source.bytes.length || source.bytes.length > 8_000_000)
    throw new AiError('INVALID_MEDIA_BINARY');
  const b = source.bytes;
  const valid =
    kind === 'image'
      ? (source.mime === 'image/png' &&
          b.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) ||
        (source.mime === 'image/jpeg' &&
          b[0] === 255 &&
          b[1] === 216 &&
          b[2] === 255)
      : (source.mime === 'audio/wav' &&
          b.toString('ascii', 0, 4) === 'RIFF' &&
          b.toString('ascii', 8, 12) === 'WAVE') ||
        (source.mime === 'audio/webm' &&
          b.subarray(0, 4).equals(Buffer.from('1a45dfa3', 'hex')));
  if (!valid) throw new AiError('INVALID_MEDIA_BINARY');
  return new Blob([new Uint8Array(b)], { type: source.mime });
}

// model comes from future verified admin capability, never a built-in paid default.
// source bytes must come from the existing authorized/versioned storage reader.
export function openAiRequest(
  capability: Capability,
  input: unknown,
  source?: Binary,
): { path: string; body: Record<string, unknown> | FormData } {
  if (Buffer.byteLength(JSON.stringify(input)) > 128_000)
    throw new AiError('TOOL_INPUT_TOO_LARGE');
  if (capability === 'responses') {
    const value = z
      .object({
        model,
        input: z
          .array(z.union([message, call, functionOutput, reasoning]))
          .min(1)
          .max(32),
        tools: z
          .array(z.enum(Object.keys(toolInputs) as [ToolName, ...ToolName[]]))
          .max(10),
        maxOutputTokens: z.number().int().min(1).max(4000),
      })
      .strict()
      .parse(input);
    return {
      path: '/responses',
      body: {
        model: value.model,
        input: value.input,
        store: false,
        include: ['reasoning.encrypted_content'],
        max_output_tokens: value.maxOutputTokens,
        parallel_tool_calls: false,
        tools: toolDefinitions(value.tools).map(({ function: definition }) => ({
          type: 'function',
          ...definition,
        })),
      },
    };
  }
  if (capability === 'generate_image' || capability === 'edit_image') {
    const value = imageInput.parse(input);
    if (capability === 'generate_image')
      return {
        path: '/images/generations',
        body: { ...value, n: 1, output_format: 'png' },
      };
    const form = new FormData();
    Object.entries(value).forEach(([key, value]) => form.set(key, value));
    form.set('n', '1');
    form.set('output_format', 'png');
    form.set(
      'image[]',
      binary(source, 'image'),
      source?.mime === 'image/jpeg' ? 'source.jpg' : 'source.png',
    );
    return { path: '/images/edits', body: form };
  }
  if (capability === 'transcribe_audio') {
    const value = z.object({ model }).strict().parse(input);
    const form = new FormData();
    form.set('model', value.model);
    form.set('response_format', 'json');
    form.set(
      'file',
      binary(source, 'audio'),
      source?.mime === 'audio/wav' ? 'source.wav' : 'source.webm',
    );
    return { path: '/audio/transcriptions', body: form };
  }
  const value = z
    .object({
      model,
      input: z.string().min(1).max(4000),
      voice: z.enum([
        'alloy',
        'ash',
        'ballad',
        'coral',
        'echo',
        'fable',
        'nova',
        'onyx',
        'sage',
        'shimmer',
      ]),
    })
    .strict()
    .parse(input);
  return { path: '/audio/speech', body: { ...value, response_format: 'mp3' } };
}

export function openAiResult(capability: Capability, input: unknown) {
  if (capability === 'speak_response') {
    if (
      !Buffer.isBuffer(input) ||
      input.length < 3 ||
      input.length > 8_000_000 ||
      !(
        input.toString('ascii', 0, 3) === 'ID3' ||
        (input[0] === 255 && (input[1]! & 224) === 224)
      )
    )
      throw new AiError('INVALID_MEDIA_BINARY');
    return { bytes: input, mime: 'audio/mpeg', label: 'Giọng đọc do AI tạo' };
  }
  if (Buffer.byteLength(JSON.stringify(input)) > 12_000_000)
    throw new AiError('TOOL_OUTPUT_TOO_LARGE');
  if (capability === 'transcribe_audio')
    return z.object({ text: z.string().max(32000) }).parse(input);
  if (capability === 'generate_image' || capability === 'edit_image') {
    const value = z
      .object({
        data: z
          .array(
            z.object({
              b64_json: z
                .string()
                .max(11_000_000)
                .regex(/^[A-Za-z0-9+/]*={0,2}$/),
            }),
          )
          .length(1),
        usage: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(input);
    const encoded = value.data[0]!.b64_json;
    const bytes = Buffer.from(encoded, 'base64');
    if (bytes.toString('base64') !== encoded)
      throw new AiError('INVALID_MEDIA_BINARY');
    binary({ bytes, mime: 'image/png' }, 'image');
    return {
      bytes,
      mime: 'image/png',
      label: 'Ảnh AI tạo/chỉnh',
      usage: value.usage ?? null,
    };
  }
  const value = z
    .object({
      id: z.string().min(1).max(200),
      model,
      status: z.literal('completed'),
      usage: z
        .object({
          input_tokens: z.number().int().nonnegative(),
          output_tokens: z.number().int().nonnegative(),
        })
        .optional(),
      output: z.array(z.object({ type: z.string() }).passthrough()).max(32),
    })
    .parse(input);
  const calls = value.output
    .filter((item) => item.type === 'function_call')
    .map((item) => call.parse(item));
  if (
    calls.length > 8 ||
    new Set(calls.map((item) => item.call_id)).size !== calls.length
  )
    throw new AiError('INVALID_TOOL_INPUT');
  for (const item of calls)
    toolInputs[item.name].parse(JSON.parse(item.arguments));
  const text = value.output
    .filter((item) => item.type === 'message')
    .flatMap(
      (item) =>
        z
          .object({
            content: z
              .array(
                z.object({
                  type: z.string(),
                  text: z.string().max(16000).optional(),
                }),
              )
              .max(32),
          })
          .parse(item).content,
    )
    .filter((item) => item.type === 'output_text')
    .map((item) => item.text ?? '')
    .join('');
  if (text.length > 16000) throw new AiError('TOOL_OUTPUT_TOO_LARGE');
  // Opaque provider continuation stays backend-only; never render/log it.
  const continuation = value.output
    .filter((item) => item.type === 'reasoning')
    .map((item) => reasoning.parse(item));
  return {
    id: value.id,
    model: value.model,
    text,
    calls,
    continuation,
    usage: value.usage ?? null,
  };
}
