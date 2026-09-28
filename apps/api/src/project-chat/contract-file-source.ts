import { ConflictException, NotFoundException } from '@nestjs/common';
import { FileAsset, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { extname } from 'node:path';
import {
  CurrentActor,
  actorsForPermission,
} from '../access-control/current-actor';
import { projectWhereForPermissions } from '../access-control/business-entity.policy';
import { customerPublicationSource } from './customer-publication-source';

export async function lockContractFileOwnership(tx: Prisma.TransactionClient) {
  // ponytail: Scalar legacy references have no FileAsset FK. Lock only the final
  // decision after storage I/O; global table contention returns 409. Replace
  // these locks with typed FileAsset FKs if registration volume requires it.
  // ContractDocument/release are our own writes and must not take SHARE locks.
  try {
    await tx.$executeRaw`LOCK TABLE
      "CustomsDocument", "DamageRecord", "HandoverDocument", "InspectionItem",
      "PackingRecord", "ProductionMilestone", "ProformaInvoiceDocument",
      "ProjectRequiredDocument", "ProjectRequiredDocumentVersion", "ProjectStageApproval",
      "PunchItem", "PurchaseOrderDocument", "QualityInspectionLine", "QualityReport",
      "QuotationDocument", "SampleApproval", "ServiceResolution", "ServiceVisit",
      "ShipmentDocument", "SiteDelivery", "StockIssue", "SupplierQuotationDocument",
      "SupplierRFQDocument", "TechnicalApprovalRevision" IN SHARE MODE NOWAIT`;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.meta?.code === '55P03'
    )
      throw new ConflictException('Nguồn file đang được cập nhật; thử lại sau');
    throw error;
  }
}

export async function contractFileSource(
  tx: Prisma.TransactionClient,
  actor: CurrentActor,
  projectId: string,
  sourceId: string,
  appendixId?: string,
  registration = false,
) {
  if (registration) {
    const bindings = actorsForPermission(actor, 'contract.update');
    if (
      !bindings.length ||
      !(await tx.project.count({
        where: {
          id: projectId,
          OR: bindings.map((binding) =>
            projectWhereForPermissions(binding, 'contract.update'),
          ),
        },
      }))
    )
      throw new NotFoundException();
  }
  const source = await customerPublicationSource(tx, actor, projectId, {
    sourceType: 'CONTRACT',
    sourceId,
    appendixId,
  });
  const snapshot = {
    ...source.snapshot,
    sourceType: 'CONTRACT_FILE',
    purpose: 'CUSTOMER_REVIEW_FILE',
    sourceUpdatedAt: source.updatedAt.toISOString(),
  };
  return {
    snapshot,
    updatedAt: source.updatedAt,
    fingerprint: createHash('sha256')
      .update(JSON.stringify(snapshot))
      .digest('hex'),
  };
}

export async function eligibleContractFile(
  tx: Prisma.TransactionClient,
  actor: CurrentActor,
  projectId: string,
  contractId: string,
  appendixId: string | undefined,
  fileId: string,
) {
  const file = await tx.fileAsset.findFirst({
    where: {
      id: fileId,
      organizationId: actor.organizationId,
      deletedAt: null,
      confidentiality: 'INTERNAL',
      sizeBytes: { gt: 0, lte: 10 * 1024 * 1024 },
      attachments: {
        some: { entityType: 'Project', entityId: projectId, projectId },
        every: { entityType: 'Project', entityId: projectId, projectId },
      },
      chatFiles: { none: {} },
      currentStageOneDocuments: { none: {} },
      stageOneDocumentVersions: { none: {} },
      importJobs: { none: {} },
      contractDocuments: {
        none: {
          NOT: {
            contractId,
            appendixId: appendixId ?? null,
            format: 'CUSTOMER_REVIEW_FILE',
          },
        },
      },
      chatReleases: { none: { contractDocumentId: null } },
    },
    include: {
      attachments: { include: { project: { select: { customerId: true } } } },
    },
  });
  if (!file || !/^[0-9a-f]{64}$/.test(file.checksum))
    throw new NotFoundException('File không thuộc nguồn hợp đồng được phép');
  // Match the finite ordinary-upload types; registration never trusts a legacy MIME label alone.
  const extension = {
    'application/pdf': '.pdf',
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'text/plain': '.txt',
  }[file.mimeType];
  if (
    !extension ||
    extname(file.originalFilename).toLowerCase() !== extension ||
    file.attachments.some(
      (attachment) => attachment.customerId !== attachment.project?.customerId,
    )
  )
    throw new NotFoundException('File không đúng loại hoặc khách của hồ sơ');
  const references = await Promise.all([
    tx.projectRequiredDocument.count({
      where: {
        OR: [
          { currentFileAssetId: file.id },
          { versions: { some: { fileAssetId: file.id } } },
        ],
      },
    }),
    tx.technicalApprovalRevision.count({ where: { fileId: file.id } }),
    tx.sampleApproval.count({ where: { fileId: file.id } }),
    tx.handoverDocument.count({ where: { fileAssetId: file.id } }),
    tx.quotationDocument.count({ where: { storageKey: file.storageKey } }),
    tx.projectStageApproval.count({ where: { evidenceFileId: file.id } }),
    tx.productionMilestone.count({ where: { evidenceFileId: file.id } }),
    tx.qualityReport.count({ where: { fileId: file.id } }),
    tx.packingRecord.count({ where: { fileId: file.id } }),
    tx.punchItem.count({ where: { evidenceFileId: file.id } }),
    tx.inspectionItem.count({ where: { evidenceFileId: file.id } }),
    tx.serviceVisit.count({ where: { evidenceFileId: file.id } }),
    tx.serviceResolution.count({ where: { evidenceFileId: file.id } }),
    tx.stockIssue.count({ where: { evidenceFileId: file.id } }),
    tx.qualityInspectionLine.count({ where: { evidenceFileId: file.id } }),
    tx.damageRecord.count({ where: { evidenceFileId: file.id } }),
    tx.proformaInvoiceDocument.count({
      where: { storageKey: file.storageKey },
    }),
    tx.purchaseOrderDocument.count({ where: { storageKey: file.storageKey } }),
    tx.supplierRFQDocument.count({ where: { fileAssetId: file.id } }),
    tx.supplierQuotationDocument.count({ where: { fileAssetId: file.id } }),
    tx.customsDocument.count({ where: { fileId: file.id } }),
    tx.siteDelivery.count({ where: { evidenceFileId: file.id } }),
    tx.shipmentDocument.count({ where: { fileId: file.id } }),
    tx.contractDocument.count({
      where: {
        storageKey: file.storageKey,
        OR: [{ fileAssetId: null }, { fileAssetId: { not: file.id } }],
      },
    }),
  ]);
  if (references.some(Boolean))
    throw new ConflictException(
      'File đang thuộc nguồn khác; cần bản riêng để xem xét',
    );
  return file;
}

export function contractFileSnapshot(
  source: Awaited<ReturnType<typeof contractFileSource>>,
  file: FileAsset,
) {
  const snapshot = {
    ...source.snapshot,
    file: {
      id: file.id,
      version: file.version,
      checksum: file.checksum,
      filename: file.originalFilename,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes.toString(),
    },
  };
  return {
    snapshot,
    fingerprint: createHash('sha256')
      .update(JSON.stringify(snapshot))
      .digest('hex'),
  };
}
