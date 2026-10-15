'use client';

import React, {
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ApiError, api, apiUrl, type Actor } from '../../lib/api';
import { createCommandKey } from '../../lib/create-command-key';
import { PROJECT_STAGE_ACCENTS, ProjectStageHeader } from '../../project-pms';
import {
  mergeProjectDocumentQueue,
  projectDocumentQueueKey,
  ProjectDocumentUploadQueue,
  recoverProjectDocumentQueues,
  type ProjectDocumentQueueItem,
  type UploadedProjectDocument,
} from '../../../features/projects/project-document-upload-queue';
import type { UploadConstraints } from './documents/document-upload';
import { formatVietnameseMoney } from './stage-1/money';
import { isPreviewableProjectFile } from './stage-1/optional-document-matrix';

export type StageTwoStep = 1 | 2 | 3;
const stageTwoTabs = [
  { step: 1, label: 'KẾ HOẠCH & KHẢO SÁT' },
  { step: 2, label: 'THIẾT KẾ, SẢN PHẨM & BOQ' },
  { step: 3, label: 'PHÊ DUYỆT' },
] as const;
export type StageTwoPlanRow = {
  id?: string;
  code: string;
  description: string;
  departmentId: string;
  department?: { id: string; code: string; name: string };
  startDate: string | null;
  finishDate: string | null;
  allocatedBudget?: string | null;
  version?: number;
};
export type StageTwoPlanDraft = Omit<
  StageTwoPlanRow,
  'startDate' | 'finishDate'
> & {
  key: string;
  startDate: string;
  finishDate: string;
};
export type StageTwoDocument = {
  id: string;
  createdAt: string;
  requiredDocumentId?: string;
  definitionId?: string;
  stageKey: string;
  workstreamKey: string;
  documentType: string;
  displayName: string;
  status: string;
  currentVersion: number;
  currentFileAssetId: string | null;
  submittedOfficer?: { id: string; displayName: string; email?: string };
  currentFileAsset?: {
    id: string;
    originalFilename: string;
    mimeType: string;
    sizeBytes: string;
  };
};
export type StageTwoDocumentDefinition = {
  id: string;
  name: string;
  workstreamKey: 'PLAN';
  description?: string;
  position: number;
  initialMatrix: boolean;
  active: boolean;
  required: false;
  files: readonly StageTwoDocument[];
};
export type StageTwoDocumentDefinitionInput = {
  name: string;
  workstreamKey: 'PLAN';
  description?: string;
  position: number;
  initialMatrix: boolean;
  active: boolean;
};
export type StageTwoImportPreview = {
  jobId: string;
  status: 'VALIDATED';
  summary: { totalRows: number; validRows: number; invalidRows: number };
  rows: {
    rowNumber: number;
    status: 'VALID' | 'INVALID';
    data: {
      code: string;
      description: string;
      departmentId: string;
      startDate: string;
      finishDate: string;
      allocatedBudget?: string;
    };
    errors: string[];
  }[];
};
export type StageTwoData = {
  project: {
    id: string;
    code: string;
    name: string;
    customer?: { id: string; displayName: string } | null;
    location?: string | null;
    projectType?: string | null;
    status: string;
    phase?: string | null;
  };
  selectedStep: 1;
  tabs: readonly { step: StageTwoStep; label: string }[];
  state: { status: string; stepOneStatus: string };
  plan: readonly StageTwoPlanRow[];
  documentDefinitions: readonly StageTwoDocumentDefinition[];
  documents: readonly StageTwoDocument[];
  options: {
    projects: readonly { id: string; code: string; name: string }[];
    members: readonly {
      id: string;
      displayName: string;
      email: string;
      role?: string;
    }[];
    departments: readonly { id: string; code: string; name: string }[];
  };
  uploadConstraints: UploadConstraints;
  capabilities: {
    canSwitchProject: boolean;
    canManageProjectAccess: boolean;
    canDeleteProject?: boolean;
    canPreviewFiles: boolean;
    canDownloadFiles: boolean;
  };
  permittedCommands: {
    viewPlan: boolean;
    addPlanRows: boolean;
    editPlanRows: boolean;
    deletePlanRows: boolean;
    downloadTemplate: boolean;
    previewImport: boolean;
    confirmImport: boolean;
    completeStep: boolean;
    manageDocumentDefinitions: boolean;
    uploadDocuments: boolean;
    viewAllocatedBudget: boolean;
    editAllocatedBudget: boolean;
  };
};

export type EstimateSummary = {
  id: string;
  number: string;
  title: string;
  currentVersion: number;
  status: string;
  updatedAt: string;
};

export type ProjectRiskSummary = {
  id: string;
  code: string;
  title: string;
  stage: string;
  priorityScore: number;
  status: string;
  emv?: string | null;
  allocations?: readonly { approvedAmount: string }[];
};

type Request = (path: string, init?: RequestInit) => Promise<unknown>;
type Notice = { kind: 'success' | 'error'; text: string } | null;

const estimateStatuses: Record<string, string> = {
  DRAFT: 'Nháp',
  PENDING: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  RETURNED: 'Yêu cầu sửa',
  REJECTED: 'Từ chối',
};
const estimateStatusLabel = (status: string) =>
  estimateStatuses[status] ?? status;

const riskStages: Record<string, string> = {
  STAGE_ONE: 'GĐ1',
  STAGE_TWO: 'GĐ2',
  STAGE_THREE: 'GĐ3',
  STAGE_FOUR: 'GĐ4',
  STAGE_FIVE: 'GĐ5',
};

export function stageTwoStepFromSearchParam(
  value: string | null,
): StageTwoStep {
  return value === '2' ? 2 : value === '3' ? 3 : 1;
}

export const stageTwoStepUrl = (projectId: string, step: StageTwoStep) =>
  `/projects/${projectId}/stage-2?step=${step}`;

export const loadStageTwo = (projectId: string, request: Request = api) =>
  request(`/projects/${projectId}/stage-2?step=1`) as Promise<StageTwoData>;

export const saveStageTwoPlan = (
  projectId: string,
  payload: StageTwoPlanPayload,
  request: Request = api,
) =>
  request(`/projects/${projectId}/stage-2/plan`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  }) as Promise<StageTwoData>;

export const completeStageTwoStepOne = (
  projectId: string,
  request: Request = api,
) =>
  request(`/projects/${projectId}/stage-2/steps/1/complete`, {
    method: 'POST',
    body: '{}',
  }) as Promise<{
    completed: true;
    step: 1;
    nextStep: 2;
    stageCompleted: false;
  }>;

export function saveStageTwoDocumentDefinition(
  projectId: string,
  definitionId: string | undefined,
  input: StageTwoDocumentDefinitionInput,
  request: Request = api,
) {
  return request(
    `/projects/${projectId}/stage-2/document-definitions${definitionId ? `/${definitionId}` : ''}`,
    {
      method: definitionId ? 'PATCH' : 'POST',
      body: JSON.stringify(input),
    },
  );
}

const uploadedFileId = (document: UploadedProjectDocument) => {
  const direct = document.currentFileAssetId;
  if (typeof direct === 'string' && direct) return direct;
  const nested = document.currentFileAsset;
  if (
    nested &&
    typeof nested === 'object' &&
    'id' in nested &&
    typeof nested.id === 'string'
  )
    return nested.id;
  throw new Error('Không thể xác định tệp Excel vừa tải.');
};

