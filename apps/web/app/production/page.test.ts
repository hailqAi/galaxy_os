import { describe, expect, it } from 'vitest';
import {
  canCreateProduction,
  productionOrdersPath,
  productionStatusLabel,
} from './page';

describe('Production project context', () => {
  it('keeps the Project filter on the production API request', () => {
    expect(productionOrdersPath('project-701')).toBe(
      '/production-orders?projectId=project-701',
    );
    expect(productionOrdersPath(null)).toBe('/production-orders');
  });

  it('does not expose raw production status codes', () => {
    expect(productionStatusLabel('IN_PRODUCTION')).toBe('Đang sản xuất');
    expect(productionStatusLabel('UNKNOWN_STATUS')).toBe(
      'Không xác định: Unknown status',
    );
  });

  it('never exposes the unscoped create form inside a Project workspace', () => {
    expect(canCreateProduction('project-701', ['production.create'])).toBe(
      false,
    );
    expect(canCreateProduction(null, ['production.read'])).toBe(false);
    expect(canCreateProduction(null, ['production.create'])).toBe(true);
  });
});
