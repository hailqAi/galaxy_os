'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api, apiErrorCategory } from '../../app/lib/api';
import { createCommandKey } from '../../app/lib/create-command-key';
import {
  digestUploadBlob,
  parseUploadBytes,
  remainingUploadParts,
  uploadErrorMessage,
  uploadSizeLabel,
  uploadedSlicesMatch,
  validateUploadFile,
  type UploadConstraints,
} from '../../app/projects/[projectId]/documents/document-upload';

export type ProjectDocumentContext =
  | 'STAGE_MATRIX_DOCUMENT'
  | 'STAGE_WORKFLOW_STEP_DOCUMENT';
export type ProjectDocumentTargetType = 'STAGE_DOCUMENT' | 'REQUIRED_DOCUMENT';
export type ProjectDocumentStageKey =
  | 'STAGE_1'
  | 'STAGE_2'
  | 'STAGE_3'
  | 'STAGE_4'
  | 'STAGE_5';
export type ProjectDocumentDefinitionOption = {
  id: string;
  name: string;
  customNameRequired?: boolean;
};
export type ProjectDocumentOfficerOption = {
  id: string;
  displayName: string;
};
export type UploadedProjectDocument = {
  id: string;
  definitionId?: string;
  [key: string]: unknown;
};
export type ProjectDocumentQueueItem = {
  idempotencyKey: string;
  projectId: string;
  definitionId: string;
  definitionName: string;
  contextType: ProjectDocumentContext;
  targetType: ProjectDocumentTargetType;
  displayName?: string;
  stageKey: ProjectDocumentStageKey;
  workstreamKey: string;
  submittedOfficerId: string;
  documentId?: string;
  file?: File;
  filename: string;
  size: number;
  mimeType: string;
  status:
    | 'QUEUED'
    | 'INITIALIZING'
    | 'UPLOADING'
    | 'RETRYING'
    | 'FINALIZING_TEMP'
    | 'READY_TO_SUBMIT'
    | 'SUBMITTING'
    | 'SUBMITTED'
    | 'FAILED'
    | 'ABORTED'
    | 'EXPIRED';
  progress: number;
  confirmedBytes: number;
  attempts: number;
  error: string;
  valid: boolean;
  sessionId?: string;
  submittedDocument?: UploadedProjectDocument;
};

type UploadSession = {
  id: string;
  status: string;
  partSize: number;
  totalParts: number;
  uploadedBytes: string;
  uploadedParts: { partNumber: number; size: number; checksum: string }[];
  originalFilename: string;
  declaredSize: string;
  mimeType: string;
  constraints: UploadConstraints;
  stageOneDocumentId?: string;
  submittingOfficerId?: string | null;
  fileAssetId?: string;
};
type Request = (path: string, init?: RequestInit) => Promise<unknown>;

const statuses: Record<ProjectDocumentQueueItem['status'], string> = {
  QUEUED: 'Chờ tải',
  INITIALIZING: 'Đang khởi tạo',
  UPLOADING: 'Đang tải',
  RETRYING: 'Đang thử lại',
  FINALIZING_TEMP: 'Đang hoàn tất tải tạm',
  READY_TO_SUBMIT: 'Đã tải tạm — Chờ nộp',
  SUBMITTING: 'Đang nộp hồ sơ',
  SUBMITTED: 'Đã nộp',
  FAILED: 'Lỗi',
  ABORTED: 'Đã hủy',
  EXPIRED: 'Đã hết hạn',
};

export const MAX_UPLOAD_ATTEMPTS = 3;
export const MAX_PROJECT_DOCUMENT_FILES_PER_SUBMISSION = 20;

export const limitProjectDocumentFiles = (
  files: Iterable<File>,
  currentCount: number,
) =>
  Array.from(files).slice(
    0,
    Math.max(0, MAX_PROJECT_DOCUMENT_FILES_PER_SUBMISSION - currentCount),
  );

class ProjectDocumentUploadError extends Error {
  constructor(
    message: string,
    readonly category?: string,
  ) {
    super(message);
  }
}

export function isProjectDocumentTargetStale(error: unknown) {
  const category =
    error instanceof ApiError
      ? apiErrorCategory(error)
      : error instanceof ProjectDocumentUploadError
        ? error.category
        : undefined;
  return (
    category === 'PROJECT_DOCUMENT_TARGET_NOT_FOUND' ||
    category === 'PROJECT_DOCUMENT_TARGET_PROJECT_MISMATCH' ||
    category === 'PROJECT_DOCUMENT_TARGET_INACTIVE' ||
    category === 'PROJECT_NOT_FOUND_OR_NOT_VISIBLE' ||
    category === 'KEY_DOSSIER_ITEM_DELETED'
  );
}

const genericUploadError = uploadErrorMessage();

function phaseError(
  phase: 'INITIALIZING' | 'UPLOADING' | 'FINALIZING_TEMP',
  error: unknown,
) {
  const detail = uploadErrorMessage(error);
  if (error instanceof ApiError)
    return new ProjectDocumentUploadError(detail, apiErrorCategory(error));
  const message =
    phase === 'INITIALIZING'
      ? 'Không thể khởi tạo phiên tải. Vui lòng kiểm tra quyền truy cập và thử lại.'
      : phase === 'UPLOADING'
        ? 'Tải dữ liệu bị gián đoạn. Phần đã tải được giữ lại; vui lòng thử lại để tiếp tục.'
        : 'Đã tải đủ dữ liệu nhưng không thể hoàn tất tệp tạm. Vui lòng thử lại.';
  return new ProjectDocumentUploadError(
    detail === genericUploadError ? message : `${message} ${detail}`,
  );
}

export const projectDocumentQueueKey = (
  projectId: string,
  stageKey: string,
  workstreamKey: string,
  definitionId: string,
  contextType: ProjectDocumentContext,
  targetType: ProjectDocumentTargetType,
) =>
  `${projectId}:${stageKey}:${workstreamKey}:${definitionId}:${contextType}:${targetType}`;

type BatchStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type ProjectDocumentQueueContext = Pick<
  ProjectDocumentQueueItem,
  | 'projectId'
  | 'stageKey'
  | 'workstreamKey'
  | 'definitionId'
  | 'contextType'
  | 'targetType'
>;
export type ProjectDocumentPendingBatchPrincipal = {
  actorUserId: string;
  organizationId: string;
};
type ProjectDocumentQueueIdentity = ProjectDocumentQueueContext &
  ProjectDocumentPendingBatchPrincipal;

type PendingBatchItem = Pick<
  ProjectDocumentQueueItem,
  | 'idempotencyKey'
  | 'definitionName'
  | 'contextType'
  | 'targetType'
  | 'displayName'
  | 'submittedOfficerId'
  | 'documentId'
  | 'filename'
  | 'size'
  | 'mimeType'
