import { Readable } from 'node:stream';

/** The caller seeks to the returned UTF-8 byte cursor; each page reads bounded bytes. */
export async function readTextPage(
  stream: Readable,
  offset: number,
  limit: number,
) {
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }),
    content: string[] = [];
  let bytes = offset,
    more = false;
  const consume = (text: string) => {
    for (const character of text) {
      if (content.length === limit) {
        more = true;
        break;
      }
      content.push(character);
      bytes += Buffer.byteLength(character);
    }
  };
  try {
    for await (const chunk of stream) {
      consume(
        decoder.decode(
          Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string),
          { stream: true },
        ),
      );
      if (more) break;
    }
    if (!more) consume(decoder.decode());
    return {
      content: content.join(''),
      offset,
      next_offset: more ? bytes : null,
      offset_unit: 'UTF8_BYTES',
      encoding: 'utf-8',
    };
  } catch (error) {
    if (error instanceof TypeError)
      throw new Error('MCP_TEXT_ENCODING_UNSUPPORTED');
    throw error;
  } finally {
    stream.destroy();
  }
}
export function hasTextBytes(mime: string) {
  return /^(?:text\/|application\/(?:json|xml)(?:$|;))/.test(mime);
}
