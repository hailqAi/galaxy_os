import { z } from 'zod';
const channel = z
  .string()
  .regex(/^agtch_[A-Za-z0-9_-]+$/)
  .max(200);
const run = z
  .string()
  .regex(/^apirun_[A-Za-z0-9_-]+$/)
  .max(200);
const endpoint = (id: string) =>
  'https://api.chatgpt.com/v1/workspace_agents/' + id;
const headers = (token: string) => ({
  Authorization: 'Bearer ' + token,
  'Content-Type': 'application/json',
  'OpenAI-Beta': 'workspace_agent_runs=v1',
});
async function json(response: Response, allowEmpty = false) {
  if (!response.body) {
    if (allowEmpty) return null;
    throw new Error('WORKSPACE_RESPONSE_INVALID');
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 65536) {
        await reader.cancel();
        throw new Error('WORKSPACE_RESPONSE_INVALID');
      }
      chunks.push(part.value);
    }
    if (!size && allowEmpty) return null;
    return JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)),
    ) as unknown;
  } catch {
    throw new Error('WORKSPACE_RESPONSE_INVALID');
  } finally {
    reader.releaseLock();
  }
}
export async function triggerWorkspace(input: {
  channelId: string;
  token: string;
  input: string;
  conversationKey: string;
  idempotencyKey: string;
  fetcher?: typeof fetch;
  signal?: AbortSignal;
}) {
  if (!channel.safeParse(input.channelId).success)
    throw new Error('WORKSPACE_CHANNEL_INVALID');
  const response = await (input.fetcher ?? fetch)(
    endpoint(input.channelId) + '/trigger',
    {
      method: 'POST',
      headers: {
        ...headers(input.token),
        'Idempotency-Key': input.idempotencyKey,
      },
      body: JSON.stringify({
        input: input.input,
        conversation_key: input.conversationKey,
      }),
      redirect: 'error',
      signal: input.signal ?? AbortSignal.timeout(30000),
    },
  );
  if (response.status !== 202) throw new Error('WORKSPACE_TRIGGER_REJECTED');
  const body = await json(response, true);
  if (body === null) return { runId: null };
  const accepted = z
    .object({
      conversation_url: z.string().url(),
      agent_trigger_run_id: run.optional(),
    })
    .safeParse(body);
  if (
    !accepted.success ||
    new URL(accepted.data.conversation_url).origin !== 'https://chatgpt.com'
  )
    throw new Error('WORKSPACE_RESPONSE_INVALID');
  return { runId: accepted.data.agent_trigger_run_id ?? null };
}
export async function pollWorkspace(input: {
  channelId: string;
  runId: string;
  token: string;
  fetcher?: typeof fetch;
  signal?: AbortSignal;
}) {
  if (
    !channel.safeParse(input.channelId).success ||
    !run.safeParse(input.runId).success
  )
    throw new Error('WORKSPACE_CHANNEL_INVALID');
  const response = await (input.fetcher ?? fetch)(
    endpoint(input.channelId) + '/runs/' + input.runId,
    {
      headers: headers(input.token),
      redirect: 'error',
      signal: input.signal ?? AbortSignal.timeout(30000),
    },
  );
  if (response.status !== 200) throw new Error('WORKSPACE_POLL_REJECTED');
  const parsed = z
    .object({
      status: z.enum([
        'queued',
        'in_progress',
        'suspended',
        'completed',
        'failed',
      ]),
    })
    .safeParse(await json(response));
  if (!parsed.success) throw new Error('WORKSPACE_RESPONSE_INVALID');
  return parsed.data;
}