> & { sessionId: string };

export type ProjectDocumentPendingBatch = ProjectDocumentQueueIdentity & {
  version: 2;
  batchKey: string;
  sessionIds: string[];
  items: PendingBatchItem[];
};

export const PROJECT_DOCUMENT_PENDING_BATCH_PREFIX = 'project-document-submit:';

const projectDocumentPendingBatchStorageKey = (
  context: ProjectDocumentQueueIdentity,
) =>
  `${PROJECT_DOCUMENT_PENDING_BATCH_PREFIX}${encodeURIComponent(
    `${context.organizationId}:${context.actorUserId}:${projectDocumentQueueKey(
      context.projectId,
      context.stageKey,
      context.workstreamKey,
      context.definitionId,
      context.contextType,
      context.targetType,
    )}`,
  )}`;

const unscopedProjectDocumentPendingBatchStorageKey = (
  context: ProjectDocumentQueueContext,
) =>
  `${PROJECT_DOCUMENT_PENDING_BATCH_PREFIX}${encodeURIComponent(
    projectDocumentQueueKey(
      context.projectId,
      context.stageKey,
      context.workstreamKey,
      context.definitionId,
      context.contextType,
      context.targetType,
    ),
  )}`;

const legacyProjectDocumentPendingBatchStorageKey = (
  context: Pick<ProjectDocumentQueueIdentity, 'projectId' | 'definitionId'>,
) =>
  `${PROJECT_DOCUMENT_PENDING_BATCH_PREFIX}${encodeURIComponent(
    `${context.projectId}:${context.definitionId}`,
  )}`;

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const exactKeys = (value: object, keys: readonly string[]) => {
  const actual = Object.keys(value);
  return (
    actual.length === keys.length && actual.every((key) => keys.includes(key))
  );
};

const isPendingBatch = (
  value: unknown,
  context: ProjectDocumentQueueIdentity,
): value is ProjectDocumentPendingBatch => {
  if (!value || typeof value !== 'object') return false;
  const batch = value as Partial<ProjectDocumentPendingBatch>;
  if (
    batch.version !== 2 ||
    typeof batch.batchKey !== 'string' ||
    !batch.batchKey ||
    batch.batchKey.length > 200 ||
    batch.projectId !== context.projectId ||
    batch.definitionId !== context.definitionId ||
    batch.stageKey !== context.stageKey ||
    batch.workstreamKey !== context.workstreamKey ||
    batch.contextType !== context.contextType ||
    batch.targetType !== context.targetType ||
    batch.actorUserId !== context.actorUserId ||
    batch.organizationId !== context.organizationId ||
    !Array.isArray(batch.sessionIds) ||
    !Array.isArray(batch.items) ||
    !batch.sessionIds.length ||
    batch.sessionIds.length > 20 ||
    new Set(batch.sessionIds).size !== batch.sessionIds.length ||
    batch.sessionIds.length !== batch.items.length
  )
    return false;
  if (
    !exactKeys(batch, [
      'version',
      'projectId',
      'stageKey',
      'workstreamKey',
      'definitionId',
      'contextType',
      'targetType',
      'actorUserId',
      'organizationId',
      'batchKey',
      'sessionIds',
      'items',
    ])
  )
    return false;
  return batch.items.every((item, index) => {
    const sessionId = batch.sessionIds?.[index];
    return (
      typeof sessionId === 'string' &&
      uuid.test(sessionId) &&
      sessionId === sessionId.toLowerCase() &&
      item?.sessionId === sessionId &&
      exactKeys(item, [
        'sessionId',
        'idempotencyKey',
        'definitionName',
        'contextType',
        'targetType',
        ...(item.displayName === undefined ? [] : ['displayName']),
        'submittedOfficerId',
        ...(item.documentId === undefined ? [] : ['documentId']),
        'filename',
        'size',
        'mimeType',
      ]) &&
      typeof item.idempotencyKey === 'string' &&
      item.idempotencyKey.length > 0 &&
      item.idempotencyKey.length <= 200 &&
      typeof item.definitionName === 'string' &&
      item.definitionName.length > 0 &&
      item.definitionName.length <= 200 &&
      item.contextType === batch.contextType &&
      item.targetType === batch.targetType &&
      (item.displayName === undefined ||
        (typeof item.displayName === 'string' &&
          item.displayName.length > 0 &&
          item.displayName.length <= 200 &&
          item.displayName === item.displayName.trim())) &&
      typeof item.submittedOfficerId === 'string' &&
      item.submittedOfficerId.length > 0 &&
      item.submittedOfficerId.length <= 100 &&
      (item.documentId === undefined ||
        (typeof item.documentId === 'string' &&
          item.documentId.length > 0 &&
          item.documentId.length <= 100)) &&
      typeof item.filename === 'string' &&
      item.filename.length > 0 &&
      item.filename.length <= 255 &&
      typeof item.size === 'number' &&
      Number.isSafeInteger(item.size) &&
      item.size > 0 &&
      typeof item.mimeType === 'string' &&
      item.mimeType.length > 0 &&
      item.mimeType.length <= 200
    );
  });
};

export function readProjectDocumentPendingBatch(
  storage: BatchStorage,
  context: ProjectDocumentQueueIdentity,
) {
  storage.removeItem(legacyProjectDocumentPendingBatchStorageKey(context));
  storage.removeItem(unscopedProjectDocumentPendingBatchStorageKey(context));
  const storageKey = projectDocumentPendingBatchStorageKey(context);
  const serialized = storage.getItem(storageKey);
  if (!serialized) return null;
  try {
    const value: unknown = JSON.parse(serialized);
    if (!isPendingBatch(value, context)) {
      storage.removeItem(storageKey);
      return null;
    }
    return {
      version: 2 as const,
      projectId: value.projectId,
      stageKey: value.stageKey,
      workstreamKey: value.workstreamKey,
      definitionId: value.definitionId,
      contextType: value.contextType,
      targetType: value.targetType,
      actorUserId: value.actorUserId,
      organizationId: value.organizationId,
      batchKey: value.batchKey,
      sessionIds: [...value.sessionIds],
      items: value.items.map((item) => ({
        sessionId: item.sessionId,
        idempotencyKey: item.idempotencyKey,
        definitionName: item.definitionName,
        contextType: item.contextType,
        targetType: item.targetType,
        ...(item.displayName ? { displayName: item.displayName } : {}),
        submittedOfficerId: item.submittedOfficerId,
        ...(item.documentId ? { documentId: item.documentId } : {}),
        filename: item.filename,
        size: item.size,
        mimeType: item.mimeType,
      })),
    };
  } catch {
    storage.removeItem(storageKey);
    return null;
  }
}

