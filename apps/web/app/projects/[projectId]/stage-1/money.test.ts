import { describe, expect, it } from 'vitest';
import {
  formatVietnameseMoney,
  normalizeVietnameseMoney,
  subtractVietnameseMoney,
} from './money';

describe('Stage 1 Vietnamese money', () => {
  it.each([
    ['35000000000', '35000000000'],
    ['35000000000.00', '35000000000.00'],
    ['35.000.000.000 ₫', '35000000000'],
    ['34.999.999.999,99 ₫', '34999999999.99'],
    [' 35 000 000 000 ₫ ', '35000000000'],
    ['', null],
    ['   ', null],
    [null, null],
    [undefined, null],
  ])('normalizes %j to a canonical decimal', (value, expected) => {
    expect(normalizeVietnameseMoney(value)).toBe(expected);
  });

  it.each([
    '12abc',
    '1.2.3',
    '12.34.567',
    '-1',
    '1.0012',
    '1000000000000000000',
    'VND 100',
    '100 ₫ 000',
  ])('rejects invalid value %j', (value) => {
    expect(() => normalizeVietnameseMoney(value)).toThrow(
      'Giá trị tiền không hợp lệ.',
    );
  });

  it('formats without floating-point conversion', () => {
    expect(formatVietnameseMoney('35000000000.00')).toBe('35.000.000.000 ₫');
    expect(formatVietnameseMoney('9007199254740993.01')).toBe(
      '9.007.199.254.740.993,01 ₫',
    );
  });

  it('derives an exact monetary margin without Number', () => {
    expect(subtractVietnameseMoney('35000000000', '34999999999.99')).toBe(
      '0.01',
    );
    expect(subtractVietnameseMoney('1', '1.01')).toBe('-0.01');
  });
});
