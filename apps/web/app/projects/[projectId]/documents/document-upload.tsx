'use client';

import { ApiError, apiErrorCategory } from '../../../lib/api';

type Upload = {
  id: string;
  status: string;
  partSize: number;
  totalParts: number;
  uploadedBytes: string;
  uploadedParts: { partNumber: number; size: number; checksum: string }[];
  originalFilename: string;
  declaredSize: string;
  mimeType: string;
  constraints: { maxBytes: number; allowedExtensions: string[] };
};

export type UploadConstraints = {
  maxBytes: number;
  allowedExtensions: string[];
};
type UploadIdentity = Pick<Upload, 'originalFilename' | 'declaredSize'>;
const localUploadErrors = new Set([
  'Tệp đã chọn không khớp với phiên tải trước.',
  'Tệp đã chọn không khớp với dữ liệu đã tải.',
  'Định dạng tệp không được hỗ trợ.',
  'Không thể liên kết hồ sơ. Vui lòng thử nộp lại.',
]);

export function validateUploadFile(
  file: { name: string; size: number },
  constraints: UploadConstraints,
  identity?: UploadIdentity,
) {
  if (
    identity &&
    (file.name !== identity.originalFilename ||
      String(file.size) !== identity.declaredSize)
  )
    return 'Tệp đã chọn không khớp với phiên tải trước.';
  if (file.size < 1) return 'Tệp phải có dữ liệu.';
  if (file.size > constraints.maxBytes)
    return `Tệp vượt quá giới hạn ${uploadSizeLabel(constraints.maxBytes)}.`;
  if (
    !constraints.allowedExtensions.some((extension) =>
      file.name.toLowerCase().endsWith(extension),
    )
  )
    return 'Định dạng tệp không được hỗ trợ.';
  return null;
}

export function parseUploadBytes(value: string) {
  if (!/^(0|[1-9]\d*)$/.test(value)) throw new RangeError('Invalid byte count');
  const bytes = Number(value);
  if (!Number.isSafeInteger(bytes)) throw new RangeError('Invalid byte count');
  return bytes;
}

export const uploadSizeLabel = (value: number) =>
  value >= 1024 ** 3
    ? `${value / 1024 ** 3} GB`
    : value >= 1024 ** 2
      ? `${(value / 1024 ** 2).toFixed(1)} MB`
      : value >= 1024
        ? `${(value / 1024).toFixed(1)} KB`
        : `${value} B`;

export function remainingUploadParts(
  totalParts: number,
  uploadedParts: Pick<Upload['uploadedParts'][number], 'partNumber'>[],
) {
  const uploaded = new Set(uploadedParts.map(({ partNumber }) => partNumber));
  return Array.from({ length: totalParts }, (_, index) => index + 1).filter(
    (partNumber) => !uploaded.has(partNumber),
  );
}

export async function uploadedSlicesMatch(
  file: { slice(start: number, end: number): Blob },
  partSize: number,
  uploadedParts: Pick<
    Upload['uploadedParts'][number],
    'partNumber' | 'checksum'
  >[],
  digestBlob: (blob: Blob) => Promise<string> = digestUploadBlob,
) {
  for (const uploaded of uploadedParts) {
    const part = file.slice(
      (uploaded.partNumber - 1) * partSize,
      uploaded.partNumber * partSize,
    );
    if ((await digestBlob(part)) !== uploaded.checksum) return false;
  }
  return true;
}