const writeProjectDocumentPendingBatch = (
  storage: BatchStorage,
  batch: ProjectDocumentPendingBatch,
) =>
  storage.setItem(
    projectDocumentPendingBatchStorageKey(batch),
    JSON.stringify(batch),
  );

const pendingBatchItemMatches = (
  pending: PendingBatchItem,
  item: ProjectDocumentQueueItem,
  batch: ProjectDocumentPendingBatch,
) =>
  item.projectId === batch.projectId &&
  item.stageKey === batch.stageKey &&
  item.workstreamKey === batch.workstreamKey &&
  item.definitionId === batch.definitionId &&
  item.contextType === batch.contextType &&
  item.targetType === batch.targetType &&
  pending.sessionId === item.sessionId?.toLowerCase() &&
  pending.idempotencyKey === item.idempotencyKey &&
  pending.definitionName === item.definitionName &&
  pending.displayName === item.displayName &&
  pending.submittedOfficerId === item.submittedOfficerId &&
  pending.documentId === item.documentId &&
  pending.filename === item.filename &&
  pending.size === item.size &&
  pending.mimeType === item.mimeType;

export function loadOrCreateProjectDocumentPendingBatch(
  storage: BatchStorage,
  items: readonly ProjectDocumentQueueItem[],
  principal: ProjectDocumentPendingBatchPrincipal,
  create: () => string = createCommandKey,
) {
  const first = items.find(({ sessionId }) => sessionId);
  if (!first)
    throw new ProjectDocumentUploadError('Không có phiên tải để nộp.');
  const context: ProjectDocumentQueueContext = {
    projectId: first.projectId,
    stageKey: first.stageKey,
    workstreamKey: first.workstreamKey,
    definitionId: first.definitionId,
    contextType: first.contextType,
    targetType: first.targetType,
  };
  const identity = { ...context, ...principal };
  const current = readProjectDocumentPendingBatch(storage, identity);
  if (current) {
    const exactItems = items.every((item, index) => {
      const pending = current.items[index];
      return pending && pendingBatchItemMatches(pending, item, current);
    });
    if (current.items.length === items.length && exactItems) return current;
    clearProjectDocumentPendingBatch(storage, identity);
    throw new ProjectDocumentUploadError(
      'Bản nộp đã lưu không khớp với hàng hồ sơ hiện tại.',
    );
  }
  const pending = items.flatMap((item): PendingBatchItem[] => {
    if (
      !item.sessionId ||
      item.projectId !== context.projectId ||
      item.stageKey !== context.stageKey ||
      item.workstreamKey !== context.workstreamKey ||
      item.definitionId !== context.definitionId ||
      item.contextType !== context.contextType ||
      item.targetType !== context.targetType
    )
      return [];
    return [
      {
        sessionId: item.sessionId.toLowerCase(),
        idempotencyKey: item.idempotencyKey,
        definitionName: item.definitionName,
        contextType: item.contextType,
        targetType: item.targetType,
        ...(item.displayName ? { displayName: item.displayName } : {}),
        submittedOfficerId: item.submittedOfficerId,
        ...(item.documentId ? { documentId: item.documentId } : {}),
        filename: item.filename,
        size: item.size,
        mimeType: item.mimeType,
      },
    ];
  });
  if (pending.length !== items.length)
    throw new ProjectDocumentUploadError('Các tệp phải cùng một hàng hồ sơ.');
  const batch: ProjectDocumentPendingBatch = {
    version: 2,
    ...identity,
    batchKey: create(),
    sessionIds: pending.map(({ sessionId }) => sessionId),
    items: pending,
  };
  if (!isPendingBatch(batch, identity))
    throw new ProjectDocumentUploadError('Thông tin phiên tải không hợp lệ.');
  writeProjectDocumentPendingBatch(storage, batch);
  return batch;
}

export const clearProjectDocumentPendingBatch = (
  storage: BatchStorage,
  context: ProjectDocumentQueueIdentity,
) => storage.removeItem(projectDocumentPendingBatchStorageKey(context));

export const clearProjectDocumentPendingBatchStorage = (
  storage: Pick<Storage, 'key' | 'length' | 'removeItem'>,
) => {
  for (let index = storage.length - 1; index >= 0; index--) {
    const key = storage.key(index);
    if (key?.startsWith(PROJECT_DOCUMENT_PENDING_BATCH_PREFIX))
      storage.removeItem(key);
  }
};

export const projectDocumentPendingBatchItems = (
  batch: ProjectDocumentPendingBatch,
  status: 'READY_TO_SUBMIT' | 'SUBMITTING' = 'READY_TO_SUBMIT',
): ProjectDocumentQueueItem[] =>
  batch.items.map((item) => ({
    idempotencyKey: item.idempotencyKey,
    projectId: batch.projectId,
    definitionId: batch.definitionId,
    definitionName: item.definitionName,
    contextType: item.contextType,
    targetType: item.targetType,
    ...(item.displayName ? { displayName: item.displayName } : {}),
    stageKey: batch.stageKey,
    workstreamKey: batch.workstreamKey,
    submittedOfficerId: item.submittedOfficerId,
    ...(item.documentId ? { documentId: item.documentId } : {}),
    filename: item.filename,
    size: item.size,
    mimeType: item.mimeType,
    sessionId: item.sessionId,
    status,
    progress: 100,
    confirmedBytes: item.size,
    attempts: 0,
    error: '',
    valid: true,
  }));

export async function reconcileProjectDocumentPendingBatch(
  storage: BatchStorage,
  batch: ProjectDocumentPendingBatch,
  recoveredSessionIds: readonly string[],
  request: Request = api,
) {
  const recovered = new Set(recoveredSessionIds.map((id) => id.toLowerCase()));
  const items: PendingBatchItem[] = [];
  let uncertain = false;
  for (const item of batch.items) {
    if (recovered.has(item.sessionId)) {
      items.push(item);
      continue;
    }
    try {
      const session = (await request(`/uploads/${item.sessionId}`)) as {
        status?: string;
      };
      if (!session.status) uncertain = true;
      if (!['ABORTED', 'EXPIRED'].includes(session.status ?? ''))
        items.push(item);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) continue;
      uncertain = true;
      items.push(item);
    }
  }
  if (!items.length) {
    clearProjectDocumentPendingBatch(storage, batch);
    return { batch: null, error: '' };
  }
  const next = {
    ...batch,
    sessionIds: items.map(({ sessionId }) => sessionId),
    items,
  };
  writeProjectDocumentPendingBatch(storage, next);
  return {
    batch: next,
    error: uncertain
      ? 'Không thể xác minh trạng thái tệp tạm. Vui lòng thử lại.'
      : '',
  };
}

