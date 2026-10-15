import { expect, it, vi } from 'vitest';
import { triggerWorkspace, pollWorkspace } from './workspace-agent-api';
const channel = 'agtch_synthetic';
it('uses the fixed official endpoint, stable idempotency and exact input without unsupported model fields', async () => {
  const fetcher = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          conversation_url:
            'https://chatgpt.com/workspace/conversation/synthetic',
          agent_trigger_run_id: 'apirun_synthetic',
        }),
        { status: 202 },
      ),
  );
  const input = '  Câu hỏi nguyên gốc\n';
  const accepted = await triggerWorkspace({
    channelId: channel,
    token: 'synthetic-token',
    input,
    conversationKey: 'scope-key',
    idempotencyKey: 'idempotent',
    fetcher: fetcher as typeof fetch,
  });
  expect(accepted).toMatchObject({ runId: 'apirun_synthetic' });
  const [url, options] = fetcher.mock.calls[0] as unknown as [
    string,
    RequestInit,
  ];
  expect(url).toBe(
    'https://api.chatgpt.com/v1/workspace_agents/agtch_synthetic/trigger',
  );
  expect(JSON.parse(String(options.body))).toEqual({
    input,
    conversation_key: 'scope-key',
  });
  expect(options.headers).toMatchObject({
    'Idempotency-Key': 'idempotent',
    'OpenAI-Beta': 'workspace_agent_runs=v1',
  });
});
it('does not treat provider completed as a returned answer or follow redirects', async () => {
  const fetcher = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          status: 'completed',
          agent_trigger_run_id: 'apirun_synthetic',
        }),
        { status: 200 },
      ),
  );
  expect(
    await pollWorkspace({
      channelId: channel,
      runId: 'apirun_synthetic',
      token: 'synthetic',
      fetcher: fetcher as typeof fetch,
    }),
  ).toEqual({ status: 'completed' });
  expect(fetcher.mock.calls[0]).toBeDefined();
});
it('rejects channel/path substitution, unexpected 200 trigger and provider errors without echoing secrets', async () => {
  await expect(
    triggerWorkspace({
      channelId: '../bad',
      token: 'secret',
      input: 'Q',
      conversationKey: 'key',
      idempotencyKey: 'key',
    }),
  ).rejects.toThrow('WORKSPACE_CHANNEL_INVALID');
  const fetcher = async () => new Response('synthetic-secret', { status: 200 });
  await expect(
    triggerWorkspace({
      channelId: channel,
      token: 'secret',
      input: 'Q',
      conversationKey: 'key',
      idempotencyKey: 'key',
      fetcher,
    }),
  ).rejects.toThrow('WORKSPACE_TRIGGER_REJECTED');
});

it('stops reading an oversized provider body instead of allocating it in full', async () => {
  let pulled = 0,
    cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulled++;
      controller.enqueue(new Uint8Array(40000));
      if (pulled === 4) controller.close();
    },
    cancel() {
      cancelled = true;
    },
  });
  await expect(
    pollWorkspace({
      channelId: channel,
      runId: 'apirun_synthetic',
      token: 'synthetic',
      fetcher: async () => new Response(body),
    }),
  ).rejects.toThrow('WORKSPACE_RESPONSE_INVALID');
  expect(cancelled).toBe(true);
  expect(pulled).toBeLessThan(4);
});

it('accepts an empty 202 queue receipt without claiming output or a run ID', async () => {
  expect(
    await triggerWorkspace({
      channelId: channel,
      token: 'synthetic',
      input: 'Q',
      conversationKey: 'key',
      idempotencyKey: 'key',
      fetcher: async () => new Response(null, { status: 202 }),
    }),
  ).toEqual({ runId: null });
});
