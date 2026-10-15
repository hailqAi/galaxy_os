import { describe, expect, it } from 'vitest';
import { presentPublicActivity } from './activity.presenter';

describe('public activity presentation', () => {
  it('keeps only a safe count from a private upload submission receipt', () => {
    const presented = presentPublicActivity({
      id: 'activity-1',
      event: 'PROJECT_UPLOAD_BATCH_SUBMITTED',
      metadata: {
        idempotencyKey: 'submit-secret',
        sessionIds: ['session-1'],
        result: {
          items: [
            {
              sessionId: 'session-1',
              fileAssetId: 'asset-1',
              document: {
                id: 'document-1',
                documentType: 'PRELIMINARY_FINANCIAL_PLAN',
                displayName: 'Kế hoạch tài chính nội bộ.pdf',
              },
            },
          ],
        },
      },
    });

    expect(presented).toEqual({
      id: 'activity-1',
      event: 'PROJECT_UPLOAD_BATCH_SUBMITTED',
      metadata: { fileCount: 1 },
    });
    expect(JSON.stringify(presented)).not.toMatch(
      /session|asset|document|financial|submit-secret/i,
    );
  });

  it('does not rewrite unrelated public activity metadata', () => {
    const activity = {
      event: 'PROJECT_STAGE_COMPLETED',
      metadata: { stageKey: 'STAGE_1' },
    };

    expect(presentPublicActivity(activity)).toEqual(activity);
  });

  it('removes the private payload hash and idempotency key from a simple Stage 1 update', () => {
    const presented = presentPublicActivity({
      id: 'activity-update',
      event: 'PROJECT_STAGE_ONE_SIMPLE_UPDATED',
      metadata: {
        idempotencyKey: 'private-update-key',
        payloadHash: 'private-payload-hash',
      },
    });

    expect(presented).toEqual({
      id: 'activity-update',
      event: 'PROJECT_STAGE_ONE_SIMPLE_UPDATED',
      metadata: {},
    });
    expect(JSON.stringify(presented)).not.toMatch(/idempotency|hash|private/i);
  });

  it('removes private command metadata from a simple Stage 1 initiation', () => {
    const presented = presentPublicActivity({
      id: 'activity-initiation',
      event: 'PROJECT_STAGE_ONE_SIMPLE_INITIATED',
      metadata: {
        idempotencyKey: 'private-initiation-key',
        approvalId: 'private-approval-id',
      },
    });

    expect(presented).toEqual({
      id: 'activity-initiation',
      event: 'PROJECT_STAGE_ONE_SIMPLE_INITIATED',
      metadata: {},
    });
    expect(JSON.stringify(presented)).not.toMatch(
      /idempotency|approval|private/i,
    );
  });

  it.each(['FILE_UPLOADED', 'FILE_UPDATED', 'FILE_DELETED', 'FILE_RESTORED'])(
    'removes private file capability metadata from %s',
    (event) => {
      const presented = presentPublicActivity({
        event,
        metadata: { fileId: 'private-file-id', category: 'FINANCE' },
      });

      expect(presented).toEqual({ event, metadata: {} });
    },
  );
});