export function enqueueProjectDocumentFiles(
  files: Iterable<File>,
  target: {
    projectId: string;
    definition: ProjectDocumentDefinitionOption;
    stageKey: ProjectDocumentQueueItem['stageKey'];
    workstreamKey: string;
    submittedOfficerId: string;
    contextType: ProjectDocumentContext;
    targetType: ProjectDocumentTargetType;
    displayName?: string;
    documentId?: string;
  },
  constraints: UploadConstraints,
  key: () => string = createCommandKey,
) {
  return Array.from(files, (file): ProjectDocumentQueueItem => {
    const error = validateUploadFile(file, constraints) ?? '';
    return {
      idempotencyKey: key(),
      projectId: target.projectId,
      definitionId: target.definition.id,
      definitionName: target.definition.name,
      contextType: target.contextType,
      targetType: target.targetType,
      ...(target.displayName?.trim()
        ? { displayName: target.displayName.trim().slice(0, 200) }
        : {}),
      stageKey: target.stageKey,
      workstreamKey: target.workstreamKey,
      submittedOfficerId: target.submittedOfficerId,
      documentId: target.documentId,
      file,
      filename: file.name,
      size: file.size,
      mimeType: file.type || 'application/octet-stream',
      status: error ? 'FAILED' : 'QUEUED',
      progress: 0,
      confirmedBytes: 0,
      attempts: 0,
      error,
      valid: !error,
    };
  });
}

export const removeProjectDocumentQueueItem = (
  queue: ProjectDocumentQueueItem[],
  idempotencyKey: string,
) =>
  queue.filter(
    (item) =>
      item.idempotencyKey !== idempotencyKey ||
      [
        'INITIALIZING',
        'UPLOADING',
        'RETRYING',
        'FINALIZING_TEMP',
        'SUBMITTING',
      ].includes(item.status),
  );

export const setProjectDocumentAborted = (
  aborted: Set<string>,
  idempotencyKey: string,
  value: boolean,
) => {
  if (value) aborted.add(idempotencyKey);
  else aborted.delete(idempotencyKey);
};

export function mergeProjectDocumentQueue(
  current: ProjectDocumentQueueItem[],
  changed: ProjectDocumentQueueItem[],
) {
  const scope = (item: ProjectDocumentQueueItem) =>
    projectDocumentQueueKey(
      item.projectId,
      item.stageKey,
      item.workstreamKey,
      item.definitionId,
      item.contextType,
      item.targetType,
    );
  const identity = (item: ProjectDocumentQueueItem) =>
    `${scope(item)}:${item.idempotencyKey}`;
  const sessionIdentity = (item: ProjectDocumentQueueItem) =>
    `${scope(item)}:${item.documentId ?? 'new'}:${item.sessionId}`;
  const updates = new Map(changed.map((item) => [identity(item), item]));
  const sessionUpdates = new Map(
    changed.flatMap((item) =>
      item.sessionId ? [[sessionIdentity(item), item] as const] : [],
    ),
  );
  const merged = current.map((item) => {
    if (item.status === 'SUBMITTED') return item;
    const update =
      updates.get(identity(item)) ??
      (item.sessionId ? sessionUpdates.get(sessionIdentity(item)) : undefined);
    return update ? { ...item, ...update } : item;
  });
  const known = new Set(merged.map(identity));
  return [...merged, ...changed.filter((item) => !known.has(identity(item)))];
}

export const projectDocumentQueueShouldAutoStart = (
  queue: readonly ProjectDocumentQueueItem[],
) =>
  queue.some(
    ({ attempts, file, status, valid }) =>
      Boolean(file) &&
      valid &&
      status === 'QUEUED' &&
      attempts < MAX_UPLOAD_ATTEMPTS,
  );

export const projectDocumentQueueBlocksClose = (
  queue: readonly ProjectDocumentQueueItem[],
  abortPending = false,
) =>
  abortPending ||
  queue.some(({ status }) =>
    [
      'QUEUED',
      'INITIALIZING',
      'UPLOADING',
      'RETRYING',
      'FINALIZING_TEMP',
      'READY_TO_SUBMIT',
      'SUBMITTING',
    ].includes(status),
  );

export async function runProjectDocumentUploadQueue(
  queue: ProjectDocumentQueueItem[],
  upload: (
    item: ProjectDocumentQueueItem,
    update: (change: Partial<ProjectDocumentQueueItem>) => void,
  ) => Promise<unknown>,
  concurrency = 2,
  onChange?: (queue: ProjectDocumentQueueItem[]) => void,
  isAborted: (item: ProjectDocumentQueueItem) => boolean = () => false,
  isRemoved: (item: ProjectDocumentQueueItem) => boolean = () => false,
) {
  const result = queue.map((item) => ({ ...item }));
  const pending = result
    .map((item, index) => ({ item, index }))
    .filter(
      ({ item }) =>
        item.valid &&
        item.file &&
        (item.status === 'QUEUED' || item.status === 'FAILED') &&
        item.attempts < MAX_UPLOAD_ATTEMPTS,
    );
  let cursor = 0;
  const visibleResult = () =>
    result.filter((item) => !isRemoved(item)).map((item) => ({ ...item }));
  const publish = () => onChange?.(visibleResult());
  await Promise.all(
    Array.from(
      { length: Math.min(Math.max(1, concurrency), pending.length) },
      async () => {
        while (cursor < pending.length) {
          const current = pending[cursor++];
          if (!current) return;
          if (isRemoved(current.item)) continue;
          result[current.index] = {
            ...current.item,
            status:
              current.item.status === 'FAILED' ? 'RETRYING' : 'INITIALIZING',
            attempts: current.item.attempts + 1,
            error: '',
          };
          publish();
          try {
            await upload(result[current.index]!, (change) => {
              result[current.index] = { ...result[current.index]!, ...change };
              publish();
            });
            result[current.index] = isAborted(result[current.index]!)
              ? { ...result[current.index]!, status: 'ABORTED', error: '' }
              : {
                  ...result[current.index]!,
                  status: 'READY_TO_SUBMIT',
                  progress: 100,
                  confirmedBytes: result[current.index]!.size,
                  error: '',
                };
          } catch (error) {
            result[current.index] = isAborted(result[current.index]!)
              ? { ...result[current.index]!, status: 'ABORTED', error: '' }
              : {
                  ...result[current.index]!,
                  status: 'FAILED',
                  error:
                    error instanceof ProjectDocumentUploadError
                      ? error.message
                      : 'Không thể tải tệp. Vui lòng thử lại.',
                };
          }
          publish();
        }
      },
    ),
  );
  return visibleResult();
}

