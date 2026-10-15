import {
  ConflictException,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { statfs } from 'node:fs/promises';

type FileCapacityClient = Pick<
  Prisma.TransactionClient,
  '$queryRaw' | 'uploadSession' | 'fileStorageReservation'
>;

const FILE_OBJECT_RESERVATION_BYTES = 1024n * 1024n;

export function uploadDiskFits(
  disk: { bsize: bigint; blocks: bigint; bavail: bigint },
  reservedBytes: bigint,
  incomingBytes: bigint,
) {
  if (
    disk.bsize <= 0n ||
    disk.blocks <= 0n ||
    disk.bavail < 0n ||
    reservedBytes < 0n ||
    incomingBytes < 0n
  )
    return false;
  const headroom = (disk.blocks * disk.bsize + 9n) / 10n;
  return (
    disk.bavail * disk.bsize -
      (headroom > 5_000_000_000n ? headroom : 5_000_000_000n) >=
    reservedBytes + incomingBytes * 3n
  );
}

export async function assertUploadDiskSpace(
  tx: Pick<Prisma.TransactionClient, '$queryRaw'>,
  root: string,
  incomingBytes = 0n,
) {
  const [reservation] = await tx.$queryRaw<
    { reservedBytes: string }[]
  >(Prisma.sql`
    SELECT (COALESCE((SELECT SUM(GREATEST(0, 3 * "declaredSize" - "uploadedBytes"))
      FROM "UploadSession" WHERE "storageProvider"='LOCAL' AND "fileAssetId" IS NULL
      AND "stagingReleasedAt" IS NULL AND "status" IN ('INITIATED','UPLOADING','VERIFYING','FAILED')), 0)
      + COALESCE((SELECT SUM("sizeBytes") FROM "FileStorageReservation"), 0))::text AS "reservedBytes"
  `);
  if (
    !reservation ||
    !/^\d+$/.test(reservation.reservedBytes) ||
    !uploadDiskFits(
      await statfs(root, { bigint: true }),
      BigInt(reservation.reservedBytes),
      incomingBytes,
    )
  )
    throw new PayloadTooLargeException(
      'Không đủ dung lượng đĩa an toàn cho tệp; thử lại sau khi giải phóng staging.',
    );
}
export const fileStorageReservationExpiry = () =>
  new Date(Date.now() + 24 * 60 * 60 * 1000);

export async function lockOrganizationFileCapacity(
  tx: FileCapacityClient,
  organizationId: string,
) {
  // ponytail: one global admission lock matches one LOCAL volume; shard only
  // after storage is split across independently quota-controlled volumes.
  await tx.$queryRaw(Prisma.sql`
    WITH capacity_lock AS (
      SELECT pg_advisory_xact_lock(6491132214020260823::bigint)
    )
    SELECT TRUE AS "locked" FROM capacity_lock
  `);
  const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "Organization"
    WHERE "id" = ${organizationId}::uuid
    FOR UPDATE
  `);
  if (!rows.length) throw new NotFoundException('Organization not found');
}

export async function assertFileCapacity(
  tx: FileCapacityClient,
  input: {
    organizationId: string;
    actorId: string;
    incomingBytes: bigint;
    staging: boolean;
    organizationLimitBytes: bigint;
    globalLimitBytes: bigint;
    unmeasuredFileBytes: bigint;
    actorStagingLimit: number;
  },
) {
  const physicallyRetainedFile = Prisma.sql`
    (
      file."deletedAt" IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM "UploadSession" AS purged
        WHERE purged."fileAssetId" = file."id"
          AND purged."status" IN ('ABORTED', 'EXPIRED')
          AND purged."stagingReleasedAt" IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM "EntityAttachment" AS reference
            WHERE reference."fileAssetId" = file."id"
          )
          AND NOT EXISTS (
            SELECT 1 FROM "ProjectRequiredDocument" AS reference
            WHERE reference."currentFileAssetId" = file."id"
          )
          AND NOT EXISTS (
            SELECT 1 FROM "ProjectRequiredDocumentVersion" AS reference
            WHERE reference."fileAssetId" = file."id"
          )
          AND NOT EXISTS (
            SELECT 1 FROM "ProjectStageOneDocument" AS reference
            WHERE reference."currentFileAssetId" = file."id"
          )
          AND NOT EXISTS (
            SELECT 1 FROM "ProjectStageOneDocumentVersion" AS reference
            WHERE reference."fileAssetId" = file."id"
          )
          AND NOT EXISTS (
            SELECT 1 FROM "ImportJob" AS reference
            WHERE reference."fileAssetId" = file."id"
          )
          AND NOT EXISTS (
            SELECT 1 FROM "ChatAiSourceIndex" AS reference
            WHERE reference."fileAssetId" = file."id"
              OR reference."projectFileAssetId" = file."id"
          )
      )
    )
  `;
  const [usage] = await tx.$queryRaw<
    {
      permanentBytes: string;
      stagedBytes: string;
      materializedBytes: string;
      objectRows: string;
      recentActorOperations: string;
      globalPermanentBytes: string;
      globalStagedBytes: string;
      globalMaterializedBytes: string;
      globalObjectRows: string;
    }[]
  >(Prisma.sql`
    SELECT
      (COALESCE((
        SELECT SUM(file."sizeBytes") FROM "FileAsset" AS file
        WHERE file."organizationId" = ${input.organizationId}::uuid
          AND ${physicallyRetainedFile}
      ), 0) + COALESCE((
        SELECT SUM(upload."declaredSize") FROM "UploadSession" AS upload
        WHERE upload."organizationId" = ${input.organizationId}::uuid
          AND upload."fileAssetId" IS NULL
          AND upload."status" IN ('AVAILABLE', 'EXPIRED')
          AND upload."storageKey" ~
            '^[0-9a-f-]+/[0-9a-f-]+\\.(pdf|docx|xlsx|csv|zip|jpe?g|png|mp4|dwg)$'
      ), 0) + COALESCE((
        SELECT SUM(COALESCE(document."sizeBytes", ${input.unmeasuredFileBytes}::bigint))
        FROM "QuotationDocument" AS document
        INNER JOIN "QuotationVersion" AS version
          ON version."id" = document."quotationVersionId"
        INNER JOIN "Quotation" AS quotation
          ON quotation."id" = version."quotationId"
        WHERE quotation."organizationId" = ${input.organizationId}::uuid
          AND NOT EXISTS (
            SELECT 1 FROM "FileAsset" AS file
            WHERE file."storageKey" = document."storageKey"
              AND file."organizationId" = quotation."organizationId"
          )
      ), 0) + COALESCE((
        SELECT SUM("sizeBytes") FROM "FileStorageReservation"
        WHERE "organizationId" = ${input.organizationId}::uuid
      ), 0))::text AS "permanentBytes",
      COALESCE((
        SELECT SUM("declaredSize") FROM "UploadSession"
        WHERE "organizationId" = ${input.organizationId}::uuid
          AND "stagingReleasedAt" IS NULL
          AND "fileAssetId" IS NULL
      ), 0)::text AS "stagedBytes",
      COALESCE((
        SELECT SUM("declaredSize") FROM "UploadSession"
        WHERE "organizationId" = ${input.organizationId}::uuid
          AND "stagingReleasedAt" IS NULL
          AND "fileAssetId" IS NOT NULL
      ), 0)::text AS "materializedBytes",
      (
        (SELECT COUNT(*) FROM "FileAsset" AS file
          WHERE file."organizationId" = ${input.organizationId}::uuid)
        + (SELECT COUNT(*) FROM "UploadSession" AS retained
          WHERE retained."organizationId" = ${input.organizationId}::uuid)
        + (SELECT COUNT(*) FROM "QuotationDocument" AS document
          INNER JOIN "QuotationVersion" AS version
            ON version."id" = document."quotationVersionId"
          INNER JOIN "Quotation" AS quotation
            ON quotation."id" = version."quotationId"
          WHERE quotation."organizationId" = ${input.organizationId}::uuid)
        + (SELECT COUNT(*) FROM "FileStorageReservation"
          WHERE "organizationId" = ${input.organizationId}::uuid)
      )::text AS "objectRows",
      (
        (SELECT COUNT(*) FROM "UploadSession"
          WHERE "organizationId" = ${input.organizationId}::uuid
            AND "actorId" = ${input.actorId}::uuid
            AND "createdAt" >= NOW() - INTERVAL '24 hours')
        + (SELECT COUNT(*) FROM "FileAsset" AS file
          WHERE file."organizationId" = ${input.organizationId}::uuid
            AND file."uploadedById" = ${input.actorId}::uuid
            AND file."deletedAt" IS NULL
            AND file."createdAt" >= NOW() - INTERVAL '24 hours'
            AND NOT EXISTS (
              SELECT 1 FROM "UploadSession" AS session
              WHERE session."fileAssetId" = file."id"
            ))
        + (SELECT COUNT(*) FROM "QuotationDocument" AS document
          INNER JOIN "QuotationVersion" AS version
            ON version."id" = document."quotationVersionId"
          INNER JOIN "Quotation" AS quotation
            ON quotation."id" = version."quotationId"
          WHERE quotation."organizationId" = ${input.organizationId}::uuid
            AND document."generatedBy" = ${input.actorId}::uuid
            AND NOT EXISTS (
              SELECT 1 FROM "FileAsset" AS file
              WHERE file."storageKey" = document."storageKey"
                AND file."organizationId" = quotation."organizationId"
            )
            AND document."generatedAt" >= NOW() - INTERVAL '24 hours')
        + (SELECT COUNT(*) FROM "FileStorageReservation"
          WHERE "organizationId" = ${input.organizationId}::uuid
            AND "actorId" = ${input.actorId}::uuid
            AND "createdAt" >= NOW() - INTERVAL '24 hours')
      )::text AS "recentActorOperations"
  `);
  const [globalUsage] = await tx.$queryRaw<
    {
      globalPermanentBytes: string;
      globalStagedBytes: string;
      globalMaterializedBytes: string;
      globalObjectRows: string;
    }[]
  >(Prisma.sql`
    SELECT
      (COALESCE((
        SELECT SUM(file."sizeBytes") FROM "FileAsset" AS file
        WHERE ${physicallyRetainedFile}
      ), 0)
        + COALESCE((
          SELECT SUM(upload."declaredSize") FROM "UploadSession" AS upload
          WHERE upload."fileAssetId" IS NULL
            AND upload."status" IN ('AVAILABLE', 'EXPIRED')
            AND upload."storageKey" ~
              '^[0-9a-f-]+/[0-9a-f-]+\\.(pdf|docx|xlsx|csv|zip|jpe?g|png|mp4|dwg)$'
        ), 0)
        + COALESCE((
          SELECT SUM(COALESCE(document."sizeBytes", ${input.unmeasuredFileBytes}::bigint))
          FROM "QuotationDocument" AS document
          INNER JOIN "QuotationVersion" AS version ON version."id" = document."quotationVersionId"
          INNER JOIN "Quotation" AS quotation ON quotation."id" = version."quotationId"
          WHERE NOT EXISTS (
            SELECT 1 FROM "FileAsset" AS file
            WHERE file."storageKey" = document."storageKey"
              AND file."organizationId" = quotation."organizationId"
          )
        ), 0)
        + COALESCE((
          SELECT SUM("sizeBytes") FROM "FileStorageReservation"
        ), 0))::text AS "globalPermanentBytes",
      COALESCE((
        SELECT SUM("declaredSize") FROM "UploadSession"
        WHERE "stagingReleasedAt" IS NULL AND "fileAssetId" IS NULL
      ), 0)::text AS "globalStagedBytes",
      COALESCE((
        SELECT SUM("declaredSize") FROM "UploadSession"
        WHERE "stagingReleasedAt" IS NULL AND "fileAssetId" IS NOT NULL
      ), 0)::text AS "globalMaterializedBytes",
      ((SELECT COUNT(*) FROM "FileAsset" AS file
        )
        + (SELECT COUNT(*) FROM "UploadSession" AS retained)
        + (SELECT COUNT(*) FROM "QuotationDocument")
        + (SELECT COUNT(*) FROM "FileStorageReservation"))::text
        AS "globalObjectRows"
  `);
  const used =
    BigInt(usage?.permanentBytes ?? 0) +
    BigInt(usage?.stagedBytes ?? 0) * 3n +
    BigInt(usage?.materializedBytes ?? 0) * 2n;
  const incoming = input.incomingBytes * (input.staging ? 3n : 1n);
  // ponytail: one MiB metadata reservation bounds retained rows; split byte/object
  // quotas only when a measured tenant workload needs separate tuning.
  const objectLimit =
    input.organizationLimitBytes / FILE_OBJECT_RESERVATION_BYTES;
  const incomingObjectRows = input.staging ? 2n : 1n;
  const globalUsed =
    BigInt(globalUsage?.globalPermanentBytes ?? 0) +
    BigInt(globalUsage?.globalStagedBytes ?? 0) * 3n +
    BigInt(globalUsage?.globalMaterializedBytes ?? 0) * 2n;
  const globalObjectLimit =
    input.globalLimitBytes / FILE_OBJECT_RESERVATION_BYTES;
  if (
    globalUsed + incoming > input.globalLimitBytes ||
    BigInt(globalUsage?.globalObjectRows ?? 0) + incomingObjectRows >
      globalObjectLimit
  )
    throw new PayloadTooLargeException({
      category: 'UPLOAD_GLOBAL_QUOTA_EXCEEDED',
      message: 'Shared file capacity is exhausted',
    });
  if (
    used + incoming > input.organizationLimitBytes ||
    BigInt(usage?.objectRows ?? 0) + incomingObjectRows > objectLimit
  )
    throw new PayloadTooLargeException({
      category: 'UPLOAD_ORGANIZATION_QUOTA_EXCEEDED',
      message: 'Organization file capacity is exhausted',
    });
  if (
    BigInt(usage?.recentActorOperations ?? 0) >=
    BigInt(input.actorStagingLimit * 10)
  )
    throw new ConflictException({
      category: 'UPLOAD_RATE_LIMIT',
      message: 'Actor has too many recent file operations',
    });
  if (input.staging) {
    const outstanding = await tx.uploadSession.count({
      where: {
        organizationId: input.organizationId,
        actorId: input.actorId,
        OR: [
          { stagingReleasedAt: null },
          {
            status: { in: ['AVAILABLE', 'VERIFYING'] },
            fileAsset: { is: { attachments: { none: {} } } },
          },
        ],
      },
    });
    if (outstanding >= input.actorStagingLimit)
      throw new ConflictException({
        category: 'UPLOAD_SESSION_LIMIT',
        message: 'Actor has too many upload sessions',
      });
  }
}
