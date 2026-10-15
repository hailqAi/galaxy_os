import { expect, it, vi } from 'vitest';
import { uploadAiFile } from './project-ai-upload';

const constraints = { maxBytes: 10_000_000_000, allowedExtensions: ['.csv'] };
const base = {
  id: 'session',
  projectId: 'project',
  aiConversationId: 'conversation',
  originalFilename: 'source.csv',
  declaredSize: '12',
  mimeType: 'text/csv',
  status: 'UPLOADING',
  partSize: 8,
  totalParts: 2,
  uploadedBytes: '8',
  uploadedParts: [{ partNumber: 1, size: 8, checksum: 'first-hash' }],
  constraints,
};
const input = (
  request: (path: string, init?: RequestInit) => Promise<unknown>,
) => ({
  projectId: 'project',
  conversationId: 'conversation',
  key: 'key',
  sessionId: 'session',
  file: new File(['0007392,1234'], 'source.csv', { type: 'text/csv' }),
  signal: new AbortController().signal,
  request,
});

it('verifies retained slices and sends only missing parts before returning the real source', async () => {
  const calls: { path: string; body?: BodyInit | null }[] = [];
  const request = vi.fn(async (path: string, init?: RequestInit) => {
    calls.push({ path, body: init?.body });
    if (path.endsWith('/complete'))
      return { status: 'AVAILABLE', sourceId: 'source' };
    if (path.includes('/parts?')) return { ...base, uploadedBytes: '12' };
    return base;
  });
  const digest = vi.fn(async (blob: Blob) =>
    blob.size === 8 ? 'first-hash' : 'last-hash',
  );
  const result = await uploadAiFile({ ...input(request), digest });
  expect(result.sourceId).toBe('source');
  expect(
    calls
      .filter((call) => call.path.includes('/parts?'))
      .map((call) => call.path),
  ).toEqual(['/uploads/session/parts?partNumber=2&checksum=last-hash']);
  expect(
    calls.find((call) => call.path.includes('/parts?'))!.body,
  ).toBeInstanceOf(Blob);
  expect(digest.mock.calls.every(([blob]) => blob.size <= 8)).toBe(true);
});

it('rejects wrong scope, changed retained bytes and geometry before transferring data', async () => {
  for (const changed of [
    { ...base, projectId: 'other-project' },
    { ...base, aiConversationId: 'other-conversation' },
    { ...base, totalParts: 3 },
    {
      ...base,
      uploadedParts: [{ partNumber: 1, size: 8, checksum: 'changed' }],
    },
  ]) {
    const request = vi.fn(async () => changed);
    await expect(
      uploadAiFile({ ...input(request), digest: async () => 'first-hash' }),
    ).rejects.toThrow();
    expect(request).toHaveBeenCalledTimes(1);
  }
});

it('keeps committed progress on an interrupted part and never completes after cancellation', async () => {
  const stop = new AbortController();
  const progress: number[] = [];
  const request = vi.fn(async (path: string) => {
    if (path.includes('/parts?')) {
      stop.abort();
      throw new Error('interrupted');
    }
    return base;
  });
  await expect(
    uploadAiFile({
      ...input(request),
      signal: stop.signal,
      digest: async () => 'first-hash',
      onProgress: (value) => progress.push(value),
    }),
  ).rejects.toThrow();
  expect(progress).toEqual([8]);
  expect(request.mock.calls.some(([path]) => path.endsWith('/complete'))).toBe(
    false,
  );
});
