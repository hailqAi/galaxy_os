import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../lib/api';
import {
  digestUploadBlob,
  remainingUploadParts,
  uploadErrorMessage,
  parseUploadBytes,
  uploadedSlicesMatch,
  validateUploadFile,
} from './document-upload';

describe('required document resumable upload state', () => {
  const constraints = { maxBytes: 8, allowedExtensions: ['.pdf'] };

  afterEach(() => vi.unstubAllGlobals());

  it('does not expose a raw server failure', () => {
    expect(uploadErrorMessage(new Error('sensitive path'))).toBe(
      'Không thể tải tệp. Vui lòng kiểm tra tệp và thử lại.',
    );
    expect(uploadErrorMessage(new ApiError('too large', 413))).toBe(
      'Tệp vượt quá dung lượng cho phép.',
    );
    expect(uploadErrorMessage(new ApiError('conflict', 409))).toBe(
      'Phiên tải tệp không còn khả dụng. Vui lòng bắt đầu lại.',
    );
    expect(
      uploadErrorMessage(new ApiError('Upload session expired', 403)),
    ).toBe('Phiên tải tệp đã hết hạn. Vui lòng bắt đầu phiên mới.');
    expect(
      uploadErrorMessage(new ApiError('Required permission is missing', 403)),
    ).toBe('Bạn không có quyền tải hồ sơ cho dự án này.');
    expect(
      uploadErrorMessage(
        new ApiError('target missing', 404, {
          category: 'PROJECT_DOCUMENT_TARGET_NOT_FOUND',
        }),
      ),
    ).toBe(
      'Không tìm thấy loại hồ sơ. Danh sách có thể đã thay đổi; vui lòng mở lại và thử lại.',
    );
    expect(
      uploadErrorMessage(
        new ApiError('masked target', 403, {
          category: 'PROJECT_DOCUMENT_TARGET_NOT_FOUND',
        }),
      ),
    ).toBe(
      'Không tìm thấy loại hồ sơ. Danh sách có thể đã thay đổi; vui lòng mở lại và thử lại.',
    );
    expect(
      uploadErrorMessage(
        new ApiError('project missing', 404, {
          category: 'PROJECT_NOT_FOUND_OR_NOT_VISIBLE',
        }),
      ),
    ).toBe('Dự án đã bị xóa hoặc không còn khả dụng.');
    expect(
      uploadErrorMessage(
        new ApiError('item missing', 404, {
          category: 'KEY_DOSSIER_ITEM_DELETED',
        }),
      ),
    ).toBe('Mục hồ sơ đã bị xóa. Vui lòng chọn mục khác.');
    expect(
      uploadErrorMessage(
        new ApiError('route missing', 404, {
          category: 'UPLOAD_ROUTE_NOT_FOUND',
        }),
      ),
    ).toBe('Không tìm thấy dịch vụ khởi tạo phiên tải.');
    expect(uploadErrorMessage(new ApiError('unknown', 404))).toBe(
      'Không tìm thấy tài nguyên tải hồ sơ.',
    );
    expect(uploadErrorMessage(new ApiError('invalid', 422))).toBe(
      'Thông tin khởi tạo phiên tải không hợp lệ.',
    );
    expect(uploadErrorMessage(new ApiError('upstream down', 502))).toBe(
      'Dịch vụ tải tệp đang gặp lỗi. Vui lòng thử lại sau.',
    );
  });

  it('validates the current contract and resumed file identity', () => {
    expect(
      validateUploadFile({ name: 'drawing.pdf', size: 8 }, constraints),
    ).toBeNull();
    expect(
      validateUploadFile({ name: 'drawing.txt', size: 8 }, constraints),
    ).toBe('Định dạng tệp không được hỗ trợ.');
    expect(
      validateUploadFile(
        { name: 'drawing.pdf', size: 9 },
        { maxBytes: 8, allowedExtensions: ['.pdf'] },
      ),
    ).toBe('Tệp vượt quá giới hạn 8 B.');
    expect(
      validateUploadFile(
        { name: 'large.pdf', size: 21_474_836_481 },
        { maxBytes: 21_474_836_480, allowedExtensions: ['.pdf'] },
      ),
    ).toBe('Tệp vượt quá giới hạn 20 GB.');
    expect(
      validateUploadFile({ name: 'other.pdf', size: 8 }, constraints, {
        originalFilename: 'drawing.pdf',
        declaredSize: '8',
      }),
    ).toBe('Tệp đã chọn không khớp với phiên tải trước.');
  });

  it('selects only missing upload parts', () => {
    expect(
      remainingUploadParts(4, [{ partNumber: 1 }, { partNumber: 3 }]),
    ).toEqual([2, 4]);
  });

  it('parses only safe canonical non-negative decimal byte strings', () => {
    expect(parseUploadBytes('21474836480')).toBe(21_474_836_480);
    expect(parseUploadBytes('0')).toBe(0);
    for (const value of ['-1', '1.5', '1e3', '01', '9007199254740992'])
      expect(() => parseUploadBytes(value)).toThrow('Invalid byte count');
  });

  it('verifies each uploaded file slice with an injected digest', async () => {
    const file = {
      slice: (start: number, end: number) =>
        new Blob([start === 0 && end === 3 ? 'one' : 'two']),
    };
    const digest = async (blob: Blob) => blob.text();
    const parts = [
      { partNumber: 1, checksum: 'one' },
      { partNumber: 2, checksum: 'two' },
    ];

    await expect(uploadedSlicesMatch(file, 3, parts, digest)).resolves.toBe(
      true,
    );
    await expect(
      uploadedSlicesMatch(
        file,
        3,
        [{ partNumber: 2, checksum: 'wrong' }],
        digest,
      ),
    ).resolves.toBe(false);
  });

  it('hashes upload chunks when SubtleCrypto is unavailable on HTTP LAN', async () => {
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues });

    await expect(digestUploadBlob(new Blob(['abc']))).resolves.toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
