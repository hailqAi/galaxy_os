import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { ChatComposer, mergeMessages } from './project-chat';

describe('M2-A chat UI', () => {
  it('deduplicates the same persisted message after polling and keeps server sequence', () => {
    const a = {
      id: 'a',
      sequence: 1,
      body: 'Một',
      authorId: 'u',
      createdAt: '2026-09-28',
      attachments: [],
    };
    const b = { ...a, id: 'b', sequence: 2 };
    expect(mergeMessages([b], [a, b]).map((m) => m.id)).toEqual(['a', 'b']);
  });
  it('renders read-only and escaped text without a fake AI button', () => {
    const html = renderToStaticMarkup(
      createElement(ChatComposer, {
        value: '<script>bad()</script>',
        disabled: true,
        reason: 'Bạn chỉ có quyền xem',
        sending: false,
        onChange: () => {},
        onSubmit: () => {},
      }),
    );
    expect(html).toContain('disabled');
    expect(html).toContain('Bạn chỉ có quyền xem');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('Hỏi GPT');
  });
});

it('labels a draft contract snapshot as information without inferring business approval', async () => {
  const { SourceReviewLabel } = await import('./chat-controls');
  const html = renderToStaticMarkup(
    createElement(SourceReviewLabel, {
      source: { sourceType: 'CONTRACT', title: 'Hợp đồng dự thảo' },
    }),
  );
  expect(html).toContain('Hợp đồng dự thảo');
  expect(html).toContain('Bản thông tin từ hồ sơ');
  expect(html).not.toContain('Nguồn đã duyệt');
});
