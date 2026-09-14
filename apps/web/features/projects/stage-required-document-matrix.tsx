'use client';

import React, {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { api, apiUrl } from '../../app/lib/api';
import {
  documentActions,
  documentStatusClass,
} from '../../app/projects/[projectId]/documents/document-ui';
import { ProjectContextDocuments } from './project-context-documents';
import type { ProjectDocumentStageKey } from './project-document-upload-queue';
import { projectDomainLabel } from './project-domain-labels';

export type RequiredDocument = {
  id: string;
  documentName: string;
  documentType: string;
  stageKey: ProjectDocumentStageKey;
  workstreamKey: string;
  required: boolean;
  status: string;
  currentVersion: number;
  completionPolicy: 'FILE_PRESENT' | 'APPROVED';
  dueDate: string | null;
  updatedAt: string;
  ownerUserId?: string | null;
  owner: { id?: string; displayName: string } | null;
  currentFile: { id: string; originalFilename: string } | null;
  notApplicableReason?: string | null;
};

export type RequiredDocumentPage = {
  items: RequiredDocument[];
  page: number;
  totalPages: number;
  total: number;
};

type HistoryActor = { displayName: string } | null;
export type RequiredDocumentHistory = {
  current: {
    downloadId: string | null;
    filename: string | null;
    version: number;
    status: string;
    note: string | null;
    uploader: HistoryActor;
    timestamp: string | null;
    approval: { actor: HistoryActor; timestamp: string } | null;
  };
  versions: {
    id: string;
    downloadId: string | null;
    filename: string | null;
    version: number;
    actor: HistoryActor;
    timestamp: string;
    status: string;
  }[];
};

type ProjectMember = { userId: string; user: { displayName: string } };
type RemoteDocumentPage = { key: string; data: RequiredDocumentPage };
type DialogAction =
  | { type: 'open'; document: RequiredDocument }
  | { type: 'close' };

const groups = [
  {
    label: 'Khởi tạo dự án',
    steps: ['ASSIGNMENT'],
    types: ['PROJECT_DOSSIER', 'RESPONSIBILITY_MATRIX'],
  },
  {
    label: 'Khảo sát',
    steps: ['SURVEY'],
    types: ['SURVEY_REPORT', 'SITE_CONSTRAINTS'],
  },
  {
    label: 'Phạm vi & kế hoạch',
    steps: ['PROPOSAL'],
    types: [
      'SCOPE_STATEMENT',
      'PROPOSAL',
      'PROPOSAL_MILESTONES',
      'PROPOSAL_WBS',
      'RISK_REGISTER',
      'RESOURCE_PLAN',
    ],
  },
  {
    label: 'Tài chính',
    steps: ['FINANCIAL_PLANNING'],
    types: ['PRELIMINARY_FINANCIAL_PLAN'],
  },
  {
    label: 'Phê duyệt khởi động',
    steps: ['KICKOFF_APPROVAL'],
    types: ['KICKOFF_APPROVAL'],
  },
] as const;

function completionLabel(policy: RequiredDocument['completionPolicy']) {
  return policy === 'APPROVED' ? 'Cần phê duyệt' : 'Cần tệp hiện hành';
}

function documentDisplayComplete(document: RequiredDocument) {
  return (
    document.status === 'NOT_APPLICABLE' ||
    (document.completionPolicy === 'APPROVED'
      ? document.status === 'APPROVED'
      : Boolean(document.currentFile) &&
        [
          'DRAFT',
          'UPLOADED',
          'PENDING_REVIEW',
          'UNDER_REVIEW',
          'APPROVED',
        ].includes(document.status))
  );
}

function groupedDocuments(items: RequiredDocument[]) {
  const grouped = groups
    .map((group, index) => ({
      ...group,
      items: items.filter((item) => {
        const matched = groups.findIndex(
          (candidate) =>
            candidate.types.some((type) => type === item.documentType) ||
            candidate.steps.some((step) => step === item.workstreamKey),
        );
        return matched === index;
      }),
    }))
    .filter((group) => group.items.length);
  const unmatched = items.filter(
    (item) =>
      !groups.some(
        (group) =>
          group.types.some((type) => type === item.documentType) ||
          group.steps.some((step) => step === item.workstreamKey),
      ),
  );
  return unmatched.length
    ? [...grouped, { label: 'Hồ sơ khác', items: unmatched }]
    : grouped;
}

export async function loadRequiredDocumentPage(
  projectId: string,
  stageKey: string,
  stepKey?: string,
) {
  const query = new URLSearchParams({
    pageSize: '100',
    stageKey,
  });
  if (stepKey) query.set('workstreamKey', stepKey);
  const first = await api<RequiredDocumentPage>(
    `/projects/${projectId}/required-documents?${query}`,
  );
  if (first.totalPages <= 1) return first;
  const rest = await Promise.all(
    Array.from({ length: first.totalPages - 1 }, (_, index) => {
      const next = new URLSearchParams(query);
      next.set('page', String(index + 2));
      return api<RequiredDocumentPage>(
        `/projects/${projectId}/required-documents?${next}`,
      );
    }),
  );
  const items = new Map(
    [first, ...rest]
      .flatMap((page) => page.items)
      .map((item) => [item.id, item]),
  );
  return {
    ...first,
    items: [...items.values()],
    total: items.size,
    totalPages: 1,
  };
}

export function loadRequiredDocumentHistory(
  projectId: string,
  documentId: string,
) {
  return api<RequiredDocumentHistory>(
    `/projects/${projectId}/required-documents/${documentId}/history`,
  );
}

export async function loadRequiredDocumentHistoryForInspection({
  projectId,
  documentId,
  isCurrent,
  onData,
  onError,
}: {
  projectId: string;
  documentId: string;
  isCurrent: () => boolean;
  onData: (history: RequiredDocumentHistory) => void;
  onError: () => void;
}) {
  try {
    const data = await loadRequiredDocumentHistory(projectId, documentId);
    if (isCurrent()) onData(data);
  } catch {
    if (isCurrent()) onError();
  }
}

export function matrixDataForContext(
  initialData: RequiredDocumentPage | undefined,
  remote: RemoteDocumentPage | undefined,
  key: string,
) {
  return remote?.key === key ? remote.data : initialData;
}

export function revealRequiredDocumentAnchor(
  targetId: string,
  root: Pick<Document, 'getElementById'> = document,
) {
  if (
    !targetId.startsWith('required-document-') &&
    !targetId.startsWith('document-')
  )
    return false;
  const target = root.getElementById(targetId);
  if (!target) return false;
  const group = target.closest('details') as HTMLDetailsElement | null;
  if (group) group.open = true;
  target.scrollIntoView({ block: 'center' });
  return true;
}

export function stageRequiredDocumentMatrixDialogReducer(
  state: RequiredDocument | undefined,
  action: DialogAction,
) {
  return action.type === 'open' ? action.document : undefined;
}

export async function finishMatrixUpload(
  refresh: () => Promise<unknown>,
  onMutate?: () => void | Promise<void>,
) {
  const [refreshResult, mutateResult] = await Promise.allSettled([
    refresh(),
    onMutate ? Promise.resolve().then(onMutate) : Promise.resolve(),
  ]);
  return {
    refreshFailed: refreshResult.status === 'rejected',
    mutateFailed: mutateResult.status === 'rejected',
  };
}

export function executeRequiredDocumentAction(
  projectId: string,
  document: RequiredDocument,
  path: string,
  body?: object,
) {
  return api(
    `/projects/${projectId}/required-documents/${document.id}/${path}`,
    { method: 'POST', body: body ? JSON.stringify(body) : undefined },
  );
}

function updateRequiredDocument(
  projectId: string,
  document: RequiredDocument,
  body: object,
) {
  return api(`/projects/${projectId}/required-documents/${document.id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function StageRequiredDocumentMatrixDialog({
  projectId,
  uploading,
  closeBlocked = false,
  onClose,
  onCloseBlockedChange,
  onComplete,
  onMessage,
  actorPermissions = [],
}: {
  projectId: string;
  uploading?: RequiredDocument;
  closeBlocked?: boolean;
  onClose: () => void;
  onCloseBlockedChange?: (blocked: boolean) => void;
  onComplete: () => void | Promise<void>;
  onMessage: (message: string) => void;
  actorPermissions?: string[];
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (uploading && !dialog.current?.open) dialog.current?.showModal();
    if (!uploading && dialog.current?.open) dialog.current.close();
  }, [uploading]);
  return (
    <dialog
      aria-label="TẢI LÊN HỒ SƠ"
      className="w-[min(90vw,64rem)] rounded-xl border border-slate-200 p-0 shadow-2xl backdrop:bg-black/40"
      onCancel={(event) => {
        if (!canCloseRequiredDocumentUploadDialog(closeBlocked))
          event.preventDefault();
      }}
      onClose={() => {
        if (canCloseRequiredDocumentUploadDialog(closeBlocked)) onClose();
      }}
      ref={dialog}
    >
      {uploading && (
        <div className="grid gap-4 p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">TẢI LÊN HỒ SƠ</h2>
            <button disabled={closeBlocked} onClick={onClose} type="button">
              Đóng
            </button>
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt>Tên hồ sơ</dt>
              <dd>{projectDomainLabel('document', uploading.documentType)}</dd>
            </div>
            <div>
              <dt>Nhóm</dt>
              <dd>
                {groupedDocuments([uploading])[0]?.label ??
                  'Phạm vi & kế hoạch'}
              </dd>
            </div>
            <div>
              <dt>Điều kiện hoàn thành</dt>
              <dd>{completionLabel(uploading.completionPolicy)}</dd>
            </div>
            <div>
              <dt>Người phụ trách</dt>
              <dd>{uploading.owner?.displayName ?? 'Chưa giao'}</dd>
            </div>
            <div>
              <dt>Hạn nộp</dt>
              <dd>
                {uploading.dueDate
                  ? new Date(uploading.dueDate).toLocaleDateString('vi-VN')
                  : '—'}
              </dd>
            </div>
          </dl>
          <ProjectContextDocuments
            actorPermissions={actorPermissions}
            document={uploading}
            onClose={onClose}
            onCloseBlockedChange={onCloseBlockedChange}
            onComplete={onComplete}
            onMessage={onMessage}
            projectId={projectId}
          />
        </div>
      )}
    </dialog>
  );
}

export const canCloseRequiredDocumentUploadDialog = (blocked: boolean) =>
  !blocked;

export function StageRequiredDocumentNotApplicableDialog({
  document,
  pending,
  onClose,
  onSubmit,
}: {
  document?: RequiredDocument;
  pending: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (document && !dialog.current?.open) dialog.current?.showModal();
    if (!document && dialog.current?.open) dialog.current.close();
  }, [document]);
  return (
    <dialog
      aria-label="Lý do không áp dụng"
      className="w-[min(90vw,32rem)] rounded-xl p-5 backdrop:bg-black/40"
      onClose={onClose}
      ref={dialog}
    >
      {document && (
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const reason = new FormData(event.currentTarget)
              .get('reason')
              ?.toString()
              .trim();
            if (reason) onSubmit(reason);
          }}
        >
          <h2 className="font-semibold">LÝ DO KHÔNG ÁP DỤNG</h2>
          <p>{projectDomainLabel('document', document.documentType)}</p>
          <label>
            Lý do
            <textarea maxLength={2000} name="reason" required />
          </label>
          <div className="flex justify-end gap-2">
            <button onClick={onClose} type="button">
              Hủy
            </button>
            <button className="primary" disabled={pending} type="submit">
              Xác nhận
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}

export function StageRequiredDocumentAssignmentDialog({
  document,
  members,
  pending,
  onClose,
  onSubmit,
}: {
  document?: RequiredDocument;
  members: ProjectMember[];
  pending: boolean;
  onClose: () => void;
  onSubmit: (body: {
    ownerUserId: string | null;
    dueDate: string | null;
  }) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (document && !dialog.current?.open) dialog.current?.showModal();
    if (!document && dialog.current?.open) dialog.current.close();
  }, [document]);
  return (
    <dialog
      aria-label="Phân công hồ sơ"
      className="w-[min(90vw,32rem)] rounded-xl p-5 backdrop:bg-black/40"
      onClose={onClose}
      ref={dialog}
    >
      {document && (
        <form
          className="grid gap-3"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const values = new FormData(event.currentTarget);
            onSubmit({
              ownerUserId: values.get('ownerUserId')?.toString() || null,
              dueDate: values.get('dueDate')?.toString() || null,
            });
          }}
        >
          <h2 className="font-semibold">PHÂN CÔNG HỒ SƠ</h2>
          <label>
            Người phụ trách
            <select
              defaultValue={document.ownerUserId ?? document.owner?.id ?? ''}
              name="ownerUserId"
            >
              <option value="">Chưa giao</option>
              {members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.user.displayName}
                </option>
              ))}
            </select>
          </label>
          <label>
            Hạn
            <input
              defaultValue={document.dueDate?.slice(0, 10) ?? ''}
              name="dueDate"
              type="date"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button onClick={onClose} type="button">
              Hủy
            </button>
            <button className="primary" disabled={pending} type="submit">
              Lưu
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}

export function StageRequiredDocumentHistoryDialog({
  canDownload = false,
  document,
  history,
  message,
  onClose,
  view,
}: {
  canDownload?: boolean;
  document?: RequiredDocument;
  history?: RequiredDocumentHistory;
  message?: string;
  onClose: () => void;
  view?: 'detail' | 'history';
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (document && !dialog.current?.open) dialog.current?.showModal();
    if (!document && dialog.current?.open) dialog.current.close();
  }, [document]);
  return (
    <dialog
      aria-label={view === 'history' ? 'Lịch sử hồ sơ' : 'Chi tiết hồ sơ'}
      className="w-[min(90vw,42rem)] rounded-xl border border-slate-200 p-5 shadow-2xl backdrop:bg-black/40"
      onClose={onClose}
      ref={dialog}
    >
      {document && (
        <div className="grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2>{view === 'history' ? 'LỊCH SỬ HỒ SƠ' : 'THÔNG TIN HỒ SƠ'}</h2>
            <button onClick={onClose} type="button">
              Đóng
            </button>
          </div>
          {message ? (
            <p role="alert">{message}</p>
          ) : !history ? (
            <p role="status">Đang tải chi tiết hồ sơ…</p>
          ) : (
            <>
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt>Tên hồ sơ</dt>
                  <dd>
                    {projectDomainLabel('document', document.documentType)}
                  </dd>
                </div>
                <div>
                  <dt>Trạng thái</dt>
                  <dd>
                    {projectDomainLabel('status', history.current.status)}
                  </dd>
                </div>
                <div>
                  <dt>Điều kiện hoàn thành</dt>
                  <dd>{completionLabel(document.completionPolicy)}</dd>
                </div>
                <div>
                  <dt>Phiên bản hiện hành</dt>
                  <dd>v{history.current.version}</dd>
                </div>
                {history.current.filename && (
                  <div>
                    <dt>Tệp hiện hành</dt>
                    <dd>{history.current.filename}</dd>
                  </div>
                )}
                {history.current.uploader && (
                  <div>
                    <dt>Người tải</dt>
                    <dd>{history.current.uploader.displayName}</dd>
                  </div>
                )}
                {history.current.timestamp && (
                  <div>
                    <dt>Thời điểm tải</dt>
                    <dd>
                      {new Date(history.current.timestamp).toLocaleString(
                        'vi-VN',
                      )}
                    </dd>
                  </div>
                )}
                {history.current.note && (
                  <div>
                    <dt>Ghi chú</dt>
                    <dd>{history.current.note}</dd>
                  </div>
                )}
                {document.notApplicableReason && (
                  <div>
                    <dt>Lý do không áp dụng</dt>
                    <dd>{document.notApplicableReason}</dd>
                  </div>
                )}
                {history.current.approval && (
                  <div>
                    <dt>Phê duyệt</dt>
                    <dd>
                      {history.current.approval.actor?.displayName ??
                        'Người phê duyệt'}{' '}
                      ·{' '}
                      {new Date(
                        history.current.approval.timestamp,
                      ).toLocaleString('vi-VN')}
                    </dd>
                  </div>
                )}
              </dl>
              {canDownload && history.current.downloadId && (
                <a
                  href={`${apiUrl}/files/${history.current.downloadId}/download`}
                >
                  Tải tệp hiện hành
                </a>
              )}
              {view === 'history' && (
                <ol className="divide-y">
                  {history.versions.map((version) => (
                    <li className="py-2" key={version.id}>
                      v{version.version} · {version.filename ?? 'Không có tệp'}{' '}
                      · {projectDomainLabel('status', version.status)} ·{' '}
                      {new Date(version.timestamp).toLocaleString('vi-VN')}
                      {version.actor && ` · ${version.actor.displayName}`}
                      {canDownload && version.downloadId && (
                        <a
                          className="ml-2 underline"
                          href={`${apiUrl}/files/${version.downloadId}/download`}
                        >
                          Tải tệp
                        </a>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </div>
      )}
    </dialog>
  );
}

export function StageRequiredDocumentMatrixActions({
  document,
  actorPermissions,
  pending,
  onAssign,
  onCommand,
  onInspect,
  onNotApplicable,
  onUpload,
}: {
  document: RequiredDocument;
  actorPermissions: string[];
  pending: boolean;
  onAssign?: () => void;
  onCommand: (path: string, body?: object) => void;
  onInspect: (view: 'detail' | 'history') => void;
  onNotApplicable?: () => void;
  onUpload: () => void;
}) {
  const actions = documentActions(
    document.status,
    Boolean(document.currentFile),
    actorPermissions,
  );
  const submit = actions.submit && document.completionPolicy === 'APPROVED';
  const primary =
    document.status === 'NOT_APPLICABLE'
      ? 'reason'
      : document.currentFile
        ? 'detail'
        : actions.upload
          ? 'upload'
          : 'detail';
  const reject = () => {
    const notes = window.prompt('Nhập lý do từ chối')?.trim();
    if (notes) onCommand('decision', { decision: 'REJECTED', notes });
  };
  const primaryButton =
    primary === 'upload' ? (
      <button disabled={pending} onClick={onUpload} type="button">
        Tải hồ sơ
      </button>
    ) : primary === 'reason' ? (
      <button
        disabled={pending}
        onClick={() => onInspect('detail')}
        type="button"
      >
        Xem lý do
      </button>
    ) : (
      <button
        disabled={pending}
        onClick={() => onInspect('detail')}
        type="button"
      >
        Xem
      </button>
    );

  return (
    <td className="grid grid-cols-[7rem_minmax(0,1fr)] items-start gap-2 p-3 md:table-cell">
      <span className="font-medium md:hidden">Thao tác</span>
      <div className="flex flex-wrap gap-2">
        {primaryButton}
        <details>
          <summary>Thao tác khác</summary>
          <div className="mt-2 grid gap-2 rounded border bg-white p-2">
            {actions.upload && primary !== 'upload' && (
              <button disabled={pending} onClick={onUpload} type="button">
                {document.currentFile ? 'Tải phiên bản mới' : 'Tải lên'}
              </button>
            )}
            {submit && (
              <button
                disabled={pending}
                onClick={() => onCommand('submit')}
                type="button"
              >
                Gửi duyệt
              </button>
            )}
            {actions.review && (
              <>
                <button
                  disabled={pending}
                  onClick={() =>
                    onCommand('decision', { decision: 'APPROVED' })
                  }
                  type="button"
                >
                  Phê duyệt
                </button>
                <button disabled={pending} onClick={reject} type="button">
                  Từ chối
                </button>
              </>
            )}
            {actions.notApplicable && (
              <button
                disabled={pending}
                onClick={onNotApplicable}
                type="button"
              >
                Đánh dấu không áp dụng
              </button>
            )}
            {actions.restore && (
              <button
                disabled={pending}
                onClick={() => onCommand('restore-applicability')}
                type="button"
              >
                Khôi phục áp dụng
              </button>
            )}
            {actions.edit && (
              <button disabled={pending} onClick={onAssign} type="button">
                Phân công &amp; hạn
              </button>
            )}
            {actions.supersede && (
              <button
                disabled={pending}
                onClick={() => onCommand('supersede')}
                type="button"
              >
                Đánh dấu đã thay thế
              </button>
            )}
            {primary !== 'detail' && primary !== 'reason' && (
              <button
                disabled={pending}
                onClick={() => onInspect('detail')}
                type="button"
              >
                Xem hồ sơ
              </button>
            )}
            <button
              disabled={pending}
              onClick={() => onInspect('history')}
              type="button"
            >
              Xem lịch sử
            </button>
            {document.currentFile &&
              actorPermissions.includes('file.download') && (
                <a href={`${apiUrl}/files/${document.currentFile.id}/download`}>
                  Tải tệp hiện hành
                </a>
              )}
          </div>
        </details>
      </div>
    </td>
  );
}

type StageRequiredDocumentMatrixProps = {
  projectId: string;
  stageKey: ProjectDocumentStageKey;
  stepKey?: string;
  compact?: boolean;
  actorPermissions?: string[];
  initialData?: RequiredDocumentPage;
  onMutate?: () => void | Promise<void>;
};

export function StageRequiredDocumentGroups(
  props: StageRequiredDocumentMatrixProps,
) {
  const contextKey = `${props.projectId}:${props.stageKey}:${props.stepKey ?? ''}`;
  return <StageRequiredDocumentGroupsContext key={contextKey} {...props} />;
}

export const StageRequiredDocumentMatrix = StageRequiredDocumentGroups;

function StageRequiredDocumentGroupsContext({
  projectId,
  stageKey,
  stepKey,
  compact = false,
  actorPermissions = [],
  initialData,
  onMutate,
}: StageRequiredDocumentMatrixProps) {
  const contextKey = useMemo(
    () => `${projectId}:${stageKey}:${stepKey ?? ''}`,
    [projectId, stageKey, stepKey],
  );
  const historyRequest = useRef(0);
  const [remote, setRemote] = useState<RemoteDocumentPage>();
  const [message, setMessage] = useState('');
  const [loadError, setLoadError] = useState('');
  const [uploading, dispatchUpload] = useReducer(
    stageRequiredDocumentMatrixDialogReducer,
    undefined,
  );
  const [uploadCloseBlocked, setUploadCloseBlocked] = useState(false);
  const [notApplicable, setNotApplicable] = useState<RequiredDocument>();
  const [assignment, setAssignment] = useState<RequiredDocument>();
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [pending, setPending] = useState<string>();
  const [inspection, setInspection] = useState<{
    document: RequiredDocument;
    view: 'detail' | 'history';
  }>();
  const [history, setHistory] = useState<RequiredDocumentHistory>();
  const [historyMessage, setHistoryMessage] = useState('');
  const load = useCallback(
    () => loadRequiredDocumentPage(projectId, stageKey, stepKey),
    [projectId, stageKey, stepKey],
  );
  const refresh = useCallback(async () => {
    const data = await load();
    setRemote({ key: contextKey, data });
  }, [contextKey, load]);
  const data = matrixDataForContext(initialData, remote, contextKey);
  const items = data?.items.filter(
    (item) =>
      item.stageKey === stageKey &&
      (!stepKey || item.workstreamKey === stepKey),
  );

  useEffect(() => () => void (historyRequest.current += 1), []);

  useEffect(() => {
    if (initialData) return;
    let current = true;
    void load()
      .then((next) => {
        if (current) {
          setLoadError('');
          setRemote({ key: contextKey, data: next });
        }
      })
      .catch(() => {
        if (current) setLoadError('Không thể tải hồ sơ. Vui lòng thử lại.');
      });
    return () => {
      current = false;
    };
  }, [contextKey, initialData, load]);

  useEffect(() => {
    if (compact || !items?.length || !window.location.hash) return;
    const targetId = window.location.hash.slice(1);
    const frame = requestAnimationFrame(() =>
      revealRequiredDocumentAnchor(targetId),
    );
    return () => cancelAnimationFrame(frame);
  }, [compact, items]);

  async function mutate(action: () => Promise<unknown>, success: string) {
    try {
      await action();
      const result = await finishMatrixUpload(refresh, onMutate);
      setMessage(
        result.refreshFailed || result.mutateFailed
          ? `${success} Không thể làm mới dữ liệu.`
          : success,
      );
    } catch {
      setMessage('Không thể cập nhật hồ sơ. Vui lòng kiểm tra và thử lại.');
    } finally {
      setPending(undefined);
    }
  }

  async function command(
    document: RequiredDocument,
    path: string,
    body?: object,
  ) {
    setPending(document.id);
    await mutate(
      () => executeRequiredDocumentAction(projectId, document, path, body),
      'Đã cập nhật hồ sơ.',
    );
  }

  async function completeUpload() {
    dispatchUpload({ type: 'close' });
    const result = await finishMatrixUpload(refresh, onMutate);
    setMessage(
      result.refreshFailed || result.mutateFailed
        ? 'Đã tải lên hồ sơ. Không thể làm mới dữ liệu.'
        : 'Đã tải lên hồ sơ.',
    );
  }

  async function inspect(
    document: RequiredDocument,
    view: 'detail' | 'history',
  ) {
    const request = ++historyRequest.current;
    setInspection({ document, view });
    setHistory(undefined);
    setHistoryMessage('');
    await loadRequiredDocumentHistoryForInspection({
      projectId,
      documentId: document.id,
      isCurrent: () => request === historyRequest.current,
      onData: setHistory,
      onError: () => setHistoryMessage('Không thể tải chi tiết hồ sơ.'),
    });
  }

  function closeInspection() {
    historyRequest.current += 1;
    setInspection(undefined);
    setHistory(undefined);
    setHistoryMessage('');
  }

  const visibleGroups = groupedDocuments(items ?? []);
  return (
    <section
      aria-label={compact ? 'Hồ sơ của bước đang chọn' : 'Hồ sơ giai đoạn'}
      className="panel grid min-w-0 gap-3"
    >
      {!compact && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold">HỒ SƠ GIAI ĐOẠN</h2>
            <p className="mt-1 text-sm text-black/65">
              Hồ sơ được nhóm theo mục đích công việc của giai đoạn.
            </p>
          </div>
        </div>
      )}
      {loadError && (
        <div className="flex flex-wrap items-center gap-3" role="alert">
          <span>{loadError}</span>
          <button
            onClick={() => {
              setLoadError('');
              void refresh().catch(() =>
                setLoadError('Không thể tải hồ sơ. Vui lòng thử lại.'),
              );
            }}
            type="button"
          >
            Thử lại
          </button>
        </div>
      )}
      {message && (
        <p role={message.startsWith('Đã') ? 'status' : 'alert'}>{message}</p>
      )}
      {!data ? (
        !loadError && <p role="status">Đang tải hồ sơ…</p>
      ) : !items?.length ? (
        <p>Chưa có yêu cầu hồ sơ phù hợp.</p>
      ) : (
        <div className="grid min-w-0 gap-3">
          {visibleGroups.map((group) => {
            const groupCompleted = group.items.filter(
              documentDisplayComplete,
            ).length;
            return (
              <details
                className="rounded-lg border border-slate-200"
                key={group.label}
                open={groupCompleted < group.items.length || undefined}
              >
                <summary className="cursor-pointer p-3 font-semibold">
                  {group.label}
                </summary>
                <table className="w-full table-fixed border-collapse">
                  <thead className="hidden md:table-header-group">
                    <tr>
                      <th>Hồ sơ</th>
                      <th>Trạng thái</th>
                      <th>Phụ trách</th>
                      <th>Hạn</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="block md:table-row-group">
                    {group.items.map((item) => (
                      <tr
                        className="target:bg-amber-50 grid border-t md:table-row"
                        id={
                          compact ? undefined : `required-document-${item.id}`
                        }
                        key={item.id}
                      >
                        <td className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2 p-3 md:table-cell">
                          {!compact && (
                            <span
                              className="scroll-mt-4"
                              id={`document-${item.id}`}
                            />
                          )}
                          <span className="font-medium md:hidden">Hồ sơ</span>
                          {projectDomainLabel('document', item.documentType)}
                        </td>
                        <td className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2 p-3 md:table-cell">
                          <span className="font-medium md:hidden">
                            Trạng thái
                          </span>
                          <span
                            className={`w-fit rounded-full px-2 py-1 text-xs ${documentStatusClass(item.status)}`}
                          >
                            {projectDomainLabel(
                              'status',
                              item.status,
                              'requiredDocument',
                            )}
                          </span>
                        </td>
                        <td className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2 p-3 md:table-cell">
                          <span className="font-medium md:hidden">
                            Phụ trách
                          </span>
                          {item.owner?.displayName ?? 'Chưa giao'}
                        </td>
                        <td className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2 p-3 md:table-cell">
                          <span className="font-medium md:hidden">Hạn</span>
                          {item.dueDate
                            ? new Date(item.dueDate).toLocaleDateString('vi-VN')
                            : 'Chưa đặt hạn'}
                        </td>
                        <StageRequiredDocumentMatrixActions
                          actorPermissions={actorPermissions}
                          document={item}
                          onAssign={() => {
                            setAssignment(item);
                            void api<ProjectMember[]>(
                              `/projects/${projectId}/members`,
                            )
                              .then(setMembers)
                              .catch(() =>
                                setMessage('Không thể tải thành viên dự án.'),
                              );
                          }}
                          onCommand={(path, body) =>
                            void command(item, path, body)
                          }
                          onInspect={(view) => void inspect(item, view)}
                          onNotApplicable={() => setNotApplicable(item)}
                          onUpload={() =>
                            dispatchUpload({ type: 'open', document: item })
                          }
                          pending={pending === item.id}
                        />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            );
          })}
        </div>
      )}
      <StageRequiredDocumentMatrixDialog
        actorPermissions={actorPermissions}
        closeBlocked={uploadCloseBlocked}
        onClose={() => dispatchUpload({ type: 'close' })}
        onCloseBlockedChange={setUploadCloseBlocked}
        onComplete={completeUpload}
        onMessage={setMessage}
        projectId={projectId}
        uploading={uploading}
      />
      <StageRequiredDocumentNotApplicableDialog
        document={notApplicable}
        onClose={() => setNotApplicable(undefined)}
        onSubmit={(reason) => {
          if (!notApplicable) return;
          const document = notApplicable;
          setNotApplicable(undefined);
          void command(document, 'not-applicable', { reason });
        }}
        pending={pending === notApplicable?.id}
      />
      <StageRequiredDocumentAssignmentDialog
        document={assignment}
        members={members}
        onClose={() => setAssignment(undefined)}
        onSubmit={(body) => {
          if (!assignment) return;
          const document = assignment;
          setAssignment(undefined);
          setPending(document.id);
          void mutate(
            () => updateRequiredDocument(projectId, document, body),
            'Đã cập nhật phân công.',
          );
        }}
        pending={pending === assignment?.id}
      />
      <StageRequiredDocumentHistoryDialog
        canDownload={actorPermissions.includes('file.download')}
        document={inspection?.document}
        history={history}
        message={historyMessage}
        onClose={closeInspection}
        view={inspection?.view}
      />
    </section>
  );
}
