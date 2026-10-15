import { expect, it } from 'vitest';
import { readAiDraft } from './ai-draft';

it.each([['NORMAL'], ['DEEP'], { value: 'NORMAL' }, 1])(
  'rejects a non-string persisted run mode %j',
  (runMode) => {
    const value = {
      version: 1,
      conversationId: id,
      question: request.question,
      sourceIds: [id],
      request: { ...request, runMode },
    };
    expect(readAiDraft(JSON.stringify(value))).toBeUndefined();
  },
);

const id = '50000000-0000-4000-8000-000000000101';
const request = {
  conversationKey: id,
  clientKey: id,
  conversationId: id,
  question: 'Keep the original question',
  scope: 'ALL',
  model: 'selected-model',
  reasoning: 'max',
  searchMode: 'PROJECT_ONLY',
  sourceIds: [id],
};

it('keeps the Create format with the original question and selected file through draft/retry', () => {
  const draft = {
    version: 1,
    conversationId: id,
    question: request.question,
    sourceIds: [id],
    outputFormat: 'xlsx',
    request: { ...request, outputFormat: 'xlsx' },
  };
  expect(readAiDraft(JSON.stringify(draft))).toEqual(draft);
  expect(
    readAiDraft(JSON.stringify({ ...draft, outputFormat: 'exe' })),
  ).toBeUndefined();
  expect(
    readAiDraft(
      JSON.stringify({
        ...draft,
        request: { ...draft.request, outputFormat: ['xlsx'] },
      }),
    ),
  ).toBeUndefined();
});

it('restores only the bounded draft and exact pending request, without file binary or auth data', () => {
  const draft = {
    version: 1,
    conversationId: id,
    conversationKey: id,
    question: request.question,
    sourceIds: [id],
    request,
  };
  expect(readAiDraft(JSON.stringify(draft))).toEqual(draft);
  for (const extra of [
    { token: 'secret' },
    { file_data: 'binary' },
    { request: { ...request, sourceIds: ['foreign'] } },
    { request: { ...request, reasoning: 'invented' } },
    { sourceIds: Array(4).fill(id) },
    { question: 'a'.repeat(256001) },
  ])
    expect(readAiDraft(JSON.stringify({ ...draft, ...extra }))).toBeUndefined();
  expect(readAiDraft('not json')).toBeUndefined();
  expect(readAiDraft(null)).toBeUndefined();
});

it('retains bounded pending original upload identities without browser File data', () => {
  const pending = {
    key: id,
    sessionId: id,
    originalFilename: 'Pending.csv',
    declaredSize: '50000001',
  };
  const draft = {
    version: 1,
    conversationId: id,
    question: 'Wait for this file',
    sourceIds: [],
    pendingFiles: [pending],
  };
  expect(readAiDraft(JSON.stringify(draft))).toEqual(draft);
  for (const extra of [
    { file_data: 'binary' },
    { sessionId: 'forged' },
    { declaredSize: '10000000001' },
    { declaredSize: '5e7' },
  ])
    expect(
      readAiDraft(
        JSON.stringify({ ...draft, pendingFiles: [{ ...pending, ...extra }] }),
      ),
    ).toBeUndefined();
});

it('keeps the approved run mode pinned through draft reload and rejects invented modes', () => {
  const draft = {
    version: 1,
    conversationId: id,
    question: request.question,
    sourceIds: [id],
    request: { ...request, runMode: 'DEEP' },
  };
  expect(readAiDraft(JSON.stringify(draft))).toEqual(draft);
  expect(
    readAiDraft(
      JSON.stringify({
        ...draft,
        request: { ...draft.request, runMode: 'UNBOUNDED' },
      }),
    ),
  ).toBeUndefined();
});