const previewStageTwoWorkbook = (
  projectId: string,
  fileAssetId: string,
  request: Request = api,
) =>
  request(`/projects/${projectId}/stage-2/plan-import/preview`, {
    method: 'POST',
    body: JSON.stringify({ fileAssetId }),
  }) as Promise<StageTwoImportPreview>;

export const previewStageTwoUploadedWorkbook = (
  projectId: string,
  document: UploadedProjectDocument,
  request: Request = api,
) => previewStageTwoWorkbook(projectId, uploadedFileId(document), request);

export const confirmStageTwoPlanImport = (
  projectId: string,
  jobId: string,
  request: Request = api,
) =>
  request(`/projects/${projectId}/stage-2/plan-import/${jobId}/confirm`, {
    method: 'POST',
    body: '{}',
  }) as Promise<{
    jobId: string;
    status: 'COMPLETED';
    importedRows: number;
    skippedRows: number;
  }>;

type FetchRequest = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export async function fetchStageTwoPlanTemplate(
  projectId: string,
  request: FetchRequest = fetch,
) {
  const response = await request(
    `${apiUrl}/projects/${projectId}/stage-2/plan-template`,
    { credentials: 'include', cache: 'no-store' },
  );
  const contentType = response.headers.get('content-type') ?? '';
  if (
    !response.ok ||
    !contentType.includes(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
  )
    throw new Error('Không thể tải template kế hoạch.');
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(
    response.headers.get('content-disposition') ?? '',
  )?.[1];
  let filename = 'ke-hoach-giai-doan-2.xlsx';
  if (encoded)
    try {
      filename = decodeURIComponent(encoded);
    } catch {
      // The safe local filename remains authoritative for malformed headers.
    }
  return { blob: await response.blob(), filename };
}

async function downloadStageTwoPlanTemplate(projectId: string) {
  const { blob, filename } = await fetchStageTwoPlanTemplate(projectId);
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.download = filename;
  anchor.href = href;
  anchor.click();
  URL.revokeObjectURL(href);
}

export function createStageTwoPlanDraft(
  row: StageTwoPlanRow,
  key?: () => string,
): StageTwoPlanDraft {
  return {
    ...row,
    key: key ? key() : (row.id ?? createCommandKey()),
    startDate: row.startDate ?? '',
    finishDate: row.finishDate ?? '',
    ...(Object.prototype.hasOwnProperty.call(row, 'allocatedBudget') && {
      allocatedBudget: row.allocatedBudget ?? '',
    }),
  };
}

export function updateStageTwoPlanDraft<
  Key extends keyof Omit<StageTwoPlanDraft, 'key'>,
>(row: StageTwoPlanDraft, field: Key, value: StageTwoPlanDraft[Key]) {
  return { ...row, [field]: value };
}

type StageTwoPlanRemoval = { id: string; version: number };

export function removeStageTwoPlanDraft(
  rows: StageTwoPlanDraft[],
  key: string,
  removedRows: StageTwoPlanRemoval[],
  confirmRemoval: () => boolean = () =>
    confirm('Xóa công việc này khỏi kế hoạch tiến độ?'),
) {
  const row = rows.find((item) => item.key === key);
  if (!row || (row.id && !confirmRemoval())) return { rows, removedRows };
  return {
    rows: rows.filter((item) => item.key !== key),
    removedRows:
      row.id && row.version
        ? [...removedRows, { id: row.id, version: row.version }]
        : removedRows,
  };
}

const calendarDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
  );
};

export function validateStageTwoPlan(
  rows: readonly StageTwoPlanDraft[],
  departments: readonly { id: string }[],
  validateBudget: boolean,
) {
  const errors: Record<string, string[]> = {};
  const add = (row: StageTwoPlanDraft, message: string) => {
    (errors[row.key] ??= []).push(message);
  };
  const activeDepartments = new Set(departments.map(({ id }) => id));
  const codes = new Map<string, StageTwoPlanDraft[]>();
  for (const row of rows) {
    const code = row.code.trim().toUpperCase();
    if (!code || code.length > 100 || !/^[\p{L}\p{N}._/-]+$/u.test(code))
      add(row, 'Mã công việc không hợp lệ.');
    else codes.set(code, [...(codes.get(code) ?? []), row]);
    if (!row.description.trim() || row.description.trim().length > 300)
      add(row, 'Nội dung công việc không hợp lệ.');
    if (!activeDepartments.has(row.departmentId))
      add(row, 'Đơn vị chủ trì không còn hoạt động.');
    if (!calendarDate(row.startDate)) add(row, 'Ngày bắt đầu không hợp lệ.');
    if (!calendarDate(row.finishDate))
      add(row, 'Ngày hoàn thành không hợp lệ.');
    if (
      calendarDate(row.startDate) &&
      calendarDate(row.finishDate) &&
      row.startDate > row.finishDate
    )
      add(row, 'Ngày hoàn thành phải từ ngày bắt đầu trở đi.');
    if (
      validateBudget &&
      row.allocatedBudget?.trim() &&
      !/^\d{1,18}(?:\.\d{1,2})?$/.test(row.allocatedBudget.trim())
    )
      add(row, 'Ngân sách phải là số không âm, tối đa 2 chữ số thập phân.');
  }
  for (const duplicates of codes.values())
    if (duplicates.length > 1)
      duplicates.forEach((row) => add(row, 'Mã công việc bị trùng.'));
  return errors;
}

export type StageTwoPlanPayload = {
  rows: {
    id?: string;
    code: string;
    description: string;
    departmentId: string;
    startDate: string;
    finishDate: string;
    allocatedBudget?: string;
    version?: number;
  }[];
  removedRows: StageTwoPlanRemoval[];
};

export function stageTwoPlanPayload(
  rows: readonly StageTwoPlanDraft[],
  removedRows: StageTwoPlanRemoval[],
  dirtyKeys: ReadonlySet<string>,
  editBudget: boolean,
): StageTwoPlanPayload {
  return {
    rows: rows
      .filter(({ key }) => dirtyKeys.has(key))
      .map((row) => ({
        ...(row.id ? { id: row.id, version: row.version } : {}),
        code: row.code.trim().toUpperCase(),
        description: row.description.trim(),
        departmentId: row.departmentId,
        startDate: row.startDate,
        finishDate: row.finishDate,
        ...(editBudget &&
        Object.prototype.hasOwnProperty.call(row, 'allocatedBudget')
          ? { allocatedBudget: row.allocatedBudget?.trim() ?? '' }
          : {}),
      })),
    removedRows,
  };
}

export const stageTwoPlanRevision = (current: number, resetPlan: boolean) =>
  resetPlan ? current + 1 : current;

export const confirmStageTwoPlanReset = (
  changed: boolean,
  ask: () => boolean = () =>
    confirm('Bỏ các thay đổi kế hoạch chưa lưu để tiếp tục?'),
) => !changed || ask();

export function stageTwoPlanTabTransition(
  changed: boolean,
  preventDefault: () => void,
  discard: () => void,
  ask?: () => boolean,
) {
  if (!confirmStageTwoPlanReset(changed, ask)) {
    preventDefault();
    return false;
  }
  if (changed) discard();
  return true;
}

