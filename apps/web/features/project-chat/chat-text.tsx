import React from 'react';

// ponytail: Markdown khối cơ bản; cú pháp inline giữ nguyên chữ, không HTML/link preview.
export function ChatText({ text }: { text: string }) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];
  const cells = (line: string) =>
    line
      .trim()
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((cell) => cell.trim());
  for (let i = 0; i < lines.length; ) {
    const line = lines[i]!;
    if (!line.trim()) {
      i++;
      continue;
    }
    const key = i;
    if (/^```/.test(line)) {
      const code: string[] = [];
      for (i++; i < lines.length && !/^```/.test(lines[i]!); i++)
        code.push(lines[i]!);
      i++;
      blocks.push(
        <pre key={key}>
          <code>{code.join('\n')}</code>
        </pre>,
      );
    } else if (/^#{1,6}\s/.test(line)) {
      blocks.push(<h3 key={key}>{line.replace(/^#{1,6}\s+/, '')}</h3>);
      i++;
    } else if (
      line.includes('|') &&
      lines[i + 1]?.includes('|') &&
      cells(lines[i + 1]!).every((cell) => /^:?-{3,}:?$/.test(cell))
    ) {
      const head = cells(line),
        rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i]!.includes('|') && lines[i]!.trim())
        rows.push(cells(lines[i++]!));
      blocks.push(
        <div
          className="chat-table-scroll"
          key={key}
          tabIndex={0}
          aria-label="Bảng trong câu trả lời"
        >
          <table>
            <thead>
              <tr>
                {head.map((cell, n) => (
                  <th key={n}>{cell}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, n) => (
                <tr key={n}>
                  {row.map((cell, m) => (
                    <td key={m}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
    } else if (/^\s*(?:[-*+] |\d+\. )/.test(line)) {
      const items: string[] = [],
        ordered = /^\s*\d+\. /.test(line);
      const pattern = ordered ? /^\s*\d+\. / : /^\s*[-*+] /;
      while (i < lines.length && pattern.test(lines[i]!))
        items.push(lines[i++]!.replace(pattern, ''));
      const List = ordered ? 'ol' : 'ul';
      blocks.push(
        <List key={key}>
          {items.map((item, n) => (
            <li key={n}>{item}</li>
          ))}
        </List>,
      );
    } else {
      const paragraph = [line];
      i++;
      while (
        i < lines.length &&
        lines[i]!.trim() &&
        !/^(?:```|#{1,6}\s|\s*[-*+] |\s*\d+\. )/.test(lines[i]!)
      )
        paragraph.push(lines[i++]!);
      blocks.push(<p key={key}>{paragraph.join('\n')}</p>);
    }
  }
  return <div className="chat-text">{blocks}</div>;
}
