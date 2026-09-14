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
