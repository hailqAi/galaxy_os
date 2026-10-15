'use client';

import React, { useState } from 'react';
import Markdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';

export const isChatFileUrl = (url?: string) =>
  typeof url === 'string' &&
  /^\/api\/v1\/(?:project-chat\/(?:projects\/[^/]+\/ai\/files\/[^/]+\/download|rooms\/[^/]+\/files\/[^/]+\/download|releases\/[^/]+\/download)|files\/[^/]+\/download(?:\?version=\d+)?)$/.test(
    url,
  );

type Citation = { handle: string; url: string; title: string };
type MarkdownNode = {
  type: string;
  value?: string;
  url?: string;
  title?: string;
  data?: { hProperties: { className: string } };
  children?: MarkdownNode[];
};

function citationLinks(citations: Citation[]) {
  const known = new Map(
    citations
      .filter((citation) => /^https?:\/\//i.test(citation.url))
      .map((citation, index) => [
        citation.handle,
        { ...citation, number: index + 1 },
      ]),
  );
  return () => (tree: MarkdownNode) => {
    if (!known.size) return;
    function visit(node: MarkdownNode) {
      if (
        !node.children ||
        [
          'code',
          'inlineCode',
          'link',
          'linkReference',
          'image',
          'imageReference',
          'html',
        ].includes(node.type)
      )
        return;
      node.children = node.children.flatMap((child) => {
        if (child.type !== 'text' || !child.value) {
          visit(child);
          return [child];
        }
        const parts: MarkdownNode[] = [];
        let offset = 0;
        for (const match of child.value.matchAll(/\[(T_[a-f0-9]{24})\]/g)) {
          const citation = known.get(match[1]!);
          if (!citation) continue;
          if (match.index > offset)
            parts.push({
              type: 'text',
              value: child.value.slice(offset, match.index),
            });
          parts.push({
            type: 'link',
            url: citation.url,
            title: citation.title,
            data: { hProperties: { className: 'chat-source-citation' } },
            children: [{ type: 'text', value: `[${citation.number}]` }],
          });
          offset = match.index + match[0].length;
        }
        if (!offset) return [child];
        if (offset < child.value.length)
          parts.push({ type: 'text', value: child.value.slice(offset) });
        return parts;
      });
    }
    visit(tree);
  };
}

function CodeBlock({ children }: { children?: React.ReactNode }) {
  const [label, setLabel] = useState('Sao chép mã');
  const code = React.isValidElement<{ children?: React.ReactNode }>(children)
    ? children.props.children
    : '';
  return (
    <div className="chat-code-block">
      <button
        type="button"
        onClick={async () => {
          try {
            if (typeof code !== 'string') return;
            await navigator.clipboard.writeText(code);
            setLabel('Đã sao chép');
          } catch {
            setLabel('Không sao chép được');
          }
        }}
      >
        {label}
      </button>
      <pre>{children}</pre>
    </div>
  );
}

export function ChatText({
  text,
  imageUrls = [],
  citations = [],
}: {
  text: string;
  imageUrls?: string[];
  citations?: Citation[];
}) {
  return (
    <div className="chat-text">
      <Markdown
        remarkPlugins={[remarkGfm, citationLinks(citations)]}
        urlTransform={(url) => {
          const safe = defaultUrlTransform(url);
          return /^(?:https?:\/\/|\/(?!\/)|#)/i.test(safe) ? safe : '';
        }}
        components={{
          h1: ({ children }) => <h3>{children}</h3>,
          h2: ({ children }) => <h3>{children}</h3>,
          h3: ({ children }) => <h3>{children}</h3>,
          table: ({ children }) => (
            <div
              className="chat-table-scroll"
              tabIndex={0}
              aria-label="Bảng trong câu trả lời"
            >
              <table>{children}</table>
            </div>
          ),
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
          a: ({ href, children, className, title }) =>
            href ? (
              <a
                href={href}
                className={className}
                title={title}
                target="_blank"
                rel="noopener noreferrer"
              >
                {children}
              </a>
            ) : (
              <span>{children}</span>
            ),
          img: ({ src, alt }) =>
            typeof src === 'string' &&
            isChatFileUrl(src) &&
            imageUrls.includes(src) ? (
              // Authenticated original images need browser cookies, which Next's optimizer omits.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={src}
                alt={alt ?? 'Ảnh nguồn'}
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span>Ảnh: {alt ?? 'chưa có nguồn được cấp'}</span>
            ),
        }}
      >
        {text}
      </Markdown>
    </div>
  );
}
