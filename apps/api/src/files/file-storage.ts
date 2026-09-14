import {
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  PayloadTooLargeException,
} from '@nestjs/common';
import {
  mkdir,
  open,
  opendir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
} from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { constants, createReadStream } from 'node:fs';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { readEnvironment } from '../config/env';

const claimIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const storageKeyPattern =
  /^(?:[0-9a-f-]+\/\d{4}\/\d{2}\/[0-9a-f-]+|[0-9a-f-]+\/[0-9a-f-]+\.(?:pdf|docx|xlsx|csv|zip|jpe?g|png|mp4|dwg))$/;

export async function ensurePrivateDirectory(path: string) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const directory = await open(
    path,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  try {
    const details = await directory.stat();
    const userId = process.getuid?.();
    if (
      !details.isDirectory() ||
      (userId !== undefined && details.uid !== userId)
    )
      throw new Error('Local storage must be owned by the service user');
    await directory.chmod(0o700);
  } finally {
    await directory.close();
  }
}

export async function createPrivateWriteStream(
  path: string,
  flags: 'w' | 'wx',
) {
  const file = await open(
    path,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_NOFOLLOW |
      (flags === 'wx' ? constants.O_EXCL : 0),
    0o600,
  );
  try {
    const details = await file.stat();
    const userId = process.getuid?.();
    if (!details.isFile() || (userId !== undefined && details.uid !== userId))
      throw new Error('Local storage must be owned by the service user');
    await file.chmod(0o600);
    if (flags === 'w') await file.truncate(0);
    return file.createWriteStream();
  } catch (error) {
    await file.close();
    throw error;
  }
}

