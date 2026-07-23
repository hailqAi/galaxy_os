import { Injectable, NotFoundException } from '@nestjs/common';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

@Injectable()
export class FileStorage {
  private readonly root = resolve(
    process.env.FILE_STORAGE_PATH ??
      join(process.cwd(), '../../.runtime/files'),
  );
  async put(organizationId: string, data: Buffer) {
    const now = new Date();
    const key = `${organizationId}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}`;
    const path = join(this.root, ...key.split('/'));
    await mkdir(resolve(path, '..'), { recursive: true });
    await writeFile(path, data, { flag: 'wx' });
    return key;
  }
  async read(key: string) {
    if (!/^[0-9a-f-]+\/\d{4}\/\d{2}\/[0-9a-f-]+$/.test(key))
      throw new NotFoundException();
    const path = resolve(this.root, ...key.split('/'));
    if (!path.startsWith(`${this.root}/`)) throw new NotFoundException();
    const data = await readFile(path).catch(() => null);
    if (!data) throw new NotFoundException();
    return data;
  }
}
