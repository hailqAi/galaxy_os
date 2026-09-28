import { basename } from 'node:path';

export function safeFilename(value: string) {
  if (
    value !== basename(value) ||
    value.includes('\\') ||
    value.includes('/') ||
    /[\p{Cc}\p{Cf}\p{Cs}]/u.test(value)
  )
    return null;
  const clean = value
    .normalize('NFC')
    .trim()
    .replace(/[^\p{L}\p{N}._ -]/gu, '_');
  return clean && clean.length <= 200 ? clean : null;
}

// Busboy's default multipart parameter charset is Latin-1; browsers send UTF-8.
// Decode only valid byte sequences at the multipart boundary, before sanitizing.
export function multipartFilename(value: string) {
  if ([...value].some((char) => char.charCodeAt(0) > 255)) return value;
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
      Buffer.from(value, 'latin1'),
    );
  } catch {
    return value;
  }
}
