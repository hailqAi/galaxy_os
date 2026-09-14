import { ConflictException, PayloadTooLargeException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { assertFileCapacity, lockOrganizationFileCapacity } from './file-quota';

const quotaClient = ({
  permanent = 10n,
  staged = 5n,
  materialized = 7n,
  objectRows = 3n,
  recentActorOperations = 1n,
  actorSessions = 1,
  globalPermanent = 10n,
  globalStaged = 5n,
  globalMaterialized = 7n,
  globalObjectRows = 3n,
} = {}) => ({
  $queryRaw: vi.fn().mockResolvedValue([
    {
      permanentBytes: permanent.toString(),
      stagedBytes: staged.toString(),
      materializedBytes: materialized.toString(),
      objectRows: objectRows.toString(),
      recentActorOperations: recentActorOperations.toString(),
      globalPermanentBytes: globalPermanent.toString(),
      globalStagedBytes: globalStaged.toString(),
      globalMaterializedBytes: globalMaterialized.toString(),
      globalObjectRows: globalObjectRows.toString(),
    },
  ]),
  uploadSession: {
    count: vi.fn().mockResolvedValue(actorSessions),
  },
});

describe('file capacity admission', () => {
  it('serializes admission on the organization row', async () => {
    const tx = quotaClient();
    tx.$queryRaw
      .mockResolvedValueOnce([{ locked: true }])
      .mockResolvedValueOnce([{ id: 'organization' }]);

    await lockOrganizationFileCapacity(tx as never, 'organization');

    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('counts every permanent byte plus conservative unreleased staging', async () => {
    const tx = quotaClient();

    await expect(
      assertFileCapacity(tx as never, {
        organizationId: 'organization',
        actorId: 'actor',
        incomingBytes: 10n,
        staging: true,
        organizationLimitBytes: 68n,
        globalLimitBytes: 1_000n,
        unmeasuredFileBytes: 10n,
        actorStagingLimit: 20,
      }),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect((tx.$queryRaw.mock.calls[0]?.[0] as { sql: string }).sql).toContain(
      'upload."storageKey" ~',
    );
    expect((tx.$queryRaw.mock.calls[0]?.[0] as { sql: string }).sql).toContain(
      '"FileStorageReservation"',
    );
    expect((tx.$queryRaw.mock.calls[0]?.[0] as { sql: string }).sql).toContain(
      '"deletedAt" IS NULL',
    );
    expect((tx.$queryRaw.mock.calls[0]?.[0] as { sql: string }).sql).toContain(
      '"stagingReleasedAt" IS NULL',
    );
    expect((tx.$queryRaw.mock.calls[0]?.[0] as { sql: string }).sql).toContain(
      "purged.\"status\" IN ('ABORTED', 'EXPIRED')",
    );
    expect((tx.$queryRaw.mock.calls[0]?.[0] as { sql: string }).sql).toContain(
      'FROM "EntityAttachment" AS reference',
    );
    expect((tx.$queryRaw.mock.calls[0]?.[0] as { sql: string }).sql).toContain(
      'SELECT COUNT(*) FROM "UploadSession" AS retained',
    );
  });

  it('rejects admission when other organizations exhaust the shared volume', async () => {
    const tx = quotaClient({
      permanent: 0n,
      staged: 0n,
      materialized: 0n,
      globalPermanent: 2n * 1024n * 1024n - 10n,
      globalStaged: 0n,
      globalMaterialized: 0n,
    });

    await expect(
      assertFileCapacity(tx as never, {
        organizationId: 'organization',
        actorId: 'actor',
        incomingBytes: 11n,
        staging: false,
        organizationLimitBytes: 2n * 1024n * 1024n,
        globalLimitBytes: 2n * 1024n * 1024n,
        unmeasuredFileBytes: 10n,
        actorStagingLimit: 20,
      }),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);
  });

  it("caps one actor's unreleased resumable sessions without blocking direct files", async () => {
    const resumable = quotaClient({ actorSessions: 2 });
    await expect(
      assertFileCapacity(resumable as never, {
        organizationId: 'organization',
        actorId: 'actor',
        incomingBytes: 1n,
        staging: true,
        organizationLimitBytes: 1_000_000_000n,
        globalLimitBytes: 2_000_000_000n,
        unmeasuredFileBytes: 1n,
        actorStagingLimit: 2,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(resumable.uploadSession.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        OR: expect.arrayContaining([
          expect.objectContaining({
            status: { in: ['AVAILABLE', 'VERIFYING'] },
          }),
        ]),
      }),
    });

    const direct = quotaClient({ actorSessions: 2 });
    await expect(
      assertFileCapacity(direct as never, {
        organizationId: 'organization',
        actorId: 'actor',
        incomingBytes: 1n,
        staging: false,
        organizationLimitBytes: 1_000_000_000n,
        globalLimitBytes: 2_000_000_000n,
        unmeasuredFileBytes: 1n,
        actorStagingLimit: 2,
      }),
    ).resolves.toBeUndefined();
    expect(direct.uploadSession.count).not.toHaveBeenCalled();
  });

  it('caps recent actor ingestion across aborted sessions and direct files', async () => {
    const direct = quotaClient({ recentActorOperations: 20n });

    await expect(
      assertFileCapacity(direct as never, {
        organizationId: 'organization',
        actorId: 'actor',
        incomingBytes: 1n,
        staging: false,
        organizationLimitBytes: 1_000_000_000n,
        globalLimitBytes: 2_000_000_000n,
        unmeasuredFileBytes: 1n,
        actorStagingLimit: 2,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('reserves bounded metadata capacity for tiny files and upload history', async () => {
    const direct = quotaClient({
      permanent: 0n,
      staged: 0n,
      materialized: 0n,
      objectRows: 2n,
    });

    await expect(
      assertFileCapacity(direct as never, {
        organizationId: 'organization',
        actorId: 'actor',
        incomingBytes: 1n,
        staging: false,
        organizationLimitBytes: 2n * 1024n * 1024n,
        globalLimitBytes: 4n * 1024n * 1024n,
        unmeasuredFileBytes: 1n,
        actorStagingLimit: 20,
      }),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);
  });
});
