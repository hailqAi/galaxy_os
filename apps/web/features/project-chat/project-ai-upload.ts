import { api } from '../../app/lib/api';
import {
  digestUploadBlob,
  parseUploadBytes,
  remainingUploadParts,
  uploadedSlicesMatch,
  validateUploadFile,
} from '../../app/projects/[projectId]/documents/document-upload';

export type PendingChatUpload = {
  id: string;
  projectId: string;
  aiConversationId: string;
  originalFilename: string;
  declaredSize: string;
  mimeType: string;
  status: string;
  uploadedBytes: string;
};
type Session = PendingChatUpload & {
  partSize: number;
  totalParts: number;
  uploadedParts: { partNumber: number; size: number; checksum: string }[];
  constraints: { maxBytes: number; allowedExtensions: string[] };
};
const mimeTypes: Record<string, string> = {
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

export async function uploadAiFile(input: {
  projectId: string;
  conversationId: string;
  key: string;
  file: File;
  sessionId?: string;
  signal: AbortSignal;
  onSession?: (id: string) => void;
  onProgress?: (bytes: number) => void;
  request?: (path: string, init?: RequestInit) => Promise<unknown>;
  digest?: (blob: Blob) => Promise<string>;
}) {
  const request = input.request ?? api;
  const call = (path: string, init?: RequestInit) => {
    input.signal.throwIfAborted();
    return request('/uploads' + path, { ...init, signal: input.signal });
  };
  if (input.file.size < 1 || input.file.size > 10_000_000_000)
    throw new Error('Tệp phải có dữ liệu và không quá 10.000.000.000 bytes.');
  const session = (await (input.sessionId
    ? call('/' + encodeURIComponent(input.sessionId))
    : call('/initiate', {
        method: 'POST',
        body: JSON.stringify({
          projectId: input.projectId,
          aiConversationId: input.conversationId,
          idempotencyKey: input.key,
          originalFilename: input.file.name,
          declaredSize: input.file.size,
          mimeType:
            input.file.type ||
            mimeTypes[input.file.name.split('.').at(-1)!.toLowerCase()] ||
            'application/octet-stream',
        }),
      }))) as Session;
  if (
    session.projectId !== input.projectId ||
    session.aiConversationId !== input.conversationId
  )
    throw new Error('Phiên tải không thuộc hội thoại hiện hành.');
  const invalid = validateUploadFile(input.file, session.constraints, session);
  if (invalid) throw new Error(invalid);
  if (
    !Number.isSafeInteger(session.partSize) ||
    session.partSize < 1 ||
    session.partSize > 67_108_864 ||
    session.totalParts !== Math.ceil(input.file.size / session.partSize) ||
    session.totalParts > 10000 ||
    !Array.isArray(session.uploadedParts) ||
    session.uploadedParts.length > session.totalParts ||
    new Set(session.uploadedParts.map((part) => part.partNumber)).size !==
      session.uploadedParts.length ||
    session.uploadedParts.some(
      (part) =>
        !Number.isInteger(part.partNumber) ||
        part.partNumber < 1 ||
        part.partNumber > session.totalParts ||
        part.size !==
          Math.min(
            session.partSize,
            input.file.size - (part.partNumber - 1) * session.partSize,
          ),
    )
  )
    throw new Error(
      'Cấu hình phần tải không hợp lệ hoặc vượt giới hạn bộ nhớ trình duyệt.',
    );
  input.onSession?.(session.id);
  const digest = input.digest ?? digestUploadBlob;
  if (
    !(await uploadedSlicesMatch(
      input.file,
      session.partSize,
      session.uploadedParts,
      digest,
    ))
  )
    throw new Error('Tệp đã chọn không khớp với dữ liệu đã tải.');
  input.signal.throwIfAborted();
  let uploaded = parseUploadBytes(session.uploadedBytes);
  if (
    uploaded !== session.uploadedParts.reduce((sum, part) => sum + part.size, 0)
  )
    throw new Error('Tiến độ tải không khớp dữ liệu đã lưu.');
  input.onProgress?.(uploaded);
  for (const partNumber of remainingUploadParts(
    session.totalParts,
    session.uploadedParts,
  )) {
    input.signal.throwIfAborted();
    const part = input.file.slice(
      (partNumber - 1) * session.partSize,
      partNumber * session.partSize,
    );
    const checksum = await digest(part);
    input.signal.throwIfAborted();
    const saved = (await call(
      `/${encodeURIComponent(session.id)}/parts?partNumber=${partNumber}&checksum=${encodeURIComponent(checksum)}`,
      {
        method: 'POST',
        body: part,
        headers: { 'Content-Type': 'application/octet-stream' },
      },
    )) as Session;
    const committed = parseUploadBytes(saved.uploadedBytes);
    if (committed !== uploaded + part.size)
      throw new Error('Tiến độ tải không khớp dữ liệu đã lưu.');
    uploaded = committed;
    input.onProgress?.(uploaded);
  }
  input.signal.throwIfAborted();
  const complete = (await call(`/${encodeURIComponent(session.id)}/complete`, {
    method: 'POST',
    body: '{}',
  })) as {
    status: string;
    sourceId?: string;
  };
  if (complete.status !== 'AVAILABLE' || !complete.sourceId)
    throw new Error(
      'Nguồn chat chưa hoàn tất; tải lại trạng thái để tiếp tục.',
    );
  return { sourceId: complete.sourceId, sessionId: session.id };
}
