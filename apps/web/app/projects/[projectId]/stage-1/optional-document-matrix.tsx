'use client';

import React, { FormEvent, useRef, useState } from 'react';
import { ApiError, api, apiUrl } from '../../../lib/api';
import {
  ProjectDocumentUploadQueue,
  projectDocumentQueueBlocksClose,
  type ProjectDocumentContext,
  type ProjectDocumentQueueItem,
  type ProjectDocumentOfficerOption,
  type ProjectDocumentQueueContext,
  type UploadedProjectDocument,
} from '../../../../features/projects/project-document-upload-queue';
import type { UploadConstraints } from '../documents/document-upload';
import type { DocumentCapabilities } from '../project-stage-one';

export type OptionalDocumentFile = {
  id: string;
  source?: 'STAGE_ONE' | 'LEGACY_REQUIRED_DOCUMENT';
  contextType: ProjectDocumentContext;
  displayName: string;
  currentFileAssetId: string | null;
  currentFileAsset?: { originalFilename: string; mimeType: string };
};
export type OptionalDocumentDefinition = {
  id: string;
  name: string;
  workstreamKey: string;
  description?: string;
  position: number;
  initialMatrix: boolean;
  active: boolean;
  required: boolean;
  referenceMilestoneId?: string | null;
  referenceMilestone?: KeyDossierMilestone | null;
  files: readonly OptionalDocumentFile[];
};
export type KeyDossierMilestone = {
  id: string;
  code: string;
  name: string;
  position: number;
  active: boolean;
};
export type OptionalDocumentDefinitionInput = {
  name: string;
  referenceMilestoneId?: string;
  description?: string;
  position: number;
  initialMatrix: boolean;
  active: boolean;
};
type Request = (path: string, init?: RequestInit) => Promise<unknown>;

type KeyDossierMilestoneInput = Omit<KeyDossierMilestone, 'id'>;

function saveKeyDossierMilestone(
  projectId: string,
  milestoneId: string | undefined,
  input: KeyDossierMilestoneInput,
  request: Request = api,
) {
  return request(
    `/projects/${projectId}/stage-1/key-dossier/milestones${milestoneId ? `/${milestoneId}` : ''}`,
    {
      method: milestoneId ? 'PATCH' : 'POST',
      body: JSON.stringify(input),
    },
  );
}

export const optionalDocumentDuplicateMessage = (error: unknown) => {
  if (!(error instanceof ApiError) || error.status !== 409)
    return 'Không thể lưu cấu hình hồ sơ. Vui lòng thử lại.';
  return error.message ===
    'Document definition Step cannot change after files or history exist'
    ? 'Không thể đổi mốc sau khi loại hồ sơ đã có tệp hoặc lịch sử.'
    : 'Tên mục Hồ sơ chủ chốt đã tồn tại. Hãy đổi tên trước khi lưu.';
};

export function saveOptionalDocumentDefinition(
  projectId: string,
  definitionId: string | undefined,
  input: OptionalDocumentDefinitionInput,
  request: Request = api,
) {
  return request(
    `/projects/${projectId}/stage-1/key-dossier/items${definitionId ? `/${definitionId}` : ''}`,
    {
      method: definitionId ? 'PATCH' : 'POST',
      body: JSON.stringify(input),
    },
  );
}

export function definitionInputFromForm(
  values: Pick<FormData, 'get'>,
  definition?: OptionalDocumentDefinition,
): OptionalDocumentDefinitionInput {
  return {
    name: String(values.get('name') ?? ''),
    referenceMilestoneId:
      String(values.get('referenceMilestoneId') ?? '') || undefined,
    description: String(values.get('description') ?? '') || undefined,
    position: Number(values.get('position') ?? 0),
    initialMatrix: definition?.initialMatrix ?? true,
    active:
      definition?.active === false ? true : values.get('active') === 'true',
  };
}

const fileStatus = (
  files: readonly OptionalDocumentFile[],
  queue: readonly ProjectDocumentQueueItem[],
) => {
  if (queue.some(({ status }) => status === 'FAILED' || status === 'ABORTED'))
    return 'Lỗi';
  if (queue.some(({ status }) => status === 'SUBMITTING'))
    return 'Đang nộp hồ sơ';
  if (
    queue.some(({ status }) =>
      [
        'QUEUED',
        'INITIALIZING',
        'UPLOADING',
        'RETRYING',
        'FINALIZING_TEMP',
      ].includes(status),
    )
  )
    return 'Đang tải';
  if (queue.some(({ status }) => status === 'READY_TO_SUBMIT'))
    return 'Đã tải tạm — Chờ nộp';
  return files.length ? 'Đã lưu' : 'Chưa có tệp';
};

