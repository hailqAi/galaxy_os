import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { availableAvatarUrl } from './me.service';

describe('availableAvatarUrl', () => {
  let directory = '';

  afterEach(async () => {
    if (directory) await rm(directory, { force: true, recursive: true });
  });

  it('omits stale or unsafe avatar keys and returns an existing avatar', async () => {
    directory = await mkdtemp(join(tmpdir(), 'galaxy-avatar-'));
    const key = '11111111-1111-4111-8111-111111111111.jpg';
    await writeFile(join(directory, key), Buffer.from([0xff, 0xd8, 0xff]));

    await expect(availableAvatarUrl(key, directory)).resolves.toBe(
      `/me/avatar/${key}`,
    );
    await expect(
      availableAvatarUrl('22222222-2222-4222-8222-222222222222.jpg', directory),
    ).resolves.toBeNull();
    await expect(availableAvatarUrl('../secret.jpg', directory)).resolves.toBeNull();
  });
});
