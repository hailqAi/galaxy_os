import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import {
  CurrentActor,
  actorsForPermission,
} from '../access-control/current-actor';
import { projectWhereForPermissions } from '../access-control/business-entity.policy';

export const customerSnapshotTypes = [
  'CONTRACT',
  'PAYMENT',
  'DELIVERY_INSTALL',
] as const;
export type CustomerSnapshotType = (typeof customerSnapshotTypes)[number];

export async function customerPublicationSource(
  tx: Prisma.TransactionClient,
  actor: CurrentActor,
  projectId: string,
  input: {
    sourceType: CustomerSnapshotType;
    sourceId: string;
    appendixId?: string;
  },
) {
  const permission = {
    CONTRACT: 'contract.read',
    PAYMENT: 'receivable.read',
    DELIVERY_INSTALL: 'installation.read',
  }[input.sourceType];
  const sourceScopes = actorsForPermission(actor, permission);
  const fileScopes = actorsForPermission(actor, 'file.read').filter((a) =>
    a.permissions.includes('file.download'),
  );
  // Prisma can elide an empty OR nested in AND. Deny absent bindings explicitly.
  if (!sourceScopes.length || !fileScopes.length) throw new NotFoundException();
  const project = await tx.project.findFirst({
    where: {
      id: projectId,
      organizationId: actor.organizationId,
      deletedAt: null,
      AND: [
        {
          OR: sourceScopes.map((a) =>
            projectWhereForPermissions(a, [permission]),
          ),
        },
        {
          OR: fileScopes.map((a) =>
            projectWhereForPermissions(a, ['file.read', 'file.download']),
          ),
        },
      ],
    },
  });
  if (!project || !project.customerId) throw new NotFoundException();
  let updatedAt: Date;
  let details: Prisma.InputJsonObject;
  let contractId: string | undefined;
  let title: string;
  if (input.sourceType === 'CONTRACT') {
    const contract = await tx.contract.findFirst({
      where: {
        id: input.sourceId,
        organizationId: actor.organizationId,
        projectId,
        customerId: project.customerId,
      },
    });
    if (!contract || ['CANCELLED', 'TERMINATED'].includes(contract.status))
      throw new ConflictException('Hợp đồng không đủ căn cứ xuất thông tin');
    const appendix = input.appendixId
      ? await tx.contractAppendix.findFirst({
          where: { id: input.appendixId, contractId: contract.id },
        })
      : null;
    if (
      input.appendixId &&
      (!appendix || ['REJECTED', 'CANCELLED'].includes(appendix.status))
    )
      throw new ConflictException('Phụ lục không thuộc nguồn hợp lệ');
    contractId = contract.id;
    updatedAt = contract.updatedAt;
    title = appendix
      ? `Bản thông tin phụ lục ${appendix.appendixNumber} · ${contract.contractNumber}`
      : `Bản thông tin hợp đồng ${contract.contractNumber}`;
    details = {
      'Số hợp đồng': contract.contractNumber,
      'Bên bán': contract.sellerLegalEntity,
      'Bên mua': contract.buyerLegalEntity,
      'Trạng thái ghi trong hồ sơ': contract.status,
      'Giá trị hiện tại': contract.currentValue.toString(),
      'Tiền tệ': contract.currency,
      'Điều khoản thanh toán': contract.paymentTerms,
      'Điều khoản giao hàng': contract.deliveryTerms,
      'Điều khoản lắp đặt': contract.installationTerms,
      'Điều khoản bảo hành': contract.warrantyTerms,
      'Điều khoản chấm dứt': contract.terminationTerms,
      'Ngày ký ghi trong hồ sơ': contract.signedDate?.toISOString() ?? null,
      'Lưu ý':
        'Bản thông tin để đối chiếu/xem xét; không chứa hoặc xác minh chữ ký. Trạng thái hồ sơ không thay chứng cứ ký.',
      ...(appendix
        ? {
            'Phụ lục': {
              id: appendix.id,
              number: appendix.appendixNumber,
              title: appendix.title,
              type: appendix.type,
              status: appendix.status,
              description: appendix.description,
              valueChange: appendix.valueChange.toString(),
              currency: appendix.currency,
            },
          }
        : {}),
    };
  } else if (input.sourceType === 'PAYMENT') {
    const schedule = await tx.customerPaymentSchedule.findFirst({
      where: {
        id: input.sourceId,
        organizationId: actor.organizationId,
        projectId,
      },
      include: { contract: true },
    });
    if (
      !schedule ||
      schedule.contract.projectId !== projectId ||
      schedule.contract.organizationId !== actor.organizationId ||
      schedule.contract.customerId !== project.customerId ||
      ['CANCELLED', 'TERMINATED'].includes(schedule.contract.status)
    )
      throw new ConflictException(
        'Lịch thanh toán không thuộc khách của hồ sơ',
      );
    updatedAt = schedule.updatedAt;
    title = `Lịch thanh toán ${schedule.contract.contractNumber} · ${schedule.milestoneName}`;
    details = {
      'Số hợp đồng': schedule.contract.contractNumber,
      Khách: schedule.contract.buyerLegalEntity,
      'Trạng thái hợp đồng nguồn': schedule.contract.status,
      Mốc: schedule.milestoneName,
      Hạn: schedule.dueDate.toISOString(),
      'Số tiền nghĩa vụ': schedule.amount.toString(),
      'Tiền tệ': schedule.currency,
      'Điều kiện': schedule.condition,
      'Lưu ý':
        'Lịch theo hồ sơ, không phải biên lai, xác nhận đã thu tiền hoặc đối soát ngân hàng.',
    };
  } else {
    const plan = await tx.installationPlan.findFirst({
      where: {
        id: input.sourceId,
        organizationId: actor.organizationId,
        projectId,
      },
      include: { workOrders: { orderBy: { id: 'asc' } } },
    });
    if (!plan) throw new NotFoundException();
    if (
      plan.workOrders.some(
        (w) =>
          w.organizationId !== actor.organizationId ||
          w.projectId !== projectId,
      )
    )
      throw new ConflictException('Hạng mục không cùng phạm vi');
    updatedAt = plan.updatedAt;
    title = `Kế hoạch lắp đặt dự kiến ${plan.planNumber}`;
    details = {
      'Số kế hoạch': plan.planNumber,
      Tên: plan.name,
      'Trạng thái nguồn': plan.status,
      'Bắt đầu dự kiến': plan.plannedStartDate?.toISOString() ?? null,
      'Hoàn thành dự kiến': plan.plannedCompletionDate?.toISOString() ?? null,
      'Công việc': plan.workOrders.map((w) => ({
        id: w.id,
        number: w.workOrderNumber,
        title: w.title,
        area: w.area,
        plannedDate: w.plannedDate?.toISOString() ?? null,
        status: w.status,
      })),
      'Lưu ý':
        'Kế hoạch/lịch theo hồ sơ; không xác nhận đã giao, đã lắp hoặc nghiệm thu. Không suy ra số lượng khi nguồn chưa ghi.',
    };
  }
  const snapshot = {
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    appendixId: input.appendixId ?? null,
    organizationId: actor.organizationId,
    projectId,
    customerId: project.customerId,
    title,
    details,
  };
  const fingerprint = createHash('sha256')
    .update(JSON.stringify(snapshot))
    .digest('hex');
  // Plain text is intentional: no hidden sheets, scripts, embedded links or internal projection.
  const bytes = Buffer.from(
    `${title}\nDấu nguồn: ${fingerprint}\n${JSON.stringify(details, null, 2)}\n`,
    'utf8',
  );
  if (bytes.length > 65536)
    throw new ConflictException('Bản thông tin vượt giới hạn 64 KiB');
  return { snapshot, fingerprint, bytes, updatedAt, contractId, title };
}
