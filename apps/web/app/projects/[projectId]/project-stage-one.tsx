'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ApiError, api, apiUrl, type Actor } from '../../lib/api';
import { createCommandKey } from '../../lib/create-command-key';
import { EntityActivity } from '../../entity-activity';
import { ProjectWorkspaceHeader } from '../../../features/projects/project-workspace-header';
import { EntityFiles } from '../../entity-files';
import { ProjectStageHeader } from '../../project-pms';
import { type UploadConstraints } from './documents/document-upload';
import {
  ProjectDocumentUploadQueue,
  projectDocumentQueueBlocksClose,
  projectDocumentPendingBatchItems,
  readProjectDocumentPendingBatch,
  reconcileProjectDocumentPendingBatch,
  recoverProjectDocumentQueuesOnce,
  retryProjectDocumentPendingBatch,
  mergeProjectDocumentQueue,
  projectDocumentQueueKey,
  type ProjectDocumentQueueContext,
  type ProjectDocumentQueueItem,
  type ProjectDocumentContext,
  type ProjectDocumentTargetType,
  type UploadedProjectDocument,
} from '../../../features/projects/project-document-upload-queue';
import {
  isPreviewableProjectFile,
  OptionalDocumentMatrix,
} from './stage-1/optional-document-matrix';
import { projectDomainLabel } from '../../../features/projects/project-domain-labels';
import {
  formatVietnameseMoney,
  normalizeVietnameseMoney,
} from './stage-1/money';

export type StageOneStep =
  | 'ASSIGNMENT'
  | 'SURVEY'
  | 'PROPOSAL'
  | 'FINANCIAL_PLANNING'
  | 'KICKOFF_APPROVAL';
type StageOneFundingSource =
  | 'PUBLIC_INVESTMENT_2026'
  | 'ODA_CONCESSIONAL_LOAN'
  | 'PPP'
  | 'MIXED_OTHER';
type StageOneNumber = 1 | 2 | 3 | 4 | 5;
type ProjectOption = { id: string; code: string; name: string };
type MemberOption = { id: string; displayName: string; email: string };
type ContactOption = {
  id: string;
  displayName: string;
  email?: string | null;
  isPrimary?: boolean;
};
export type CustomerOption = {
  id: string;
  displayName: string;
  contacts?: ContactOption[];
};
export type StageOneDocument = {
  id: string;
  source: 'STAGE_ONE' | 'LEGACY_REQUIRED_DOCUMENT';
  legacyRequirementId?: string | null;
  contextType: ProjectDocumentContext;
  step: StageOneStep | string;
  documentType: string;
  displayName: string;
  status: string;
  currentVersion: number;
  currentFileAssetId: string | null;
  submittedAt?: string | null;
  createdAt?: string | null;
  submittedOfficer?: { id: string; displayName: string; email?: string };
  currentFileAsset?: {
    id: string;
    originalFilename: string;
    mimeType: string;
    sizeBytes: string;
  };
};
export type StageOneDocumentHistory = {
  displayName: string;
  currentVersion: number;
  versions: {
    version: number;
    status: string;
    createdAt: string;
    downloadId: string;
    filename: string;
    sizeBytes: string;
    submittedOfficer?: { displayName: string } | null;
    actualActor?: { displayName: string } | null;
  }[];
};
export type DocumentCapabilities = {
  canSwitchProject: boolean;
  canManageProjectAccess: boolean;
  canReadDocuments: boolean;
  canUploadDocuments: boolean;
  canSubmitDocuments: boolean;
  canManageDocumentTypes: boolean;
  canCompleteStep: boolean;
  canReopenStep: boolean;
  canPreviewFiles: boolean;
  canDownloadFiles: boolean;
  canDeleteProjectDocuments: boolean;
  canDeleteProject: boolean;
  canManageKeyDossier: boolean;
  canDeleteKeyDossierItem: boolean;
  canDeleteAttachment: boolean;
  canUploadWorkflowDocuments: boolean;
  canUploadKeyDossierAttachments: boolean;
  canReadFinance: boolean;
  canManageFinance: boolean;
};
type StageOneDocumentDefinition = {
  id: string;
  name: string;
  workstreamKey: string;
  description?: string;
  position: number;
  initialMatrix: boolean;
  active: boolean;
  required: boolean;
  referenceMilestoneId?: string | null;
  referenceMilestone?: {
    id: string;
    code: string;
    name: string;
    position: number;
    active: boolean;
  } | null;
  files: readonly StageOneDocument[];
};

export type SimpleStageOneData = {
  project: ProjectOption;
  initiation: {
    name: string;
    estimatedInvestmentAmount: string | null;
    fundingSource: StageOneFundingSource | null;
    customerId: string | null;
    primaryContactId: string | null;
  };
  steps: readonly {
    number: StageOneNumber;
    step: StageOneStep;
    label: string;
    status: string;
    documentTypes: readonly {
      id: string;
      name: string;
      customNameRequired: boolean;
      required: boolean;
    }[];
  }[];
  keyDossier: {
    milestones: readonly {
      id: string;
      code: string;
      name: string;
      position: number;
      active: boolean;
    }[];
    items: readonly StageOneDocumentDefinition[];
    attachments: readonly StageOneDocument[];
  };
  workflow: {
    definitions: readonly StageOneDocumentDefinition[];
    documents: readonly StageOneDocument[];
  };
  permittedCommands: { manageDocumentDefinitions: boolean };
  capabilities: DocumentCapabilities;
  options: {
    projects: readonly ProjectOption[];
    members: readonly MemberOption[];
  };
  approval: {
    id: string;
    status: string;
    decision: string | null;
  } | null;
};

export type StageOneUploadQueueItem = ProjectDocumentQueueItem;

export function stageOneQueueMap(
  queues: Readonly<Record<string, StageOneUploadQueueItem[]>>,
  projectId: string,
  targets: readonly {
    definitionId: string;
    workstreamKey: string;
    contextType: ProjectDocumentContext;
    targetType: ProjectDocumentTargetType;
  }[],
) {
  return Object.fromEntries(
    targets.map(({ contextType, definitionId, targetType, workstreamKey }) => {
      const rowKey = `${workstreamKey}:${definitionId}`;
      return [
        rowKey,
        queues[
          projectDocumentQueueKey(
            projectId,
            'STAGE_1',
            workstreamKey,
            definitionId,
            contextType,
            targetType,
          )
        ] ?? [],
      ];
    }),
  );
}

export function removeStageOneTargetQueue(
  queues: Readonly<Record<string, StageOneUploadQueueItem[]>>,
  projectId: string,
  target: Omit<ProjectDocumentQueueContext, 'projectId' | 'stageKey'>,
) {
  const key = projectDocumentQueueKey(
    projectId,
    'STAGE_1',
    target.workstreamKey,
    target.definitionId,
    target.contextType,
    target.targetType,
  );
  return Object.fromEntries(
    Object.entries(queues).filter(([queueKey]) => queueKey !== key),
  );
}

export function stepFromSearchParam(value: string | null): StageOneNumber {
  return value === '2' || value === '3' || value === '4' || value === '5'
    ? (Number(value as '2' | '3' | '4' | '5') as StageOneNumber)
    : 1;
}

export const stageOneStepUrl = (projectId: string, step: StageOneNumber) =>
  `/projects/${projectId}/stage-1?step=${step}`;

export const replaceAfterInitiationUpdate = (
  projectId: string,
  selectedStep: StageOneNumber,
  replace: (url: string) => void,
) => replace(stageOneStepUrl(projectId, selectedStep));

export function documentIdFromHash(hash: string) {
  if (!hash.startsWith('#document-')) return '';
  try {
    return decodeURIComponent(hash.slice('#document-'.length));
  } catch {
    return '';
  }
}