export function uploadErrorMessage(error?: unknown) {
  if (error instanceof ApiError) {
    const category = apiErrorCategory(error);
    if (category === 'PROJECT_DOCUMENT_TARGET_NOT_FOUND')
      return 'Không tìm thấy loại hồ sơ. Danh sách có thể đã thay đổi; vui lòng mở lại và thử lại.';
    if (category === 'PROJECT_DOCUMENT_TARGET_PROJECT_MISMATCH')
      return 'Hồ sơ không thuộc dự án hiện tại.';
    if (category === 'PROJECT_NOT_FOUND_OR_NOT_VISIBLE')
      return 'Dự án đã bị xóa hoặc không còn khả dụng.';
    if (category === 'KEY_DOSSIER_ITEM_DELETED')
      return 'Mục hồ sơ đã bị xóa. Vui lòng chọn mục khác.';
    if (category === 'PROJECT_DOCUMENT_TARGET_INACTIVE')
      return 'Loại hồ sơ không còn được sử dụng.';
    if (category === 'PROJECT_UPLOAD_FORBIDDEN')
      return 'Bạn không có quyền tải hồ sơ cho dự án này.';
    if (category === 'UPLOAD_ROUTE_NOT_FOUND')
      return 'Không tìm thấy dịch vụ khởi tạo phiên tải.';
    if (error.status === 413) return 'Tệp vượt quá dung lượng cho phép.';
    if (error.status === 403 && /upload session expired/i.test(error.message))
      return 'Phiên tải tệp đã hết hạn. Vui lòng bắt đầu phiên mới.';
    if (error.status === 401)
      return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
    if (error.status === 403)
      return 'Bạn không có quyền tải hồ sơ cho dự án này.';
    if (error.status === 404) return 'Không tìm thấy tài nguyên tải hồ sơ.';
    if (error.status === 409)
      return 'Phiên tải tệp không còn khả dụng. Vui lòng bắt đầu lại.';
    if (error.status === 422)
      return 'Thông tin khởi tạo phiên tải không hợp lệ.';
    if (error.status >= 500)
      return 'Dịch vụ tải tệp đang gặp lỗi. Vui lòng thử lại sau.';
  }
  if (error instanceof Error && localUploadErrors.has(error.message))
    return error.message;
  if (
    error instanceof Error &&
    error.message.startsWith('Tệp vượt quá giới hạn ')
  )
    return error.message;
  return 'Không thể tải tệp. Vui lòng kiểm tra tệp và thử lại.';
}

const sha256Constants = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const rotateRight = (value: number, bits: number) =>
  (value >>> bits) | (value << (32 - bits));

function sha256(bytes: Uint8Array) {
  const padded = new Uint8Array(Math.ceil((bytes.length + 9) / 64) * 64);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  const bitLength = bytes.length * 8;
  view.setUint32(padded.length - 8, Math.floor(bitLength / 2 ** 32));
  view.setUint32(padded.length - 4, bitLength >>> 0);
  const hash = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
    0x1f83d9ab, 0x5be0cd19,
  ]);
  const words = new Uint32Array(64);

  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let index = 0; index < 16; index += 1)
      words[index] = view.getUint32(offset + index * 4);
    for (let index = 16; index < 64; index += 1) {
      const previous15 = words[index - 15]!;
      const previous2 = words[index - 2]!;
      const sigma0 =
        rotateRight(previous15, 7) ^
        rotateRight(previous15, 18) ^
        (previous15 >>> 3);
      const sigma1 =
        rotateRight(previous2, 17) ^
        rotateRight(previous2, 19) ^
        (previous2 >>> 10);
      words[index] =
        (words[index - 16]! + sigma0 + words[index - 7]! + sigma1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = hash;
    for (let index = 0; index < 64; index += 1) {
      const sum1 =
        rotateRight(e!, 6) ^ rotateRight(e!, 11) ^ rotateRight(e!, 25);
      const choice = (e! & f!) ^ (~e! & g!);
      const temporary1 =
        (h! + sum1 + choice + sha256Constants[index]! + words[index]!) >>> 0;
      const sum0 =
        rotateRight(a!, 2) ^ rotateRight(a!, 13) ^ rotateRight(a!, 22);
      const majority = (a! & b!) ^ (a! & c!) ^ (b! & c!);
      const temporary2 = (sum0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d! + temporary1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temporary1 + temporary2) >>> 0;
    }
    hash[0] = (hash[0]! + a!) >>> 0;
    hash[1] = (hash[1]! + b!) >>> 0;
    hash[2] = (hash[2]! + c!) >>> 0;
    hash[3] = (hash[3]! + d!) >>> 0;
    hash[4] = (hash[4]! + e!) >>> 0;
    hash[5] = (hash[5]! + f!) >>> 0;
    hash[6] = (hash[6]! + g!) >>> 0;
    hash[7] = (hash[7]! + h!) >>> 0;
  }

  return Array.from(hash)
    .map((word) => word.toString(16).padStart(8, '0'))
    .join('');
}

export async function digestUploadBlob(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const digest = globalThis.crypto?.subtle
    ? new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes))
    : null;
  return digest
    ? Array.from(digest)
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('')
    : sha256(bytes);
}