const filename = (file: OptionalDocumentFile) =>
  file.currentFileAsset?.originalFilename ?? file.displayName;

const previewableProjectMimeTypes = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'text/plain',
]);

export const isPreviewableProjectFile = (mimeType?: string) =>
  Boolean(mimeType && previewableProjectMimeTypes.has(mimeType));

function AttachmentLink({
  canDownload,
  canDelete,
  canPreview,
  file,
  onDelete,
  overflow = false,
}: {
  canDownload: boolean;
  canDelete: boolean;
  canPreview: boolean;
  file: OptionalDocumentFile;
  onDelete?: () => void;
  overflow?: boolean;
}) {
  const className = overflow
    ? 'flex min-w-0 items-center justify-between gap-2 rounded px-2 py-1 text-sm text-blue-700 hover:bg-blue-50'
    : 'flex min-w-0 items-center justify-between gap-2 rounded-md bg-blue-50 px-2 py-1 text-blue-700';
  return (
    <span
      className={className}
      data-attachment-overflow-file={overflow || undefined}
      data-attachment-chip={overflow ? undefined : 'true'}
      id={overflow ? undefined : `document-${file.id}`}
    >
      <span className="min-w-0 truncate" title={filename(file)}>
        {filename(file)}
      </span>
      {((file.currentFileAssetId && (canPreview || canDownload)) ||
        (canDelete && onDelete)) && (
        <span className="flex shrink-0 gap-2 whitespace-nowrap text-xs font-semibold">
          {file.currentFileAssetId &&
            canPreview &&
            isPreviewableProjectFile(file.currentFileAsset?.mimeType) && (
              <a
                href={`${apiUrl}/files/${file.currentFileAssetId}/preview`}
                rel="noreferrer"
                target="_blank"
              >
                Xem
              </a>
            )}
          {file.currentFileAssetId && canDownload && (
            <a href={`${apiUrl}/files/${file.currentFileAssetId}/download`}>
              Tải xuống
            </a>
          )}
          {canDelete && onDelete && (
            <button
              className="border-0 p-0 text-red-700"
              onClick={onDelete}
              type="button"
            >
              Xóa
            </button>
          )}
        </span>
      )}
    </span>
  );
}