function readableError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403)
      return 'Bạn không có quyền thực hiện thao tác này.';
    if (error.status === 404)
      return 'Không tìm thấy dự án hoặc bước thực hiện.';
    if (error.status === 413) return 'Tệp vượt quá giới hạn dung lượng.';
    if (error.status === 409 && /duplicate|đã được tải/i.test(error.message))
      return 'Tệp này đã được tải lên trước đó.';
    if (error.status === 409)
      return 'Dữ liệu vừa thay đổi. Vui lòng tải lại và thử lại.';
    if (error.status === 400 || error.status === 422)
      return 'Dữ liệu chưa hợp lệ. Vui lòng kiểm tra lại.';
  }
  if (error instanceof Error && error.message === 'Giá trị tiền không hợp lệ.')
    return 'Giá trị dự kiến không hợp lệ.';
  return 'Không thể hoàn tất thao tác. Vui lòng thử lại.';
}

export const loadSimpleStageOne = (projectId: string) =>
  api<SimpleStageOneData>(`/projects/${projectId}/stage-1/simple`);

export const deleteStageOneDocument = (
  projectId: string,
  document: Pick<StageOneDocument, 'id' | 'contextType' | 'source'>,
) =>
  api(
    `/projects/${projectId}/stage-1/documents/${document.id}?${new URLSearchParams({ contextType: document.contextType, source: document.source })}`,
    {
      method: 'DELETE',
    },
  );

export async function loadStageOneCustomers(customerId?: string | null) {
  const result = await api<{ items: CustomerOption[] }>(
    '/customers?pageSize=100&status=ACTIVE&sort=displayName&direction=asc',
  );
  if (!customerId) return result.items;
  const selected = await api<CustomerOption>(`/customers/${customerId}`);
  return [
    selected,
    ...result.items.filter((customer) => customer.id !== selected.id),
  ];
}

export const replaceStageOneCustomer = (
  customers: CustomerOption[],
  selected: CustomerOption,
) =>
  [...customers.filter(({ id }) => id !== selected.id), selected].sort(
    (left, right) => left.displayName.localeCompare(right.displayName, 'vi'),
  );

type ApiRequest = (path: string, init?: RequestInit) => Promise<unknown>;

export function loadStageOneSupportingData(
  customerId: string | null | undefined,
  capabilities: Pick<DocumentCapabilities, 'canUploadDocuments'>,
  handlers: {
    onCustomers: (customers: CustomerOption[]) => void;
    onConstraints: (constraints: UploadConstraints) => void;
    onError: (message: string) => void;
  },
  dependencies: {
    loadCustomers?: typeof loadStageOneCustomers;
    request?: ApiRequest;
  } = {},
) {
  const loadCustomers = dependencies.loadCustomers ?? loadStageOneCustomers;
  const request = dependencies.request ?? api;
  const pending = [
    loadCustomers(customerId)
      .then(handlers.onCustomers)
      .catch(() => handlers.onError('Không thể tải danh sách chủ đầu tư.')),
  ];
  if (capabilities.canUploadDocuments)
    pending.push(
      request('/uploads/constraints')
        .then((value) => handlers.onConstraints(value as UploadConstraints))
        .catch(() => handlers.onError('Không thể tải giới hạn tệp.')),
    );
  return Promise.all(pending);
}

export const loadStageOneCustomer = (
  customerId: string,
  request: ApiRequest = api,
) => request(`/customers/${customerId}`) as Promise<CustomerOption>;

export async function searchStageOneCustomers(
  search: string,
  request: ApiRequest = api,
) {
  const query = new URLSearchParams({
    pageSize: '20',
    status: 'ACTIVE',
    sort: 'displayName',
    direction: 'asc',
    search: search.trim(),
  });
  return (
    (await request(`/customers?${query}`)) as {
      items: CustomerOption[];
    }
  ).items;
}

export async function latestStageOneCustomerSearch(
  search: string,
  generation: number,
  currentGeneration: () => number,
  request: ApiRequest = api,
) {
  const customers = await searchStageOneCustomers(search, request);
  return generation === currentGeneration() ? customers : undefined;
}

export async function loadStageOneDocumentHistory(
  projectId: string,
  document: StageOneDocument,
  request: ApiRequest = api,
): Promise<StageOneDocumentHistory> {
  if (document.source === 'STAGE_ONE')
    return request(
      `/projects/${projectId}/stage-1/documents/${document.id}/history`,
    ) as Promise<StageOneDocumentHistory>;
  const history = (await request(
    `/projects/${projectId}/required-documents/${document.id}/history`,
  )) as {
    current: LegacyHistoryVersion;
    versions: LegacyHistoryVersion[];
  };
  return {
    displayName: document.displayName,
    currentVersion: history.current.version,
    versions: [history.current, ...history.versions]
      .filter(
        (
          version,
        ): version is LegacyHistoryVersion & {
          downloadId: string;
          filename: string;
          timestamp: string;
        } =>
          Boolean(version.downloadId && version.filename && version.timestamp),
      )
      .map((version) => ({
        version: version.version,
        status: version.status,
        createdAt: version.timestamp,
        downloadId: version.downloadId,
        filename: version.filename,
        sizeBytes: '0',
        submittedOfficer: version.uploader ?? version.actor,
      })),
  };
}

type LegacyHistoryVersion = {
  version: number;
  status: string;
  timestamp: string | null;
  downloadId: string | null;
  filename: string | null;
  uploader?: { displayName: string } | null;
  actor?: { displayName: string } | null;
};

export async function updateSimpleStageOne(
  projectId: string,
  values: {
    name: string;
    estimatedInvestmentAmount: string;
    customerId: string;
    primaryContactId?: string;
  },
  idempotencyKey: string,
) {
  const amount = normalizeVietnameseMoney(values.estimatedInvestmentAmount);
  if (!values.name.trim()) throw new Error('Vui lòng nhập tên dự án.');
  if (!amount) throw new Error('Giá trị dự kiến không hợp lệ.');
  if (!values.customerId) throw new Error('Vui lòng chọn khách hàng.');
  if (!idempotencyKey.trim()) throw new Error('Yêu cầu cập nhật không hợp lệ.');
  return api<SimpleStageOneData>(
    `/projects/${projectId}/stage-1/initiate-simple`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        ...values,
        name: values.name.trim(),
        estimatedInvestmentAmount: amount,
        primaryContactId: values.primaryContactId || undefined,
        idempotencyKey: idempotencyKey.trim(),
      }),
    },
  );
}

export type CompleteOptionalStepResult = {
  completed: true;
  nextStep: StageOneNumber | null;
  stageCompleted: boolean;
};

export const completeSimpleStageOneStep = (
  projectId: string,
  step: StageOneStep,
) =>
  api<CompleteOptionalStepResult>(
    `/projects/${projectId}/stage-1/steps/${step}/complete`,
    {
      method: 'POST',
      body: '{}',
    },
  );

export async function applySimpleStageOneCompletion(
  result: CompleteOptionalStepResult,
  projectId: string,
  refresh: () => Promise<void>,
  navigate: (route: string) => void,
) {
  if (result.nextStep) navigate(stageOneStepUrl(projectId, result.nextStep));
  await refresh();
}

