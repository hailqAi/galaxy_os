import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { InitiateUploadDto, RecoverUploadsQuery } from './uploads.dto';
import { uploadConstraints } from './uploads.service';

const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});
const upload = (input: Record<string, unknown>) =>
  pipe.transform(input, { type: 'body', metatype: InitiateUploadDto });
const recovery = (input: Record<string, unknown>) =>
  pipe.transform(input, { type: 'query', metatype: RecoverUploadsQuery });
const file = () => ({
  projectId: randomUUID(),
  aiConversationId: randomUUID(),
  idempotencyKey: randomUUID(),
  originalFilename: 'Nguồn nháp.md',
  declaredSize: 10_000_000_000,
  mimeType: 'text/markdown',
});

it('admits the owned-conversation target without a dummy business document', async () => {
  const input = file();
  await expect(upload(input)).resolves.toMatchObject(input);
});

it('requires exactly one upload target and a UUID chat replay key', async () => {
  const input = file();
  for (const value of [
    { ...input, requiredDocumentId: randomUUID() },
    { ...input, aiConversationId: undefined },
    { ...input, aiConversationId: 'not-a-conversation' },
    { ...input, idempotencyKey: 'business-human-key' },
  ])
    await expect(upload(value)).rejects.toThrow();
  const business = { ...input, aiConversationId: undefined };
  await expect(
    upload({
      ...business,
      requiredDocumentId: randomUUID(),
      idempotencyKey: 'business-human-key',
    }),
  ).resolves.toMatchObject({ idempotencyKey: 'business-human-key' });
});

it('recovers chat uploads only within one explicit conversation target', async () => {
  const input = { projectId: randomUUID(), aiConversationId: randomUUID() };
  await expect(recovery(input)).resolves.toMatchObject(input);
  await expect(
    recovery({ ...input, requiredDocumentId: randomUUID() }),
  ).rejects.toThrow();
  await expect(
    recovery({ ...input, stageOneDocumentId: randomUUID() }),
  ).rejects.toThrow();
});
it('adds text/Markdown/PPTX only to chat resumable admission, preserving business formats', () => {
  for (const extension of ['.txt', '.md', '.pptx']) {
    expect(uploadConstraints(10_000_000_000, true).allowedExtensions).toContain(
      extension,
    );
    expect(uploadConstraints(10_000_000_000).allowedExtensions).not.toContain(
      extension,
    );
  }
});
