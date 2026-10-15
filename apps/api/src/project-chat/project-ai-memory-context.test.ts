import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  ProjectAiMemoryService,
  type MemoryScope,
  type MemoryView,
} from './project-ai-memory.service';

const note = (id: string, verification = 'USER_CONFIRMED'): MemoryView => ({
  id,
  revisionId: 'revision-' + id,
  version: 1,
  visibility: 'PRIVATE',
  kind: 'NOTE',
  category: 'DECISION',
  content: id,
  verification,
  provenance: { kind: 'USER_INPUT', editorId: 'owner', createdAt: new Date(0) },
  sources: [],
  createdAt: new Date(0),
  updatedAt: new Date(0),
  canEdit: true,
});

describe('authorized Project memory for request context', () => {
  it('keeps confirmed rules past the first page and deduplicates relevant matches', async () => {
    const service = new ProjectAiMemoryService(null as never, null as never);
    const first = Array.from({ length: 20 }, (_, i) => note('rule-' + i));
    const last = note('confirmed-rule-last');
    const list = vi
      .spyOn(service, 'list')
      .mockResolvedValueOnce({ items: first, nextCursor: 'next-page' })
      .mockResolvedValueOnce({
        items: [last, note('unrelated', 'UNVERIFIED')],
        nextCursor: null,
      });
    vi.spyOn(service, 'search').mockResolvedValue([
      last,
      note('relevant', 'UNVERIFIED'),
    ]);
    const tx = {} as Prisma.TransactionClient,
      scope = {} as MemoryScope;
    const resolve = vi.fn();
    const selected = await service.context(
      tx,
      scope,
      'Apply the saved rule',
      resolve,
    );
    expect(selected.map((item) => item.id)).toEqual([
      ...first.map((item) => item.id),
      last.id,
      'relevant',
    ]);
    expect(list.mock.calls[1]![2].cursor).toBe('next-page');
    expect(selected.at(-2)).toMatchObject({
      revisionId: last.revisionId,
      version: 1,
    });
  });

  it('never inserts unavailable memory or unrelated unconfirmed notes into context', async () => {
    const service = new ProjectAiMemoryService(null as never, null as never);
    vi.spyOn(service, 'list').mockResolvedValue({
      items: [
        {
          ...note('hidden'),
          content: null,
          category: null,
          verification: null,
          provenance: null,
          sources: [],
          sourceStatus: 'SOURCE_UNAVAILABLE',
        },
        note('draft', 'UNVERIFIED'),
      ],
      nextCursor: null,
    });
    vi.spyOn(service, 'search').mockResolvedValue([]);
    expect(
      await service.context(
        {} as Prisma.TransactionClient,
        {} as MemoryScope,
        'A different request',
        vi.fn(),
      ),
    ).toEqual([]);
  });
});