export async function transferProjectDocumentQueueItem(
  item: ProjectDocumentQueueItem,
  target: { projectId: string },
  request: Request = api,
  digest: (blob: Blob) => Promise<string> = digestUploadBlob,
  onUpdate: (change: Partial<ProjectDocumentQueueItem>) => void = () =>
    undefined,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  if (!item.file)
    throw new ProjectDocumentUploadError(
      'Không có dữ liệu tệp cục bộ để tiếp tục tải.',
    );
  const file = item.file;
  let session: UploadSession;
  try {
    session = (await request('/uploads/initiate', {
      method: 'POST',
      signal,
      body: JSON.stringify({
        projectId: target.projectId,
        idempotencyKey: item.idempotencyKey,
        originalFilename: item.filename,
        declaredSize: item.size,
        mimeType: item.mimeType,
        ...(item.targetType === 'REQUIRED_DOCUMENT'
          ? { requiredDocumentId: item.definitionId }
          : {
              stageOneDocument: {
                definitionId: item.definitionId,
                stageKey: item.stageKey,
                ...(item.stageKey !== 'STAGE_1' ||
                item.contextType !== 'STAGE_MATRIX_DOCUMENT'
                  ? { workstreamKey: item.workstreamKey }
                  : {}),
                contextType: item.contextType,
                ...(item.displayName
                  ? { displayName: item.displayName.trim().slice(0, 200) }
                  : {}),
                submittedOfficerId: item.submittedOfficerId,
                ...(item.documentId ? { documentId: item.documentId } : {}),
                idempotencyKey: item.idempotencyKey,
              },
            }),
      }),
    })) as UploadSession;
  } catch (error) {
    throw phaseError('INITIALIZING', error);
  }
  const issue = validateUploadFile(file, session.constraints, session);
  if (issue) throw new ProjectDocumentUploadError(issue);
  const resumedBytes = parseUploadBytes(session.uploadedBytes);
  if (resumedBytes > item.size)
    throw new ProjectDocumentUploadError(
      'Phiên tải có số byte không hợp lệ. Vui lòng bắt đầu lại.',
    );
  try {
    if (
      !(await uploadedSlicesMatch(
        file,
        session.partSize,
        session.uploadedParts,
        digest,
      ))
    )
      throw new ProjectDocumentUploadError(
        'Tệp đã chọn không khớp với dữ liệu đã tải.',
      );
  } catch (error) {
    if (error instanceof ProjectDocumentUploadError) throw error;
    throw phaseError('UPLOADING', error);
  }
  onUpdate({
    sessionId: session.id,
    ...(session.stageOneDocumentId || item.documentId
      ? { documentId: session.stageOneDocumentId ?? item.documentId }
      : {}),
    status: 'UPLOADING',
    confirmedBytes: resumedBytes,
    progress: item.size ? (resumedBytes / item.size) * 100 : 0,
  });
  for (const partNumber of remainingUploadParts(
    session.totalParts,
    session.uploadedParts,
  )) {
    signal?.throwIfAborted();
    try {
      const part = file.slice(
        (partNumber - 1) * session.partSize,
        partNumber * session.partSize,
      );
      session = (await request(
        `/uploads/${session.id}/parts?partNumber=${partNumber}&checksum=${await digest(part)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: part,
          signal,
        },
      )) as UploadSession;
    } catch (error) {
      throw phaseError('UPLOADING', error);
    }
    const confirmedBytes = parseUploadBytes(session.uploadedBytes);
    if (confirmedBytes > item.size)
      throw new ProjectDocumentUploadError(
        'Phiên tải có số byte không hợp lệ. Vui lòng bắt đầu lại.',
      );
    onUpdate({
      sessionId: session.id,
      confirmedBytes,
      progress: item.size ? (confirmedBytes / item.size) * 100 : 0,
    });
  }
  signal?.throwIfAborted();
  onUpdate({ status: 'FINALIZING_TEMP' });
  try {
    const completed = (await request(`/uploads/${session.id}/complete`, {
      method: 'POST',
      body: '{}',
      signal,
    })) as UploadSession;
    const confirmedBytes = parseUploadBytes(completed.uploadedBytes);
    if (completed.status !== 'AVAILABLE' || confirmedBytes !== item.size)
      throw new Error('temporary upload incomplete');
    onUpdate({ confirmedBytes, progress: 100 });
    return completed;
  } catch (error) {
    if (error instanceof ProjectDocumentUploadError) throw error;
    throw phaseError('FINALIZING_TEMP', error);
  }
}

export async function submitProjectDocumentQueue(
  items: readonly ProjectDocumentQueueItem[],
  batchKey: string,
  request: Request = api,
  refresh?: (document: UploadedProjectDocument) => void | Promise<void>,
) {
  const ready = items.filter(
    (item): item is ProjectDocumentQueueItem & { sessionId: string } =>
      item.status === 'READY_TO_SUBMIT' && Boolean(item.sessionId),
  );
  const projectId = ready[0]?.projectId;
  if (!projectId || ready.some((item) => item.projectId !== projectId))
    throw new ProjectDocumentUploadError('Các tệp phải thuộc cùng một dự án.');
  let result: {
    items: {
      sessionId: string;
      fileAssetId: string;
      document: UploadedProjectDocument;
    }[];
  };
  let submitted = new Map<string, UploadedProjectDocument>();
  try {
    result = (await request('/uploads/submit', {
      method: 'POST',
      body: JSON.stringify({
        projectId,
        sessionIds: ready.map(({ sessionId }) => sessionId),
        idempotencyKey: batchKey,
      }),
    })) as typeof result;
    submitted = new Map(
      result.items.map((item) => [item.sessionId, item.document]),
    );
    if (
      result.items.length !== ready.length ||
      result.items.some(
        ({ sessionId }, index) => sessionId !== ready[index]?.sessionId,
      )
    )
      throw new Error('invalid submission response');
  } catch (error) {
    if (error instanceof ApiError)
      throw new ProjectDocumentUploadError(
        uploadErrorMessage(error),
        apiErrorCategory(error),
      );
    throw new ProjectDocumentUploadError(
      `Không thể liên kết các tệp: ${ready.map(({ filename }) => filename).join(', ')}. Vui lòng thử nộp lại.`,
    );
  }
  const submittedItems = items.map((item) =>
    item.sessionId && submitted.has(item.sessionId)
      ? {
          ...item,
          status: 'SUBMITTED' as const,
          error: '',
          submittedDocument: submitted.get(item.sessionId),
        }
      : item,
  );
  const document = submittedItems.find(
    ({ submittedDocument }) => submittedDocument,
  )?.submittedDocument;
  if (document && refresh)
    try {
      await refresh(document);
    } catch {
      throw new ProjectDocumentUploadError(
        'Đã liên kết hồ sơ nhưng không thể làm mới dữ liệu. Vui lòng thử nộp lại.',
      );
    }
  return submittedItems;
}

export async function retryProjectDocumentPendingBatch(
  storage: BatchStorage,
  batch: ProjectDocumentPendingBatch,
  request: Request = api,
  refresh?: (document: UploadedProjectDocument) => void | Promise<void>,
) {
  const submitted = await submitProjectDocumentQueue(
    projectDocumentPendingBatchItems(batch),
    batch.batchKey,
    request,
    refresh,
  );
  clearProjectDocumentPendingBatch(storage, batch);
  return submitted;
}

type RecoveredUploadSession = {
  id: string;
  requiredDocumentId: string | null;
  stageOneDocumentId: string | null;
  submittingOfficerId?: string | null;
  originalFilename: string;
  declaredSize: string;
  uploadedBytes: string;
  mimeType: string;
  status: 'AVAILABLE';
  stageOneDocument?: {
    requiredDocumentId: string | null;
    stageKey: string;
    workstreamKey: string;
    submittedOfficerId: string;
  } | null;
};

const recoveredQueueItem = (
  session: RecoveredUploadSession,
  target: {
    projectId: string;
    definition: ProjectDocumentDefinitionOption;
    stageKey: ProjectDocumentQueueItem['stageKey'];
    workstreamKey: string;
    submittedOfficerId: string;
    contextType: ProjectDocumentContext;
    targetType: ProjectDocumentTargetType;
    documentId?: string;
  },
): ProjectDocumentQueueItem => {
  const size = parseUploadBytes(session.declaredSize);
  const confirmedBytes = parseUploadBytes(session.uploadedBytes);
  return {
    idempotencyKey: `recovered:${session.id}`,
    projectId: target.projectId,
    definitionId: target.definition.id,
    definitionName: target.definition.name,
    contextType: target.contextType,
    targetType: target.targetType,
    stageKey: target.stageKey,
    workstreamKey: target.workstreamKey,
    submittedOfficerId: target.submittedOfficerId,
    ...(target.documentId ? { documentId: target.documentId } : {}),
    filename: session.originalFilename,
    size,
    mimeType: session.mimeType,
    status: 'READY_TO_SUBMIT',
    progress: size ? (confirmedBytes / size) * 100 : 0,
    confirmedBytes,
    attempts: 0,
    error: '',
    valid: true,
    sessionId: session.id,
  };
};

export async function recoverProjectDocumentQueues(
  target: {
    projectId: string;
    definitions: readonly (ProjectDocumentDefinitionOption & {
      workstreamKey: string;
      contextType: ProjectDocumentContext;
      targetType: ProjectDocumentTargetType;
      stageKey?: ProjectDocumentStageKey;
      submittedOfficerId?: string;
    })[];
  },
  request: Request = api,
) {
  const singleRequired =
    target.definitions.length === 1 &&
    target.definitions[0]?.targetType === 'REQUIRED_DOCUMENT'
      ? target.definitions[0]
      : undefined;
  const query = new URLSearchParams({ projectId: target.projectId });
  if (singleRequired) query.set('requiredDocumentId', singleRequired.id);
  const contexts = new Set(
    target.definitions.map(({ contextType }) => contextType),
  );
  if (!singleRequired && contexts.size === 1)
    query.set('contextType', target.definitions[0]!.contextType);
  const result = (await request(`/uploads/recovery?${query}`)) as {
    items: RecoveredUploadSession[];
  };
  const definitions = new Map(
    target.definitions.map((definition) => [definition.id, definition]),
  );
  const queues: Record<string, ProjectDocumentQueueItem[]> = {};
  for (const session of result.items) {
    const definitionId =
      session.requiredDocumentId ??
      session.stageOneDocument?.requiredDocumentId;
    const definition = definitionId ? definitions.get(definitionId) : undefined;
    if (!definition) continue;
    const requiredDocument = definition.targetType === 'REQUIRED_DOCUMENT';
    const stageKey =
      definition.stageKey ?? (requiredDocument ? undefined : 'STAGE_1');
    const submittedOfficerId = requiredDocument
      ? definition.submittedOfficerId
      : (session.submittingOfficerId ??
        session.stageOneDocument?.submittedOfficerId);
    if (
      !stageKey ||
      !submittedOfficerId ||
      (requiredDocument
        ? session.requiredDocumentId !== definition.id ||
          Boolean(session.stageOneDocumentId || session.stageOneDocument)
        : session.stageOneDocument?.stageKey !== stageKey ||
          session.stageOneDocument.workstreamKey !== definition.workstreamKey)
    )
      continue;
    const key = projectDocumentQueueKey(
      target.projectId,
      stageKey,
      definition.workstreamKey,
      definition.id,
      definition.contextType,
      definition.targetType,
    );
    (queues[key] ??= []).push(
      recoveredQueueItem(session, {
        projectId: target.projectId,
        definition,
        stageKey,
        workstreamKey: definition.workstreamKey,
        contextType: definition.contextType,
        targetType: definition.targetType,
        submittedOfficerId,
        ...(!requiredDocument && session.stageOneDocumentId
          ? { documentId: session.stageOneDocumentId }
          : {}),
      }),
    );
  }
  return queues;
}

export async function recoverProjectDocumentQueuesOnce(
  guard: { current: string },
  target: Parameters<typeof recoverProjectDocumentQueues>[0],
  request: Request = api,
) {
  if (guard.current === target.projectId) return {};
  guard.current = target.projectId;
  try {
    return await recoverProjectDocumentQueues(target, request);
  } catch (error) {
    if (guard.current === target.projectId) guard.current = '';
    throw error;
  }
}

export function ProjectDocumentUploadQueue({
  actor,
  constraints,
  definition,
  contextType,
  targetType,
  displayName,
  documentId,
  officerOptions,
  onAbortPendingChange,
  onClose,
  onQueueChange,
  onStaleTarget,
  onUploaded,
  projectId,
  queue,
  stageKey,
  workstreamKey,
}: {
  actor: ProjectDocumentOfficerOption & { organizationId: string };
  constraints?: UploadConstraints;
  definition: ProjectDocumentDefinitionOption;
  contextType: ProjectDocumentContext;
  targetType: ProjectDocumentTargetType;
  displayName?: string;
  documentId?: string;
  officerOptions: readonly ProjectDocumentOfficerOption[];
  onAbortPendingChange?: (pending: boolean) => void;
  onClose?: () => void;
  onQueueChange: (
    update:
      | ProjectDocumentQueueItem[]
      | ((current: ProjectDocumentQueueItem[]) => ProjectDocumentQueueItem[]),
  ) => void;
  onStaleTarget?: (target: ProjectDocumentQueueContext) => void;
  onUploaded: (document: UploadedProjectDocument) => void | Promise<void>;
  projectId: string;
  queue: ProjectDocumentQueueItem[];
  stageKey: ProjectDocumentQueueItem['stageKey'];
  workstreamKey: string;
}) {
  const [officerId, setOfficerId] = useState(actor.id);
  const [busy, setBusy] = useState(false);
  const [batchKey, setBatchKey] = useState<string | null>(null);
  const [selectionError, setSelectionError] = useState('');
  const [abortingIds, setAbortingIds] = useState(new Set<string>());
  const aborted = useRef(new Set<string>());
  const aborting = useRef(new Set<string>());
  const removed = useRef(new Set<string>());
  const controllers = useRef(new Map<string, AbortController>());
  const transferring = useRef(false);
  const submitting = useRef(false);
  const queueRef = useRef(queue);
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);
  const recoveredOfficerId = queue.find(
    ({ file, sessionId, status }) =>
      !file &&
      Boolean(sessionId) &&
      status !== 'ABORTED' &&
      status !== 'EXPIRED',
  )?.submittedOfficerId;
  const effectiveOfficerId =
    recoveredOfficerId ??
    (officerOptions.some(({ id }) => id === officerId) ? officerId : actor.id);
  const hasRecoveredBatch = Boolean(recoveredOfficerId);
  const displayedOfficerOptions =
    recoveredOfficerId &&
    !officerOptions.some(({ id }) => id === recoveredOfficerId)
      ? [
          ...officerOptions,
          { id: recoveredOfficerId, displayName: 'Cán bộ đã lưu' },
        ]
      : officerOptions;
  const batchContext = {
    projectId,
    stageKey,
    workstreamKey,
    definitionId: definition.id,
    contextType,
    targetType,
    actorUserId: actor.id,
    organizationId: actor.organizationId,
  };
  const persistedBatch =
    typeof window === 'undefined'
      ? null
      : readProjectDocumentPendingBatch(window.sessionStorage, batchContext);
  const persistedBatchKey = persistedBatch?.batchKey ?? null;
  const publish = useCallback(
    (changed: ProjectDocumentQueueItem[]) =>
      onQueueChange((current) => mergeProjectDocumentQueue(current, changed)),
    [onQueueChange],
  );
  const append = (files: Iterable<File>) => {
    if (
      !constraints ||
      hasRecoveredBatch ||
      batchKey ||
      persistedBatchKey ||
      (definition.customNameRequired && !displayName?.trim())
    )
      return;
    const selected = Array.from(files);
    const accepted = limitProjectDocumentFiles(
      selected,
      queueRef.current.length,
    );
    setSelectionError(
      selected.length > accepted.length
        ? `Mỗi lần nộp tối đa ${MAX_PROJECT_DOCUMENT_FILES_PER_SUBMISSION} tệp.`
        : '',
    );
    if (!accepted.length) return;
    publish(
      enqueueProjectDocumentFiles(
        accepted,
        {
          projectId,
          definition,
          stageKey,
          workstreamKey,
          submittedOfficerId: effectiveOfficerId,
          contextType,
          targetType,
          displayName,
          documentId,
        },
        constraints,
      ),
    );
  };
  const upload = useCallback(
    async (onlyId?: string) => {
      if (transferring.current) return;
      const selected = onlyId
        ? queueRef.current.filter(
            ({ idempotencyKey }) => idempotencyKey === onlyId,
          )
        : queueRef.current;
      transferring.current = true;
      setBusy(true);
      let staleTarget = false;
      try {
        await runProjectDocumentUploadQueue(
          selected,
          async (item, update) => {
            const controller = new AbortController();
            controllers.current.set(item.idempotencyKey, controller);
            try {
              await transferProjectDocumentQueueItem(
                item,
                { projectId },
                api,
                digestUploadBlob,
                update,
                controller.signal,
              );
            } catch (error) {
              if (isProjectDocumentTargetStale(error)) staleTarget = true;
              throw error;
            } finally {
              controllers.current.delete(item.idempotencyKey);
            }
          },
          2,
          publish,
          (item) => aborted.current.has(item.idempotencyKey),
          (item) => removed.current.has(item.idempotencyKey),
        );
        if (staleTarget)
          onStaleTarget?.({
            projectId,
            stageKey,
            workstreamKey,
            definitionId: definition.id,
            contextType,
            targetType,
          });
      } finally {
        transferring.current = false;
        setBusy(false);
      }
    },
    [
      contextType,
      definition.id,
      onStaleTarget,
      projectId,
      publish,
      stageKey,
      targetType,
      workstreamKey,
    ],
  );

  useEffect(() => {
    if (!busy && projectDocumentQueueShouldAutoStart(queue)) void upload();
  }, [busy, queue, upload]);

  const abort = async (item: ProjectDocumentQueueItem) => {
    if (aborting.current.has(item.idempotencyKey)) return false;
    aborting.current.add(item.idempotencyKey);
    if (aborting.current.size === 1) onAbortPendingChange?.(true);
    setAbortingIds(new Set(aborting.current));
    try {
      setProjectDocumentAborted(aborted.current, item.idempotencyKey, true);
      controllers.current.get(item.idempotencyKey)?.abort();
      if (item.sessionId)
        await api(`/uploads/${item.sessionId}/abort`, {
          method: 'POST',
          body: '{}',
        });
      publish([{ ...item, status: 'ABORTED', error: '' }]);
      return true;
    } catch {
      setProjectDocumentAborted(aborted.current, item.idempotencyKey, false);
      publish([
        {
          ...item,
          status:
            item.status === 'READY_TO_SUBMIT' ? 'READY_TO_SUBMIT' : 'FAILED',
          error: 'Không thể hủy tệp. Vui lòng thử lại.',
        },
      ]);
      return false;
    } finally {
      aborting.current.delete(item.idempotencyKey);
      setAbortingIds(new Set(aborting.current));
      if (!aborting.current.size) onAbortPendingChange?.(false);
    }
  };
  const liveItems = queue.filter(
    ({ status }) => status !== 'ABORTED' && status !== 'EXPIRED',
  );
  const readyItems = liveItems.filter(
    ({ status }) => status === 'READY_TO_SUBMIT',
  );
  const canSubmit =
    readyItems.length > 0 && readyItems.length === liveItems.length;
  const submit = async () => {
    if (!canSubmit || submitting.current) return;
    submitting.current = true;
    try {
      setBusy(true);
      const currentBatch = loadOrCreateProjectDocumentPendingBatch(
        sessionStorage,
        readyItems,
        { actorUserId: actor.id, organizationId: actor.organizationId },
      );
      const pendingItems = projectDocumentPendingBatchItems(currentBatch);
      setBatchKey(currentBatch.batchKey);
      publish(
        pendingItems.map((item) => ({
          ...item,
          status: 'SUBMITTING',
          error: '',
        })),
      );
      try {
        const submittedItems = await retryProjectDocumentPendingBatch(
          sessionStorage,
          currentBatch,
          api,
          onUploaded,
        );
        publish(submittedItems);
        onQueueChange((current) =>
          current.filter(({ status }) => status !== 'SUBMITTED'),
        );
        setBatchKey(null);
      } catch (error) {
        const staleTarget = isProjectDocumentTargetStale(error);
        const message =
          error instanceof Error
            ? error.message
            : 'Không thể nộp hồ sơ. Vui lòng thử lại.';
        publish(
          pendingItems.map((item) => ({
            ...item,
            status: 'READY_TO_SUBMIT',
            error: `${item.filename}: ${message}`,
          })),
        );
        if (staleTarget) {
          clearProjectDocumentPendingBatch(sessionStorage, currentBatch);
          setBatchKey(null);
          onStaleTarget?.({
            projectId,
            stageKey,
            workstreamKey,
            definitionId: definition.id,
            contextType,
            targetType,
          });
        }
      } finally {
        setBusy(false);
      }
    } finally {
      submitting.current = false;
    }
  };
  const remove = (item: ProjectDocumentQueueItem) => {
    removed.current.add(item.idempotencyKey);
    onQueueChange((current) =>
      removeProjectDocumentQueueItem(current, item.idempotencyKey),
    );
  };

  return (
    <section
      className="grid gap-3"
      data-upload-scope={projectDocumentQueueKey(
        projectId,
        stageKey,
        workstreamKey,
        definition.id,
        contextType,
        targetType,
      )}
    >
      <label className="grid gap-1 text-sm font-semibold">
        CÁN BỘ THỰC HIỆN NỘP
        <select
          aria-label="Cán bộ thực hiện nộp"
          disabled={hasRecoveredBatch}
          name="submittingOfficerId"
          onChange={(event) => setOfficerId(event.target.value)}
          value={effectiveOfficerId}
        >
          {displayedOfficerOptions.map((officer) => (
            <option key={officer.id} value={officer.id}>
              {officer.displayName}
            </option>
          ))}
        </select>
      </label>
      <label
        className="grid min-h-28 cursor-pointer place-items-center rounded-lg border-2 border-dashed border-blue-300 bg-blue-50 p-4 text-center text-sm text-blue-800"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          append(event.dataTransfer.files);
        }}
      >
        <span>Bấm để chọn tệp hoặc kéo-thả nhiều tệp vào đây.</span>
        {constraints && (
          <span className="text-xs">
            DUNG LƯỢNG TỐI ĐA MỖI TỆP: {uploadSizeLabel(constraints.maxBytes)} ·{' '}
            {constraints.allowedExtensions.join(', ')}
          </span>
        )}
        <input
          accept={constraints?.allowedExtensions.join(',')}
          className="sr-only"
          disabled={
            !constraints ||
            hasRecoveredBatch ||
            Boolean(batchKey || persistedBatchKey) ||
            queue.length >= MAX_PROJECT_DOCUMENT_FILES_PER_SUBMISSION ||
            (definition.customNameRequired && !displayName?.trim())
          }
          multiple
          name="files"
          onChange={(event) => {
            append(event.target.files ?? []);
            event.target.value = '';
          }}
          type="file"
        />
      </label>
      {selectionError && (
        <p className="text-sm text-red-700" role="alert">
          {selectionError}
        </p>
      )}
      {!!queue.length && (
        <ul aria-label="Hàng chờ tải lên" className="grid gap-2">
          {queue.map((item) => (
            <li
              className="grid gap-2 rounded border p-3 sm:grid-cols-[1fr_auto]"
              key={`${projectDocumentQueueKey(
                item.projectId,
                item.stageKey,
                item.workstreamKey,
                item.definitionId,
                item.contextType,
                item.targetType,
              )}:${item.idempotencyKey}`}
            >
              <div className="min-w-0">
                <strong className="block truncate">{item.filename}</strong>
                <span
                  aria-live="polite"
                  className="text-xs text-slate-600"
                  role="status"
                >
                  {uploadSizeLabel(item.size)} · {statuses[item.status]} ·{' '}
                  {Math.floor(item.progress)}% ·{' '}
                  {uploadSizeLabel(item.confirmedBytes)} /{' '}
                  {uploadSizeLabel(item.size)} · {item.definitionName}
                </span>
                <progress
                  aria-label={`Tiến độ ${item.filename}`}
                  aria-valuetext={`${statuses[item.status]}, ${Math.floor(item.progress)}%`}
                  className="block w-full"
                  max={100}
                  value={item.progress}
                />
                {item.error && (
                  <span className="text-xs text-red-700" role="alert">
                    {item.error}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {[
                  'INITIALIZING',
                  'UPLOADING',
                  'RETRYING',
                  'FINALIZING_TEMP',
                ].includes(item.status) && (
                  <button
                    disabled={abortingIds.has(item.idempotencyKey)}
                    onClick={() => void abort(item)}
                    type="button"
                  >
                    Hủy
                  </button>
                )}
                {item.status === 'FAILED' &&
                  item.valid &&
                  item.attempts < MAX_UPLOAD_ATTEMPTS && (
                    <button
                      disabled={busy}
                      onClick={() => void upload(item.idempotencyKey)}
                      type="button"
                    >
                      Thử lại
                    </button>
                  )}
                {![
                  'INITIALIZING',
                  'UPLOADING',
                  'RETRYING',
                  'FINALIZING_TEMP',
                  'READY_TO_SUBMIT',
                  'SUBMITTING',
                  'SUBMITTED',
                ].includes(item.status) && (
                  <button
                    disabled={busy || abortingIds.has(item.idempotencyKey)}
                    onClick={() => remove(item)}
                    type="button"
                  >
                    Bỏ tệp
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <button
        className="rounded bg-blue-700 px-4 py-2 font-bold text-white sm:justify-self-start"
        disabled={busy || !canSubmit}
        onClick={() => void submit()}
        type="button"
      >
        NỘP HỒ SƠ
      </button>
      {canSubmit && onClose && (
        <div
          className="flex flex-wrap gap-2"
          aria-label="Đóng bản tải tạm"
          role="group"
        >
          <button
            disabled={abortingIds.size > 0}
            onClick={onClose}
            type="button"
          >
            Giữ bản tải tạm và đóng
          </button>
          <button
            disabled={abortingIds.size > 0}
            onClick={() => {
              void Promise.all(readyItems.map(abort)).then((results) => {
                if (results.every(Boolean)) {
                  clearProjectDocumentPendingBatch(
                    sessionStorage,
                    batchContext,
                  );
                  setBatchKey(null);
                  onClose();
                }
              });
            }}
            type="button"
          >
            Hủy bản tải tạm
          </button>
        </div>
      )}
    </section>
  );
}
