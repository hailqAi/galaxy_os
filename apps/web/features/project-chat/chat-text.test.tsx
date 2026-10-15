import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { ChatText, isChatFileUrl } from './chat-text';

it('links only known public references in prose, preserving code and existing links', () => {
  const handle = 'T_' + 'a'.repeat(24);
  const unknown = 'T_' + 'b'.repeat(24);
  const text = `**Giá [${handle}]**\n\n| Nguồn |\n| --- |\n| [${handle}] |\n\n\`[${handle}]\`\n\n\`\`\`txt\n[${handle}]\n\`\`\`\n\n[Giữ [${handle}]](https://example.test/existing)\n\n[${unknown}]`;
  const html = renderToStaticMarkup(
    <ChatText
      text={text}
      citations={[
        { handle, url: 'https://example.test/official', title: 'Nhà sản xuất' },
      ]}
    />,
  );
  expect(html.match(/href="https:\/\/example.test\/official"/g)).toHaveLength(
    2,
  );
  expect(html).toContain('title="Nhà sản xuất"');
  expect(html).toContain('<strong>Giá ');
  expect(html).toContain(`<code>[${handle}]</code>`);
  expect(html).toContain(`<code class="language-txt">[${handle}]\n</code>`);
  expect(html).toContain('href="https://example.test/existing"');
  expect(html).toContain(`>Giữ [${handle}]</a>`);
  expect(html).toContain(`[${unknown}]`);
  const unsafe = renderToStaticMarkup(
    <ChatText
      text={`[${handle}]`}
      citations={[{ handle, url: 'javascript:alert(1)', title: 'Bad' }]}
    />,
  );
  expect(unsafe).not.toContain('<a');
  expect(unsafe).toContain(`[${handle}]`);
});

it('allows only existing authenticated file-download routes', () => {
  for (const url of [
    '/api/v1/files/f/download?version=2',
    '/api/v1/project-chat/projects/p/ai/files/f/download',
    '/api/v1/project-chat/rooms/r/files/f/download',
    '/api/v1/project-chat/releases/r/download',
  ])
    expect(isChatFileUrl(url)).toBe(true);
  for (const url of [
    undefined,
    '/api/v1/me',
    '//example.test/a',
    '/api/v1/files/f/download?token=private',
    '/api/v1/files/f/download/other',
  ])
    expect(isChatFileUrl(url)).toBe(false);
  const html = renderToStaticMarkup(
    <ChatText text="![bad](/api/v1/me)" imageUrls={['/api/v1/me']} />,
  );
  expect(html).not.toContain('<img');
});

it('renders readable blocks while raw HTML remains inert text', () => {
  const html = renderToStaticMarkup(
    <ChatText
      text={
        '## Kết quả\n\n- Một\n- Hai\n\n| Mã | Rộng |\n| --- | --- |\n| NG-42 | 900 |\n\n```txt\n<script>bad()</script>\n```\n\n<img src="https://example.test/private">\n\nhttps://example.test/khong-preview'
      }
    />,
  );
  expect(html).toContain('<h3>Kết quả</h3>');
  expect(html).toContain('<li>Một</li>');
  expect(html).toContain('<table>');
  expect(html).toContain('<td>900</td>');
  expect(html).toContain('<pre>');
  expect(html).toContain('&lt;script&gt;');
  expect(html).not.toMatch(/<(img|script|iframe)\b/);
  expect(html).toContain('href="https://example.test/khong-preview"');
});

it('renders GFM inline styles, entities, tables and literal code without deleting punctuation', () => {
  const html = renderToStaticMarkup(
    <ChatText
      text={
        '**Báo giá** &amp; nguồn\n\n| Mã | Giá |\n| --- | --- |\n| *AB* | **12.50** |\n\n```json\n{"text":"**literal** &amp; ..."}\n```\n\n\\*giữ dấu sao\\* và ...'
      }
    />,
  );
  expect(html).toContain('<strong>Báo giá</strong> &amp; nguồn');
  expect(html).toContain('<em>AB</em>');
  expect(html).toContain('<strong>12.50</strong>');
  expect(html).toContain('**literal** &amp;amp; ...');
  expect(html).toContain('*giữ dấu sao* và ...');
  expect(html).toContain('Sao chép mã');
});

it('blocks executable links and external image requests; renders only authorized image URLs', () => {
  const url =
    '/api/v1/project-chat/projects/00000000-0000-4000-8000-000000000001/ai/files/00000000-0000-4000-8000-000000000002/download';
  const text = `[bad](javascript:alert%281%29) ![remote](https://example.test/?private=SECRET) ![local](${url})`;
  const blocked = renderToStaticMarkup(<ChatText text={text} />);
  expect(blocked).not.toContain('<img');
  expect(blocked).not.toContain('href="javascript:');
  const allowed = renderToStaticMarkup(
    <ChatText text={text} imageUrls={[url]} />,
  );
  expect(allowed).toContain(`src="${url}"`);
  expect(allowed).not.toContain('src="https://');
  expect(allowed).toContain('referrerPolicy="no-referrer"');
});
