import 'reflect-metadata';
import { validate } from 'class-validator';
import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { ChatAiQuestionDto } from './project-chat.dto';

it('accepts exact max at chat admission and rejects invented reasoning modes', async () => {
  const dto = Object.assign(new ChatAiQuestionDto(), {
    clientKey: randomUUID(),
    question: '  Giữ nguyên câu hỏi 😀\n',
    reasoning: 'max',
  });
  expect(await validate(dto)).toEqual([]);
  dto.reasoning = 'unlimited';
  expect((await validate(dto)).map((e) => e.property)).toEqual(['reasoning']);
});

it('validates an exact current public query without accepting a client authorization receipt', async () => {
  const dto = Object.assign(new ChatAiQuestionDto(), {
    clientKey: randomUUID(),
    question: 'Original private question stays here',
    searchMode: 'WEB',
    publicQuery: 'Official SIWC preview limitations',
  });
  expect(
    await validate(dto, { whitelist: true, forbidNonWhitelisted: true }),
  ).toEqual([]);
  for (const publicQuery of ['', ' ', 'x'.repeat(401)]) {
    dto.publicQuery = publicQuery;
    expect((await validate(dto)).map((e) => e.property)).toContain(
      'publicQuery',
    );
  }
  dto.publicQuery = 'public';
  Object.assign(dto, { searchMode: 'UNKNOWN' });
  expect((await validate(dto)).map((e) => e.property)).toContain('searchMode');
  Object.assign(dto, { searchMode: 'WEB', authorizationHash: 'a'.repeat(64) });
  expect(
    (await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).map(
      (e) => e.property,
    ),
  ).toContain('authorizationHash');
});
