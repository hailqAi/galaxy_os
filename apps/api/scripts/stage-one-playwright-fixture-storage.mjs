import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const storageKeyPattern = /^[0-9a-f-]+\/\d{4}\/\d{2}\/[0-9a-f-]+$/;

export async function removeFixtureStorageObjects(root, storageKeys) {
  const storageRoot = resolve(root);
  await Promise.all(
    [...new Set(storageKeys)].map(async (storageKey) => {
      if (!storageKeyPattern.test(storageKey)) return;
      const path = resolve(storageRoot, ...storageKey.split('/'));
      if (path.startsWith(`${storageRoot}/`)) await rm(path, { force: true });
    }),
  );
}

export async function deleteFixtureFileAssets(deleteRows, root, storageKeys) {
  await deleteRows();
  await removeFixtureStorageObjects(root, storageKeys);
}
