import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { FileAsset, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { extname } from 'node:path';
import {
  CurrentActor,
  actorsForPermission,
} from '../access-control/current-actor';
import { projectWhereForPermissions } from '../access-control/business-entity.policy';
import { customerPublicationSource } from './customer-publication-source';
import { FileStorage } from '../files/file-storage';

export type CustomerFileInput = {
  sourceType: 'CONTRACT_FILE' | 'CUSTOMER_PAYMENT_FILE' | 'SITE_DELIVERY';
  sourceId: string;
  appendixId?: string;
  purpose?: 'CUSTOMER_REVIEW_FILE' | 'RECORDED_SIGNED_COPY';
};

export async function lockCustomerFileOwnership(tx: Prisma.TransactionClient) {
  // ponytail: Scalar legacy references have no FileAsset FK. Lock only the final
  // decision after storage I/O; global table contention returns 409. Replace
  // these locks with typed FileAsset FKs if registration volume requires it.
  // ContractDocument/release are our own writes and must not take SHARE locks.
  // SiteDelivery now has a typed FileAsset FK; FOR UPDATE on the file serializes its links.
  try {
    await tx.$executeRaw`LOCK TABLE
      "AcceptanceRecord", "CustomerConfirmation",
      "CustomsDocument", "DamageRecord", "HandoverDocument", "InspectionItem",
      "PackingRecord", "ProductionMilestone", "ProformaInvoiceDocument",
      "ProjectRequiredDocument", "ProjectRequiredDocumentVersion", "ProjectStageApproval",
      "PunchItem", "PurchaseOrderDocument", "QualityInspectionLine", "QualityReport",
      "QuotationDocument", "SampleApproval", "ServiceResolution", "ServiceVisit",
      "ShipmentDocument", "StockIssue", "SupplierQuotationDocument",
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

export async function customerFileSource(
  tx: Prisma.TransactionClient,
  actor: CurrentActor,
  projectId: string,
  input: CustomerFileInput,
  registration = false,
) {
  if (input.purpose && input.sourceType !== 'CONTRACT_FILE')
    throw new BadRequestException('Mục đích này chỉ dành cho file hợp đồng');
  const signedCopy = input.purpose === 'RECORDED_SIGNED_COPY';
  if (input.sourceType === 'SITE_DELIVERY') {
    if (input.appendixId)
      throw new BadRequestException('Giao hàng không có phụ lục');
    const required = [['installation.read'], ['file.read', 'file.download']];
    const groups = required.map((permissions) =>
      actorsForPermission(actor, permissions[0]!).filter((binding) =>
        permissions.every((p) => binding.permissions.includes(p)),
      ),
    );
    if (groups.some((group) => !group.length)) throw new NotFoundException();
    const project = await tx.project.findFirst({
      where: {
        id: projectId,
        organizationId: actor.organizationId,
        deletedAt: null,
        AND: groups.map((group, i) => ({
          OR: group.map((binding) =>
            projectWhereForPermissions(binding, required[i]!),
          ),
        })),
      },
    });
    if (!project?.customerId) throw new NotFoundException();
    const delivery = await tx.siteDelivery.findFirst({
      where: {
        id: input.sourceId,
        organizationId: actor.organizationId,
        projectId,
      },
      include: { workOrder: true },
    });
    if (
      !delivery ||
      !delivery.evidenceFileId ||
      !delivery.evidenceFileVersion ||
      !delivery.evidenceChecksum ||
      !delivery.clientKey ||
      !delivery.requestHash ||
      delivery.workOrder.organizationId !== actor.organizationId ||
      delivery.workOrder.projectId !== projectId ||
      !Array.isArray(delivery.items) ||
      !delivery.items.length ||
      delivery.items.some(
        (item) =>
          !item ||
          typeof item !== 'object' ||
          Array.isArray(item) ||
          item.projectId !== projectId ||
          item.customerId !== project.customerId,
      )
    )
      throw new ConflictException(
        'Giao hàng chưa có bằng chứng được ghim đúng nguồn',
      );
    const snapshot = {
      sourceType: 'SITE_DELIVERY',
      sourceId: delivery.id,
      organizationId: actor.organizationId,
      projectId,
      customerId: project.customerId,
      purpose: 'Nhân viên ghi nhận giao tại công trường',
      title: `Giao tại công trường · ${delivery.workOrder.workOrderNumber}`,
      sourceUpdatedAt: delivery.createdAt.toISOString(),
      workOrderId: delivery.installationWorkOrderId,
      deliveryDate: delivery.deliveryDate.toISOString(),
      recipient: delivery.recipient,
      items: delivery.items as Prisma.InputJsonArray,
      evidenceFileId: delivery.evidenceFileId,
      evidenceFileVersion: delivery.evidenceFileVersion,
      evidenceChecksum: delivery.evidenceChecksum,
    };
    return {
      snapshot,
      updatedAt: delivery.createdAt,
      fingerprint: createHash('sha256')
        .update(JSON.stringify(snapshot))
        .digest('hex'),
      pinnedFile: {
        id: delivery.evidenceFileId,
        version: delivery.evidenceFileVersion,
        checksum: delivery.evidenceChecksum,
      },
    };
  }
  const paymentFile = input.sourceType === 'CUSTOMER_PAYMENT_FILE';
  if (paymentFile && input.appendixId)
    throw new BadRequestException('Khoản thu không có phụ lục');
  const permission = paymentFile
    ? 'receivable.payment.record'
    : signedCopy && input.appendixId
      ? 'appendix.approve'
      : 'contract.update';
  if (registration) {
    const bindings = actorsForPermission(actor, permission);
    if (
      !bindings.length ||
      !(await tx.project.count({
        where: {
          id: projectId,
          OR: bindings.map((binding) =>
            projectWhereForPermissions(binding, permission),
          ),
        },
      }))
    )
      throw new NotFoundException();
  }
  const source = await customerPublicationSource(tx, actor, projectId, {
    sourceType: paymentFile ? 'CUSTOMER_PAYMENT_RECORD' : 'CONTRACT',
    sourceId: input.sourceId,
    appendixId: input.appendixId,
  });
  let recordedSigning: Prisma.InputJsonObject | undefined;
  if (signedCopy) {
    const contract = await tx.contract.findUniqueOrThrow({
      where: { id: input.sourceId },
      select: { status: true, signedDate: true },
    });
    if (
      !['SIGNED', 'ACTIVE', 'SUSPENDED', 'COMPLETED'].includes(
        contract.status,
      ) ||
      !contract.signedDate
    )
      throw new ConflictException(
        'Hợp đồng chưa ghi nhận trạng thái và ngày ký',
      );
    const appendix = input.appendixId
      ? await tx.contractAppendix.findFirst({
          where: { id: input.appendixId, contractId: input.sourceId },
          select: { id: true, status: true, signedDate: true, updatedAt: true },
        })
      : null;
    if (
      input.appendixId &&
      (!appendix ||
        !['SIGNED', 'EFFECTIVE'].includes(appendix.status) ||
        !appendix.signedDate)
    )
      throw new ConflictException(
        'Phụ lục chưa ghi nhận trạng thái và ngày ký',
      );
    recordedSigning = {
      contractStatus: contract.status,
      contractSignedDate: contract.signedDate.toISOString(),
      ...(appendix
        ? {
            appendix: {
              id: appendix.id,
              status: appendix.status,
              signedDate: appendix.signedDate!.toISOString(),
              updatedAt: appendix.updatedAt.toISOString(),
            },
          }
        : {}),
    };
  }
  const snapshot = {
    ...source.snapshot,
    sourceType: input.sourceType,
    purpose: paymentFile
      ? 'Chứng từ khoản thu do nhân viên cung cấp'
      : (input.purpose ?? 'CUSTOMER_REVIEW_FILE'),
    sourceUpdatedAt: source.updatedAt.toISOString(),
    ...(recordedSigning ? { recordedSigning } : {}),
  };
  return {
    snapshot,
    pinnedFile: undefined,
    updatedAt: source.updatedAt,
    fingerprint: createHash('sha256')
      .update(JSON.stringify(snapshot))
      .digest('hex'),
  };
}

export async function eligibleCustomerFile(
  tx: Prisma.TransactionClient,
  actor: CurrentActor,
  projectId: string,
  input: CustomerFileInput,
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
      contractDocuments:
        input.sourceType !== 'CONTRACT_FILE'
          ? { none: {} }
          : {
              none: {
                NOT: {
                  contractId: input.sourceId,
                  appendixId: input.appendixId ?? null,
                  format: 'CUSTOMER_REVIEW_FILE',
                },
              },
            },
      chatReleases:
        input.sourceType === 'SITE_DELIVERY'
          ? {
              every: {
                siteDeliveryId: input.sourceId,
                sourceSnapshot: {
                  path: ['sourceType'],
                  equals: 'SITE_DELIVERY',
                },
              },
            }
          : input.sourceType === 'CUSTOMER_PAYMENT_FILE'
            ? {
                every: {
                  customerPaymentId: input.sourceId,
                  sourceSnapshot: {
                    path: ['sourceType'],
                    equals: 'CUSTOMER_PAYMENT_FILE',
                  },
                },
              }
            : { none: { contractDocumentId: null } },
    },
    include: {
      attachments: { include: { project: { select: { customerId: true } } } },
    },
  });
  if (!file || !/^[0-9a-f]{64}$/.test(file.checksum))
    throw new NotFoundException('File không thuộc nguồn được phép');
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
    tx.acceptanceRecord.count({ where: { signedDocumentId: file.id } }),
    tx.customerConfirmation.count({ where: { documentId: file.id } }),
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
    tx.siteDelivery.count({
      where: {
        evidenceFileId: file.id,
        ...(input.sourceType === 'SITE_DELIVERY'
          ? { id: { not: input.sourceId } }
          : {}),
      },
    }),
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

export function customerFileSnapshot(
  source: Awaited<ReturnType<typeof customerFileSource>>,
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

export async function verifiedCustomerFileBytes(
  storage: FileStorage,
  storageKey: string,
  checksum: string,
) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of await storage.stream(storageKey)) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    if (size > 10 * 1024 * 1024)
      throw new ConflictException('Bản phát hành vượt giới hạn 10 MiB');
    chunks.push(bytes);
  }
  const data = Buffer.concat(chunks);
  if (createHash('sha256').update(data).digest('hex') !== checksum)
    throw new ConflictException('Nội dung nguồn không khớp checksum');
  return data;
}
