import { describe, expect, it } from 'vitest';
import { uploadParts } from './uploads.service';
describe('large upload part calculation', () => {
  it('accepts 5.1 GiB and keeps provider parts bounded', () => {
    const result = uploadParts(Math.ceil(5.1 * 1024 ** 3));
    expect(result.partSize).toBe(64 * 1024 ** 2);
    expect(result.totalParts).toBe(82);
  });
  it('increases part size when the provider part cap requires it', () => {
    const result = uploadParts(10_001 * 5 * 1024 ** 2, 5 * 1024 ** 2);
    expect(result.totalParts).toBeLessThanOrEqual(10_000);
  });
});
