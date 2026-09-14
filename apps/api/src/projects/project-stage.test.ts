import { describe, expect, it } from 'vitest';
import {
  initialStageStates,
  visualProjectStage,
  visualProjectStageWhere,
} from './project-stage';

describe('visualProjectStage', () => {
  it.each([
    ['SURVEY', 'STAGE_1'],
    ['REQUIREMENT', 'STAGE_1'],
    ['DESIGN', 'STAGE_2'],
    ['PRODUCT_SELECTION', 'STAGE_2'],
    ['QUOTATION', 'STAGE_3'],
    ['CONTRACT', 'STAGE_3'],
    ['PROCUREMENT', 'STAGE_3'],
    ['PRODUCTION', 'STAGE_4'],
    ['SHIPPING', 'STAGE_4'],
    ['INSTALLATION', 'STAGE_4'],
    ['INSPECTION', 'STAGE_5'],
    ['HANDOVER', 'STAGE_5'],
    ['WARRANTY', 'STAGE_5'],
    ['AFTER_SALES', 'STAGE_5'],
  ] as const)('maps legacy %s to %s', (phase, expected) => {
    expect(visualProjectStage(phase, [])).toBe(expected);
  });

  it('advances from a completed backend stage without changing the legacy phase', () => {
    const states = [{ stage: 'STAGE_ONE', status: 'DONE' }];

    expect(visualProjectStage('SURVEY', states)).toBe('STAGE_2');
    expect(states).toEqual([{ stage: 'STAGE_ONE', status: 'DONE' }]);
  });

  it('prefers the current backend stage over a historical phase', () => {
    expect(
      visualProjectStage('SURVEY', [
        { stage: 'STAGE_THREE', status: 'IN_PROGRESS' },
      ]),
    ).toBe('STAGE_3');
  });

  it('uses the furthest valid backend state regardless of relation order', () => {
    expect(
      visualProjectStage('SURVEY', [
        { stage: 'STAGE_ONE', status: 'DONE' },
        { stage: 'STAGE_THREE', status: 'IN_PROGRESS' },
      ]),
    ).toBe('STAGE_3');
  });

  it('falls back to the legacy phase for unavailable state records', () => {
    expect(
      visualProjectStage('CONTRACT', [
        { stage: 'NOT_A_STAGE', status: 'DONE' },
        { stage: 'STAGE_TWO', status: 'CANCELLED' },
      ]),
    ).toBe('STAGE_3');
  });

  it('initializes only a Stage 3 entry as active without fabricating earlier completion', () => {
    expect(initialStageStates('STAGE_3')).toEqual([
      { stage: 'STAGE_ONE', status: 'NOT_INITIALIZED' },
      { stage: 'STAGE_TWO', status: 'NOT_INITIALIZED' },
      { stage: 'STAGE_THREE', status: 'IN_PROGRESS' },
      { stage: 'STAGE_FOUR', status: 'NOT_INITIALIZED' },
      { stage: 'STAGE_FIVE', status: 'NOT_INITIALIZED' },
    ]);
  });

  it('uses the immutable entry stage before a legacy phase when no stage is active', () => {
    expect(visualProjectStage('SURVEY', [], 'STAGE_THREE')).toBe('STAGE_3');
  });

  it('keeps the persisted current stage when a different stage is viewed', () => {
    expect(
      visualProjectStage(
        'SURVEY',
        [
          { stage: 'STAGE_ONE', status: 'NOT_INITIALIZED' },
          { stage: 'STAGE_FOUR', status: 'IN_PROGRESS' },
        ],
        'STAGE_FOUR',
      ),
    ).toBe('STAGE_4');
  });

  it('builds a Stage 3 filter with backend precedence and historical fallback', () => {
    expect(visualProjectStageWhere('STAGE_3')).toEqual(
      expect.objectContaining({ OR: expect.any(Array) }),
    );
  });

  it('filters inactive Project rows by immutable entry stage instead of legacy phase', () => {
    const where = visualProjectStageWhere('STAGE_2');

    expect(where.OR).toContainEqual(
      expect.objectContaining({
        AND: expect.arrayContaining([{ entryStage: 'STAGE_TWO' }]),
      }),
    );
    expect(where.OR).not.toContainEqual(
      expect.objectContaining({
        AND: expect.arrayContaining([{ phase: { in: expect.any(Array) } }]),
      }),
    );
  });

  it('uses legacy TODO consistently in current-stage filters and display', () => {
    expect(
      visualProjectStage('SURVEY', [{ stage: 'STAGE_THREE', status: 'TODO' }]),
    ).toBe('STAGE_3');
    expect(JSON.stringify(visualProjectStageWhere('STAGE_3'))).toContain(
      'TODO',
    );
  });
});
