import { PayloadTooLargeException } from '@nestjs/common';
import { tmpdir } from 'node:os';
import { expect, it, vi } from 'vitest';
import { assertUploadDiskSpace, uploadDiskFits } from './file-quota';

const gb = 1_000_000_000n;
const disk = (total: bigint, available: bigint) => ({
  bsize: 1n,
  blocks: total,
  bavail: available,
});

it('reserves three streamed copies plus ten percent headroom on the shared volume', () => {
  expect(uploadDiskFits(disk(1000n * gb, 430n * gb), 300n * gb, 10n * gb)).toBe(
    true,
  );
  expect(
    uploadDiskFits(disk(1000n * gb, 430n * gb - 1n), 300n * gb, 10n * gb),
  ).toBe(false);
});

it('keeps at least five decimal GB free and rejects unknown or negative capacity', () => {
  expect(uploadDiskFits(disk(20n * gb, 6n * gb), 0n, 333_333_333n)).toBe(true);
  expect(uploadDiskFits(disk(20n * gb, 6n * gb), 0n, 333_333_334n)).toBe(false);
  expect(uploadDiskFits(disk(0n, 0n), 0n, 0n)).toBe(false);
  expect(uploadDiskFits(disk(20n * gb, -1n), 0n, 0n)).toBe(false);
});

it('checks the real filesystem against outstanding shared reservations before admitting bytes', async () => {
  const tx = {
    $queryRaw: vi
      .fn()
      .mockResolvedValue([{ reservedBytes: (2n ** 100n).toString() }]),
  };
  await expect(
    assertUploadDiskSpace(tx as never, tmpdir(), 10n * gb),
  ).rejects.toBeInstanceOf(PayloadTooLargeException);
});
