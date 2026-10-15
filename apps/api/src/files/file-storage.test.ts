import {
  chmod,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createPrivateWriteStream, FileStorage } from './file-storage';

describe('FileStorage local permissions', () => {
  it('verifies a 50MB original by streaming and removes its private reader link', async () => {
    const root = await mkdtemp(join(tmpdir(), 'galaxy-large-files-'));
    vi.stubEnv('DATABASE_URL', 'postgresql://test:test@localhost:5432/test');
    vi.stubEnv('FILE_STORAGE_PATH', root);
    const storage = new FileStorage();
    const digest = createHash('sha256');
    const size = 50_000_001;
    async function* content() {
      for (let left = size; left > 0; left -= 65536) {
        const part = Buffer.alloc(Math.min(left, 65536), 7);
        digest.update(part);
        yield part;
      }
    }
    try {
      await storage.onModuleInit();
      const key = await storage.putStream(
        '00000000-0000-4000-8000-000000000001',
        Readable.from(content()),
      );
      const checksum = digest.digest('hex');
      vi.spyOn(storage, 'read').mockRejectedValue(
        new Error('No whole-file Buffer'),
      );
      await storage.withVerifiedPath(key, size, checksum, async (path) => {
        expect(path.startsWith(join(root, '.readers') + '/')).toBe(true);
        expect((await stat(path)).size).toBe(size);
        const handle = await open(path, 'r');
        try {
          const prefix = Buffer.alloc(8);
          await handle.read(prefix, 0, 8, 0);
          expect(prefix.equals(Buffer.alloc(8, 7))).toBe(true);
        } finally {
          await handle.close();
        }
      });
      expect(await readdir(join(root, '.readers'))).toEqual([]);
      expect((await stat(join(root, key))).size).toBe(size);
      const reader = vi.fn();
      await expect(
        storage.withVerifiedPath(key, size, '0'.repeat(64), reader),
      ).rejects.toThrow();
      expect(reader).not.toHaveBeenCalled();
      expect(await readdir(join(root, '.readers'))).toEqual([]);
    } finally {
      vi.unstubAllEnvs();
      vi.restoreAllMocks();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects a reader symlink and a source modified during decoding', async () => {
    const root = await mkdtemp(join(tmpdir(), 'galaxy-reader-files-'));
    vi.stubEnv('DATABASE_URL', 'postgresql://test:test@localhost:5432/test');
    vi.stubEnv('FILE_STORAGE_PATH', root);
    const storage = new FileStorage();
    try {
      await storage.onModuleInit();
      const key = await storage.put(
        '00000000-0000-4000-8000-000000000001',
        Buffer.from('original'),
      );
      const hash = createHash('sha256').update('original').digest('hex');
      const reader = vi.fn();
      const original = join(root, key);
      await expect(
        storage.withVerifiedPath(key, 8, hash, async () => {
          await new Promise((resolve) => setTimeout(resolve, 20));
          return storage.withVerifiedPath(key, 8, hash, async () => true);
        }),
      ).resolves.toBe(true);
      await rm(original);
      const outside = join(root, 'outside');
      await writeFile(outside, 'original');
      await symlink(outside, original);
      await expect(
        storage.withVerifiedPath(key, 8, hash, reader),
      ).rejects.toThrow();
      expect(reader).not.toHaveBeenCalled();
      await rm(original);
      await writeFile(original, 'original');
      await expect(
        storage.withVerifiedPath(key, 8, hash, async () => {
          await writeFile(original, 'modified');
          return 'Do not publish this result';
        }),
      ).rejects.toThrow();
      expect(await readdir(join(root, '.readers'))).toEqual([]);
    } finally {
      vi.unstubAllEnvs();
      await rm(root, { recursive: true, force: true });
    }
  });

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