export async function completeStageTwoStepOneWithDraftGuard(
  projectId: string,
  changed: boolean,
  reload: (resetPlan?: boolean) => Promise<void>,
  discard: () => void,
  request: Request = api,
  ask?: () => boolean,
) {
  if (!confirmStageTwoPlanReset(changed, ask)) return false;
  await completeStageTwoStepOne(projectId, request);
  await reload(true);
  discard();
  return true;
}

const safeError = (error: unknown) => {
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403)
      return 'Bạn không có quyền thực hiện thao tác này.';
    if (error.status === 404) return 'Không tìm thấy Dự án hoặc dữ liệu.';
    if (error.status === 409)
      return 'Dữ liệu bị trùng hoặc vừa thay đổi. Vui lòng tải lại.';
    if (error.status === 400) return 'File Excel hoặc dữ liệu chưa hợp lệ.';
    if (error.status === 413) return 'Tệp vượt quá giới hạn cho phép.';
    if (error.status === 422)
      return 'Dữ liệu chưa hợp lệ. Vui lòng kiểm tra lại.';
  }
  return 'Không thể hoàn tất thao tác. Vui lòng thử lại.';
};

export async function attemptStageTwoPlanPreview(
  projectId: string,
  fileAssetId: string,
  request: Request = api,
) {
  try {
    return {
      fileAssetId,
      preview: await previewStageTwoWorkbook(projectId, fileAssetId, request),
      error: '',
    };
  } catch (error) {
    return { fileAssetId, preview: undefined, error: safeError(error) };
  }
}

const definitionError = (error: unknown) =>
  error instanceof ApiError && error.status === 409
    ? 'Tên hồ sơ đã tồn tại trong Bước 1. Hãy đổi tên trước khi lưu.'
    : safeError(error);

const importError = (error: string) => {
  if (/duplicate/i.test(error)) return 'Mã công việc bị trùng.';
  if (/department/i.test(error)) return 'Đơn vị chủ trì không hoạt động.';
  if (/start date/i.test(error)) return 'Ngày bắt đầu không hợp lệ.';
  if (/finish date/i.test(error)) return 'Ngày hoàn thành không hợp lệ.';
  if (/allocated budget/i.test(error)) return 'Ngân sách không hợp lệ.';
  if (/description/i.test(error)) return 'Nội dung công việc không hợp lệ.';
  if (/code/i.test(error)) return 'Mã công việc không hợp lệ.';
  return 'Dòng dữ liệu không hợp lệ.';
};

const documentStatus: Record<string, string> = {
  DRAFT: 'Bản nháp',
  UPLOADED: 'Đã tải lên',
  PENDING_REVIEW: 'Chờ duyệt',
  UNDER_REVIEW: 'Đang duyệt',
  APPROVED: 'Đã phê duyệt',
  SUPERSEDED: 'Ngừng sử dụng',
};

const uploadDate = (value: string) =>
  new Intl.DateTimeFormat('vi-VN', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(value));

export function StageTwoLoadState({
  error = '',
  onRetry,
}: {
  error?: string;
  onRetry?: () => void;
}) {
  if (error)
    return (
      <div
        className="grid justify-items-start gap-2 p-5 text-red-700"
        role="alert"
      >
        <p>{error}</p>
        {onRetry && (
          <button
            className="rounded border px-3 py-2 font-semibold"
            onClick={onRetry}
            type="button"
          >
            THỬ TẢI LẠI
          </button>
        )}
      </div>
    );
  return (
    <p className="p-5" role="status">
      Đang tải Giai đoạn 2…
    </p>
  );
}

