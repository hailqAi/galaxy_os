import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { ChatText } from './chat-text';

it('renders readable blocks while HTML and URLs remain inert text', () => {
  const html = renderToStaticMarkup(
    <ChatText
      text={
        '## Kết quả\n\n- Một\n- Hai\n\n| Mã | Rộng |\n| --- | --- |\n| NG-42 | 900 |\n\n```txt\n<script>bad()</script>\n```\n\n<img src="https://example.test/private">\nhttps://example.test/khong-preview'
      }
    />,
  );
  expect(html).toContain('<h3>Kết quả</h3>');
  expect(html).toContain('<li>Một</li>');
  expect(html).toContain('<table>');
  expect(html).toContain('<td>900</td>');
  expect(html).toContain('<pre>');
  expect(html).toContain('&lt;script&gt;');
  expect(html).not.toMatch(/<(img|script|iframe|a)\b/);
});
