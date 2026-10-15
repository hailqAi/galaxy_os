import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { MemoryCard, ProjectAiMemory } from './project-ai-memory';

it('starts private and describes explicit publication without claiming business approval', () => {
  const html = renderToStaticMarkup(
    createElement(ProjectAiMemory, { projectId: 'A', actorId: 'owner' }),
  );
  expect(html).toContain('Riêng của tôi');
  expect(html).toContain('aria-pressed="true"');
  expect(html).toContain('Dùng chung');
  expect(html).not.toContain('quyết định đã duyệt');
});

it('renders an unavailable source without text or publication controls', () => {
  const html = renderToStaticMarkup(
    createElement(MemoryCard, {
      note: {
        id: 'm',
        revisionId: 'r',
        version: 2,
        visibility: 'PRIVATE',
        kind: 'NOTE',
        content: null,
        category: null,
        verification: null,
        provenance: null,
        sources: [],
        createdAt: '2026-10-09T00:00:00Z',
        updatedAt: '2026-10-09T00:00:00Z',
        canEdit: true,
        sourceStatus: 'SOURCE_UNAVAILABLE',
      },
      onSelect: () => {},
    }),
  );
  expect(html).toContain('Nguồn không còn khả dụng');
  expect(html).not.toContain('undefined');
  expect(html).not.toContain('Công bố');
});

it('blocks selecting another note until an acknowledged write has finished refreshing', () => {
  const html = renderToStaticMarkup(
    createElement(MemoryCard, {
      note: {
        id: 'm',
        revisionId: 'r',
        version: 1,
        visibility: 'PRIVATE',
        kind: 'NOTE',
        content: 'content',
        category: 'NOTE',
        verification: 'UNVERIFIED',
        provenance: null,
        sources: [],
        createdAt: '2026-10-09T00:00:00Z',
        updatedAt: '2026-10-09T00:00:00Z',
        canEdit: true,
      },
      onSelect: () => {},
      disabled: true,
    }),
  );
  expect(html).toContain('disabled=""');
});
