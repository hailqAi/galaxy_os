import { describe, expect, it } from 'vitest';
import { extractText, chunks, retrieve } from './ai-source';

const source = {
  organizationId: 'org-a',
  projectId: 'project-a',
  roomId: 'room-a',
  sourceId: 'message-a',
  version: '1',
  text: 'Mã GH-42: cửa gỗ\nGiá chưa được duyệt',
};
describe('M3 nguồn lexical có version và locator', () => {
  it('rejects invalid UTF-8, unsupported files and forbidden source names', () => {
    expect(extractText('a.txt', 'text/plain', Buffer.from([0xff])).status).toBe(
      'INVALID',
    );
    expect(
      extractText('scan.pdf', 'application/pdf', Buffer.from('not OCR')).status,
    ).toBe('UNSUPPORTED');
    for (const name of [
      '.env',
      '.env.local',
      'AGENTS.md',
      'backup.sql',
      'profile/cookies',
    ])
      expect(
        extractText(name, 'text/plain', Buffer.from('secret')).status,
      ).toBe('FORBIDDEN');
    expect(
      extractText('spec.txt', 'text/plain', Buffer.from('Cửa GH-42')).text,
    ).toBe('Cửa GH-42');
  });
  it('retains exact version and line offsets while chunking long input', () => {
    const indexed = chunks({
      ...source,
      text: ['a'.repeat(900), 'b'.repeat(900), 'GH-42'].join('\n'),
    });
    expect(indexed.length).toBeGreaterThan(1);
    expect(indexed.at(-1)).toMatchObject({ version: '1', endLine: 3 });
    expect(indexed.map((c) => c.text).join('')).toContain('GH-42');
    expect(chunks(source)[0]!.checksum).not.toBe(
      chunks({ ...source, text: 'changed' })[0]!.checksum,
    );
  });
  it('finds exact product codes without mixing same-named Projects or tenants', () => {
    const index = [
      ...chunks(source),
      ...chunks({
        ...source,
        projectId: 'project-b',
        text: 'GH-42 private project',
      }),
      ...chunks({
        ...source,
        organizationId: 'org-b',
        text: 'GH-42 private tenant',
      }),
      ...chunks({
        ...source,
        roomId: 'denied-room',
        text: 'GH-42 private room',
      }),
    ];
    const result = retrieve(index, 'GH-42', {
      organizationId: 'org-a',
      projectId: 'project-a',
      roomIds: ['room-a'],
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.text).toContain('cửa gỗ');
    expect(
      retrieve(index, 'GH-420', {
        organizationId: 'org-a',
        projectId: 'project-a',
        roomIds: ['room-a'],
      }),
    ).toEqual([]);
  });
  it('preserves long-line characters and product codes at chunk boundaries', () => {
    const text = 'a'.repeat(1597) + ' GH-42\r\u2028' + '😀'.repeat(1700);
    const indexed = chunks({ ...source, text });
    expect(indexed.map((c) => c.text).join('')).toBe(text);
    expect(indexed.every((c) => c.text.length <= 1600)).toBe(true);
    expect(indexed.every((c) => !/\p{Surrogate}/u.test(c.text))).toBe(true);
    expect(
      retrieve(indexed, 'GH-42', {
        organizationId: 'org-a',
        projectId: 'project-a',
        roomIds: ['room-a'],
      }),
    ).toHaveLength(1);
  });
});