function date(value?: string | null) {
  return value
    ? new Intl.DateTimeFormat('vi-VN', {
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(new Date(value))
    : '—';
}

function statusClass(status: string, selected: boolean) {
  if (selected) return 'border-blue-700 bg-blue-700 text-white';
  if (status === 'DONE' || status === 'COMPLETED')
    return 'border-emerald-300 bg-emerald-50 text-emerald-800';
  if (status === 'IN_PROGRESS' || status === 'IN_REVIEW')
    return 'border-blue-300 bg-blue-50 text-blue-800';
  if (status === 'BLOCKED') return 'border-red-300 bg-red-50 text-red-800';
  return 'border-black/10 bg-white text-black/75';
}

export function SimpleStageOneView({
  actor,
  constraints,
  customers,
  data,
  editingInitiation = false,
  highlightedDocumentId,
  matrixUploadingDefinitionId,
  onCompleteStep,
  onDefinitionsChanged,
  onDeleteDocument,
  onCancelEditInitiation,
  onEditInitiation,
  onInvestorCustomerChange,
  onInvestorSearch,
  onMatrixUploadingDefinitionIdChange,
  onNavigate,
  onQueueChange,
  onStaleTarget,
  onUploaded,
  onUpdateInitiation,
  queueByWorkstream = {},
  selectedStep,
  busy = false,
  message = '',
}: {
  actor: Pick<Actor, 'userId' | 'displayName' | 'permissions' | 'organization'>;
  constraints?: UploadConstraints;
  customers: CustomerOption[];
  data: SimpleStageOneData;
  editingInitiation?: boolean;
  highlightedDocumentId?: string;
  matrixUploadingDefinitionId?: string;
  onCompleteStep: () => void;
  onDefinitionsChanged?: () => void | Promise<void>;
  onDeleteDocument?: (document: StageOneDocument) => void | Promise<void>;
  onCancelEditInitiation?: () => void;
  onEditInitiation?: () => void;
  onInvestorCustomerChange?: (
    customerId: string,
  ) => Promise<CustomerOption | undefined>;
  onInvestorSearch?: (search: string) => void;
  onMatrixUploadingDefinitionIdChange?: (
    definitionId: string | undefined,
  ) => void;
  onNavigate: (route: string) => void;
  onQueueChange?: (
    workstreamKey: string,
    definitionId: string,
    contextType: ProjectDocumentContext,
    targetType: ProjectDocumentTargetType,
    update:
      | StageOneUploadQueueItem[]
      | ((current: StageOneUploadQueueItem[]) => StageOneUploadQueueItem[]),
  ) => void;
  onStaleTarget?: (target: ProjectDocumentQueueContext) => void;
  onUploaded?: (document: UploadedProjectDocument) => void | Promise<void>;
  onUpdateInitiation?: (event: React.FormEvent<HTMLFormElement>) => void;
  queueByWorkstream?: Readonly<Record<string, StageOneUploadQueueItem[]>>;
  selectedStep: StageOneNumber;
  busy?: boolean;
  message?: string;
}) {
  const step = data.steps.find(({ number }) => number === selectedStep)!;
  const workflowDefinitions = data.workflow.definitions;
  const stepDefinitions = workflowDefinitions
    .filter(
      ({ active, initialMatrix, workstreamKey }) =>
        active && !initialMatrix && workstreamKey === step.step,
    )
    .map((definition) => ({
      ...definition,
      customNameRequired:
        step.documentTypes.find(({ id }) => id === definition.id)
          ?.customNameRequired ?? false,
    }));
  const [stepDefinitionId, setStepDefinitionId] = useState(
    stepDefinitions[0]?.id ?? '',
  );
  const [customDisplayName, setCustomDisplayName] = useState('');
  const [workflowUploadOpen, setWorkflowUploadOpen] = useState(false);
  const stepDocuments = data.workflow.documents.filter(
    ({ contextType, step: documentStep }) =>
      contextType === 'STAGE_WORKFLOW_STEP_DOCUMENT' &&
      documentStep === step.step,
  );
  const stepDefinition =
    stepDefinitions.find(({ id }) => id === stepDefinitionId) ??
    stepDefinitions[0];
  const [investorSearch, setInvestorSearch] = useState('');
  const [customerId, setCustomerId] = useState(
    data.initiation.customerId ?? '',
  );
  const [contactId, setContactId] = useState(
    data.initiation.primaryContactId ?? '',
  );
  const deleteDialog = useRef<HTMLDialogElement>(null);
  const [deleteDocument, setDeleteDocument] = useState<StageOneDocument>();
  const [deletePending, setDeletePending] = useState(false);
  const requestDelete = (document: StageOneDocument) => {
    setDeleteDocument(document);
    deleteDialog.current?.showModal();
  };
  const selectedCustomer = customers.find(({ id }) => id === customerId);
  const selectedContact = selectedCustomer?.contacts?.find(
    ({ id }) => id === contactId,
  );
  const visibleCustomers = customers.filter(
    (customer) =>
      customer.id === customerId ||
      customer.displayName
        .toLocaleLowerCase('vi')
        .includes(investorSearch.trim().toLocaleLowerCase('vi')),
  );
  const uploadOfficerOptions = actor.permissions.includes(
    'project.manage_members',
  )
    ? data.options.members
    : [{ id: actor.userId, displayName: actor.displayName }];
  const canUpload = data.capabilities.canUploadWorkflowDocuments;
  const matrixDefinitions = data.keyDossier.items
    .filter(({ initialMatrix }) => initialMatrix)
    .map((definition) => ({
      ...definition,
      files: [
        ...definition.files,
        ...data.keyDossier.attachments.filter(
          (document) =>
            document.contextType === 'STAGE_MATRIX_DOCUMENT' &&
            document.legacyRequirementId === definition.id &&
            !definition.files.some(({ id }) => id === document.id),
        ),
      ],
    }));
  const workflowQueue = stepDefinition
    ? (queueByWorkstream[`${step.step}:${stepDefinition.id}`] ?? [])
    : [];
  const workflowUploadBlocksClose =
    projectDocumentQueueBlocksClose(workflowQueue);
  const displayedMessage = message;
  const messageIsSuccess = displayedMessage.startsWith('Đã ');
  return (
    <main className="mx-auto grid w-full max-w-[1280px] min-w-0 grid-cols-[minmax(0,1fr)] gap-4 p-3 sm:p-5">
      <ProjectStageHeader
        activeStage="STAGE_1"
        canManageProjectAccess={data.capabilities.canManageProjectAccess}
        canDeleteProject={data.capabilities.canDeleteProject}
        canSwitchProject={data.capabilities.canSwitchProject}
        onNavigate={onNavigate}
        onProjectDeleted={() => onNavigate('/projects')}
        project={data.project}
        projects={data.options.projects}
      />

      {editingInitiation ? (
        <form
          className="grid gap-4 rounded-lg border bg-white p-4 shadow-sm sm:grid-cols-2 sm:items-start"
          onSubmit={onUpdateInitiation}
        >
          <h2 className="font-bold text-slate-900 sm:col-span-2">
            THÔNG TIN KHỞI TẠO DỰ ÁN
          </h2>
          <label className="grid gap-1 text-sm font-semibold">
            TÊN DỰ ÁN *
            <input
              data-business-input="name"
              defaultValue={data.initiation.name}
              maxLength={200}
              name="name"
              required
            />
          </label>
          {data.capabilities.canManageFinance && (
            <>
              <label className="grid gap-1 text-sm font-semibold">
                GIÁ TRỊ DỰ KIẾN (VND) *
                <input
                  data-business-input="estimated-investment"
                  defaultValue={formatVietnameseMoney(
                    data.initiation.estimatedInvestmentAmount,
                  )}
                  inputMode="decimal"
                  name="estimatedInvestmentAmount"
                  placeholder="35.000.000.000 ₫"
                  required
                />
              </label>
            </>
          )}
          <label className="grid gap-1 text-sm font-semibold">
            KHÁCH HÀNG / ĐẠI DIỆN KHÁCH HÀNG *
            <input
              aria-label="Tìm khách hàng"
              onChange={(event) => {
                setInvestorSearch(event.target.value);
                onInvestorSearch?.(event.target.value);
              }}
              placeholder="Tìm theo tên khách hàng"
              type="search"
              value={investorSearch}
            />
            <select
              aria-label="Khách hàng"
              data-business-input="investor"
              name="customerId"
              onChange={async (event) => {
                const nextCustomerId = event.target.value;
                const nextCustomer = customers.find(
                  ({ id }) => id === nextCustomerId,
                );
                setCustomerId(nextCustomerId);
                setContactId(
                  nextCustomer?.contacts?.find(({ isPrimary }) => isPrimary)
                    ?.id ?? '',
                );
                const detailed =
                  await onInvestorCustomerChange?.(nextCustomerId);
                if (detailed)
                  setContactId(
                    detailed.contacts?.find(({ isPrimary }) => isPrimary)?.id ??
                      '',
                  );
              }}
              required
              value={customerId}
            >
              <option value="">Chọn khách hàng</option>
              {!customers.some(({ id }) => id === customerId) && customerId && (
                <option value={customerId}>Khách hàng hiện tại</option>
              )}
              {visibleCustomers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.displayName}
                </option>
              ))}
            </select>
            {!!selectedCustomer?.contacts?.length && (
              <select
                aria-label="Đại diện chủ đầu tư"
                name="primaryContactId"
                onChange={(event) => setContactId(event.target.value)}
                value={contactId}
              >
                <option value="">Chọn người đại diện</option>
                {selectedCustomer.contacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.displayName}
                  </option>
                ))}
              </select>
            )}
            {selectedContact && (
              <span className="font-normal text-slate-600">
                Đại diện: {selectedContact.displayName}
              </span>
            )}
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <button
              className="rounded bg-blue-700 px-4 py-3 font-bold text-white"
              disabled={busy}
            >
              {busy ? 'Đang lưu…' : 'Lưu thay đổi'}
            </button>
            <button
              className="rounded border px-4 py-3 font-semibold"
              onClick={onCancelEditInitiation}
              type="button"
            >
              Hủy
            </button>
          </div>
        </form>
      ) : (
        <section className="grid gap-3 rounded-xl border bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-bold text-slate-900">
              THÔNG TIN KHỞI TẠO DỰ ÁN
            </h2>
            {data.capabilities.canCompleteStep &&
              data.capabilities.canManageFinance && (
                <button
                  aria-label="Chỉnh sửa thông tin khởi tạo dự án"
                  className="rounded-lg border border-blue-300 px-3 py-2 text-sm font-semibold text-blue-700"
                  onClick={onEditInitiation}
                  type="button"
                >
                  CHỈNH SỬA
                </button>
              )}
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="font-semibold">Tên dự án</dt>
              <dd>{data.initiation.name}</dd>
            </div>
            {data.capabilities.canReadFinance && (
              <>
                <div>
                  <dt className="font-semibold">Giá trị dự kiến (VND)</dt>
                  <dd>
                    {formatVietnameseMoney(
                      data.initiation.estimatedInvestmentAmount,
                    )}
                  </dd>
                </div>
              </>
            )}
            <div>
              <dt className="font-semibold">
                Khách hàng / Đại diện khách hàng
              </dt>
              <dd>{selectedCustomer?.displayName ?? 'Chưa cập nhật'}</dd>
              {selectedContact && <dd>{selectedContact.displayName}</dd>}
            </div>
          </dl>
        </section>
      )}
      {displayedMessage && (
        <p
          className={`text-sm ${messageIsSuccess ? 'text-emerald-700' : 'text-red-700'}`}
          role={messageIsSuccess ? 'status' : 'alert'}
        >
          {displayedMessage}
        </p>
      )}

      <OptionalDocumentMatrix
        actor={actor}
        capabilities={data.capabilities}
        constraints={constraints}
        definitions={matrixDefinitions}
        milestones={data.keyDossier.milestones}
        highlightedDocumentId={highlightedDocumentId}
        officerOptions={uploadOfficerOptions}
        onChanged={() => onDefinitionsChanged?.()}
        onDelete={(file) => {
          const document = data.keyDossier.attachments.find(
            ({ id }) => id === file.id,
          );
          if (document) requestDelete(document);
        }}
        onDeleteItem={async (definition, reason) => {
          await api(
            `/projects/${data.project.id}/stage-1/key-dossier/items/${definition.id}`,
            { method: 'DELETE', body: JSON.stringify({ reason }) },
          );
          await onDefinitionsChanged?.();
        }}
        onQueueChange={(workstreamKey, definitionId, nextQueue) =>
          onQueueChange?.(
            workstreamKey,
            definitionId,
            'STAGE_MATRIX_DOCUMENT',
            'STAGE_DOCUMENT',
            nextQueue,
          )
        }
        onStaleTarget={onStaleTarget}
        onUploadingIdChange={onMatrixUploadingDefinitionIdChange}
        onUploaded={(document) => onUploaded?.(document)}
        projectId={data.project.id}
        queueByWorkstream={queueByWorkstream}
        uploadingId={matrixUploadingDefinitionId}
      />
      {!canUpload && (
        <p className="text-sm text-slate-600">
          Bạn không có quyền tải hồ sơ cho dự án này.
        </p>
      )}

      <section className="rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="font-bold">QUY TRÌNH 5 BƯỚC HỒ SƠ DỰ ÁN</h2>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 md:grid md:grid-cols-5 md:overflow-visible md:pb-0">
          {data.steps.map((item) => (
            <Link
              aria-current={item.number === selectedStep ? 'step' : undefined}
              className={`min-w-44 rounded-lg border p-2.5 md:min-w-0 ${statusClass(
                item.status,
                item.number === selectedStep,
              )}`}
              href={stageOneStepUrl(data.project.id, item.number)}
              key={item.step}
            >
              <span className="block text-xs font-bold">
                BƯỚC {item.number}
              </span>
              <span className="mt-1 block text-sm font-semibold">
                {projectDomainLabel('step', item.step)}
              </span>
              <span className="mt-1 block text-xs">
                {projectDomainLabel('status', item.status)}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-4 rounded-lg border bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-blue-700">
              CHI TIẾT BƯỚC {selectedStep}
            </p>
            <h2 className="font-bold">
              Bước {selectedStep}: {projectDomainLabel('step', step.step)}
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {canUpload && stepDefinition && !workflowUploadOpen && (
              <button
                className="rounded bg-blue-700 px-4 py-2 font-bold text-white"
                onClick={() => setWorkflowUploadOpen(true)}
                type="button"
              >
                + THÊM HỒ SƠ
              </button>
            )}
            {data.capabilities.canCompleteStep && (
              <button
                className="rounded border border-blue-300 px-4 py-2 font-bold text-blue-700"
                disabled={busy}
                onClick={onCompleteStep}
                type="button"
              >
                {selectedStep < 5
                  ? `HOÀN TẤT & CHUYỂN SANG BƯỚC ${selectedStep + 1}`
                  : 'HOÀN TẤT QUY TRÌNH'}
              </button>
            )}
          </div>
        </div>
        <div
          className={`grid gap-4 ${workflowUploadOpen ? 'lg:grid-cols-2' : ''}`}
          id="step-documents"
        >
          {workflowUploadOpen && (
            <section className="grid content-start gap-3 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-bold">THÊM HỒ SƠ</h3>
                {!workflowUploadBlocksClose && (
                  <button
                    onClick={() => setWorkflowUploadOpen(false)}
                    type="button"
                  >
                    Đóng
                  </button>
                )}
              </div>
              {stepDefinition ? (
                <>
                  <label className="grid gap-1 text-sm font-semibold">
                    LOẠI HỒ SƠ
                    <select
                      name="documentType"
                      onChange={(event) => {
                        setStepDefinitionId(event.target.value);
                        setCustomDisplayName('');
                      }}
                      value={stepDefinition.id}
                    >
                      {stepDefinitions.map((definition) => (
                        <option key={definition.id} value={definition.id}>
                          {definition.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {stepDefinition.customNameRequired && (
                    <label className="grid gap-1 text-sm font-semibold">
                      TÊN HỒ SƠ
                      <input
                        aria-label="Tên hồ sơ"
                        autoComplete="off"
                        maxLength={200}
                        name="documentName"
                        onChange={(event) =>
                          setCustomDisplayName(event.target.value)
                        }
                        required
                        value={customDisplayName}
                      />
                    </label>
                  )}
                  {canUpload && (
                    <ProjectDocumentUploadQueue
                      actor={{
                        id: actor.userId,
                        displayName: actor.displayName,
                        organizationId: actor.organization.id,
                      }}
                      constraints={constraints}
                      contextType="STAGE_WORKFLOW_STEP_DOCUMENT"
                      definition={stepDefinition}
                      displayName={
                        stepDefinition.customNameRequired
                          ? customDisplayName
                          : undefined
                      }
                      officerOptions={uploadOfficerOptions}
                      onQueueChange={(queue) =>
                        onQueueChange?.(
                          step.step,
                          stepDefinition.id,
                          'STAGE_WORKFLOW_STEP_DOCUMENT',
                          'STAGE_DOCUMENT',
                          queue,
                        )
                      }
                      onStaleTarget={(target) => {
                        setWorkflowUploadOpen(false);
                        onStaleTarget?.(target);
                      }}
                      onUploaded={(document) => onUploaded?.(document)}
                      projectId={data.project.id}
                      queue={workflowQueue}
                      stageKey="STAGE_1"
                      targetType="STAGE_DOCUMENT"
                      workstreamKey={step.step}
                    />
                  )}
                </>
              ) : (
                <p className="text-sm text-slate-600">
                  Chưa có loại hồ sơ hoạt động cho Bước này.
                </p>
              )}
            </section>
          )}
          <section className="grid content-start gap-3 rounded-lg border p-3">
            <h3 className="font-bold">
              DANH SÁCH HỒ SƠ ĐÃ NỘP — BƯỚC {selectedStep}
            </h3>
            <div className="overflow-x-auto">
              <table
                className="block min-w-full text-[13px] md:table md:table-fixed"
                data-document-list={step.step}
              >
                <thead className="hidden md:table-header-group">
                  <tr>
                    <th scope="col">TÊN HỒ SƠ</th>
                    <th scope="col">TỆP</th>
                    <th scope="col">NGƯỜI NỘP</th>
                    <th scope="col">NGÀY NỘP</th>
                    <th scope="col">TRẠNG THÁI</th>
                    <th scope="col">THAO TÁC</th>
                  </tr>
                </thead>
                <tbody className="grid gap-2 md:table-row-group">
                  {stepDocuments.length ? (
                    stepDocuments.map((document) => (
                      <tr
                        className="grid grid-cols-2 gap-2 rounded border p-3 md:table-row md:rounded-none md:border-x-0 md:border-b-0 md:p-0"
                        key={`${document.source}:${document.id}`}
                      >
                        <td
                          className="col-span-2 p-0 font-semibold md:table-cell md:truncate md:px-3 md:py-3.5 md:pr-2"
                          title={document.displayName}
                        >
                          <span className="mr-1 font-semibold md:hidden">
                            Hồ sơ:
                          </span>
                          {document.displayName}
                        </td>
                        <td className="col-span-2 min-w-0 p-0 md:table-cell md:px-3 md:py-3.5 md:pr-2">
                          <span className="mr-1 font-semibold md:hidden">
                            Tệp:
                          </span>
                          <span
                            className="block truncate"
                            title={document.currentFileAsset?.originalFilename}
                          >
                            {document.currentFileAsset?.originalFilename ??
                              document.displayName}
                          </span>
                        </td>
                        <td className="p-0 md:table-cell md:px-3 md:py-3.5 md:pr-2">
                          <span className="mr-1 font-semibold md:hidden">
                            Người nộp:
                          </span>
                          {document.submittedOfficer?.displayName ?? '—'}
                        </td>
                        <td className="p-0 whitespace-normal md:table-cell md:whitespace-nowrap md:px-3 md:py-3.5 md:pr-2">
                          <span className="mr-1 font-semibold md:hidden">
                            Ngày nộp:
                          </span>
                          {date(document.submittedAt ?? document.createdAt)}
                        </td>
                        <td className="p-0 md:table-cell md:px-3 md:py-3.5 md:pr-2">
                          <span className="mr-1 font-semibold md:hidden">
                            Trạng thái:
                          </span>
                          {projectDomainLabel('status', document.status)}
                        </td>
                        <td className="p-0 md:table-cell md:px-3 md:py-3.5">
                          <div className="flex flex-wrap items-center gap-2 whitespace-nowrap">
                            {data.capabilities.canPreviewFiles &&
                              document.currentFileAssetId &&
                              isPreviewableProjectFile(
                                document.currentFileAsset?.mimeType,
                              ) && (
                                <a
                                  className="font-semibold text-blue-700"
                                  href={`${apiUrl}/files/${document.currentFileAssetId}/preview`}
                                  rel="noreferrer"
                                  target="_blank"
                                >
                                  Xem
                                </a>
                              )}
                            {data.capabilities.canDownloadFiles &&
                              document.currentFileAssetId && (
                                <a
                                  className="font-semibold text-blue-700"
                                  href={`${apiUrl}/files/${document.currentFileAssetId}/download`}
                                >
                                  Tải xuống
                                </a>
                              )}
                            {data.capabilities.canDeleteProjectDocuments &&
                              onDeleteDocument && (
                                <button
                                  className="border-0 p-0 font-semibold text-red-700"
                                  onClick={() => requestDelete(document)}
                                  type="button"
                                >
                                  Xóa
                                </button>
                              )}
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="text-sm text-slate-600" colSpan={6}>
                        Chưa có hồ sơ nào được nộp cho Bước {selectedStep}.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
        <dialog
          aria-labelledby="delete-project-document-title"
          className="w-[min(28rem,calc(100%-2rem))] rounded-xl border border-slate-200 p-0 shadow-xl backdrop:bg-black/30"
          ref={deleteDialog}
        >
          <form
            className="grid gap-4 p-5"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!deleteDocument || !onDeleteDocument) return;
              setDeletePending(true);
              try {
                await onDeleteDocument(deleteDocument);
                deleteDialog.current?.close();
                setDeleteDocument(undefined);
              } finally {
                setDeletePending(false);
              }
            }}
          >
            <div>
              <h3 className="font-bold" id="delete-project-document-title">
                XÓA TỆP ĐÍNH KÈM?
              </h3>
              <p className="mt-2 break-words font-semibold">
                {deleteDocument?.currentFileAsset?.originalFilename ??
                  deleteDocument?.displayName}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Chỉ gỡ liên kết tệp này; không xóa mục hồ sơ.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                className="rounded border border-slate-300 px-3 py-2 font-semibold"
                disabled={deletePending}
                onClick={() => deleteDialog.current?.close()}
                type="button"
              >
                HỦY
              </button>
              <button
                className="rounded bg-red-700 px-3 py-2 font-semibold text-white"
                disabled={deletePending}
                type="submit"
              >
                XÓA
              </button>
            </div>
          </form>
        </dialog>
      </section>
    </main>
  );
}

export type StageOneProject = {
  id: string;
  projectManagerId?: string | null;
  projectManager?: { id: string; displayName: string } | null;
  members: {
    userId: string;
    role?: string;
    user: { id: string; displayName: string; email?: string; status: string };
  }[];
  projectOwner?: { id: string; displayName: string } | null;
  departments?: {
    departmentId: string;
    department: { code: string; name: string };
  }[];
};

export const addProjectMember = (
  projectId: string,
  userId: string,
  role: string,
) =>
  api(`/projects/${projectId}/members`, {
    method: 'POST',
    body: JSON.stringify({ userId, role }),
  });
export const removeProjectMember = (projectId: string, userId: string) =>
  api(`/projects/${projectId}/members/${userId}`, { method: 'DELETE' });
export const changeProjectManager = (
  projectId: string,
  projectManagerId: string,
) =>
  api(`/projects/${projectId}`, {
    method: 'PATCH',
    body: JSON.stringify({ projectManagerId }),
  });
export const projectMemberSearchPath = (search: string) =>
  `/users?${new URLSearchParams({
    pageSize: '20',
    status: 'active',
    membershipStatus: 'active',
    search: search.trim(),
  })}`;

export function ProjectMembersDialog({
  actor,
  onClose,
  onMutate,
  open,
  project,
}: {
  actor: Pick<Actor, 'permissions'>;
  onClose: () => void;
  onMutate: (action: () => Promise<unknown>) => Promise<unknown>;
  open: boolean;
  project: StageOneProject;
}) {
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<
    { userId: string; displayName: string; email: string }[]
  >([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    if (!open && dialog.current?.open) dialog.current.close();
  }, [open]);
  if (!open) return null;
  const canManage = actor.permissions.includes('project.manage_members');
  const canUpdate = actor.permissions.includes('project.update');
  const canReadUsers = actor.permissions.includes('user.read');
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setMessage('');
    try {
      await onMutate(action);
    } catch (error) {
      setMessage(readableError(error));
    } finally {
      setBusy(false);
    }
  };
  const searchUsers = async (value: string) => {
    setSearch(value);
    if (!canReadUsers || !value.trim()) {
      setUsers([]);
      return;
    }
    try {
      const result = await api<{
        items: { userId: string; displayName: string; email: string }[];
      }>(projectMemberSearchPath(value));
      setUsers(result.items);
    } catch {
      setUsers([]);
    }
  };
  return (
    <dialog
      aria-labelledby="project-members-title"
      className="w-full max-w-3xl rounded border p-5"
      onClose={onClose}
      ref={dialog}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-bold" id="project-members-title">
          THÀNH VIÊN &amp; PHÂN QUYỀN DỰ ÁN
        </h2>
        <button onClick={() => dialog.current?.close()} type="button">
          Đóng
        </button>
      </div>
      {message && (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {message}
        </p>
      )}
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt>Chủ dự án / Giám đốc dự án</dt>
          <dd>{project.projectOwner?.displayName ?? '—'}</dd>
        </div>
        <div>
          <dt>Quản lý dự án</dt>
          <dd>{project.projectManager?.displayName ?? 'Chưa gán'}</dd>
        </div>
        <div>
          <dt>Phòng ban</dt>
          <dd>
            {project.departments
              ?.map(({ department }) => department.name)
              .join(', ') || '—'}
          </dd>
        </div>
        <div>
          <dt>Tóm tắt quyền</dt>
          <dd>
            Quyền tài chính hiện tại:{' '}
            {actor.permissions.includes('project.stage1.finance.manage')
              ? 'xem và quản lý'
              : actor.permissions.includes('project.stage1.finance.read')
                ? 'xem'
                : 'không hiển thị'}
          </dd>
        </div>
      </dl>
      {canUpdate && (
        <label className="mt-4 grid gap-1 text-sm">
          Quản lý dự án
          <select
            defaultValue={project.projectManagerId ?? ''}
            disabled={busy}
            onChange={(event) =>
              void run(() =>
                changeProjectManager(project.id, event.target.value),
              )
            }
          >
            {project.members
              .filter(({ user }) => user.status.toLowerCase() === 'active')
              .map(({ user }) => (
                <option key={user.id} value={user.id}>
                  {user.displayName}
                </option>
              ))}
          </select>
        </label>
      )}
      <ul className="mt-4 divide-y">
        {project.members.map((member) => (
          <li
            className="flex items-center justify-between gap-2 py-2"
            key={member.userId}
          >
            <span>
              {member.user.displayName} · {member.user.email ?? member.userId}
            </span>
            {canManage && (
              <button
                disabled={busy}
                onClick={() =>
                  void run(() => removeProjectMember(project.id, member.userId))
                }
                type="button"
              >
                Xóa
              </button>
            )}
          </li>
        ))}
      </ul>
      {canManage && canReadUsers && (
        <form
          className="mt-4 grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const values = new FormData(event.currentTarget);
            void run(() =>
              addProjectMember(
                project.id,
                String(values.get('userId') ?? ''),
                String(values.get('role') ?? ''),
              ),
            );
          }}
        >
          <label>
            Tìm người dùng đang hoạt động
            <input
              onChange={(event) => void searchUsers(event.target.value)}
              value={search}
            />
          </label>
          <label>
            Người dùng
            <select name="userId" required defaultValue="">
              <option value="">Chọn người dùng</option>
              {users.map((user) => (
                <option key={user.userId} value={user.userId}>
                  {user.displayName} · {user.email}
                </option>
              ))}
            </select>
          </label>
          <label>
            Nhãn vai trò
            <input name="role" />
          </label>
          <button>Thêm thành viên</button>
        </form>
      )}
    </dialog>
  );
}

export const loadProjectMembersWorkspace = async (projectId: string) => {
  const [project, actor] = await Promise.all([
    api<StageOneProject>(`/projects/${projectId}`),
    api<Actor>('/me'),
  ]);
  return { project, actor };
};

export function ProjectMembersWorkspace({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [data, setData] = useState<{
    project: StageOneProject;
    actor: Actor;
  }>();
  const [message, setMessage] = useState('');
  const load = useCallback(async () => {
    try {
      setData(await loadProjectMembersWorkspace(projectId));
      setMessage('');
    } catch (error) {
      setMessage(readableError(error));
    }
  }, [projectId]);
  // Loading is the external synchronization performed by this effect.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => void load(), [load]);
  if (!data)
    return (
      <p role={message ? 'alert' : 'status'}>
        {message || 'Đang tải phân quyền dự án…'}
      </p>
    );
  return (
    <ProjectMembersDialog
      actor={data.actor}
      onClose={() =>
        router.push(
          `/projects/${projectId}/stage-1?step=1#project-permissions-action`,
        )
      }
      onMutate={async (action) => {
        const result = await action();
        await load();
        return result;
      }}
      open
      project={data.project}
    />
  );
}

export function ProjectFilesWorkspace({ projectId }: { projectId: string }) {
  const [actor, setActor] = useState<Actor>();
  const [message, setMessage] = useState('');
  const [projectName, setProjectName] = useState('Dự án');
  useEffect(() => {
    const controller = new AbortController();
    void api<{ project: { name: string } }>(
      `/projects/${projectId}/workspace-summary`,
      { signal: controller.signal },
    )
      .then((p) => {
        if (!controller.signal.aborted) setProjectName(p.project.name);
      })
      .catch(() => undefined);
    void api<Actor>('/me', { signal: controller.signal })
      .then(setActor)
      .catch((error) => setMessage(readableError(error)));
    return () => controller.abort();
  }, [projectId]);
  if (!actor)
    return (
      <p role={message ? 'alert' : 'status'}>
        {message || 'Đang tải tệp dự án…'}
      </p>
    );
  return (
    <main className="grid gap-5">
      <ProjectWorkspaceHeader
        projectId={projectId}
        active="files"
        name={projectName}
        permissions={actor.permissions}
      />
      <EntityFiles
        entityId={projectId}
        entityType="Project"
        permissions={actor.permissions}
      />
    </main>
  );
}

export function ProjectActivityWorkspace({ projectId }: { projectId: string }) {
  return (
    <main className="grid gap-4 p-5">
      <Link href={`/projects/${projectId}/stage-1?step=1`}>
        Quay lại Giai đoạn 1
      </Link>
      <EntityActivity entityId={projectId} entityType="Project" />
    </main>
  );
}

export function StageOneLoadState({
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
      Đang tải Giai đoạn 1…
    </p>
  );
}

export function ProjectStageOne({ projectId }: { projectId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedStep = stepFromSearchParam(searchParams.get('step'));
  const [highlightedDocumentId, setHighlightedDocumentId] = useState('');
  const [data, setData] = useState<SimpleStageOneData>();
  const [actor, setActor] = useState<Actor>();
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [constraints, setConstraints] = useState<UploadConstraints>();
  const [matrixQueues, setMatrixQueues] = useState<
    Record<string, StageOneUploadQueueItem[]>
  >({});
  const [workflowQueues, setWorkflowQueues] = useState<
    Record<string, StageOneUploadQueueItem[]>
  >({});
  const [editingInitiation, setEditingInitiation] = useState(false);
  const [matrixUploadingDefinitionId, setMatrixUploadingDefinitionId] =
    useState<string>();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  const loadSequence = useRef(0);
  const investorSearchGeneration = useRef(0);
  const initiationUpdateKey = useRef<string | null>(null);
  const recoveredMatrixProject = useRef('');
  const recoveredWorkflowProject = useRef('');
  const retryingBatches = useRef(new Set<string>());
  const setContextQueues = useCallback(
    (
      contextType: ProjectDocumentContext,
      update: React.SetStateAction<Record<string, StageOneUploadQueueItem[]>>,
    ) =>
      (contextType === 'STAGE_MATRIX_DOCUMENT'
        ? setMatrixQueues
        : setWorkflowQueues)(update),
    [],
  );

  useEffect(() => {
    const update = () =>
      setHighlightedDocumentId(documentIdFromHash(location.hash));
    update();
    addEventListener('hashchange', update);
    return () => removeEventListener('hashchange', update);
  }, []);

  useEffect(() => {
    if (!data || !highlightedDocumentId) return;
    document
      .getElementById(`document-${highlightedDocumentId}`)
      ?.scrollIntoView({ block: 'center' });
  }, [data, highlightedDocumentId]);

  useEffect(() => {
    if (data && location.hash === '#project-permissions-action')
      document.getElementById('project-permissions-action')?.focus();
  }, [data]);

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    let result: [SimpleStageOneData, Actor];
    try {
      result = await Promise.all([
        loadSimpleStageOne(projectId),
        api<Actor>('/me'),
      ]);
    } catch (error) {
      if (mounted.current && sequence === loadSequence.current) throw error;
      return;
    }
    if (!mounted.current || sequence !== loadSequence.current) return;
    const [nextData, nextActor] = result;
    setData(nextData);
    setActor(nextActor);
    void loadStageOneSupportingData(
      nextData.initiation.customerId,
      nextData.capabilities,
      {
        onCustomers: (nextCustomers) => {
          if (mounted.current && sequence === loadSequence.current)
            setCustomers(nextCustomers);
        },
        onConstraints: (nextConstraints) => {
          if (mounted.current && sequence === loadSequence.current)
            setConstraints(nextConstraints);
        },
        onError: (nextMessage) => {
          if (mounted.current && sequence === loadSequence.current)
            setMessage(nextMessage);
        },
      },
    );
  }, [projectId]);

  useEffect(() => {
    mounted.current = true;
    queueMicrotask(
      () =>
        void load().catch((error) => {
          if (mounted.current) setMessage(readableError(error));
        }),
    );
    return () => {
      mounted.current = false;
    };
  }, [load]);

  useEffect(() => {
    let current = true;
    const isCurrent = () => current && mounted.current;
    if (
      !data ||
      data.project.id !== projectId ||
      !actor ||
      (!data.capabilities.canUploadWorkflowDocuments &&
        !data.capabilities.canUploadKeyDossierAttachments)
    )
      return () => {
        current = false;
      };
    const target = {
      projectId,
      definitions: [
        ...data.keyDossier.items.map((definition) => ({
          ...definition,
          contextType: 'STAGE_MATRIX_DOCUMENT' as const,
          targetType: 'STAGE_DOCUMENT' as const,
        })),
        ...data.workflow.definitions.map((definition) => ({
          ...definition,
          contextType: 'STAGE_WORKFLOW_STEP_DOCUMENT' as const,
          targetType: 'STAGE_DOCUMENT' as const,
        })),
      ],
    };
    const pendingBatches = target.definitions.flatMap((definition) => {
      const batch = readProjectDocumentPendingBatch(sessionStorage, {
        projectId,
        stageKey: 'STAGE_1',
        workstreamKey: definition.workstreamKey,
        definitionId: definition.id,
        contextType: definition.contextType,
        targetType: definition.targetType,
        actorUserId: actor.userId,
        organizationId: actor.organization.id,
      });
      return batch ? [batch] : [];
    });
    for (const batch of pendingBatches)
      queueMicrotask(() => {
        if (!isCurrent()) return;
        setContextQueues(batch.contextType, (current) => {
          const next = { ...current };
          const key = projectDocumentQueueKey(
            batch.projectId,
            batch.stageKey,
            batch.workstreamKey,
            batch.definitionId,
            batch.contextType,
            batch.targetType,
          );
          next[key] = mergeProjectDocumentQueue(
            current[key] ?? [],
            projectDocumentPendingBatchItems(batch, 'SUBMITTING'),
          );
          return next;
        });
      });
    const recoveryTargets = [
      {
        guard: recoveredMatrixProject,
        definitions: target.definitions.filter(
          ({ contextType }) => contextType === 'STAGE_MATRIX_DOCUMENT',
        ),
      },
      {
        guard: recoveredWorkflowProject,
        definitions: target.definitions.filter(
          ({ contextType }) => contextType === 'STAGE_WORKFLOW_STEP_DOCUMENT',
        ),
      },
    ].filter(({ definitions }) => definitions.length);
    const recovery: Promise<Record<string, StageOneUploadQueueItem[]>> =
      Promise.all(
        recoveryTargets.map(({ definitions, guard }) =>
          recoverProjectDocumentQueuesOnce(guard, {
            projectId,
            definitions,
          }),
        ),
      )
        .then(
          (parts) =>
            Object.assign({}, ...parts) as Record<
              string,
              StageOneUploadQueueItem[]
            >,
        )
        .then((recovered) => {
          if (isCurrent()) {
            const mergeContext = (contextType: ProjectDocumentContext) =>
              setContextQueues(contextType, (current) => {
                const next = { ...current };
                for (const [key, items] of Object.entries(recovered))
                  if (items[0]?.contextType === contextType)
                    next[key] = mergeProjectDocumentQueue(
                      next[key] ?? [],
                      items,
                    );
                for (const batch of pendingBatches.filter(
                  (batch) => batch.contextType === contextType,
                )) {
                  const key = projectDocumentQueueKey(
                    batch.projectId,
                    batch.stageKey,
                    batch.workstreamKey,
                    batch.definitionId,
                    batch.contextType,
                    batch.targetType,
                  );
                  next[key] = mergeProjectDocumentQueue(
                    next[key] ?? [],
                    projectDocumentPendingBatchItems(batch, 'SUBMITTING'),
                  );
                }
                return next;
              });
            mergeContext('STAGE_MATRIX_DOCUMENT');
            mergeContext('STAGE_WORKFLOW_STEP_DOCUMENT');
          }
          return recovered;
        })
        .catch(() => {
          if (isCurrent()) setMessage('Không thể khôi phục các tệp tải tạm.');
          return {};
        });
    for (const batch of pendingBatches) {
      if (retryingBatches.current.has(batch.batchKey)) continue;
      retryingBatches.current.add(batch.batchKey);
      let retryBatch = batch;
      const originalSessionIds = new Set(batch.sessionIds);
      void recovery
        .then(async (recovered) => {
          const recoveredIds = Object.values(recovered).flatMap((items) =>
            items.flatMap(({ sessionId }) => (sessionId ? [sessionId] : [])),
          );
          const reconciled = await reconcileProjectDocumentPendingBatch(
            sessionStorage,
            batch,
            recoveredIds,
            api,
          );
          const key = projectDocumentQueueKey(
            batch.projectId,
            batch.stageKey,
            batch.workstreamKey,
            batch.definitionId,
            batch.contextType,
            batch.targetType,
          );
          if (!reconciled.batch) {
            if (isCurrent())
              setContextQueues(batch.contextType, (current) => ({
                ...current,
                [key]: (current[key] ?? []).filter(
                  ({ sessionId }) =>
                    !sessionId || !originalSessionIds.has(sessionId),
                ),
              }));
            return null;
          }
          retryBatch = reconciled.batch;
          if (reconciled.error) {
            if (isCurrent())
              setContextQueues(batch.contextType, (current) => ({
                ...current,
                [key]: [
                  ...(current[key] ?? []).filter(
                    ({ sessionId }) =>
                      !sessionId || !originalSessionIds.has(sessionId),
                  ),
                  ...projectDocumentPendingBatchItems(reconciled.batch!).map(
                    (item) => ({
                      ...item,
                      error: `${item.filename}: ${reconciled.error}`,
                    }),
                  ),
                ],
              }));
            return null;
          }
          if (isCurrent())
            setContextQueues(batch.contextType, (current) => ({
              ...current,
              [key]: [
                ...(current[key] ?? []).filter(
                  ({ sessionId }) =>
                    !sessionId || !originalSessionIds.has(sessionId),
                ),
                ...projectDocumentPendingBatchItems(
                  reconciled.batch!,
                  'SUBMITTING',
                ),
              ],
            }));
          await retryProjectDocumentPendingBatch(
            sessionStorage,
            reconciled.batch,
            api,
            async () => load(),
          );
          return { key };
        })
        .then((result) => {
          if (!isCurrent() || !result) return;
          setContextQueues(batch.contextType, (current) => ({
            ...current,
            [result.key]: (current[result.key] ?? []).filter(
              ({ sessionId }) =>
                !sessionId || !originalSessionIds.has(sessionId),
            ),
          }));
        })
        .catch((error) => {
          if (!isCurrent()) return;
          const message =
            error instanceof Error
              ? error.message
              : 'Không thể nộp hồ sơ. Vui lòng thử lại.';
          const key = projectDocumentQueueKey(
            batch.projectId,
            batch.stageKey,
            batch.workstreamKey,
            batch.definitionId,
            batch.contextType,
            batch.targetType,
          );
          setContextQueues(batch.contextType, (current) => ({
            ...current,
            [key]: [
              ...(current[key] ?? []).filter(
                ({ sessionId }) =>
                  !sessionId || !originalSessionIds.has(sessionId),
              ),
              ...projectDocumentPendingBatchItems(retryBatch).map((item) => ({
                ...item,
                error: `${item.filename}: ${message}`,
              })),
            ],
          }));
        })
        .finally(() => retryingBatches.current.delete(batch.batchKey));
    }
    return () => {
      current = false;
    };
  }, [actor, data, load, projectId, setContextQueues]);

  const step = data?.steps.find(({ number }) => number === selectedStep);
  const stageQueues = stageOneQueueMap(
    { ...matrixQueues, ...workflowQueues },
    projectId,
    data
      ? [
          ...data.keyDossier.items.map(({ id, workstreamKey }) => ({
            definitionId: id,
            workstreamKey,
            contextType: 'STAGE_MATRIX_DOCUMENT' as const,
            targetType: 'STAGE_DOCUMENT' as const,
          })),
          ...data.workflow.definitions.map(({ id, workstreamKey }) => ({
            definitionId: id,
            workstreamKey,
            contextType: 'STAGE_WORKFLOW_STEP_DOCUMENT' as const,
            targetType: 'STAGE_DOCUMENT' as const,
          })),
        ]
      : [],
  );

  const selectInvestorCustomer = async (customerId: string) => {
    if (!customerId) return undefined;
    try {
      const selected = await loadStageOneCustomer(customerId);
      setCustomers((current) => replaceStageOneCustomer(current, selected));
      return selected;
    } catch (error) {
      setMessage(readableError(error));
      return undefined;
    }
  };

  const searchInvestors = async (search: string) => {
    if (!search.trim()) return;
    const generation = ++investorSearchGeneration.current;
    try {
      const found = await latestStageOneCustomerSearch(
        search,
        generation,
        () => investorSearchGeneration.current,
      );
      if (!found) return;
      const currentCustomerId = data?.initiation.customerId;
      setCustomers((current) => {
        const selected = current.find(({ id }) => id === currentCustomerId);
        return selected
          ? [selected, ...found.filter(({ id }) => id !== selected.id)]
          : found;
      });
    } catch (error) {
      setMessage(readableError(error));
    }
  };

  const updateInitiation = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!data) return;
    const values = new FormData(event.currentTarget);
    setBusy(true);
    setMessage('');
    try {
      const next = await updateSimpleStageOne(
        projectId,
        {
          name: String(values.get('name') ?? ''),
          estimatedInvestmentAmount: String(
            values.get('estimatedInvestmentAmount') ?? '',
          ),
          customerId: String(values.get('customerId') ?? ''),
          primaryContactId:
            String(values.get('primaryContactId') ?? '') || undefined,
        },
        (initiationUpdateKey.current ??= createCommandKey()),
      );
      initiationUpdateKey.current = createCommandKey();
      setData(next);
      setEditingInitiation(false);
      setMessage('Đã lưu thông tin khởi tạo dự án.');
      replaceAfterInitiationUpdate(projectId, selectedStep, router.replace);
    } catch (error) {
      setMessage(readableError(error));
    } finally {
      setBusy(false);
    }
  };

  const complete = async () => {
    if (!step) return;
    setBusy(true);
    setMessage('');
    try {
      const result = await completeSimpleStageOneStep(projectId, step.step);
      await applySimpleStageOneCompletion(result, projectId, load, (route) =>
        router.push(route),
      );
    } catch (error) {
      setMessage(readableError(error));
    } finally {
      setBusy(false);
    }
  };

  if (!data || data.project.id !== projectId || !actor)
    return (
      <StageOneLoadState
        error={message}
        onRetry={
          message
            ? () => {
                setMessage('');
                void load().catch((error) => {
                  if (mounted.current) setMessage(readableError(error));
                });
              }
            : undefined
        }
      />
    );
  return (
    <SimpleStageOneView
      actor={actor}
      busy={busy}
      constraints={constraints}
      customers={customers}
      data={data}
      key={`${data.project.id}:${selectedStep}`}
      editingInitiation={editingInitiation}
      highlightedDocumentId={highlightedDocumentId}
      matrixUploadingDefinitionId={matrixUploadingDefinitionId}
      message={message}
      onCompleteStep={() => void complete()}
      onCancelEditInitiation={() => setEditingInitiation(false)}
      onDefinitionsChanged={load}
      onDeleteDocument={async (document) => {
        setMessage('');
        try {
          await deleteStageOneDocument(projectId, document);
          await load();
          setMessage('Đã xóa hồ sơ khỏi dự án.');
        } catch (error) {
          setMessage(readableError(error));
          throw error;
        }
      }}
      onEditInitiation={() => setEditingInitiation(true)}
      onInvestorCustomerChange={selectInvestorCustomer}
      onInvestorSearch={(search) => void searchInvestors(search)}
      onMatrixUploadingDefinitionIdChange={setMatrixUploadingDefinitionId}
      onNavigate={(route) => router.push(route)}
      onQueueChange={(
        workstreamKey,
        definitionId,
        contextType,
        targetType,
        update,
      ) =>
        setContextQueues(contextType, (current) => {
          const key = projectDocumentQueueKey(
            projectId,
            'STAGE_1',
            workstreamKey,
            definitionId,
            contextType,
            targetType,
          );
          return {
            ...current,
            [key]:
              typeof update === 'function'
                ? update(current[key] ?? [])
                : update,
          };
        })
      }
      onStaleTarget={(target) => {
        setContextQueues(target.contextType, (current) =>
          removeStageOneTargetQueue(current, projectId, target),
        );
        if (target.contextType === 'STAGE_MATRIX_DOCUMENT')
          setMatrixUploadingDefinitionId(undefined);
        setMessage(
          'Dự án hoặc mục/loại hồ sơ đã bị xóa hoặc không còn khả dụng. Danh sách đã được cập nhật; vui lòng mở lại và thử lại.',
        );
        void load().catch((error) => {
          if (mounted.current) setMessage(readableError(error));
        });
      }}
      onUploaded={async () => {
        try {
          await load();
        } catch (error) {
          setMessage(readableError(error));
          throw error;
        }
      }}
      onUpdateInitiation={(event) => void updateInitiation(event)}
      queueByWorkstream={stageQueues}
      selectedStep={selectedStep}
    />
  );
}
