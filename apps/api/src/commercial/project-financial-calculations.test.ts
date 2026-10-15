import { describe, expect, it } from 'vitest';
import {
  allocateAmount,
  calculateEstimateLine,
  estimateAtCompletion,
  expectedMonetaryValue,
  remainingRiskContingency,
  sumEstimateCosts,
} from './project-financial-calculations';

describe('Project estimate and risk calculations', () => {
  it('distinguishes 20% margin from 25% markup for cost 80 and revenue 100', () => {
    expect(
      calculateEstimateLine({
        sellQuantity: '1',
        purchaseQuantity: '1',
        purchaseUnitPrice: '80',
        exchangeRate: '1',
        sellingUnitPrice: '100',
      }),
    ).toMatchObject({
      totalCost: '80.00',
      revenue: '100.00',
      profit: '20.00',
      margin: '0.200000',
      markup: '0.250000',
      completeness: 'COMPLETE',
    });
  });

  it('keeps a missing purchase price incomplete instead of confirming zero cost', () => {
    expect(
      calculateEstimateLine({
        sellQuantity: '1',
        purchaseQuantity: '1',
        purchaseUnitPrice: null,
        exchangeRate: '1',
        sellingUnitPrice: '100',
      }),
    ).toMatchObject({
      totalCost: null,
      profit: null,
      margin: null,
      markup: null,
      completeness: 'MISSING_PRICE',
    });
  });

  it('uses purchase quantity for cost without increasing customer sell quantity', () => {
    expect(
      calculateEstimateLine({
        sellQuantity: '10',
        purchaseQuantity: '11',
        purchaseUnitPrice: '8',
        exchangeRate: '1',
        sellingUnitPrice: '10',
      }),
    ).toMatchObject({ totalCost: '88.00', revenue: '100.00' });
  });

  it('does not count a displayed parent when its children contribute to total', () => {
    expect(
      sumEstimateCosts([
        { totalCost: '100.00', contributesToTotal: false },
        { totalCost: '60.00', contributesToTotal: true },
        { totalCost: '40.00', contributesToTotal: true },
      ]),
    ).toBe('100.00');
    expect(
      sumEstimateCosts([
        { totalCost: null, contributesToTotal: true },
        { totalCost: '40.00', contributesToTotal: true },
      ]),
    ).toBeNull();
  });

  it('allocates rounded amounts without losing or creating money', () => {
    expect(allocateAmount('100.00', ['1', '1', '1'])).toEqual([
      '33.34',
      '33.33',
      '33.33',
    ]);
  });

  it('calculates EMV only from an explicit probability and financial impact', () => {
    expect(expectedMonetaryValue('0.30', '100000000')).toBe('30000000.00');
    expect(expectedMonetaryValue(null, '100000000')).toBeNull();
  });

  it('forecasts 950 and variance -50 without counting cash advances as cost', () => {
    expect(
      estimateAtCompletion({
        actualCost: '300000000',
        remainingCommitment: '400000000',
        uncommittedCost: '250000000',
        cashAdvance: '200000000',
        currentBudget: '900000000',
      }),
    ).toEqual({ forecast: '950000000.00', variance: '-50000000.00' });
  });

  it('releases the old contingency after its risk occurs', () => {
    expect(remainingRiskContingency('30000000', 'OCCURRED')).toBe('0.00');
    expect(remainingRiskContingency('30000000', 'OPEN')).toBe('30000000.00');
  });
});