@Injectable()
export class FileStorage implements OnModuleInit, OnModuleDestroy {
  private readonly maximumBytes = readEnvironment().UPLOAD_MAX_FILE_BYTES;
  private readonly root = resolve(readEnvironment().FILE_STORAGE_PATH);
  private finalObjectScanner?: AsyncGenerator<{
    object?: { storageKey: string; modifiedAt: Date };
  }>;
  async onModuleInit() {
    await ensurePrivateDirectory(this.root);
  }
  createKey(organizationId: string, now = new Date()) {
    return `${organizationId}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}`;
  }
  async put(organizationId: string, data: Buffer) {
    return this.putStream(organizationId, Readable.from(data));
  }
  async putStream(
    organizationId: string,
    data: Readable,
    storageKey?: string,
    claimId?: string,
  ) {
    let writtenBytes = 0;
    const limit = new Transform({
      transform: (chunk: Buffer, _encoding, callback) => {
        writtenBytes += chunk.length;
        callback(
          writtenBytes > this.maximumBytes
            ? new PayloadTooLargeException('File exceeds maximum size')
            : null,
          chunk,
        );
      },
    });
    const key = storageKey ?? this.createKey(organizationId);
    if (
      !storageKeyPattern.test(key) ||
      !key.startsWith(`${organizationId}/`) ||
      Boolean(storageKey) !== Boolean(claimId) ||
      (claimId !== undefined && !claimIdPattern.test(claimId))
    )
      throw new NotFoundException();
    const path = join(this.root, ...key.split('/'));
    const writePath = claimId ? `${path}.${claimId}.pending` : path;
    let directory = this.root;
    for (const segment of key.split('/').slice(0, -1)) {
      directory = join(directory, segment);
      await ensurePrivateDirectory(directory);
    }
    try {
      await pipeline(
        data,
        limit,
        await createPrivateWriteStream(writePath, 'wx'),
      );
    } catch (error) {
      await rm(writePath, { force: true });
      throw error;
    }
    return key;
  }
  async publishPending(key: string, claimId: string) {
    if (!claimIdPattern.test(claimId)) throw new NotFoundException();
    const path = this.safePath(key);
    await rename(`${path}.${claimId}.pending`, path);
  }
  async removePending(key: string, claimId?: string) {
    const path = this.safePath(key);
    if (claimId) {
      if (!claimIdPattern.test(claimId)) throw new NotFoundException();
      await rm(`${path}.${claimId}.pending`, { force: true });
      return;
    }
    const prefix = `${basename(path)}.`;
    const names = await readdir(dirname(path)).catch((error: unknown) => {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'ENOENT'
      )
        return [];
      throw error;
    });
    await Promise.all(
      names
        .filter((name) => name.startsWith(prefix) && name.endsWith('.pending'))
        .map((name) => rm(join(dirname(path), name), { force: true })),
    );
  }
  private async openDirectory(path: string) {
    return opendir(path).catch((error: unknown) => {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'ENOENT'
      )
        return null;
      throw error;
    });
  }
  private async modifiedAt(path: string) {
    return stat(path)
      .then(({ mtime }) => mtime)
      .catch((error: unknown) => {
        if (
          error &&
          typeof error === 'object' &&
          'code' in error &&
          error.code === 'ENOENT'
        )
          return null;
        throw error;
      });
  }
  private async *finalObjectEntries() {
    const root = await this.openDirectory(this.root);
    if (!root) return;
    for await (const organization of root) {
      yield {};
      if (
        !organization.isDirectory() ||
        !claimIdPattern.test(organization.name)
      )
        continue;
      const organizationPath = join(this.root, organization.name);
      const organizationDirectory = await this.openDirectory(organizationPath);
      if (!organizationDirectory) continue;
      for await (const entry of organizationDirectory) {
        const legacyKey = `${organization.name}/${entry.name}`;
        if (entry.isFile() && storageKeyPattern.test(legacyKey)) {
          const modifiedAt = await this.modifiedAt(
            join(organizationPath, entry.name),
          );
          yield modifiedAt
            ? { object: { storageKey: legacyKey, modifiedAt } }
            : {};
          continue;
        }
        yield {};
        if (!entry.isDirectory() || !/^\d{4}$/.test(entry.name)) continue;
        const yearPath = join(organizationPath, entry.name);
        const yearDirectory = await this.openDirectory(yearPath);
        if (!yearDirectory) continue;
        for await (const month of yearDirectory) {
          yield {};
          if (!month.isDirectory() || !/^(?:0[1-9]|1[0-2])$/.test(month.name))
            continue;
          const monthPath = join(yearPath, month.name);
          const monthDirectory = await this.openDirectory(monthPath);
          if (!monthDirectory) continue;
          for await (const file of monthDirectory) {
            const storageKey = `${organization.name}/${entry.name}/${month.name}/${file.name}`;
            if (file.isFile() && storageKeyPattern.test(storageKey)) {
              const modifiedAt = await this.modifiedAt(
                join(monthPath, file.name),
              );
              yield modifiedAt ? { object: { storageKey, modifiedAt } } : {};
            } else yield {};
          }
        }
      }
    }
  }
  async listFinalObjects(limit = 100) {
    const maximumEntries = Math.max(1, Math.min(limit, 100));
    const objects: { storageKey: string; modifiedAt: Date }[] = [];
    this.finalObjectScanner ??= this.finalObjectEntries();
    let processedEntries = 0;
    while (processedEntries < maximumEntries) {
      const next = await this.finalObjectScanner.next();
      if (next.done) {
        this.finalObjectScanner = undefined;
        return { objects, processedEntries, completed: true };
      }
      processedEntries += 1;
      if (next.value.object) objects.push(next.value.object);
    }
    return { objects, processedEntries, completed: false };
  }
  async onModuleDestroy() {
    await this.finalObjectScanner?.return(undefined);
    this.finalObjectScanner = undefined;
  }
  private safePath(key: string) {
    if (!storageKeyPattern.test(key)) throw new NotFoundException();
    const path = resolve(this.root, ...key.split('/'));
    if (!path.startsWith(`${this.root}/`)) throw new NotFoundException();
    return path;
  }
  async read(key: string) {
    const path = this.safePath(key);
    const data = await readFile(path).catch(() => null);
    if (!data) throw new NotFoundException();
    return data;
  }
  async stream(key: string) {
    const path = this.safePath(key);
    await stat(path).catch(() => {
      throw new NotFoundException();
    });
    return createReadStream(path);
  }
  async remove(key: string) {
    let path: string;
    try {
      path = this.safePath(key);
    } catch {
      return;
    }
    await rm(path, { force: true });
  }
}
