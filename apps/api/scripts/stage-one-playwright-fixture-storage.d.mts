export function removeFixtureStorageObjects(
  root: string,
  storageKeys: string[],
): Promise<void>;
export function deleteFixtureFileAssets(
  deleteRows: () => Promise<unknown>,
  root: string,
  storageKeys: string[],
): Promise<void>;
