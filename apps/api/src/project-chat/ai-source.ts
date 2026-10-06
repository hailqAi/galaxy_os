import { createHash } from 'node:crypto';

export type TextSource = {
  organizationId: string;
  projectId: string;
  roomId: string | null;
  sourceId: string;
  version: string;
  text: string;
};
export type SourceChunk = TextSource & {
  page?: number;
  handle: string;
  checksum: string;
  startLine: number;
  endLine: number;
  startColumn: number;
};

export function extractText(name: string, mime: string, bytes: Uint8Array) {
  if (
    /[/\\]|^\.env|^AGENTS\.md$|backup|cookies|profile|\.(sql|dump|zip)$/i.test(
      name,
    )
  )
    return { status: 'FORBIDDEN' as const };
  if (
    !['text/plain', 'text/markdown'].includes(mime) ||
    !/\.(txt|md)$/i.test(name)
  )
    return { status: 'UNSUPPORTED' as const };
  if (bytes.byteLength > 262_144) return { status: 'TOO_LARGE' as const };
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (text.includes('\0')) return { status: 'INVALID' as const };
    return { status: 'READY' as const, text };
  } catch {
    return { status: 'INVALID' as const };
  }
}

export function chunks(source: TextSource): SourceChunk[] {
  if (Buffer.byteLength(source.text) > 262_144)
    throw new Error('Nguồn quá lớn');
  const checksum = createHash('sha256').update(source.text).digest('hex');
  const result: SourceChunk[] = [];
  const lines = source.text.split('\n');
  let text = '',
    startLine = 1;
  const emit = (value: string, start: number, end: number, column = 1) => {
    if (!value.trim()) return;
    const handle =
      'S_' +
      createHash('sha256')
        .update(
          JSON.stringify([
            source.organizationId,
            source.projectId,
            source.roomId,
            source.sourceId,
            source.version,
            checksum,
            start,
            end,
            column,
          ]),
        )
        .digest('hex')
        .slice(0, 24);
    result.push({
      ...source,
      text: value,
      handle,
      checksum,
      startLine: start,
      endLine: end,
      startColumn: column,
    });
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (text && text.length + line.length + 1 > 1600) {
      emit(text, startLine, i);
      text = '';
    }
    if (line.length > 1600) {
      // Columns and the size limit use UTF-16 units, like JS string offsets.
      for (let offset = 0; offset < line.length; ) {
        let end = Math.min(offset + 1600, line.length);
        if (end < line.length) {
          const separators = [
            ...line.slice(offset, end).matchAll(/[^\p{L}\p{N}_./-]/gu),
          ];
          const boundary = separators.at(-1)?.index;
          if (boundary !== undefined && boundary > 0) end = offset + boundary;
          // Never cut a surrogate pair. ponytail: tokens longer than 1600 units
          // are split; add a dedicated code index if real identifiers exceed this.
          if (/[\uD800-\uDBFF]/.test(line[end - 1]!)) end--;
        }
        emit(line.slice(offset, end), i + 1, i + 1, offset + 1);
        offset = end;
      }
    } else {
      if (!text) startLine = i + 1;
      text += (text ? '\n' : '') + line;
    }
  }
  emit(text, startLine, lines.length);
  return result;
}

export const sourceTokens = (text: string) =>
  new Set(
    text
      .normalize('NFKC')
      .toLocaleLowerCase('vi')
      .match(/[\p{L}\p{N}]+(?:[-_./][\p{L}\p{N}]+)*/gu) ?? [],
  );

// roomIds must come from current backend authorization; this scope filter is
// defense in depth and does not replace M2 history/revoke/file policy checks.
export function retrieve(
  index: SourceChunk[],
  question: string,
  scope: {
    organizationId: string;
    projectId: string;
    roomIds: (string | null)[];
  },
): SourceChunk[] {
  const query = sourceTokens(question);
  return index
    .filter(
      (s) =>
        s.organizationId === scope.organizationId &&
        s.projectId === scope.projectId &&
        scope.roomIds.includes(s.roomId),
    )
    .map((source) => ({
      source,
      score: [...query].filter((t) => sourceTokens(source.text).has(t)).length,
    }))
    .filter((row) => row.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score || a.source.handle.localeCompare(b.source.handle),
    )
    .slice(0, 12)
    .map((row) => row.source);
}