function AttachmentDrawer({
  canDownload,
  canDelete,
  canPreview,
  files,
  onDelete,
}: {
  canDownload: boolean;
  canDelete: boolean;
  canPreview: boolean;
  files: readonly OptionalDocumentFile[];
  onDelete?: (file: OptionalDocumentFile) => void;
}) {
  if (!files.length) return <span>-- Chưa có --</span>;
  return (
    <div className="grid min-w-0 gap-1">
      {files.slice(0, 2).map((file) => (
        <AttachmentLink
          canDownload={canDownload}
          canDelete={canDelete}
          canPreview={canPreview}
          file={file}
          key={file.id}
          onDelete={onDelete ? () => onDelete(file) : undefined}
        />
      ))}
      {files.length > 2 && (
        <details data-attachment-overflow={files.length - 2}>
          <summary className="cursor-pointer rounded-full border px-2 py-1 font-medium">
            + {files.length - 2} tệp
          </summary>
          <div className="mt-1 grid gap-2 rounded border bg-white p-2 shadow">
            {files.slice(2).map((file) => (
              <AttachmentLink
                canDownload={canDownload}
                canDelete={canDelete}
                canPreview={canPreview}
                file={file}
                key={file.id}
                onDelete={onDelete ? () => onDelete(file) : undefined}
                overflow
              />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function DefinitionForm({
  defaultPosition = 0,
  definition,
  milestones = [],
  submitLabel,
  onSubmit,
}: {
  defaultPosition?: number;
  definition?: OptionalDocumentDefinition;
  milestones?: readonly KeyDossierMilestone[];
  submitLabel: string;
  onSubmit: (input: OptionalDocumentDefinitionInput) => void;
}) {
  return (
    <form
      className="mt-2 grid gap-2 rounded border bg-white p-3"
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const values = new FormData(event.currentTarget);
        onSubmit(definitionInputFromForm(values, definition));
      }}
    >
      <label className="grid gap-1 text-sm">
        Tên loại hồ sơ
        <input
          autoComplete="off"
          defaultValue={definition?.name}
          maxLength={200}
          name="name"
          required
        />
      </label>
      <label className="grid gap-1 text-sm">
        Bước tham chiếu
        <select
          defaultValue={definition?.referenceMilestoneId ?? ''}
          name="referenceMilestoneId"
        >
          <option value="">Không phân loại</option>
          {milestones
            .filter(
              ({ active, id }) =>
                active || id === definition?.referenceMilestoneId,
            )
            .map((milestone) => (
              <option key={milestone.id} value={milestone.id}>
                {milestone.code} — {milestone.name}
              </option>
            ))}
        </select>
        <span className="text-xs text-slate-500">
          Mốc phân loại riêng của Hồ sơ chủ chốt
        </span>
      </label>
      <label className="grid gap-1 text-sm">
        Mô tả
        <textarea
          defaultValue={definition?.description}
          maxLength={1000}
          name="description"
        />
      </label>
      <label className="grid gap-1 text-sm">
        Thứ tự hiển thị
        <input
          defaultValue={definition?.position ?? defaultPosition}
          min={0}
          name="position"
          type="number"
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          defaultChecked={definition?.active ?? true}
          name="active"
          type="checkbox"
          value="true"
        />
        Đang sử dụng
      </label>
      <button
        className="rounded bg-blue-700 px-3 py-2 text-white"
        type="submit"
      >
        {submitLabel}
      </button>
    </form>
  );
}

function MilestoneForm({
  defaultPosition,
  milestone,
  onSubmit,
}: {
  defaultPosition: number;
  milestone?: KeyDossierMilestone;
  onSubmit: (input: KeyDossierMilestoneInput) => void;
}) {
  return (
    <form
      className="grid gap-2 rounded border bg-slate-50 p-3 md:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        const values = new FormData(event.currentTarget);
        onSubmit({
          code: String(values.get('code') ?? ''),
          name: String(values.get('name') ?? ''),
          position: Number(values.get('position') ?? 0),
          active: values.get('active') === 'true',
        });
      }}
    >
      <label className="grid gap-1 text-sm">
        Mã mốc
        <input
          defaultValue={milestone?.code}
          maxLength={50}
          name="code"
          required
        />
      </label>
      <label className="grid gap-1 text-sm">
        Tên mốc
        <input
          defaultValue={milestone?.name}
          maxLength={200}
          name="name"
          required
        />
      </label>
      <label className="grid gap-1 text-sm">
        Thứ tự
        <input
          defaultValue={milestone?.position ?? defaultPosition}
          min={0}
          name="position"
          type="number"
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          defaultChecked={milestone?.active ?? true}
          name="active"
          type="checkbox"
          value="true"
        />
        Đang sử dụng
      </label>
      <button
        className="rounded bg-blue-700 px-3 py-2 text-white"
        type="submit"
      >
        {milestone ? 'Lưu mốc' : 'Thêm mốc'}
      </button>
    </form>
  );
}

export function OptionalDocumentMatrix({
  actor,
  capabilities,
  constraints,
  definitions,
  milestones = [],
  officerOptions,
  onChanged,
  onDelete,
  onDeleteItem,
  onQueueChange,
  onStaleTarget,
  onUploadingIdChange = () => undefined,
  onUploaded,
  projectId,
  queueByWorkstream,
  highlightedDocumentId,
  uploadingId,
}: {
  actor: {
    userId: string;
    displayName: string;
    permissions: readonly string[];
    organization: { id: string };
  };
  capabilities: Pick<
    DocumentCapabilities,
    | 'canPreviewFiles'
    | 'canDownloadFiles'
    | 'canManageKeyDossier'
    | 'canDeleteKeyDossierItem'
    | 'canDeleteAttachment'
    | 'canUploadKeyDossierAttachments'
  >;
  constraints?: UploadConstraints;
  definitions: readonly OptionalDocumentDefinition[];
  milestones?: readonly KeyDossierMilestone[];
  officerOptions: readonly ProjectDocumentOfficerOption[];
  onChanged: () => void | Promise<void>;
  onDelete?: (file: OptionalDocumentFile) => void;
  onDeleteItem?: (
    definition: OptionalDocumentDefinition,
    reason: string,
  ) => void | Promise<void>;
  onUploadingIdChange?: (definitionId: string | undefined) => void;
  onQueueChange: (
    workstreamKey: string,
    definitionId: string,
    update:
      | ProjectDocumentQueueItem[]
      | ((current: ProjectDocumentQueueItem[]) => ProjectDocumentQueueItem[]),
  ) => void;
  onStaleTarget?: (target: ProjectDocumentQueueContext) => void;
  onUploaded: (document: UploadedProjectDocument) => void | Promise<void>;
  projectId: string;
  queueByWorkstream: Readonly<Record<string, ProjectDocumentQueueItem[]>>;
  highlightedDocumentId?: string;
  uploadingId?: string;
}) {
  const [abortPending, setAbortPending] = useState(false);
  const [error, setError] = useState('');
  const [deleteItem, setDeleteItem] = useState<OptionalDocumentDefinition>();
  const [deleteReason, setDeleteReason] = useState('');
  const [deletePending, setDeletePending] = useState(false);
  const [deleteMilestone, setDeleteMilestone] = useState<KeyDossierMilestone>();
  const [milestoneDeleteReason, setMilestoneDeleteReason] = useState('');
  const [replacementMilestoneId, setReplacementMilestoneId] = useState('');
  const managementDialog = useRef<HTMLDialogElement>(null);
  const active = definitions
    .filter(({ active, initialMatrix }) => active && initialMatrix)
    .map((definition) => ({
      ...definition,
      files: definition.files.filter(
        ({ contextType }) => contextType === 'STAGE_MATRIX_DOCUMENT',
      ),
    }))
    .sort((left, right) => left.position - right.position);
  const managedDefinitions = definitions
    .filter(({ initialMatrix }) => initialMatrix)
    .sort(
      (left, right) =>
        Number(right.active) - Number(left.active) ||
        left.position - right.position,
    );
  const uploading = active.find(({ id }) => id === uploadingId);
  const uploadingQueue = uploading
    ? (queueByWorkstream[`${uploading.workstreamKey}:${uploading.id}`] ?? [])
    : [];
  const blocksClose = projectDocumentQueueBlocksClose(
    uploadingQueue,
    abortPending,
  );
  const uploadBlocked =
    abortPending ||
    Object.values(queueByWorkstream).some((queue) =>
      projectDocumentQueueBlocksClose(
        queue.filter(
          ({ contextType }) => contextType === 'STAGE_MATRIX_DOCUMENT',
        ),
      ),
    );
  const canManage = capabilities.canManageKeyDossier;
  const canUpload = capabilities.canUploadKeyDossierAttachments;
  const canPreview = capabilities.canPreviewFiles;
  const canDownload = capabilities.canDownloadFiles;
  const canDelete = capabilities.canDeleteAttachment;
  const canDeleteItem = capabilities.canDeleteKeyDossierItem;
  const uploadOfficerOptions = actor.permissions.includes(
    'project.manage_members',
  )
    ? officerOptions
    : [{ id: actor.userId, displayName: actor.displayName }];
  const milestoneLabel = (definition: OptionalDocumentDefinition) => {
    const milestone =
      definition.referenceMilestone ??
      milestones.find(({ id }) => id === definition.referenceMilestoneId);
    return milestone
      ? `${milestone.code} — ${milestone.name}`
      : 'Không phân loại';
  };
  const mutate = async (
    definitionId: string | undefined,
    input: OptionalDocumentDefinitionInput,
  ) => {
    setError('');
    try {
      await saveOptionalDocumentDefinition(projectId, definitionId, input);
      await onChanged();
    } catch (nextError) {
      setError(optionalDocumentDuplicateMessage(nextError));
    }
  };
  const mutateMilestone = async (
    milestoneId: string | undefined,
    input: KeyDossierMilestoneInput,
  ) => {
    setError('');
    try {
      await saveKeyDossierMilestone(projectId, milestoneId, input);
      await onChanged();
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Không thể lưu mốc Hồ sơ chủ chốt.',
      );
    }
  };
  const action = (definition: OptionalDocumentDefinition) => {
    const ownQueue =
      queueByWorkstream[`${definition.workstreamKey}:${definition.id}`] ?? [];
    return (
      <div className="flex flex-wrap gap-2">
        {canUpload && (
          <button
            aria-label={`${definition.files.length ? 'Thêm tệp' : 'Tải lên'} ${definition.name}`}
            className="rounded bg-blue-700 px-3 py-2 font-semibold text-white"
            data-row-upload-action="true"
            disabled={
              uploadBlocked &&
              (abortPending || !projectDocumentQueueBlocksClose(ownQueue))
            }
            onClick={() => onUploadingIdChange(definition.id)}
            type="button"
          >
            {definition.files.length ? 'THÊM TỆP' : 'TẢI LÊN'}
          </button>
        )}
        {canDeleteItem && onDeleteItem && (
          <button
            className="rounded border border-red-300 px-3 py-2 font-semibold text-red-700"
            onClick={() => {
              setDeleteReason('');
              setDeleteItem(definition);
            }}
            type="button"
          >
            Xóa mục
          </button>
        )}
      </div>
    );
  };
  return (
    <section
      className="grid gap-3 rounded-lg border bg-white p-4 shadow-sm"
      aria-labelledby="optional-document-matrix-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-bold" id="optional-document-matrix-title">
            HỒ SƠ CHỦ CHỐT CỦA DỰ ÁN
          </h2>
          <p className="text-sm text-slate-600">
            Danh mục hồ sơ cần lưu theo dự án.
          </p>
        </div>
        {canManage && (
          <>
            <button
              className="rounded border border-blue-300 px-3 py-2 font-semibold text-blue-700"
              onClick={() => managementDialog.current?.showModal()}
              type="button"
            >
              QUẢN LÝ LOẠI HỒ SƠ
            </button>
            <dialog
              aria-labelledby="optional-document-management-title"
              className="max-h-[90vh] w-[min(56rem,calc(100%-2rem))] overflow-y-auto rounded-lg border p-4 shadow-xl backdrop:bg-black/30"
              data-definition-management-dialog="true"
              ref={managementDialog}
            >
              <div className="flex items-center justify-between gap-3">
                <h3
                  className="font-bold"
                  id="optional-document-management-title"
                >
                  CẤU HÌNH LOẠI HỒ SƠ
                </h3>
                <button
                  onClick={() => managementDialog.current?.close()}
                  type="button"
                >
                  Đóng
                </button>
              </div>
              {error && (
                <p className="text-sm text-red-700" role="alert">
                  {error}
                </p>
              )}
              <section
                className="mt-3 grid gap-3"
                aria-label="Mốc Hồ sơ chủ chốt"
              >
                <div>
                  <h4 className="font-semibold">BƯỚC THAM CHIẾU</h4>
                  <p className="text-xs text-slate-500">
                    Mốc phân loại riêng của Hồ sơ chủ chốt; không liên kết Quy
                    trình 5 bước.
                  </p>
                </div>
                <MilestoneForm
                  defaultPosition={milestones.length}
                  onSubmit={(input) => void mutateMilestone(undefined, input)}
                />
                {milestones.map((milestone) => (
                  <article className="grid gap-2" key={milestone.id}>
                    <MilestoneForm
                      defaultPosition={milestone.position}
                      milestone={milestone}
                      onSubmit={(input) =>
                        void mutateMilestone(milestone.id, input)
                      }
                    />
                    <button
                      className="justify-self-start border-0 p-0 text-sm font-semibold text-red-700"
                      onClick={() => {
                        managementDialog.current?.close();
                        setDeleteMilestone(milestone);
                        setMilestoneDeleteReason('');
                        setReplacementMilestoneId('');
                      }}
                      type="button"
                    >
                      Xóa mốc
                    </button>
                  </article>
                ))}
              </section>
              <hr className="my-4" />
              <h4 className="font-semibold">MỤC HỒ SƠ</h4>
              <DefinitionForm
                defaultPosition={
                  Math.max(-1, ...definitions.map(({ position }) => position)) +
                  1
                }
                onSubmit={(input) => void mutate(undefined, input)}
                milestones={milestones}
                submitLabel="Thêm"
              />
              <div className="mt-4 grid gap-3">
                {managedDefinitions.map((definition) => (
                  <article
                    className="rounded border p-3"
                    data-definition-management-item="true"
                    key={definition.id}
                  >
                    <DefinitionForm
                      definition={definition}
                      milestones={milestones}
                      onSubmit={(input) => void mutate(definition.id, input)}
                      submitLabel={
                        definition.active ? 'Lưu thay đổi' : 'Khôi phục'
                      }
                    />
                  </article>
                ))}
              </div>
            </dialog>
          </>
        )}
      </div>
      <table
        className="block w-full text-left text-[13px] leading-[18px] md:table md:table-fixed"
        data-optional-document-matrix="true"
      >
        <thead className="hidden md:table-header-group">
          <tr>
            <th scope="col">TÊN HỒ SƠ</th>
            <th scope="col">BƯỚC THAM CHIẾU</th>
            <th scope="col">TRẠNG THÁI</th>
            <th scope="col">TỆP ĐÍNH KÈM</th>
            <th scope="col">THAO TÁC</th>
          </tr>
        </thead>
        <tbody className="grid gap-3 md:table-row-group">
          {active.map((definition) => {
            const queue =
              queueByWorkstream[
                `${definition.workstreamKey}:${definition.id}`
              ] ?? [];
            return (
              <tr
                className={`grid grid-cols-2 gap-2 rounded border p-3 align-top md:table-row md:rounded-none md:border-x-0 md:border-b-0 md:p-0 ${
                  highlightedDocumentId === definition.id ||
                  definition.files.some(
                    ({ id }) => id === highlightedDocumentId,
                  )
                    ? 'bg-blue-50 ring-2 ring-blue-300'
                    : ''
                }`}
                data-highlighted={
                  highlightedDocumentId === definition.id ||
                  definition.files.some(
                    ({ id }) => id === highlightedDocumentId,
                  )
                    ? 'true'
                    : undefined
                }
                data-optional-document-row="true"
                id={`document-${definition.id}`}
                key={definition.id}
              >
                <td className="col-span-2 p-0 font-semibold md:table-cell md:px-3 md:py-2 md:pr-2">
                  {definition.name}
                </td>
                <td className="p-0 md:table-cell md:px-3 md:py-2 md:pr-2">
                  <span className="font-semibold md:hidden">Bước: </span>
                  {milestoneLabel(definition)}
                </td>
                <td className="p-0 md:table-cell md:px-3 md:py-2 md:pr-2">
                  <span className="font-semibold md:hidden">Trạng thái: </span>
                  {fileStatus(definition.files, queue)}
                </td>
                <td className="col-span-2 p-0 md:table-cell md:px-3 md:py-2 md:pr-2">
                  <span className="mb-1 block font-semibold md:hidden">
                    Tệp đính kèm
                  </span>
                  <AttachmentDrawer
                    canDownload={canDownload}
                    canDelete={canDelete}
                    canPreview={canPreview}
                    files={definition.files}
                    onDelete={onDelete}
                  />
                </td>
                <td className="col-span-2 p-0 md:table-cell md:px-3 md:py-2">
                  {action(definition)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {canUpload && uploading && (
        <aside
          className="grid gap-3 rounded border border-blue-200 bg-blue-50 p-3"
          aria-label={`Tải lên ${uploading.name}`}
        >
          <div className="flex items-center justify-between gap-2">
            <strong>TẢI LÊN · {uploading.name}</strong>
            {!blocksClose && (
              <button
                onClick={() => onUploadingIdChange(undefined)}
                type="button"
              >
                Đóng
              </button>
            )}
          </div>
          <ProjectDocumentUploadQueue
            actor={{
              id: actor.userId,
              displayName: actor.displayName,
              organizationId: actor.organization.id,
            }}
            constraints={constraints}
            contextType="STAGE_MATRIX_DOCUMENT"
            definition={uploading}
            officerOptions={uploadOfficerOptions}
            onAbortPendingChange={setAbortPending}
            onClose={() => onUploadingIdChange(undefined)}
            onQueueChange={(queue) =>
              onQueueChange(uploading.workstreamKey, uploading.id, queue)
            }
            onStaleTarget={onStaleTarget}
            onUploaded={onUploaded}
            projectId={projectId}
            queue={uploadingQueue}
            stageKey="STAGE_1"
            targetType="STAGE_DOCUMENT"
            workstreamKey={uploading.workstreamKey}
          />
        </aside>
      )}
      {deleteItem && (
        <dialog
          aria-labelledby="delete-key-dossier-item-title"
          className="fixed inset-0 z-50 m-auto grid w-[min(32rem,calc(100%-2rem))] gap-3 rounded-lg border bg-white p-4 shadow-xl"
          open
        >
          <h3 className="font-bold" id="delete-key-dossier-item-title">
            Xóa mục Hồ sơ chủ chốt
          </h3>
          <p>
            {deleteItem.name} · {deleteItem.files.length} tệp
          </p>
          <p className="text-sm text-slate-700">
            Mục này và các tệp thuộc mục sẽ không còn hiển thị trong Hồ sơ chủ
            chốt. Không ảnh hưởng đến Quy trình 5 bước.
          </p>
          {error && <p role="alert">{error}</p>}
          <label className="grid gap-1 text-sm font-semibold">
            Lý do xóa
            <textarea
              disabled={deletePending}
              maxLength={1000}
              onChange={(event) => setDeleteReason(event.target.value)}
              value={deleteReason}
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              disabled={deletePending}
              onClick={() => setDeleteItem(undefined)}
              type="button"
            >
              Hủy
            </button>
            <button
              className="rounded bg-red-700 px-3 py-2 font-semibold text-white disabled:opacity-50"
              disabled={deletePending || !deleteReason.trim()}
              onClick={() => {
                setDeletePending(true);
                setError('');
                void Promise.resolve(
                  onDeleteItem?.(deleteItem, deleteReason.trim()),
                )
                  .then(() => {
                    onQueueChange(deleteItem.workstreamKey, deleteItem.id, []);
                    if (uploadingId === deleteItem.id)
                      onUploadingIdChange(undefined);
                    setDeleteItem(undefined);
                  })
                  .catch((nextError) =>
                    setError(
                      nextError instanceof Error
                        ? nextError.message
                        : 'Không thể xóa mục hồ sơ.',
                    ),
                  )
                  .finally(() => setDeletePending(false));
              }}
              type="button"
            >
              {deletePending ? 'Đang xóa...' : 'Xóa mục'}
            </button>
          </div>
        </dialog>
      )}
      {deleteMilestone && (
        <dialog
          aria-labelledby="delete-key-dossier-milestone-title"
          className="fixed inset-0 z-50 m-auto grid w-[min(32rem,calc(100%-2rem))] gap-3 rounded-lg border bg-white p-4 shadow-xl"
          open
        >
          <h3 className="font-bold" id="delete-key-dossier-milestone-title">
            Xóa mốc {deleteMilestone.code} — {deleteMilestone.name}
          </h3>
          <p className="text-sm">
            {
              definitions.filter(
                ({ referenceMilestoneId }) =>
                  referenceMilestoneId === deleteMilestone.id,
              ).length
            }{' '}
            mục hồ sơ đang dùng mốc này.
          </p>
          {error && <p role="alert">{error}</p>}
          <label className="grid gap-1 text-sm">
            Chuyển các mục sang
            <select
              onChange={(event) =>
                setReplacementMilestoneId(event.target.value)
              }
              value={replacementMilestoneId}
            >
              <option value="">Không phân loại</option>
              {milestones
                .filter(({ active, id }) => active && id !== deleteMilestone.id)
                .map((milestone) => (
                  <option key={milestone.id} value={milestone.id}>
                    {milestone.code} — {milestone.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            Lý do xóa
            <textarea
              maxLength={1000}
              onChange={(event) => setMilestoneDeleteReason(event.target.value)}
              value={milestoneDeleteReason}
            />
          </label>
          <div className="flex justify-end gap-2">
            <button onClick={() => setDeleteMilestone(undefined)} type="button">
              Hủy
            </button>
            <button
              className="rounded bg-red-700 px-3 py-2 font-semibold text-white disabled:opacity-50"
              disabled={!milestoneDeleteReason.trim()}
              onClick={() => {
                setError('');
                void api(
                  `/projects/${projectId}/stage-1/key-dossier/milestones/${deleteMilestone.id}`,
                  {
                    method: 'DELETE',
                    body: JSON.stringify({
                      reason: milestoneDeleteReason.trim(),
                      replacementMilestoneId: replacementMilestoneId || null,
                    }),
                  },
                )
                  .then(onChanged)
                  .then(() => setDeleteMilestone(undefined))
                  .catch((nextError) =>
                    setError(
                      nextError instanceof Error
                        ? nextError.message
                        : 'Không thể xóa mốc hồ sơ.',
                    ),
                  );
              }}
              type="button"
            >
              Xóa mốc
            </button>
          </div>
        </dialog>
      )}
    </section>
  );
}
