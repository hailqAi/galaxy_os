import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { AiAnswer, aiStatusLabel } from './project-ai';

it('renders truthful AI state and escaped answer with versioned backend citations', () => {
  expect(aiStatusLabel('NOT_CONFIGURED')).toContain('Chưa cấu hình');
  expect(aiStatusLabel('FAILED_UNKNOWN')).toContain('Không tự gọi lại');
  const html = renderToStaticMarkup(
    createElement(AiAnswer, {
      answer: {
        id: 'a',
        status: 'COMPLETED',
        question: 'GH-42?',
        answer: '<script>900 mm</script>',
        uncertainty: 'Chưa xác nhận',
        sources: [
          {
            handle: 'S_one',
            label: 'Tin nhắn #1',
            version: 'v1',
            provenance: 'UNCONFIRMED',
            startLine: 1,
            endLine: 2,
          },
        ],
      },
      onSource: () => {},
      onCancel: () => {},
      onRun: () => {},
    }),
  );
  expect(html).toContain('&lt;script&gt;');
  expect(html).toContain('Chưa xác nhận');
  expect(html).toContain('v1');
  expect(html).toContain('AI tạo');
  expect(html).not.toContain('33003');
});

it('never renders derived text or citations for revoked or cancelled answers', () => {
  for (const status of ['ACCESS_REVOKED', 'CANCELLED']) {
    const html = renderToStaticMarkup(
      createElement(AiAnswer, {
        answer: {
          id: 'a',
          status,
          question: 'old-private-question',
          answer: 'old-private-answer',
          uncertainty: 'old-private-note',
          sources: [],
        },
        onSource: () => {},
        onCancel: () => {},
        onRun: () => {},
      }),
    );
    expect(html).not.toContain('old-private-answer');
    expect(html).not.toContain('old-private-note');
    if (status === 'ACCESS_REVOKED')
      expect(html).not.toContain('old-private-question');
  }
});
