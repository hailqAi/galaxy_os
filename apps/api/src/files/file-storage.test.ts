import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { createPrivateWriteStream, FileStorage } from './file-storage';

describe('FileStorage local permissions', () => {
  it('creates and remediates storage with owner-only permissions', async () => {
    const root = await mkdtemp(join(tmpdir(), 'galaxy-files-'));
    vi.stubEnv('DATABASE_URL', 'postgresql://test:test@localhost:5432/test');
    vi.stubEnv('FILE_STORAGE_PATH', root);
    await chmod(root, 0o777);
    const storage = new FileStorage();
    const previousUmask = process.umask(0);
    const organizationId = '00000000-0000-4000-8000-000000000001';
    const key = `${organizationId}/2026/08/00000000-0000-4000-8000-000000000002`;
    const claimId = '00000000-0000-4000-8000-000000000003';
    const pendingPath = join(root, `${key}.${claimId}.pending`);
    const finalPath = join(root, key);

    try {
      await storage.onModuleInit();
      await storage.putStream(
        organizationId,
        Readable.from('private'),
        key,
        claimId,
      );

      for (const path of [
        root,
        join(root, organizationId),
        join(root, organizationId, '2026'),
        join(root, organizationId, '2026', '08'),
      ])
        expect((await stat(path)).mode & 0o777).toBe(0o700);
      expect((await stat(pendingPath)).mode & 0o777).toBe(0o600);

      await storage.publishPending(key, claimId);
      expect((await stat(finalPath)).mode & 0o777).toBe(0o600);
    } finally {
      process.umask(previousUmask);
      vi.unstubAllEnvs();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects a configured root symlink without chmodding its target', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'galaxy-files-'));
    const target = join(parent, 'unrelated');
    const root = join(parent, 'configured');
    await mkdir(target);
    await chmod(target, 0o777);
    await symlink(target, root);
    vi.stubEnv('DATABASE_URL', 'postgresql://test:test@localhost:5432/test');
    vi.stubEnv('FILE_STORAGE_PATH', root);
    const storage = new FileStorage();

    try {
      await expect(storage.onModuleInit()).rejects.toBeDefined();
      expect((await stat(target)).mode & 0o777).toBe(0o777);
    } finally {
      vi.unstubAllEnvs();
      await rm(parent, { recursive: true, force: true });
    }
  });

  it('rejects a non-owned existing file before truncating it', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'galaxy-files-'));
    const path = join(parent, 'unrelated');
    await writeFile(path, 'preserve');
    const ownerProcess = process as NodeJS.Process & { getuid(): number };
    const userId = ownerProcess.getuid();
    const getuid = vi.spyOn(ownerProcess, 'getuid').mockReturnValue(userId + 1);

    try {
      await expect(createPrivateWriteStream(path, 'w')).rejects.toThrow(
        'owned by the service user',
      );
      await expect(readFile(path, 'utf8')).resolves.toBe('preserve');
    } finally {
      getuid.mockRestore();
      await rm(parent, { recursive: true, force: true });
    }
  });
});
