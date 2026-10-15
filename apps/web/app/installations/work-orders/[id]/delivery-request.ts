type DeliveryInput = {
  stockIssueLineId: string;
  quantity: string;
  deliveryDate: string;
  recipient: string;
  fileId: string;
  fileVersion: number;
  clientKey: string;
};

export function deliveryRequestBody(input: DeliveryInput) {
  return {
    clientKey: input.clientKey,
    deliveryDate: new Date(`${input.deliveryDate}T00:00:00.000Z`).toISOString(),
    recipient: input.recipient.trim(),
    evidenceFileId: input.fileId,
    evidenceFileVersion: input.fileVersion,
    items: [
      { stockIssueLineId: input.stockIssueLineId, quantity: input.quantity },
    ],
  };
}

export function deliveryFailureKind(
  error: unknown,
): 'retry' | 'correct' | 'revoke' {
  if (!(error instanceof ApiError)) return 'retry';
  if ([401, 403, 404].includes(error.status)) return 'revoke';
  if ([400, 409, 422].includes(error.status)) return 'correct';
  return 'retry';
}
import { ApiError } from '../../../lib/api';
