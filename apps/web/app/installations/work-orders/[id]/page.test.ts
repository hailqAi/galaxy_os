import { expect, it } from 'vitest';
import { ApiError } from '../../../lib/api';
import { deliveryRequestBody, deliveryFailureKind } from './delivery-request';

it('submits a typed issued-stock line and exact decimal string with pinned evidence', () => {
  expect(
    deliveryRequestBody({
      stockIssueLineId: 'line-id',
      quantity: '12345678901234567.123',
      deliveryDate: '2026-09-28',
      recipient: '  Người nhận  ',
      fileId: 'file-id',
      fileVersion: 3,
      clientKey: 'retry-key',
    }),
  ).toEqual({
    items: [{ stockIssueLineId: 'line-id', quantity: '12345678901234567.123' }],
    deliveryDate: '2026-09-28T00:00:00.000Z',
    recipient: 'Người nhận',
    evidenceFileId: 'file-id',
    evidenceFileVersion: 3,
    clientKey: 'retry-key',
  });
});

it('keeps uncertain delivery attempts retryable but unlocks invalid input for correction', () => {
  expect(deliveryFailureKind(new Error('Network error'))).toBe('retry');
  expect(deliveryFailureKind(new ApiError('Unavailable', 503))).toBe('retry');
  expect(deliveryFailureKind(new ApiError('Invalid quantity', 422))).toBe(
    'correct',
  );
  expect(deliveryFailureKind(new ApiError('Stale evidence', 409))).toBe(
    'correct',
  );
  expect(deliveryFailureKind(new ApiError('Access revoked', 403))).toBe(
    'revoke',
  );
});