function StageTwoPlanCard({
  data,
  initialImportOpen,
  initialPreviewFailure,
  onData,
  onChanged,
  onNotice,
  onReload,
  preview,
  setPreview,
}: {
  data: StageTwoData;
  initialImportOpen: boolean;
  initialPreviewFailure?: { fileAssetId: string; error: string };
  onData: (data: StageTwoData) => void;
  onChanged: (changed: boolean) => void;
  onNotice: (notice: Notice) => void;
  onReload: (resetPlan?: boolean) => Promise<void>;
  preview?: StageTwoImportPreview;
  setPreview: (preview?: StageTwoImportPreview) => void;
}) {
  const [rows, setRows] = useState(() =>
    data.plan.map((row) => createStageTwoPlanDraft(row)),
  );
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set());
  const [removedRows, setRemovedRows] = useState<StageTwoPlanRemoval[]>([]);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const [importOpen, setImportOpen] = useState(
    initialImportOpen || Boolean(preview) || Boolean(initialPreviewFailure),
  );
  const [previewFileAssetId, setPreviewFileAssetId] = useState(
    initialPreviewFailure?.fileAssetId ?? '',
  );
  const [previewError, setPreviewError] = useState(
    initialPreviewFailure?.error ?? '',
  );
  const [previewing, setPreviewing] = useState(false);
  const importFiles = data.documents.filter(
    ({ currentFileAsset, currentFileAssetId }) =>
      currentFileAssetId &&
      (currentFileAsset?.originalFilename.toLowerCase().endsWith('.xlsx') ||
        currentFileAsset?.mimeType ===
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
  );
  const selectedImportFileId =
    previewFileAssetId || importFiles[0]?.currentFileAssetId || '';
  const financial = data.permittedCommands.viewAllocatedBudget;
  const columns = financial ? 7 : 6;
  const changed = dirtyKeys.size > 0 || removedRows.length > 0;
  useEffect(() => onChanged(changed), [changed, onChanged]);
  const setField = <Key extends keyof Omit<StageTwoPlanDraft, 'key'>>(
    key: string,
    field: Key,
    value: StageTwoPlanDraft[Key],
  ) => {
    setRows((current) =>
      current.map((row) =>
        row.key === key ? updateStageTwoPlanDraft(row, field, value) : row,
      ),
    );
    setDirtyKeys((current) => new Set(current).add(key));
    setErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  };
  const addRow = () => {
    const row = createStageTwoPlanDraft({
      code: '',
      description: '',
      departmentId: data.options.departments[0]?.id ?? '',
      startDate: '',
      finishDate: '',
      ...(data.permittedCommands.editAllocatedBudget && {
        allocatedBudget: '',
      }),
    });
    setRows((current) => [...current, row]);
    setDirtyKeys((current) => new Set(current).add(row.key));
  };
  const removeRow = (key: string) => {
    const result = removeStageTwoPlanDraft(rows, key, removedRows);
    setRows(result.rows);
    setRemovedRows(result.removedRows);
    setDirtyKeys((current) => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });
  };
  const save = async () => {
    const nextErrors = validateStageTwoPlan(
      rows,
      data.options.departments,
      data.permittedCommands.editAllocatedBudget,
    );
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      onNotice({
        kind: 'error',
        text: 'Kế hoạch có dữ liệu chưa hợp lệ. Vui lòng kiểm tra từng dòng.',
      });
      return;
    }
    if (!changed) {
      onNotice({ kind: 'success', text: 'Kế hoạch không có thay đổi để lưu.' });
      return;
    }
    setBusy(true);
    try {
      onData(
        await saveStageTwoPlan(
          data.project.id,
          stageTwoPlanPayload(
            rows,
            removedRows,
            dirtyKeys,
            data.permittedCommands.editAllocatedBudget,
          ),
        ),
      );
      onChanged(false);
      onNotice({ kind: 'success', text: 'Đã lưu kế hoạch tiến độ.' });
    } catch (error) {
      onNotice({ kind: 'error', text: safeError(error) });
    } finally {
      setBusy(false);
    }
  };
  const reload = async () => {
    if (!confirmStageTwoPlanReset(changed)) return;
    setBusy(true);
    try {
      await onReload(true);
      onChanged(false);
      onNotice({ kind: 'success', text: 'Đã tải lại dữ liệu mới nhất.' });
    } catch (error) {
      onNotice({ kind: 'error', text: safeError(error) });
    } finally {
      setBusy(false);
    }
  };
  const downloadTemplate = async () => {
    setBusy(true);
    try {
      await downloadStageTwoPlanTemplate(data.project.id);
    } catch (error) {
      onNotice({ kind: 'error', text: safeError(error) });
    } finally {
      setBusy(false);
    }
  };
  const runPreview = async (fileAssetId: string) => {
    setPreviewing(true);
    setPreviewFileAssetId(fileAssetId);
    setPreviewError('');
    const result = await attemptStageTwoPlanPreview(
      data.project.id,
      fileAssetId,
    );
    setPreview(result.preview);
    setPreviewError(result.error);
    setPreviewing(false);
  };
  const confirmImport = async () => {
    if (!preview || !confirmStageTwoPlanReset(changed)) return;
    setBusy(true);
    try {
      const result = await confirmStageTwoPlanImport(
        data.project.id,
        preview.jobId,
      );
      setPreview(undefined);
      await onReload(true);
      onChanged(false);
      onNotice({
        kind: 'success',
        text: `Đã nhập ${result.importedRows} dòng; bỏ qua ${result.skippedRows} dòng.`,
      });
    } catch (error) {
      onNotice({ kind: 'error', text: safeError(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-labelledby="stage-two-plan-title"
      className="grid gap-4 rounded-xl border bg-white p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-bold" id="stage-two-plan-title">
            KẾ HOẠCH TIẾN ĐỘ BASELINE &amp; PHÂN BỔ NGUỒN LỰC
          </h2>
          <p className="text-sm text-slate-600">
            Cho phép chỉnh sửa trực tiếp hoặc thêm/xóa dòng tiến độ.
          </p>
          <button
            className="mt-1 text-sm font-semibold text-blue-700"
            disabled={busy}
            onClick={() => void reload()}
            type="button"
          >
            TẢI LẠI DỮ LIỆU
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {data.permittedCommands.downloadTemplate && (
            <button
              className="rounded border border-blue-300 px-3 py-2 text-sm font-semibold text-blue-700"
              disabled={busy}
              onClick={() => void downloadTemplate()}
              type="button"
            >
              TẢI TEMPLATE KẾ HOẠCH
            </button>
          )}
          {data.permittedCommands.previewImport && (
            <button
              className="rounded bg-emerald-700 px-3 py-2 text-sm font-bold text-white"
              onClick={() => setImportOpen((open) => !open)}
              type="button"
            >
              NHẬP DỮ LIỆU TỪ FILE EXCEL
            </button>
          )}
          {(data.permittedCommands.addPlanRows ||
            data.permittedCommands.editPlanRows ||
            data.permittedCommands.deletePlanRows) && (
            <button
              className="rounded bg-blue-700 px-3 py-2 text-sm font-bold text-white"
              disabled={busy}
              onClick={() => void save()}
              type="button"
            >
              LƯU KẾ HOẠCH
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[920px] w-full text-left text-sm">
          <thead className="bg-slate-100 text-xs text-slate-700">
            <tr>
              <th className="p-2" scope="col">
                MÃ CV
              </th>
              <th className="p-2" scope="col">
                NỘI DUNG CÔNG VIỆC CHI TIẾT
              </th>
              <th className="p-2" scope="col">
                ĐƠN VỊ CHỦ TRÌ
              </th>
              <th className="p-2" scope="col">
                NGÀY BẮT ĐẦU
              </th>
              <th className="p-2" scope="col">
                NGÀY HOÀN THÀNH
              </th>
              {financial && (
                <th className="p-2 text-right" scope="col">
                  NGÂN SÁCH PHÂN BỔ (VND)
                </th>
              )}
              <th className="p-2" scope="col">
                THAO TÁC
              </th>
            </tr>
          </thead>
          <tbody>
            {!rows.length && (
              <tr>
                <td
                  className="p-4 text-center text-slate-600"
                  colSpan={columns}
                >
                  Chưa có công việc tiến độ nào.
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const editable = row.id
                ? data.permittedCommands.editPlanRows
                : data.permittedCommands.addPlanRows;
              const removable = row.id
                ? data.permittedCommands.deletePlanRows
                : data.permittedCommands.addPlanRows;
              return (
                <React.Fragment key={row.key}>
                  <tr className="border-t align-top">
                    <td className="p-2">
                      <input
                        aria-label={`Mã công việc ${row.code || 'mới'}`}
                        aria-invalid={Boolean(errors[row.key])}
                        className="w-full"
                        disabled={!editable}
                        maxLength={100}
                        onChange={(event) =>
                          setField(row.key, 'code', event.target.value)
                        }
                        required
                        value={row.code}
                      />
                    </td>
                    <td className="p-2">
                      <input
                        aria-label={`Nội dung ${row.code || 'công việc mới'}`}
                        aria-invalid={Boolean(errors[row.key])}
                        className="w-full"
                        disabled={!editable}
                        maxLength={300}
                        onChange={(event) =>
                          setField(row.key, 'description', event.target.value)
                        }
                        required
                        value={row.description}
                      />
                    </td>
                    <td className="p-2">
                      <select
                        aria-label={`Đơn vị chủ trì ${row.code || 'công việc mới'}`}
                        className="w-full"
                        disabled={!editable}
                        onChange={(event) =>
                          setField(row.key, 'departmentId', event.target.value)
                        }
                        required
                        value={row.departmentId}
                      >
                        <option value="">Chọn đơn vị</option>
                        {data.options.departments.map((department) => (
                          <option key={department.id} value={department.id}>
                            {department.code} · {department.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2">
                      <input
                        aria-label={`Ngày bắt đầu ${row.code || 'công việc mới'}`}
                        className="w-full"
                        disabled={!editable}
                        onChange={(event) =>
                          setField(row.key, 'startDate', event.target.value)
                        }
                        required
                        type="date"
                        value={row.startDate}
                      />
                    </td>
                    <td className="p-2">
                      <input
                        aria-label={`Ngày hoàn thành ${row.code || 'công việc mới'}`}
                        className="w-full"
                        disabled={!editable}
                        min={row.startDate || undefined}
                        onChange={(event) =>
                          setField(row.key, 'finishDate', event.target.value)
                        }
                        required
                        type="date"
                        value={row.finishDate}
                      />
                    </td>
                    {financial && (
                      <td className="p-2 text-right">
                        {data.permittedCommands.editAllocatedBudget ? (
                          <input
                            aria-label={`Ngân sách ${row.code || 'công việc mới'}`}
                            className="w-full text-right"
                            min="0"
                            name="allocatedBudget"
                            onChange={(event) =>
                              setField(
                                row.key,
                                'allocatedBudget',
                                event.target.value,
                              )
                            }
                            step="0.01"
                            type="number"
                            value={row.allocatedBudget ?? ''}
                          />
                        ) : (
                          <span>
                            {row.allocatedBudget
                              ? formatVietnameseMoney(row.allocatedBudget)
                              : '—'}
                          </span>
                        )}
                      </td>
                    )}
                    <td className="p-2">
                      {removable && (
                        <button
                          aria-label={`Xóa ${row.code || 'công việc mới'}`}
                          className="text-red-700"
                          onClick={() => removeRow(row.key)}
                          type="button"
                        >
                          Xóa
                        </button>
                      )}
                    </td>
                  </tr>
                  {errors[row.key] && (
                    <tr>
                      <td className="px-2 pb-2 text-red-700" colSpan={columns}>
                        <ul aria-label={`Lỗi dòng ${row.code || 'mới'}`}>
                          {errors[row.key]!.map((error) => (
                            <li key={error}>{error}</li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {data.permittedCommands.addPlanRows && (
              <tr>
                <td className="p-2" colSpan={columns}>
                  <button
                    className="w-full rounded border border-dashed border-blue-300 p-2 font-bold text-blue-700"
                    onClick={addRow}
                    type="button"
                  >
                    + THÊM CÔNG VIỆC TIẾN ĐỘ MỚI
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {(importOpen || preview) && (
        <section
          aria-labelledby="stage-two-import-title"
          className="grid gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-bold" id="stage-two-import-title">
              NHẬP KẾ HOẠCH TỪ XLSX
            </h3>
            <button onClick={() => setImportOpen(false)} type="button">
              Đóng
            </button>
          </div>
          {!importFiles.length ? (
            <p className="text-sm text-slate-600">
              Hãy tải một tệp XLSX trong khu vực hồ sơ bên dưới trước khi xem
              trước dữ liệu nhập.
            </p>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <label className="grid min-w-64 gap-1 text-sm font-semibold">
                TỆP XLSX ĐÃ TẢI
                <select
                  onChange={(event) =>
                    setPreviewFileAssetId(event.target.value)
                  }
                  value={selectedImportFileId}
                >
                  {importFiles.map((document) => (
                    <option
                      key={document.id}
                      value={document.currentFileAssetId ?? ''}
                    >
                      {document.currentFileAsset?.originalFilename}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="rounded border border-emerald-700 px-3 py-2 font-semibold text-emerald-800"
                disabled={previewing || !selectedImportFileId}
                onClick={() => void runPreview(selectedImportFileId)}
                type="button"
              >
                XEM TRƯỚC FILE XLSX
              </button>
            </div>
          )}
          {previewError && (
            <div
              className="grid justify-items-start gap-2 text-red-700"
              role="alert"
            >
              <p>{previewError}</p>
              {previewFileAssetId && (
                <button
                  className="rounded border px-3 py-2 font-semibold"
                  disabled={previewing}
                  onClick={() => void runPreview(previewFileAssetId)}
                  type="button"
                >
                  THỬ LẠI XEM TRƯỚC
                </button>
              )}
            </div>
          )}
          {preview && (
            <section
              aria-labelledby="stage-two-preview-title"
              className="grid gap-3"
            >
              <h4 className="font-bold" id="stage-two-preview-title">
                XEM TRƯỚC DỮ LIỆU NHẬP
              </h4>
              <div className="flex flex-wrap gap-3 text-sm">
                <span>Tổng số dòng: {preview.summary.totalRows}</span>
                <span>Hợp lệ: {preview.summary.validRows}</span>
                <span>Không hợp lệ: {preview.summary.invalidRows}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-[760px] w-full text-left text-sm">
                  <thead>
                    <tr>
                      <th scope="col">Dòng</th>
                      <th scope="col">Mã CV</th>
                      <th scope="col">Nội dung</th>
                      <th scope="col">Đơn vị</th>
                      <th scope="col">Bắt đầu</th>
                      <th scope="col">Hoàn thành</th>
                      {financial && <th scope="col">Ngân sách</th>}
                      <th scope="col">Kết quả</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row) => (
                      <tr className="border-t" key={row.rowNumber}>
                        <td>{row.rowNumber}</td>
                        <td>{row.data.code || '—'}</td>
                        <td>{row.data.description || '—'}</td>
                        <td>
                          {data.options.departments.find(
                            ({ id }) => id === row.data.departmentId,
                          )?.name ?? '—'}
                        </td>
                        <td>{row.data.startDate || '—'}</td>
                        <td>{row.data.finishDate || '—'}</td>
                        {financial && (
                          <td>
                            {row.data.allocatedBudget
                              ? formatVietnameseMoney(row.data.allocatedBudget)
                              : '—'}
                          </td>
                        )}
                        <td>
                          {row.status === 'VALID' ? (
                            'Hợp lệ'
                          ) : (
                            <ul className="text-red-700">
                              {row.errors.map((error) => (
                                <li key={error}>{importError(error)}</li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {data.permittedCommands.confirmImport &&
                preview.summary.validRows > 0 && (
                  <button
                    className="justify-self-start rounded bg-emerald-700 px-4 py-2 font-bold text-white"
                    disabled={busy}
                    onClick={() => void confirmImport()}
                    type="button"
                  >
                    XÁC NHẬN NHẬP {preview.summary.validRows} DÒNG
                  </button>
                )}
            </section>
          )}
        </section>
      )}
    </section>
  );
}

const definitionInput = (
  definition: StageTwoDocumentDefinition,
): StageTwoDocumentDefinitionInput => ({
  name: definition.name,
  workstreamKey: 'PLAN',
  description: definition.description,
  position: definition.position,
  initialMatrix: definition.initialMatrix,
  active: definition.active,
});

function StageTwoDefinitionForm({
  definition,
  position,
  submitLabel,
  onSubmit,
}: {
  definition?: StageTwoDocumentDefinition;
  position: number;
  submitLabel: string;
  onSubmit: (input: StageTwoDocumentDefinitionInput) => void;
}) {
  return (
    <form
      className="mt-2 grid gap-2 rounded border bg-white p-3"
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const values = new FormData(event.currentTarget);
        onSubmit({
          name: String(values.get('name') ?? ''),
          workstreamKey: 'PLAN',
          description: String(values.get('description') ?? '') || undefined,
          position: Number(values.get('position') ?? position),
          initialMatrix: true,
          active: definition?.active ?? true,
        });
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
          defaultValue={definition?.position ?? position}
          min={0}
          name="position"
          required
          type="number"
        />
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

function StageTwoDocumentsCard({
  actor,
  data,
  onNotice,
  onReload,
}: {
  actor: Pick<Actor, 'userId' | 'displayName' | 'permissions' | 'organization'>;
  data: StageTwoData;
  onNotice: (notice: Notice) => void;
  onReload: (resetPlan?: boolean) => Promise<void>;
}) {
  const [queues, setQueues] = useState<
    Record<string, ProjectDocumentQueueItem[]>
  >({});
  const recoveredScope = useRef('');
  const [definitionId, setDefinitionId] = useState('');
  const active = data.documentDefinitions
    .filter(({ active }) => active)
    .sort((left, right) => left.position - right.position);
  const archived = data.documentDefinitions
    .filter(({ active }) => !active)
    .sort((left, right) => left.position - right.position);
  const selectedDefinition =
    active.find(({ id }) => id === definitionId) ?? active[0];
  const selectedQueueKey = selectedDefinition
    ? projectDocumentQueueKey(
        data.project.id,
        'STAGE_2',
        'PLAN',
        selectedDefinition.id,
        'STAGE_MATRIX_DOCUMENT',
        'STAGE_DOCUMENT',
      )
    : '';
  const officerOptions = actor.permissions.includes('project.manage_members')
    ? data.options.members
    : [{ id: actor.userId, displayName: actor.displayName }];
  useEffect(() => {
    const scope = `${data.project.id}:${active.map(({ id }) => id).join(',')}`;
    if (!active.length || recoveredScope.current === scope) return;
    recoveredScope.current = scope;
    void recoverProjectDocumentQueues({
      projectId: data.project.id,
      definitions: active.map((definition) => ({
        ...definition,
        stageKey: 'STAGE_2' as const,
        workstreamKey: 'PLAN',
        submittedOfficerId: actor.userId,
        contextType: 'STAGE_MATRIX_DOCUMENT' as const,
        targetType: 'STAGE_DOCUMENT' as const,
      })),
    })
      .then((recovered) =>
        setQueues((current) => {
          const next = { ...current };
          for (const [key, items] of Object.entries(recovered))
            next[key] = mergeProjectDocumentQueue(next[key] ?? [], items);
          return next;
        }),
      )
      .catch(() => {
        recoveredScope.current = '';
        onNotice({
          kind: 'error',
          text: 'Không thể khôi phục các tệp tải tạm.',
        });
      });
  }, [active, actor.userId, data.project.id, onNotice]);
  const mutate = async (
    definitionId: string | undefined,
    input: StageTwoDocumentDefinitionInput,
  ) => {
    try {
      await saveStageTwoDocumentDefinition(
        data.project.id,
        definitionId,
        input,
      );
      await onReload();
      onNotice({ kind: 'success', text: 'Đã lưu loại hồ sơ hỗ trợ.' });
    } catch (error) {
      onNotice({ kind: 'error', text: definitionError(error) });
    }
  };

  return (
    <section
      aria-labelledby="stage-two-documents-title"
      className="grid gap-4 rounded-xl border bg-white p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-bold" id="stage-two-documents-title">
            HỒ SƠ TÀI LIỆU GIAI ĐOẠN 2 — KẾ HOẠCH &amp; KHẢO SÁT
          </h2>
          <p className="text-sm text-slate-600">
            Có thể tải hoặc không tải tài liệu. Hồ sơ không ảnh hưởng quyền hoàn
            thành bước hoặc giai đoạn.
          </p>
        </div>
        {data.permittedCommands.manageDocumentDefinitions && (
          <details>
            <summary className="cursor-pointer rounded border border-blue-300 px-3 py-2 font-semibold text-blue-700">
              THÊM LOẠI HỒ SƠ
            </summary>
            <StageTwoDefinitionForm
              onSubmit={(input) => void mutate(undefined, input)}
              position={
                Math.max(
                  -1,
                  ...data.documentDefinitions.map(({ position }) => position),
                ) + 1
              }
              submitLabel="Thêm"
            />
          </details>
        )}
      </div>

      {!!active.length && (
        <div className="grid gap-2">
          <h3 className="text-sm font-bold">LOẠI HỒ SƠ ĐANG HOẠT ĐỘNG</h3>
          {active.map((definition) => (
            <article
              className="grid gap-2 rounded border p-3 sm:grid-cols-[1fr_auto]"
              key={definition.id}
            >
              <div>
                <strong className="block">{definition.name}</strong>
                {definition.description && (
                  <p className="text-sm text-slate-600">
                    {definition.description}
                  </p>
                )}
                <span className="mt-1 block text-xs text-slate-500">
                  Thứ tự {definition.position}
                </span>
              </div>
              {data.permittedCommands.manageDocumentDefinitions && (
                <div className="flex flex-wrap gap-2">
                  <details>
                    <summary className="cursor-pointer">Chỉnh sửa</summary>
                    <StageTwoDefinitionForm
                      definition={definition}
                      onSubmit={(input) => void mutate(definition.id, input)}
                      position={definition.position}
                      submitLabel="Lưu"
                    />
                  </details>
                  <button
                    onClick={() => {
                      if (confirm(`Ẩn loại hồ sơ “${definition.name}”?`))
                        void mutate(definition.id, {
                          ...definitionInput(definition),
                          active: false,
                        });
                    }}
                    type="button"
                  >
                    Ẩn
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {!!archived.length && (
        <details>
          <summary className="cursor-pointer font-bold">HỒ SƠ ĐÃ ẨN</summary>
          <div className="mt-2 grid gap-2">
            {archived.map((definition) => (
              <article
                className="flex flex-wrap items-center justify-between gap-2 rounded border p-3"
                key={definition.id}
              >
                <strong>{definition.name}</strong>
                {data.permittedCommands.manageDocumentDefinitions && (
                  <button
                    onClick={() =>
                      void mutate(definition.id, {
                        ...definitionInput(definition),
                        active: true,
                      })
                    }
                    type="button"
                  >
                    Khôi phục
                  </button>
                )}
              </article>
            ))}
          </div>
        </details>
      )}

      {data.permittedCommands.uploadDocuments ? (
        selectedDefinition ? (
          <section
            aria-labelledby="stage-two-upload-title"
            className="grid gap-3 rounded border p-3"
          >
            <h3 className="font-bold" id="stage-two-upload-title">
              TẢI HỒ SƠ BƯỚC 1
            </h3>
            <label className="grid gap-1 text-sm font-semibold sm:max-w-xl">
              LOẠI HỒ SƠ
              <select
                name="documentType"
                onChange={(event) => setDefinitionId(event.target.value)}
                value={selectedDefinition.id}
              >
                {active.map((definition) => (
                  <option key={definition.id} value={definition.id}>
                    {definition.name}
                  </option>
                ))}
              </select>
            </label>
            <ProjectDocumentUploadQueue
              actor={{
                id: actor.userId,
                displayName: actor.displayName,
                organizationId: actor.organization.id,
              }}
              constraints={data.uploadConstraints}
              contextType="STAGE_MATRIX_DOCUMENT"
              definition={selectedDefinition}
              officerOptions={officerOptions}
              onQueueChange={(update) =>
                setQueues((current) => {
                  const queue = current[selectedQueueKey] ?? [];
                  return {
                    ...current,
                    [selectedQueueKey]:
                      typeof update === 'function' ? update(queue) : update,
                  };
                })
              }
              onUploaded={async () => {
                await onReload();
              }}
              projectId={data.project.id}
              queue={queues[selectedQueueKey] ?? []}
              stageKey="STAGE_2"
              targetType="STAGE_DOCUMENT"
              workstreamKey="PLAN"
            />
          </section>
        ) : (
          <p className="text-sm text-slate-600">
            Chưa có loại hồ sơ hoạt động để tải tệp.
          </p>
        )
      ) : (
        <p className="text-sm text-slate-600">Bạn không có quyền tải hồ sơ.</p>
      )}

      <section aria-labelledby="stage-two-file-list-title">
        <h3 className="font-bold" id="stage-two-file-list-title">
          DANH MỤC TÀI LIỆU GĐ 2 ĐÃ TẢI LÊN — BƯỚC 1
        </h3>
        {!data.documents.length ? (
          <p className="mt-2 text-sm text-slate-600">
            Chưa có tài liệu nào được tải lên cho Bước 1.
          </p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="min-w-[1050px] w-full text-left text-sm">
              <thead>
                <tr>
                  <th scope="col">Tên hồ sơ</th>
                  <th scope="col">Tệp</th>
                  <th scope="col">Người tải lên</th>
                  <th scope="col">Ngày tải</th>
                  <th scope="col">Trạng thái</th>
                  <th scope="col">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {data.documents.map((document) => {
                  return (
                    <tr className="border-t" key={document.id}>
                      <td className="py-2 pr-2 font-semibold">
                        {document.displayName}
                      </td>
                      <td className="py-2 pr-2">
                        {document.currentFileAsset?.originalFilename ?? '—'}
                      </td>
                      <td className="py-2 pr-2">
                        {document.submittedOfficer?.displayName ?? '—'}
                      </td>
                      <td className="py-2 pr-2">
                        {uploadDate(document.createdAt)}
                      </td>
                      <td className="py-2 pr-2">
                        {documentStatus[document.status] ?? 'Đã nộp'}
                      </td>
                      <td className="py-2">
                        <div className="flex flex-wrap gap-2">
                          {data.capabilities.canPreviewFiles &&
                            document.currentFileAssetId &&
                            isPreviewableProjectFile(
                              document.currentFileAsset?.mimeType,
                            ) && (
                              <a
                                className="rounded border px-3 py-2 font-semibold text-blue-700"
                                href={`${apiUrl}/files/${document.currentFileAssetId}/preview`}
                              >
                                Xem
                              </a>
                            )}
                          {document.currentFileAssetId &&
                            data.capabilities.canDownloadFiles && (
                              <a
                                className="rounded border px-3 py-2 font-semibold text-slate-700"
                                href={`${apiUrl}/files/${document.currentFileAssetId}/download`}
                              >
                                Tải xuống
                              </a>
                            )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}

export function ProjectStageTwoView({
  actor,
  data,
  estimates = [],
  initialImportOpen = false,
  initialPreview,
  initialPreviewFailure,
  onData,
  onNavigate,
  onReload,
  risks = [],
  revision,
  selectedStep,
}: {
  actor: Pick<Actor, 'userId' | 'displayName' | 'permissions' | 'organization'>;
  data: StageTwoData;
  estimates?: readonly EstimateSummary[];
  initialImportOpen?: boolean;
  initialPreview?: StageTwoImportPreview;
  initialPreviewFailure?: { fileAssetId: string; error: string };
  onData: (data: StageTwoData) => void;
  onNavigate?: (path: string) => void;
  onReload: (resetPlan?: boolean) => Promise<void>;
  risks?: readonly ProjectRiskSummary[];
  revision: number;
  selectedStep: StageTwoStep;
}) {
  const [notice, setNotice] = useState<Notice>(null);
  const [preview, setPreview] = useState<StageTwoImportPreview | undefined>(
    initialPreview,
  );
  const [planChanged, setPlanChanged] = useState(false);
  const [completing, setCompleting] = useState(false);
  const complete = async () => {
    setCompleting(true);
    try {
      const completed = await completeStageTwoStepOneWithDraftGuard(
        data.project.id,
        planChanged,
        onReload,
        () => setPlanChanged(false),
      );
      if (completed)
        setNotice({ kind: 'success', text: 'Đã hoàn tất Bước 1.' });
    } catch (error) {
      setNotice({ kind: 'error', text: safeError(error) });
    } finally {
      setCompleting(false);
    }
  };

  return (
    <main className="mx-auto grid w-full max-w-[1280px] min-w-0 gap-5 p-3 sm:p-5">
      <ProjectStageHeader
        activeStage="STAGE_2"
        canManageProjectAccess={data.capabilities.canManageProjectAccess}
        canDeleteProject={data.capabilities.canDeleteProject}
        canSwitchProject={data.capabilities.canSwitchProject}
        onNavigate={onNavigate}
        onProjectDeleted={
          onNavigate ? () => onNavigate('/projects') : undefined
        }
        project={data.project}
        projects={data.options.projects}
        status={data.state.status}
      />

      <nav
        aria-label="Các phân hệ Giai đoạn 2"
        className="flex gap-2 overflow-x-auto rounded-xl border bg-white p-2"
      >
        {stageTwoTabs.map((tab) => (
          <Link
            aria-current={tab.step === selectedStep ? 'page' : undefined}
            className={`shrink-0 rounded-lg px-3 py-3 text-center text-sm font-bold ${
              tab.step === selectedStep
                ? PROJECT_STAGE_ACCENTS.STAGE_2.solid
                : 'text-slate-700 hover:bg-slate-100'
            }`}
            href={stageTwoStepUrl(data.project.id, tab.step)}
            key={tab.step}
            onClick={(event) => {
              if (selectedStep !== 1 || tab.step === selectedStep) return;
              stageTwoPlanTabTransition(
                planChanged,
                () => event.preventDefault(),
                () => setPlanChanged(false),
              );
            }}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {notice && (
        <p
          className={
            notice.kind === 'success' ? 'text-emerald-700' : 'text-red-700'
          }
          role={notice.kind === 'success' ? 'status' : 'alert'}
        >
          {notice.text}
        </p>
      )}

      {selectedStep === 1 ? (
        <div className="grid gap-5">
          {data.permittedCommands.viewPlan ? (
            <StageTwoPlanCard
              data={data}
              initialImportOpen={initialImportOpen}
              initialPreviewFailure={initialPreviewFailure}
              key={`plan-${revision}`}
              onData={onData}
              onChanged={setPlanChanged}
              onNotice={setNotice}
              onReload={onReload}
              preview={preview}
              setPreview={setPreview}
            />
          ) : (
            <section className="rounded-xl border bg-white p-4 text-sm text-slate-600 shadow-sm">
              Bạn không có quyền xem kế hoạch tiến độ.
            </section>
          )}
          <StageTwoDocumentsCard
            actor={actor}
            data={data}
            key={data.project.id}
            onNotice={setNotice}
            onReload={onReload}
          />
          <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-600">
              Có thể hoàn tất Bước 1 khi kế hoạch và danh sách hồ sơ đều trống.
            </p>
            {data.permittedCommands.completeStep && (
              <button
                className="rounded bg-blue-700 px-4 py-2 font-bold text-white"
                disabled={completing}
                onClick={() => void complete()}
                type="button"
              >
                HOÀN TẤT BƯỚC 1
              </button>
            )}
          </section>
        </div>
      ) : selectedStep === 2 ? (
        <section
          aria-label="Chức năng hiện có cho Bước 2"
          className="grid gap-3 rounded-xl border bg-white p-4 shadow-sm"
        >
          <p className="text-sm text-slate-600">
            Dùng các sổ nghiệp vụ Dự án hiện có; không tạo bản sao BOQ hoặc sản
            phẩm.
          </p>
          <div className="flex flex-wrap gap-3">
            {actor.permissions.includes('project.product.view') && (
              <Link
                className="font-semibold text-blue-700"
                href={`/projects/${data.project.id}/products`}
              >
                MỞ SỔ SẢN PHẨM DỰ ÁN
              </Link>
            )}
            {actor.permissions.includes('estimate.read') && (
              <Link
                className="font-semibold text-blue-700"
                href={`/projects/${data.project.id}/estimates`}
              >
                MỞ DỰ TOÁN DỰ ÁN
              </Link>
            )}
            <Link
              className="font-semibold text-amber-800"
              href={`/projects/${data.project.id}/risks`}
            >
              MỞ SỔ RỦI RO DỰ ÁN
            </Link>
          </div>
          {actor.permissions.includes('estimate.read') && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead className="bg-slate-100 text-xs text-slate-700">
                  <tr>
                    <th className="p-2">DỰ TOÁN</th>
                    <th className="p-2">PHIÊN BẢN</th>
                    <th className="p-2">TRẠNG THÁI</th>
                  </tr>
                </thead>
                <tbody>
                  {estimates.map((estimate) => (
                    <tr className="border-t" key={estimate.id}>
                      <td className="p-2">
                        <Link
                          className="font-semibold text-blue-700"
                          href={`/projects/${data.project.id}/estimates/${estimate.id}`}
                        >
                          {estimate.number} · {estimate.title}
                        </Link>
                      </td>
                      <td className="p-2">V{estimate.currentVersion}</td>
                      <td className="p-2">
                        {estimateStatusLabel(estimate.status)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!estimates.length && (
                <p className="py-3 text-sm text-slate-600">
                  Chưa có dự toán trong dự án.
                </p>
              )}
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-slate-100 text-xs text-slate-700">
                <tr>
                  <th className="p-2">RỦI RO</th>
                  <th className="p-2">GIAI ĐOẠN</th>
                  <th className="p-2 text-right">ĐIỂM</th>
                  {actor.permissions.includes('financial_margin.read') && (
                    <th className="p-2 text-right">EMV</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {risks.map((risk) => (
                  <tr className="border-t" key={risk.id}>
                    <td className="p-2">
                      <Link
                        className="font-semibold text-amber-800"
                        href={`/projects/${data.project.id}/risks`}
                      >
                        {risk.code} · {risk.title}
                      </Link>
                    </td>
                    <td className="p-2">
                      {riskStages[risk.stage] ?? risk.stage}
                    </td>
                    <td className="p-2 text-right">{risk.priorityScore}</td>
                    {actor.permissions.includes('financial_margin.read') && (
                      <td className="p-2 text-right">
                        {risk.emv
                          ? formatVietnameseMoney(risk.emv)
                          : 'Chưa định lượng'}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {!risks.length && (
              <p className="py-3 text-sm text-slate-600">
                Chưa có rủi ro được ghi nhận.
              </p>
            )}
          </div>
          {!actor.permissions.includes('project.product.view') &&
            !actor.permissions.includes('estimate.read') &&
            !risks.length && (
              <p className="text-sm text-slate-600">
                Chưa có phân hệ được kết nối mà bạn có quyền truy cập.
              </p>
            )}
        </section>
      ) : (
        <section
          aria-label="Bước 3 Giai đoạn 2"
          className="grid gap-3 rounded-xl border bg-white p-4 shadow-sm"
        >
          <h2 className="font-bold">THẨM ĐỊNH &amp; PHÊ DUYỆT DỰ TOÁN</h2>
          {actor.permissions.includes('estimate.read') ? (
            estimates.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-left text-sm">
                  <thead className="bg-slate-100 text-xs text-slate-700">
                    <tr>
                      <th className="p-2">DỰ TOÁN</th>
                      <th className="p-2">PHIÊN BẢN</th>
                      <th className="p-2">TRẠNG THÁI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {estimates.map((estimate) => (
                      <tr className="border-t" key={estimate.id}>
                        <td className="p-2">
                          <Link
                            className="font-semibold text-blue-700"
                            href={`/projects/${data.project.id}/estimates/${estimate.id}`}
                          >
                            {estimate.number} · {estimate.title}
                          </Link>
                        </td>
                        <td className="p-2">V{estimate.currentVersion}</td>
                        <td className="p-2">
                          {estimateStatusLabel(estimate.status)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-slate-600">
                Chưa có phiên bản dự toán để thẩm định.
              </p>
            )
          ) : (
            <p className="text-sm text-slate-600">
              Bạn không có quyền xem dự toán.
            </p>
          )}
        </section>
      )}
    </main>
  );
}

export function ProjectStageTwo({ projectId }: { projectId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedStep = stageTwoStepFromSearchParam(searchParams.get('step'));
  const [data, setData] = useState<StageTwoData>();
  const [actor, setActor] = useState<Actor>();
  const [estimates, setEstimates] = useState<EstimateSummary[]>([]);
  const [risks, setRisks] = useState<ProjectRiskSummary[]>([]);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const acceptData = (next: StageTwoData) => {
    setData(next);
    setRevision((current) => stageTwoPlanRevision(current, true));
  };
  const load = useCallback(
    async (resetPlan = false) => {
      const [nextData, nextActor] = await Promise.all([
        loadStageTwo(projectId),
        api<Actor>('/me'),
      ]);
      const [nextEstimates, nextRisks] = await Promise.all([
        nextActor.permissions.includes('estimate.read')
          ? api<EstimateSummary[]>(`/projects/${projectId}/estimates`)
          : Promise.resolve([]),
        api<ProjectRiskSummary[]>(`/projects/${projectId}/risks`),
      ]);
      setData(nextData);
      setRevision((current) => stageTwoPlanRevision(current, resetPlan));
      setActor(nextActor);
      setEstimates(nextEstimates);
      setRisks(nextRisks);
      setError('');
    },
    [projectId],
  );

  useEffect(() => {
    let active = true;
    void Promise.all([loadStageTwo(projectId), api<Actor>('/me')])
      .then(async ([nextData, nextActor]) => {
        const [nextEstimates, nextRisks] = await Promise.all([
          nextActor.permissions.includes('estimate.read')
            ? api<EstimateSummary[]>(`/projects/${projectId}/estimates`)
            : Promise.resolve([]),
          api<ProjectRiskSummary[]>(`/projects/${projectId}/risks`),
        ]);
        if (!active) return;
        acceptData(nextData);
        setActor(nextActor);
        setEstimates(nextEstimates);
        setRisks(nextRisks);
        setError('');
      })
      .catch((nextError) => {
        if (active) setError(safeError(nextError));
      });
    return () => {
      active = false;
    };
  }, [projectId]);

  if (!data || !actor)
    return (
      <StageTwoLoadState
        error={error}
        onRetry={
          error
            ? () => {
                setError('');
                void load(true).catch((nextError) =>
                  setError(safeError(nextError)),
                );
              }
            : undefined
        }
      />
    );
  return (
    <ProjectStageTwoView
      actor={actor}
      data={data}
      estimates={estimates}
      onData={acceptData}
      onNavigate={(path) => router.push(path)}
      onReload={load}
      revision={revision}
      risks={risks}
      selectedStep={selectedStep}
    />
  );
}
