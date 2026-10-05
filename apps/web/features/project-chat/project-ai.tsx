'use client';
import { createCommandKey } from '../../app/lib/create-command-key';

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { api, ApiError } from '../../app/lib/api';
import { ChatText } from './chat-text';
import { ChatComposerInput } from './chat-composer-input';
import { SourceDrawer } from '../../app/source-drawer';

export type AiContext = {
  roomId?: string;
  productLineId?: string;
  fileAssetId?: string;
  fileVersion?: number;
};
export const aiSessionKey = (
  projectId: string,
  scope: string,
  context?: AiContext | null,
) =>
  JSON.stringify([
    projectId,
    scope,
    context?.roomId ?? null,
    context?.productLineId ?? null,
    context?.fileAssetId ?? null,
    context?.fileVersion ?? null,
  ]);
type DocumentConnection = {
  category: string;
  enabled: boolean;
  credentialConfigured: boolean;
  credentialState: string;
  status: string;
};

const contextParams = (context?: AiContext) =>
  Object.fromEntries(
    Object.entries(context ?? {}).map(([key, value]) => [key, String(value)]),
  );
type Source = {
  handle: string;
  label: string;
  version: string;
  provenance: string;
  page?: number | null;
  startLine: number;
  endLine: number;
};
type ModelChoice = {
  id: string;
  provider: string;
  label: string;
  providerLabel: string;
  host: string;
  available: boolean;
  generalAvailable?: boolean;
  paused?: boolean;
  costMode?: string | null;
  health?: {
    status: string;
    code: string | null;
    cooldownUntil?: string | null;
  };
  reason: string | null;
  credentialConfigured: boolean;
  credentialPresent: boolean;
  credentialState: string;
  providerReady: boolean;
  providerReason: string | null;
  sourcePolicy: string;
  configLoaded: boolean;
  lastTest: string;
  adminEnabled: boolean;
  accountVisible: boolean;
  textLiveVerified: boolean;
  revision: string | null;
  capabilities: {
    reasoningModes: string[];
    imageInput: boolean;
    pdfInput: boolean;
    nativeMediaImplemented?: boolean;
  };
  limits: {
    requestsPerDay: number | null;
    concurrent: number;
    outputTokens: number;
  };
};
type Answer = {
  mode?: 'GENERAL' | 'PROJECT';
  model?: string | null;
  modelLabel?: string | null;
  provider?: string | null;
  providerLabel?: string | null;
  returnedModel?: string | null;
  cost?: { status: string; value: number | null; source: string | null };
  errorCode?: string | null;
  createdAt?: string;
  usage?: { input_tokens: number; output_tokens: number } | null;
  id: string;
  status: string;
  question: string | null;
  answer: string | null;
  uncertainty?: string | null;
  sources: Source[];
};
type Conversation = {
  mode?: 'GENERAL' | 'PROJECT';
  id: string;
  scope: string;
  createdAt?: string;
  context?: AiContext | null;
};
type History = Conversation & { answers: Answer[]; context?: AiContext | null };
type SourceDetail = Source & {
  text: string;
  kind: string;
  sourceId: string;
  sequence?: number;
  downloadUrl?: string;
};
const pending = ['QUEUED', 'INDEXING', 'RUNNING'];
const scopes = [
  ['ALL', 'Toàn hồ sơ được cấp'],
  ['CONSULTING', 'Tư vấn & báo giá'],
  ['COMMERCIAL', 'Hợp đồng & tài chính'],
  ['SUPPLY', 'Cung ứng & giao hàng'],
  ['AFTER_SALES', 'Thi công & hậu mãi'],
];
export const aiStatusLabel = (
  status: string,
  fallback = 'Trạng thái chưa xác định',
) =>
  ({
    MISSING_CREDENTIAL: 'Chưa có khóa thay thế cho nhà cung cấp này',
    CREDENTIAL_NOT_LOADED:
      'API chưa nạp được cấu hình; quản trị cần kiểm tra đường dẫn và quyền file',
    STORE_UNREADABLE:
      'Không đọc được kho khóa; quản trị cần kiểm tra owner và quyền file',
    STORE_INVALID_FORMAT:
      'Kho khóa sai định dạng; quản trị cần kiểm tra file cấu hình',
    EMPTY_STORE: 'Kho khóa chưa có nhà cung cấp nào',
    PROVIDER_ENTRY_MISSING:
      'Chưa có cấu hình cho nhà cung cấp này trong kho khóa',
    CREDENTIAL_EMPTY: 'Mục nhà cung cấp có khóa rỗng; cần nhập khóa thay thế',
    CREDENTIAL_NOT_CONFIRMED:
      'Kho khóa đã có khóa, nhưng chưa xác nhận là khóa thay thế',
    INVALID_CREDENTIAL:
      'Nhà cung cấp từ chối credential; cần thay khóa tại terminal',
    MODEL_NOT_AVAILABLE: 'Model chưa khả dụng với quyền tài khoản này',
    UNSUPPORTED_PARAMETER: 'Nhà cung cấp không hỗ trợ tham số của yêu cầu',
    ACCOUNT_QUOTA_OR_BILLING:
      'Tài khoản nhà cung cấp thiếu hạn mức hoặc cần xử lý thanh toán',
    NETWORK_OR_TLS: 'Không kết nối được nhà cung cấp; cần kiểm tra mạng/TLS',
    EGRESS_POLICY_DENIED:
      'Project hoặc nguồn chưa được phép gửi đến nhà cung cấp đã chọn',
    INPUT_POLICY_DENIED:
      'Nội dung nhập chưa được quản trị phê duyệt gửi tới nhà cung cấp này.',
    SECRET_FILE_MISSING:
      'API chưa đọc được file env AI; quản trị kiểm tra đường cấu hình.',
    SECRET_FILE_INVALID: 'Env AI không hợp lệ; quản trị kiểm tra định dạng.',
    SECRET_FILE_UNREADABLE:
      'API không có quyền đọc env AI; quản trị kiểm tra owner và quyền file.',
    RATE_LIMITED_UNKNOWN:
      'Nhà cung cấp đang chạm hạn mức, chưa xác định thời điểm mở lại; quản trị kiểm tra hạn mức tài khoản.',
    RATE_LIMITED_TEMPORARY:
      'Nhà cung cấp đang giới hạn tốc độ. Chờ rồi thử lại theo thời gian được báo.',
    PROVIDER_COOLDOWN:
      'Đang chờ thời gian Retry-After của nhà cung cấp; hãy thử lại sau.',
    QUOTA_EXHAUSTED:
      'Hạn mức tài khoản đã hết; quản trị kiểm tra quota tại nhà cung cấp.',
    BILLING_ACTION_REQUIRED:
      'Nhà cung cấp yêu cầu kiểm tra thanh toán hoặc credit; liên hệ quản trị.',
    ADAPTER_RESPONSE_ERROR:
      'Phản hồi hoặc trích nguồn không đúng contract; chưa phát hành câu trả lời',
    MODEL_RETURNED_DIFFERENT:
      'Model nhà cung cấp trả về khác model yêu cầu; chưa bật capability',
    FIXTURE_ASSERTION_FAILED:
      'Kết quả mẫu kiểm thử không khớp đáp án đối chiếu',
    EVIDENCE_WRITE_FAILED:
      'Đã thử gọi nhưng chưa ghi được bằng chứng; chưa bật capability',
    CONCURRENCY_OR_QUOTA:
      'Không giữ được suất kiểm thử; kiểm tra lượt đang chạy và hạn mức',
    INVALID_CONFIG:
      'Cấu hình model chưa hợp lệ; quản trị cần kiểm tra tại máy chủ',
    SOURCE_UNAVAILABLE: 'Nguồn chưa sẵn sàng hoặc phiên bản không còn hợp lệ',
    CONVERSATION_CONTEXT_CHANGED:
      'Phạm vi hội thoại đã được cố định. Tạo chat AI mới để đổi ngữ cảnh.',
    INVALID_CONTEXT: 'Câu hỏi hoặc ngữ cảnh chưa hợp lệ',
    OUTPUT_TOO_LARGE: 'Kết quả vượt giới hạn kiểm tra; chưa được phát hành',
    PROVIDER_REJECTED: 'Nhà cung cấp từ chối yêu cầu; cần kiểm tra cấu hình',
    FILE_NOT_LIVE_VERIFIED:
      'Ảnh/PDF chưa được kiểm chứng live và chưa được bật',
    PDF_PAGE_LIMIT: 'PDF vượt giới hạn 10 trang; cần bản trích trang phù hợp',
    PDF_VALIDATION_UNAVAILABLE: 'Chưa kiểm được cấu trúc và số trang PDF',
    MISSING_BINARY: 'Thiếu file gốc trong storage; chưa gửi nhà cung cấp',
    DATA_POLICY_BLOCKED: 'Model này chưa được phép xử lý nguồn đã chọn',
    HISTORY_UNAVAILABLE:
      'Lịch sử có nguồn không còn được phép; yêu cầu chưa được gửi',
    CONFIG_CHANGED:
      'Cấu hình đã thay đổi; tạo yêu cầu mới sau khi kiểm tra model',
    MODEL_DISABLED: 'Quản trị chưa bật model',
    MODEL_UNAVAILABLE: 'Model không khả dụng với kết nối này',
    INVALID_KEY: 'Khóa không hợp lệ; cần thay khóa tại máy chủ',
    PROVIDER_FORBIDDEN: 'Tài khoản nhà cung cấp chưa có quyền truy cập',
    RATE_LIMITED: 'Nhà cung cấp đang giới hạn lượt gọi hoặc hết hạn mức',
    DAILY_QUOTA_EXCEEDED: 'Đã hết hạn mức trong ngày',
    CONCURRENCY_LIMIT: 'Đang có yêu cầu khác; chờ hoàn tất trước khi gửi tiếp',
    UNSUPPORTED_FILE: 'Model chưa hỗ trợ loại file đã chọn',
    UNSUPPORTED_REASONING: 'Model không hỗ trợ mức suy luận này',
    INPUT_TOO_LARGE: 'Nguồn và lịch sử vượt giới hạn; hãy thu hẹp phạm vi',
    SAFETY_BLOCKED: 'Nhà cung cấp chặn yêu cầu theo chính sách',
    INVALID_OUTPUT:
      'Câu trả lời hoặc trích nguồn chưa hợp lệ; chưa được phát hành',
    INCOMPLETE_OUTPUT: 'Nhà cung cấp chưa trả câu trả lời hoàn chỉnh',
    TEMPORARY_ERROR: 'Nhà cung cấp tạm thời không khả dụng',
    PROVIDER_TIMEOUT_UNKNOWN:
      'Kết nối bị gián đoạn; nhà cung cấp có thể đã tính lượt, không tự gọi lại',
    QUEUED: 'Câu hỏi đã lưu, chờ xử lý',
    INDEXING: 'Đang tìm và đọc nguồn',
    RUNNING: 'Đang xử lý câu trả lời',
    COMPLETED: 'AI tạo — chưa phải quyết định chính thức',
    CANCELLED: 'Đã hủy',
    FAILED: 'Không thể xử lý yêu cầu',
    FAILED_UNKNOWN: 'Yêu cầu bị gián đoạn. Không tự gọi lại provider.',
    PROVIDER_PAUSED: 'Nhà cung cấp đang tạm dừng; lịch sử vẫn được giữ.',
    GENERAL_ONLY: 'Chỉ dùng Hỏi thông thường; không gửi nguồn dự án.',
    FREE_CATALOGUE_UNVERIFIED:
      'Chưa xác minh catalogue model miễn phí; chưa gửi câu hỏi.',
    FREE_ONLY_COST_VIOLATION:
      'Phát hiện chi phí ngoài 0; đã dừng các lượt tiếp theo.',
    NOT_CONFIGURED: 'Chưa cấu hình API AI hoặc hạn mức',
    NO_SOURCES: 'Chưa có nguồn đã đọc được trong phạm vi của bạn',
    NEEDS_REPORT: 'Câu hỏi tổng hợp cần báo cáo nghiệp vụ đủ dữ liệu',
    ACCESS_REVOKED: 'Không còn quyền xem nội dung phụ thuộc nguồn này',
    READY: 'Đã đọc nguồn',
    PROCESSING: 'Đang đọc nguồn',
    ERROR: 'Không đọc được nguồn',
    UNSUPPORTED: 'Định dạng chưa hỗ trợ',
    BLOCKED: 'Nguồn không được phép lập chỉ mục',
    FORBIDDEN: 'Nguồn không được phép lập chỉ mục',
    INVALID: 'Không đọc được nội dung UTF-8',
    TOO_LARGE: 'Nguồn vượt giới hạn đọc',
  })[status] ?? fallback;

const modelStatusLabel = (model: ModelChoice) =>
  model.credentialState && model.credentialState !== 'LOADED'
    ? aiStatusLabel(model.credentialState)
    : model.health?.code
      ? aiStatusLabel(model.health.code)
      : model.providerReason || model.reason
        ? aiStatusLabel(model.providerReason ?? model.reason!)
        : model.textLiveVerified
          ? 'Văn bản đã kiểm chứng live'
          : 'Cấu hình đã nạp; văn bản chưa kiểm chứng live';

export function AiAnswer({
  answer,
  onSource,
  onCancel,
  onRun,
  onDraft,
}: {
  answer: Answer;
  onSource: (source: Source) => void;
  onCancel: () => void;
  onRun: () => void;
  onDraft?: (text: string) => void;
}) {
  return (
    <article className="ai-answer">
      {answer.mode === 'GENERAL' && (
        <p className="chat-metadata">Không sử dụng hồ sơ dự án</p>
      )}
      {answer.status !== 'ACCESS_REVOKED' && answer.question && (
        <h3 className="ai-question">{answer.question}</h3>
      )}
      <p role="status" className="chat-metadata">
        {aiStatusLabel(
          answer.errorCode ?? answer.status,
          aiStatusLabel(answer.status),
        )}
      </p>
      {answer.model && (
        <p className="chat-metadata">
          {answer.modelLabel ?? answer.model} ·{' '}
          {answer.provider === 'openrouter'
            ? `Qua OpenRouter · model thực tế: ${answer.returnedModel ?? 'chưa xác định'}`
            : (answer.providerLabel ?? answer.provider)}
          {answer.createdAt
            ? ` · ${new Date(answer.createdAt).toLocaleString('vi-VN')}`
            : ''}
        </p>
      )}
      {answer.status === 'COMPLETED' && answer.usage && (
        <p className="chat-metadata">
          Token đầu vào: {answer.usage.input_tokens} · đầu ra:{' '}
          {answer.usage.output_tokens}.{' '}
          {answer.cost?.status === 'KNOWN'
            ? `Chi phí: ${answer.cost.value} USD (${answer.cost.source}).`
            : 'Chi phí tiền chưa xác định.'}
        </p>
      )}
      {answer.status === 'COMPLETED' && (
        <>
          <ChatText text={answer.answer ?? ''} />
          {answer.uncertainty && (
            <p className="whitespace-pre-wrap">{answer.uncertainty}</p>
          )}
          {onDraft && answer.answer && (
            <button onClick={() => onDraft(answer.answer!)}>
              Dùng làm nháp phản hồi
            </button>
          )}
          <ul className="ai-citations">
            {answer.sources.map((source) => (
              <li key={source.handle}>
                <button onClick={() => onSource(source)}>
                  {source.label} · bản {source.version} ·{' '}
                  {source.page
                    ? `trang ${source.page}`
                    : `dòng ${source.startLine}–${source.endLine}`}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {answer.status === 'QUEUED' && (
        <button onClick={onRun}>Tiếp tục yêu cầu đã lưu</button>
      )}
      {pending.includes(answer.status) && (
        <button onClick={onCancel}>Dừng yêu cầu</button>
      )}
    </article>
  );
}

export function ModelSelector({
  models,
  value,
  onChange,
}: {
  models: ModelChoice[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      Model AI{' '}
      <select
        aria-label="Model AI"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Chọn model đã được bật</option>
        {models.map((model) => (
          <option key={model.id} value={model.id} disabled={!model.available}>
            {model.label} · {model.providerLabel}
            {` — ${modelStatusLabel(model)}`}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ProjectAi({
  projectId,
  actorId,
  group,
  onRevoked,
  canConfigure = false,
  onDraft,
  initialContext,
  roomLabels,
  portalTarget,
  active = true,
  presentation = 'docked',
  projectName,
  initialConversationId,
  onSelected,
  onScopeChange,
  onFloat,
  onExpand,
  onMinimize,
  onClose,
  onPage,
}: {
  projectId: string;
  actorId: string;
  group: string;
  initialContext?: AiContext;
  roomLabels?: Record<string, string>;
  onRevoked: (status?: number) => void;
  canConfigure?: boolean;
  onDraft?: (text: string) => void;
  portalTarget?: HTMLElement | null;
  active?: boolean;
  presentation?: 'docked' | 'floating' | 'expanded' | 'page';
  projectName?: string;
  initialConversationId?: string;
  onSelected?: (id: string) => void;
  onScopeChange?: (scope: string) => void;
  onFloat?: () => void;
  onExpand?: () => void;
  onMinimize?: () => void;
  onClose?: () => void;
  onPage?: () => void;
}) {
  const panel = useRef<HTMLElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [models, setModels] = useState<ModelChoice[]>([]);
  const [mode, setMode] = useState<'GENERAL' | 'PROJECT'>('PROJECT');
  const choices =
    mode === 'GENERAL'
      ? models.map((item) => ({
          ...item,
          available: item.generalAvailable ?? item.providerReady,
          reason: item.providerReason,
        }))
      : models;
  const [model, setModel] = useState('');
  const [reasoning, setReasoning] = useState('default');
  const [pilotConfirmed, setPilotConfirmed] = useState(false);
  const [settings, setSettings] = useState<ModelChoice[]>();
  const [connections, setConnections] = useState<{
    llama_cloud?: DocumentConnection;
  }>({});
  const activationKeys = useRef(new Map<string, string>());
  const [activation, setActivation] = useState<{
    requestId: string;
    status: string;
    errorCode: string | null;
    evidence: {
      result: string;
      revision: string;
      capability: string;
      requestedModel: string;
      returnedModel: string | null;
    } | null;
  }>();
  const [sourceIds, setSourceIds] = useState<string[]>([]);
  const modelInitialized = useRef(false);
  const modelConversation = useRef('');
  const modelStorageKey = `galaxy-ai-model:${actorId}:${projectId}`;
  const chosenModel = choices.find((m) => m.id === model);
  const [list, setList] = useState<Conversation[]>([]);
  const [provider, setProvider] = useState('LOADING');
  const [selected, setSelected] = useState('');
  const selectedRef = useRef('');
  const [scope, setScope] = useState(group);
  const [history, setHistory] = useState<History>();
  const context =
    mode === 'GENERAL'
      ? undefined
      : selected && history?.answers.length
        ? (history.context ?? undefined)
        : initialContext;
  const presentationActive = useRef(active);
  const [verified, setVerified] = useState(false);
  const [wasActive, setWasActive] = useState(active);
  if (wasActive !== active) {
    setWasActive(active);
    setVerified(false);
  }
  const drafts = useRef(new Map<string, string>());
  const selectedCallback = useRef(onSelected);
  const pagePresentation = useRef(presentation === 'page');
  useLayoutEffect(() => {
    selectedCallback.current = onSelected;
    pagePresentation.current =
      active && (presentation === 'page' || presentation === 'docked');
  }, [onSelected, presentation, active]);
  const updateUrl = (id: string) => {
    selectedCallback.current?.(id);
    if (
      !pagePresentation.current ||
      ![`/projects/${projectId}/ai`, `/projects/${projectId}/work`].includes(
        location.pathname,
      )
    )
      return;
    const url = new URL(location.href);
    if (id) url.searchParams.set('ai', id);
    else url.searchParams.delete('ai');
    window.history.replaceState(window.history.state, '', url);
  };
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [source, setSource] = useState<SourceDetail>();
  const sourceDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (source && active && sourceDialog.current && !sourceDialog.current.open)
      sourceDialog.current.showModal();
  }, [source, active, presentation]);
  const scrollNode = useRef<HTMLDivElement | null>(null);
  const scrollPosition = useRef({ top: 0, nearEnd: true });
  const [newMessages, setNewMessages] = useState(false);
  const answerStamp = history?.answers
    .map((answer) => `${answer.id}/${answer.status}`)
    .join(',');
  const lastStamp = useRef(answerStamp);
  const scrollRef = useCallback((node: HTMLDivElement | null) => {
    scrollNode.current = node;
    if (node) node.scrollTop = scrollPosition.current.top;
  }, []);
  useLayoutEffect(() => {
    const node = scrollNode.current;
    if (!node || !verified || !active) return;
    if (scrollPosition.current.nearEnd) node.scrollTop = node.scrollHeight;
    else if (lastStamp.current !== answerStamp) setNewMessages(true);
    lastStamp.current = answerStamp;
  }, [answerStamp, verified, active, presentation]);
  const [index, setIndex] = useState<{
    hasMore: boolean;
    sources: {
      id: string;
      label: string;
      status: string;
      version?: string;
      nativeFile?: boolean;
    }[];
  }>();
  const controller = useRef<AbortController | null>(null);
  const reading = useRef(0);
  const refreshing = useRef(false);
  const refreshAgain = useRef(false);
  const activePage = useRef(true);
  const sending = useRef(false);
  const sourceKey = useRef<{ answerId: string; handle: string } | undefined>(
    undefined,
  );
  const indexScope = useRef<{ scope: string; context?: AiContext } | undefined>(
    undefined,
  );
  const requestKey = useRef<
    | {
        conversationKey: string;
        clientKey: string;
        question: string;
        scope: string;
        model: string;
        mode: 'GENERAL' | 'PROJECT';
        reasoning: string;
        dataClassification: string;
        sourceIds: string[];
        context?: AiContext;
        conversationId?: string;
      }
    | undefined
  >(undefined);
  const [retryPin, setRetryPin] = useState<(typeof requestKey)['current']>();
  useEffect(() => {
    if (!selectedRef.current && !requestKey.current) setScope(group);
  }, [group]);
  const base = `/project-chat/projects/${projectId}/ai`;
  const call = useCallback(
    <T,>(path = '', body?: object) =>
      api<T>(base + path, {
        signal: AbortSignal.any([
          ...(controller.current ? [controller.current.signal] : []),
          AbortSignal.timeout(body === undefined ? 15000 : 110000),
        ]),
        headers: { 'X-Chat-Actor': actorId },
        ...(body === undefined
          ? {}
          : { method: 'POST', body: JSON.stringify(body) }),
      }),
    [base, actorId],
  );
  const invalidate = useCallback(
    (cause: unknown) => {
      ++reading.current;
      sourceKey.current = undefined;
      indexScope.current = undefined;
      setHistory(undefined);
      setList([]);
      setSource(undefined);
      setIndex(undefined);
      setLoadError(
        aiStatusLabel((cause as Error).message, (cause as Error).message),
      );
      if (
        cause instanceof ApiError &&
        [401, 403, 404, 412].includes(cause.status)
      ) {
        setQuestion('');
        drafts.current.clear();
        requestKey.current = undefined;
        setRetryPin(undefined);
        selectedRef.current = '';
        setSelected('');
        activePage.current = false;
        refreshAgain.current = false;
        if (location.pathname.startsWith(`/projects/${projectId}/`)) {
          const url = new URL(location.href);
          url.searchParams.delete('ai');
          window.history.replaceState(window.history.state, '', url);
        }
        onRevoked(cause.status);
      }
    },
    [onRevoked, setSource, setQuestion, setRetryPin, projectId],
  );
  const select = (id: string) => {
    if (!id && mode === 'GENERAL') {
      const router = models.find(
        (item) => item.id === 'openrouter/free' && item.generalAvailable,
      );
      if (router) {
        setModel(router.id);
        setReasoning('default');
      }
    }
    modelConversation.current = '';
    scrollPosition.current = { top: 0, nearEnd: true };
    setNewMessages(false);
    drafts.current.set(selectedRef.current, question);
    setQuestion(drafts.current.get(id) ?? '');
    ++reading.current;
    sourceKey.current = undefined;
    indexScope.current = undefined;
    selectedRef.current = id;
    setSelected(id);
    setHistory(undefined);
    setSource(undefined);
    setIndex(undefined);
    setSourceIds([]);
    requestKey.current = undefined;
    setRetryPin(undefined);
    updateUrl(id);
  };
  const refresh = useCallback(
    async function refresh() {
      if (
        !activePage.current ||
        !presentationActive.current ||
        document.visibilityState !== 'visible'
      )
        return;
      if (refreshing.current) {
        refreshAgain.current = true;
        return;
      }
      refreshing.current = true;
      const epoch = ++reading.current;
      const id = selectedRef.current;
      const selectedSource = sourceKey.current;
      const selectedScope = indexScope.current;
      try {
        const [result, detail, currentSource, currentIndex] = await Promise.all(
          [
            call<{
              provider: string;
              conversations: Conversation[];
              models: ModelChoice[];
            }>(),
            id
              ? call<History>(`/conversations/${id}`)
              : Promise.resolve(undefined),
            selectedSource
              ? call<SourceDetail>(
                  `/answers/${selectedSource.answerId}/sources/${encodeURIComponent(selectedSource.handle)}`,
                )
              : Promise.resolve(undefined),
            selectedScope
              ? call<{
                  sources: {
                    id: string;
                    label: string;
                    status: string;
                    version?: string;
                    nativeFile?: boolean;
                  }[];
                }>(
                  `/index?${new URLSearchParams({ scope: selectedScope.scope, ...contextParams(selectedScope.context) })}`,
                )
              : Promise.resolve(undefined),
          ],
        );
        if (
          controller.current?.signal.aborted ||
          !activePage.current ||
          !presentationActive.current ||
          document.visibilityState !== 'visible' ||
          epoch !== reading.current ||
          id !== selectedRef.current
        )
          return;
        setProvider(result.provider);
        const identity = aiSessionKey(projectId, group, initialContext);
        if (
          detail &&
          detail.mode !== 'GENERAL' &&
          aiSessionKey(
            projectId,
            detail.scope,
            detail.answers.length ? detail.context : initialContext,
          ) !== identity
        ) {
          selectedRef.current = '';
          setSelected('');
          setHistory(undefined);
          setLoadError('Hội thoại thuộc phạm vi khác; hãy mở đúng ngữ cảnh.');
          return;
        }
        setVerified(true);
        setModels(result.models ?? []);
        setSettings((current) =>
          current === undefined ? current : (result.models ?? []),
        );
        if (!modelInitialized.current && result.models) {
          modelInitialized.current = true;
          let saved: string | null = null;
          try {
            saved = sessionStorage.getItem(modelStorageKey);
          } catch {
            /* Lựa chọn vẫn dùng được khi trình duyệt chặn storage. */
          }
          const candidate = saved
            ? result.models.find((m) => m.id === saved)
            : result.models.find(
                (m) => m.provider === 'google_gemini' && m.available,
              );
          setModel(candidate?.id ?? '');
          setReasoning(
            candidate?.capabilities.reasoningModes.includes('high')
              ? 'high'
              : 'default',
          );
        }
        setList(
          result.conversations.filter(
            (item) =>
              (item.mode === 'GENERAL' && item.scope === group) ||
              aiSessionKey(projectId, item.scope, item.context) === identity,
          ),
        );
        setSelected(id);
        setHistory(detail);
        if (detail?.answers.length) {
          setMode(detail.mode ?? 'PROJECT');
          if (modelConversation.current !== id) {
            modelConversation.current = id;
            const original = detail.answers.at(-1)?.model;
            if (original) {
              setModel(original);
              const choice = result.models?.find(
                (item) => item.id === original,
              );
              setReasoning(
                choice?.capabilities.reasoningModes.includes('high')
                  ? 'high'
                  : 'default',
              );
            }
          }
        }
        setLoadError('');
        if (selectedSource === sourceKey.current) setSource(currentSource);
        if (selectedScope === indexScope.current && currentIndex)
          setIndex((previous) => ({
            hasMore: previous?.hasMore ?? false,
            sources: currentIndex.sources,
          }));
      } catch (cause) {
        if (controller.current?.signal.aborted || epoch !== reading.current)
          return;
        invalidate(cause);
      } finally {
        refreshing.current = false;
        if (refreshAgain.current) {
          refreshAgain.current = false;
          void refresh();
        }
      }
    },
    [
      call,
      invalidate,
      modelStorageKey,
      setSource,
      projectId,
      group,
      initialContext,
    ],
  );
  useEffect(() => {
    presentationActive.current = active;
    if (active && controller.current) void refresh();
  }, [active, refresh]);
  useEffect(() => {
    if (
      initialConversationId &&
      initialConversationId !== selectedRef.current &&
      !sending.current
    ) {
      selectedRef.current = initialConversationId;
      void refresh();
    }
  }, [initialConversationId, refresh]);
  useEffect(() => {
    controller.current = new AbortController();
    const generation = reading;
    void refresh();
    const clear = () => {
      activePage.current = false;
      ++reading.current;
      sourceKey.current = undefined;
      indexScope.current = undefined;
      requestKey.current = undefined;
      setRetryPin(undefined);
      setQuestion('');
      drafts.current.clear();
      setHistory(undefined);
      setSource(undefined);
      setIndex(undefined);
    };
    const visible = () => {
      if (document.visibilityState === 'hidden') clear();
      else {
        activePage.current = true;
        void refresh();
      }
    };
    const restore = () => {
      clear();
      activePage.current = true;
      void refresh();
    };
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('pagehide', clear);
    window.addEventListener('pageshow', restore);
    window.addEventListener('galaxy-auth-changed', clear);
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 3000);
    return () => {
      controller.current?.abort();
      ++generation.current;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('pagehide', clear);
      window.removeEventListener('pageshow', restore);
      window.removeEventListener('galaxy-auth-changed', clear);
    };
  }, [refresh]);
  const act = async (operation: () => Promise<void>) => {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError('');
    try {
      await operation();
    } catch (cause) {
      if (!controller.current?.signal.aborted) {
        invalidate(cause);
        setError(
          aiStatusLabel((cause as Error).message, (cause as Error).message),
        );
        setRetryPin(requestKey.current);
      }
    } finally {
      sending.current = false;
      if (!controller.current?.signal.aborted) {
        setBusy(false);
        await refresh();
      }
    }
  };
  const run = async (id: string) => call<Answer>(`/answers/${id}/run`, {});
  const ask = (retry = false) =>
    act(async () => {
      const text = retry
        ? (requestKey.current?.question ?? '')
        : question.trim();
      if (
        (selected && !history) ||
        !text ||
        !pilotConfirmed ||
        (!retry && !chosenModel?.available)
      )
        return;
      if (requestKey.current && !retry) return;
      if (!requestKey.current)
        requestKey.current = {
          conversationKey: createCommandKey(),
          clientKey: createCommandKey(),
          question: text,
          scope,
          model,
          mode,
          reasoning,
          dataClassification: 'SYNTHETIC_PUBLIC_APPROVED',
          sourceIds: [...sourceIds],
          context,
          conversationId: selectedRef.current || undefined,
        };
      const key = requestKey.current;
      if (!key.conversationId)
        key.conversationId = (
          await call<Conversation>('/conversations', {
            clientKey: key.conversationKey,
            scope: key.scope,
          })
        ).id;
      if (controller.current?.signal.aborted) return;
      selectedRef.current = key.conversationId;
      setSelected(key.conversationId);
      updateUrl(key.conversationId);
      const answer = await call<Answer>(
        `/conversations/${key.conversationId}/answers`,
        {
          clientKey: key.clientKey,
          question: key.question,
          model: key.model,
          mode: key.mode,
          reasoning: key.reasoning,
          dataClassification: key.dataClassification,
          sourceIds: key.sourceIds,
          ...key.context,
        },
      );
      if (controller.current?.signal.aborted) return;
      requestKey.current = undefined;
      setRetryPin(undefined);
      await refresh();
      const result = await run(answer.id);
      if (result.status === 'COMPLETED')
        setQuestion((current) =>
          current.trim() === key.question ? '' : current,
        );
    });
  const openSource = async (answerId: string, item: Source) => {
    const id = selectedRef.current;
    const key = { answerId, handle: item.handle };
    sourceKey.current = key;
    try {
      const detail = await call<SourceDetail>(
        `/answers/${answerId}/sources/${encodeURIComponent(item.handle)}`,
      );
      if (
        !controller.current?.signal.aborted &&
        selectedRef.current === id &&
        sourceKey.current === key &&
        document.visibilityState === 'visible'
      )
        setSource(detail);
    } catch (cause) {
      if (!controller.current?.signal.aborted && sourceKey.current === key) {
        invalidate(cause);
        setError(
          aiStatusLabel((cause as Error).message, (cause as Error).message),
        );
        setRetryPin(requestKey.current);
      }
    }
  };
  const updateSources = () => {
    void act(async () => {
      const chosen = history?.scope ?? scope;
      const result = await call<{
        hasMore: boolean;
        sources: {
          id: string;
          label: string;
          status: string;
          version?: string;
          nativeFile?: boolean;
        }[];
      }>('/index', { scope: chosen, ...context });
      if (
        !controller.current?.signal.aborted &&
        document.visibilityState === 'visible'
      ) {
        indexScope.current = { scope: chosen, context };
        setIndex(result);
        requestAnimationFrame(() =>
          scrollNode.current
            ?.querySelector('[aria-label="Trạng thái nguồn"]')
            ?.scrollIntoView({ block: 'nearest' }),
        );
      }
    });
  };
  const content = (
    <section
      ref={panel}
      aria-label="Hỏi AI"
      className={`project-ai-panel ${collapsed && presentation === 'docked' ? 'is-collapsed' : ''}`}
      onKeyDown={(event) => {
        if (
          event.key !== 'Escape' ||
          event.defaultPrevented ||
          event.nativeEvent.isComposing ||
          event.nativeEvent.keyCode === 229 ||
          event.target instanceof HTMLSelectElement ||
          (event.target as HTMLElement).closest('.source-drawer')
        )
          return;
        const menu =
          panel.current?.querySelector<HTMLDetailsElement>('details[open]');
        if (menu) {
          menu.open = false;
          menu.querySelector('summary')?.focus();
        } else if (onClose) onClose();
        else return;
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <header className="ai-panel-header">
        <div>
          <span className="eyebrow">Galaxy AI · Riêng tư</span>
          <h2 className="mt-1 font-semibold">Galaxy AI</h2>
          {projectName && <p className="ai-project-name">{projectName}</p>}
          <p className="chat-metadata ai-connection" role="status">
            {chosenModel
              ? modelStatusLabel(chosenModel)
              : provider === 'LOADING'
                ? 'Đang kiểm tra model…'
                : 'Chọn model khả dụng; cấu hình cần được kiểm chứng'}
          </p>
        </div>
        <div className="flex gap-1">
          <button
            disabled={busy}
            aria-label="Phiên AI mới"
            onClick={() => {
              select('');
              setQuestion('');
            }}
          >
            ＋
          </button>
          {onPage && (
            <button aria-label="Mở trang AI" onClick={onPage}>
              ↗
            </button>
          )}
          {onFloat && presentation === 'docked' && (
            <button aria-label="Tách AI thành cửa sổ nổi" onClick={onFloat}>
              ▱
            </button>
          )}
          {onExpand ? (
            <button
              aria-label={
                presentation === 'expanded' ? 'Thu gọn cửa sổ AI' : 'Mở rộng AI'
              }
              onClick={onExpand}
            >
              ⤢
            </button>
          ) : (
            <button
              title="Mở AI toàn màn hình"
              aria-label="Mở AI toàn màn hình"
              onClick={() => {
                setCollapsed(false);
                void panel.current
                  ?.requestFullscreen()
                  .catch(() =>
                    setError(
                      'Trình duyệt chưa cho phép toàn màn hình. Dùng trang AI toàn dự án.',
                    ),
                  );
              }}
            >
              ⤢
            </button>
          )}
          <button
            aria-label={
              onMinimize
                ? 'Thu nhỏ AI'
                : collapsed
                  ? 'Mở panel AI'
                  : 'Thu gọn panel AI'
            }
            aria-expanded={!collapsed}
            onClick={() =>
              onMinimize ? onMinimize() : setCollapsed((value) => !value)
            }
          >
            {collapsed ? '+' : '−'}
          </button>
          {onClose && (
            <button aria-label="Đóng AI" onClick={onClose}>
              ×
            </button>
          )}
        </div>
      </header>
      <div
        className="ai-panel-content"
        hidden={collapsed && presentation === 'docked'}
      >
        {!verified && <p role="status">Đang kiểm tra quyền và hội thoại…</p>}
        {!verified && loadError && <p role="alert">{loadError}</p>}
        <div className="ai-session-content" hidden={!verified}>
          <div className="ai-context-bar">
            <label>
              Chế độ hỏi{' '}
              <select
                aria-label="Chế độ hỏi AI"
                value={mode}
                disabled={busy || Boolean(retryPin)}
                onChange={(event) => {
                  const next = event.target.value as 'GENERAL' | 'PROJECT';
                  if (next === mode) return;
                  const draft = question;
                  select('');
                  setMode(next);
                  if (next === 'GENERAL') {
                    const router = models.find(
                      (item) =>
                        item.id === 'openrouter/free' && item.generalAvailable,
                    );
                    if (router) {
                      setModel(router.id);
                      setReasoning('default');
                    }
                  }
                  setQuestion(draft);
                  setError(
                    'Đã mở ngữ cảnh sạch cho chế độ mới; hội thoại cũ vẫn trong lịch sử.',
                  );
                }}
              >
                <option value="PROJECT">Hỏi theo nguồn dự án</option>
                <option value="GENERAL">Hỏi thông thường</option>
              </select>
            </label>
            {mode === 'GENERAL' && (
              <p role="status">
                Không sử dụng hồ sơ dự án. Cần thông tin dự án: chọn Hỏi theo
                nguồn dự án.
              </p>
            )}
            <p className="ai-privacy">
              {group === 'ALL' && !initialContext
                ? 'Toàn dự án — theo quyền của bạn'
                : scopes.find(([id]) => id === group)?.[1]}{' '}
              · Chỉ mình tôi
            </p>
            <div className="ai-model-controls">
              <ModelSelector
                models={choices}
                value={model}
                onChange={(value) => {
                  setModel(value);
                  const choice = models.find((m) => m.id === value);
                  setReasoning(
                    choice?.capabilities.reasoningModes.includes('high')
                      ? 'high'
                      : 'default',
                  );
                  try {
                    sessionStorage.setItem(modelStorageKey, value);
                  } catch {
                    /* Không lưu secret tại browser. */
                  }
                }}
              />
              {chosenModel && (
                <label>
                  Mức suy luận{' '}
                  <select
                    aria-label="Mức suy luận"
                    value={reasoning}
                    onChange={(e) => setReasoning(e.target.value)}
                  >
                    {chosenModel.capabilities.reasoningModes.map((value) => (
                      <option key={value} value={value}>
                        {
                          (
                            {
                              default: 'Mặc định nhà cung cấp',
                              none: 'Tối thiểu',
                              low: 'Thấp',
                              medium: 'Trung bình',
                              high: 'Cao',
                            } as Record<string, string>
                          )[value]
                        }
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          </div>
          <div
            className="ai-scroll-body"
            ref={scrollRef}
            onScroll={(event) => {
              const node = event.currentTarget;
              const nearEnd =
                node.scrollHeight - node.scrollTop - node.clientHeight < 48;
              scrollPosition.current = { top: node.scrollTop, nearEnd };
              if (nearEnd) setNewMessages(false);
            }}
          >
            {choices.length > 0 && !choices.some((item) => item.available) && (
              <details>
                <summary>Model chưa sẵn sàng</summary>
                <ul>
                  {choices.map((item) => (
                    <li key={item.id}>
                      {item.label}: {modelStatusLabel(item)}
                    </li>
                  ))}
                </ul>
                <p>
                  {canConfigure
                    ? 'Mở cấu hình bên dưới để kiểm tra kết nối.'
                    : 'Liên hệ quản trị dự án để kiểm tra kết nối và quyền gửi nguồn.'}
                </p>
              </details>
            )}
            {canConfigure && (
              <details
                onToggle={(event) => {
                  if (!event.currentTarget.open) setSettings(undefined);
                  else
                    void call<{
                      models: ModelChoice[];
                      connections?: { llama_cloud?: DocumentConnection };
                    }>('/settings')
                      .then((result) => {
                        setSettings(result.models);
                        setConnections(result.connections ?? {});
                      })
                      .catch((cause) => {
                        setSettings(undefined);
                        setError(
                          aiStatusLabel(
                            (cause as Error).message,
                            (cause as Error).message,
                          ),
                        );
                      });
                }}
              >
                <summary>Cấu hình nhà cung cấp và hạn mức</summary>
                <p>
                  Khóa được API đọc từ env riêng; terminal là tiện ích tùy chọn.
                  Chỉ hồ sơ và phiên bản nguồn giả/công khai được quản trị duyệt
                  mới được gửi.
                </p>
                {connections.llama_cloud && (
                  <p>
                    LlamaCloud · kết nối tài liệu/tri thức ·{' '}
                    {connections.llama_cloud.credentialConfigured
                      ? 'Đã cấu hình khóa'
                      : 'Chưa cấu hình khóa'}{' '}
                    · Chưa kiểm chứng kết nối; chưa xử lý tài liệu.
                  </p>
                )}
                {settings?.map((item) => (
                  <div
                    key={item.id}
                    className="my-3 rounded border p-3 text-xs"
                  >
                    <strong>{item.label}</strong> · {item.host}
                    <p>
                      {modelStatusLabel(item)} · revision{' '}
                      {item.revision ?? 'chưa có'}
                    </p>
                    {item.credentialPresent && (
                      <p>
                        Đã thấy giá trị khóa trong file; quyền model cần kiểm
                        thử riêng.
                      </p>
                    )}
                    <p>
                      {item.textLiveVerified
                        ? 'Văn bản đã kiểm chứng live'
                        : 'Văn bản chưa kiểm chứng live'}{' '}
                      · {item.limits.concurrent} lượt đồng thời ·{' '}
                      {item.limits.requestsPerDay === null
                        ? 'Không giới hạn lượt/ngày ở ứng dụng'
                        : `${item.limits.requestsPerDay} lượt/ngày`}
                    </p>
                    <p>
                      {item.sourcePolicy === 'DENIED'
                        ? 'Project chưa được duyệt gửi dữ liệu ra nhà cung cấp.'
                        : 'Project được duyệt; từng source/version vẫn được kiểm tra riêng.'}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {(['APPROVE', 'REVOKE'] as const).map((action) => (
                        <button
                          type="button"
                          key={action}
                          disabled={
                            busy ||
                            (action === 'APPROVE' && !item.providerReady)
                          }
                          onClick={() =>
                            void act(async () => {
                              if (
                                !window.confirm(
                                  action === 'APPROVE'
                                    ? `Duyệt phạm vi Project chỉ gồm dữ liệu giả/công khai được phép cho ${item.label}? Từng nguồn và nội dung nhập vẫn phải duyệt riêng. Không duyệt dữ liệu mật/cá nhân khi tier chưa được xác minh.`
                                    : `Thu hồi quyền gửi Project tới ${item.label}? Dữ liệu đã gửi trước đó không thể thu hồi từ vendor bằng thao tác này.`,
                                )
                              )
                                return;
                              await call('/settings/egress', {
                                model: item.id,
                                kind: 'PROJECT',
                                action,
                                confirmed: true,
                              });
                            })
                          }
                        >
                          {action === 'APPROVE'
                            ? 'Duyệt phạm vi Project'
                            : 'Thu hồi Project'}
                        </button>
                      ))}
                    </div>
                    <p className="my-2">
                      Kiểm thử quản trị chỉ gửi nguồn tổng hợp cố định: văn bản
                      tối đa 3 câu; ảnh/PDF 1 câu. Không đọc hồ sơ dự án.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {(
                        [
                          'text',
                          ...(item.capabilities.nativeMediaImplemented
                            ? ['image', 'pdf']
                            : []),
                        ] as ('text' | 'image' | 'pdf')[]
                      ).map((capability) => (
                        <button
                          key={capability}
                          disabled={busy || !item.providerReady}
                          onClick={() =>
                            void act(async () => {
                              const name = `${item.id}/${capability}`;
                              let clientKey = activationKeys.current.get(name);
                              if (!clientKey) {
                                clientKey = createCommandKey();
                                activationKeys.current.set(name, clientKey);
                              }
                              const result = await call<
                                NonNullable<typeof activation>
                              >('/settings/test', {
                                model: item.id,
                                capability,
                                clientKey,
                              });
                              setActivation(result);
                              if (
                                [
                                  'COMPLETED',
                                  'FAILED',
                                  'FAILED_UNKNOWN',
                                ].includes(result.status)
                              )
                                activationKeys.current.delete(name);
                              const latest = await call<{
                                models: ModelChoice[];
                              }>('/settings');
                              setSettings(latest.models);
                              setModels(latest.models);
                            })
                          }
                        >
                          Kiểm thử{' '}
                          {capability === 'text'
                            ? 'văn bản'
                            : capability === 'image'
                              ? 'ảnh'
                              : 'PDF'}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                {activation && (
                  <p role="status" className="text-xs">
                    Lượt {activation.requestId} ·{' '}
                    {activation.evidence?.result === 'PASS'
                      ? 'Đạt kiểm thử nguồn tổng hợp'
                      : aiStatusLabel(
                          activation.errorCode ?? activation.status,
                        )}{' '}
                    · {activation.evidence?.requestedModel} · model trả về:{' '}
                    {activation.evidence?.returnedModel ??
                      'vendor không cung cấp metadata'}{' '}
                    · revision {activation.evidence?.revision ?? 'chưa có'}
                  </p>
                )}
              </details>
            )}
            {error && <p role="alert">{error}</p>}
            {loadError && <p role="alert">{loadError}</p>}
            <div className="flex flex-wrap gap-3">
              <button
                disabled={busy}
                onClick={() => {
                  select('');
                  setQuestion('');
                  setScope(group);
                }}
              >
                Chat AI mới
              </button>
              <label>
                Phạm vi{' '}
                <select
                  aria-label="Phạm vi AI"
                  value={selected ? (history?.scope ?? scope) : scope}
                  disabled={
                    busy || Boolean(selected) || Boolean(initialContext?.roomId)
                  }
                  onChange={(e) =>
                    onScopeChange
                      ? onScopeChange(e.target.value)
                      : setScope(e.target.value)
                  }
                >
                  {scopes.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Lịch sử{' '}
                <select
                  aria-label="Lịch sử AI"
                  value={selected}
                  disabled={busy}
                  onChange={(e) => {
                    select(e.target.value);
                    void refresh();
                  }}
                >
                  <option value="">Chat mới</option>
                  {list.map((conversation, i) => (
                    <option key={conversation.id} value={conversation.id}>
                      {
                        scopes.find(
                          ([value]) => value === conversation.scope,
                        )?.[1]
                      }{' '}
                      ·{' '}
                      {conversation.createdAt
                        ? new Date(conversation.createdAt).toLocaleString(
                            'vi-VN',
                          )
                        : i + 1}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {context && (
              <p
                className="rounded border border-amber-200 bg-amber-50 p-3 text-xs"
                role="status"
              >
                {context.roomId
                  ? `Ngữ cảnh hội thoại: ${roomLabels?.[context.roomId] ?? context.roomId}.`
                  : context.productLineId
                    ? 'Ngữ cảnh: các cuộc trao đổi liên kết hạng mục.'
                    : `Ngữ cảnh: file gốc, phiên bản v${context.fileVersion}.`}
                {context.roomId &&
                  context.roomId !== initialContext?.roomId &&
                  ' Phạm vi đã ghim khác room đang mở; chọn Chat AI mới để dùng room mới.'}{' '}
                Chỉ dùng nguồn có quyền trong chỉ mục hiện hữu; file chưa được
                gửi qua chat/phát hành có thể chưa có nguồn AI. Hội thoại đã lưu
                giữ phạm vi này.
              </p>
            )}
            <div className="ai-suggestions" aria-label="Gợi ý AI">
              {[
                'Tóm tắt các nguồn được phép và nêu việc còn thiếu.',
                'Đối chiếu các nguồn, chỉ rõ thông tin mâu thuẫn và phiên bản.',
                'Dịch nội dung nguồn được chọn sang tiếng Anh, giữ mã và con số.',
                'Soạn nháp phản hồi dựa trên nguồn, nêu rõ điểm cần xác nhận.',
              ].map((prompt, i) => (
                <button
                  key={prompt}
                  disabled={busy || Boolean(retryPin)}
                  onClick={() => setQuestion(prompt)}
                >
                  {['Tóm tắt', 'Đối chiếu', 'Dịch', 'Soạn phản hồi'][i]}
                </button>
              ))}
            </div>
            {index && (
              <div aria-label="Trạng thái nguồn">
                <p>
                  {index.hasMore
                    ? 'Còn nguồn chờ đọc; cập nhật tiếp để tiếp tục.'
                    : 'Đã xử lý lượt nguồn hiện tại.'}
                </p>
                <ul>
                  {index.sources.map((item) => (
                    <li key={item.id}>
                      {item.nativeFile && (
                        <input
                          type="checkbox"
                          aria-label={`Gửi native ${item.label}`}
                          disabled={
                            busy ||
                            !(item.label.toLowerCase().endsWith('.pdf')
                              ? chosenModel?.capabilities.pdfInput
                              : chosenModel?.capabilities.imageInput)
                          }
                          checked={sourceIds.includes(item.id)}
                          onChange={(e) =>
                            setSourceIds((current) =>
                              e.target.checked
                                ? [...current, item.id].slice(0, 3)
                                : current.filter((id) => id !== item.id),
                            )
                          }
                        />
                      )}
                      {item.label}: {aiStatusLabel(item.status)}
                      {canConfigure && item.version && (
                        <span>
                          {(['APPROVE', 'REVOKE'] as const).map((action) => (
                            <button
                              type="button"
                              key={action}
                              disabled={
                                busy ||
                                !model ||
                                (action === 'APPROVE' &&
                                  !chosenModel?.providerReady)
                              }
                              onClick={() =>
                                void act(async () => {
                                  if (
                                    !window.confirm(
                                      action === 'APPROVE'
                                        ? `Xác nhận phiên bản này là dữ liệu giả/công khai được phép gửi tới ${chosenModel?.label}?`
                                        : 'Thu hồi quyền gửi phiên bản này? Không xóa nguồn hoặc hội thoại.',
                                    )
                                  )
                                    return;
                                  await call('/settings/egress', {
                                    model,
                                    kind: 'SOURCE',
                                    action,
                                    sourceId: item.id,
                                    version: item.version,
                                    confirmed: true,
                                  });
                                })
                              }
                            >
                              {action === 'APPROVE'
                                ? 'Duyệt phiên bản'
                                : 'Thu hồi phiên bản'}
                            </button>
                          ))}
                        </span>
                      )}
                      {item.nativeFile
                        ? ' · Có thể chọn gửi native khi capability đã được bật; tối đa 3 file, PDF ngắn tối đa 10 trang/file.'
                        : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {history?.answers.map((answer) => (
              <AiAnswer
                key={answer.id}
                answer={answer}
                onDraft={onDraft}
                onSource={(item) => {
                  void openSource(answer.id, item);
                }}
                onRun={() => {
                  void act(async () => {
                    await run(answer.id);
                  });
                }}
                onCancel={() => {
                  void call(`/answers/${answer.id}/cancel`, {})
                    .then(refresh)
                    .catch(invalidate);
                }}
              />
            ))}
            {source && (
              <SourceDrawer
                dialogRef={sourceDialog}
                title="Nguồn câu trả lời"
                className="ai-source-drawer"
                closeLabel="Đóng nguồn"
                onClose={() => {
                  sourceKey.current = undefined;
                  setSource(undefined);
                }}
              >
                <h3>{source.label}</h3>
                <p>
                  Bản {source.version} ·{' '}
                  {source.page
                    ? `trang ${source.page}`
                    : `dòng ${source.startLine}–${source.endLine}`}{' '}
                  ·{' '}
                  {source.provenance === 'PUBLISHED'
                    ? 'Nguồn đã phát hành'
                    : 'Trao đổi chưa xác nhận'}
                </p>
                <pre className="whitespace-pre-wrap">{source.text}</pre>
                {source.downloadUrl?.startsWith('/api/v1/project-chat/') && (
                  <a href={source.downloadUrl}>Mở file đúng phiên bản</a>
                )}
              </SourceDrawer>
            )}
            {!busy && retryPin && (
              <aside role="status" className="grid gap-2 rounded border p-3">
                <p>
                  Lượt gửi chưa rõ kết quả:{' '}
                  {models.find((m) => m.id === retryPin.model)?.label ??
                    retryPin.model}{' '}
                  · mức {retryPin.reasoning} · {retryPin.sourceIds.length} file.
                  Thử lại giữ nguyên câu hỏi, model và nguồn đã chốt.
                </p>
                <button
                  type="button"
                  disabled={!pilotConfirmed}
                  onClick={() => void ask(true)}
                >
                  Thử lại lượt đã chốt
                </button>
                <button
                  type="button"
                  onClick={() => {
                    requestKey.current = undefined;
                    setRetryPin(undefined);
                    setError(
                      'Đã bỏ retry. Lượt tiếp theo là yêu cầu mới; lượt trước có thể đã được xử lý.',
                    );
                  }}
                >
                  Tạo lượt mới theo lựa chọn hiện tại
                </button>
              </aside>
            )}
          </div>
          {newMessages && (
            <button
              className="ai-new-messages"
              onClick={() => {
                const node = scrollNode.current;
                if (node) node.scrollTop = node.scrollHeight;
                scrollPosition.current.nearEnd = true;
                setNewMessages(false);
              }}
            >
              Có cập nhật · Xuống cuối ↓
            </button>
          )}
          <form
            className="ai-composer"
            onSubmit={(e) => {
              e.preventDefault();
              void ask();
            }}
          >
            <label>
              Câu hỏi AI
              <ChatComposerInput
                aria-label="Câu hỏi AI"
                value={question}
                disabled={busy}
                onChange={setQuestion}
              />
            </label>
            {canConfigure && (
              <div className="flex flex-wrap gap-2">
                {(['APPROVE', 'REVOKE'] as const).map((action) => (
                  <button
                    type="button"
                    key={action}
                    disabled={
                      busy ||
                      !question.trim() ||
                      !model ||
                      (action === 'APPROVE' &&
                        (!chosenModel?.providerReady || !pilotConfirmed))
                    }
                    onClick={() =>
                      void act(async () => {
                        if (
                          !window.confirm(
                            action === 'APPROVE'
                              ? `Phê duyệt đúng nội dung đang nhập là dữ liệu giả/công khai, gửi tới ${chosenModel?.label}? Áp dụng cho người có quyền AI trong Project; không duyệt file hay lịch sử khác.`
                              : 'Thu hồi phê duyệt nội dung đang nhập đối với model này?',
                          )
                        )
                          return;
                        await call('/settings/egress', {
                          model,
                          kind: 'INPUT',
                          action,
                          question: question.trim(),
                          confirmed: true,
                        });
                        setError(
                          action === 'APPROVE'
                            ? 'Đã phê duyệt nội dung này; bấm Hỏi AI để gửi.'
                            : 'Đã thu hồi phê duyệt nội dung.',
                        );
                      })
                    }
                  >
                    {action === 'APPROVE'
                      ? 'Phê duyệt nội dung nhập'
                      : 'Thu hồi nội dung nhập'}
                  </button>
                ))}
              </div>
            )}
            <label className="ai-policy-confirm">
              <input
                type="checkbox"
                checked={pilotConfirmed}
                onChange={(e) => setPilotConfirmed(e.target.checked)}
              />{' '}
              Câu hỏi chỉ chứa dữ liệu giả hoặc công khai được phép; không có dữ
              liệu mật/cá nhân.
            </label>
            {sourceIds.length > 0 && (
              <ul className="ai-file-chips">
                {sourceIds.map((id) => (
                  <li key={id}>
                    {index?.sources.find((item) => item.id === id)?.label ??
                      'Nguồn đã chọn'}
                    <button
                      type="button"
                      aria-label="Bỏ file đã chọn"
                      disabled={busy}
                      onClick={() =>
                        setSourceIds((current) =>
                          current.filter((value) => value !== id),
                        )
                      }
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="ai-composer-actions">
              <button
                type="button"
                disabled={busy || mode === 'GENERAL'}
                onClick={updateSources}
                title="Chọn nguồn đã có trong phạm vi được cấp"
              >
                Đính kèm nguồn
              </button>
              <span className="chat-metadata">
                {chosenModel?.label ?? 'Chưa chọn model'} · Shift+Enter xuống
                dòng
              </span>
              <button
                className="chat-send"
                type="submit"
                disabled={
                  busy ||
                  Boolean(retryPin) ||
                  !question.trim() ||
                  !chosenModel?.available ||
                  !pilotConfirmed
                }
              >
                {busy ? 'Đang tìm nguồn / xử lý…' : 'Hỏi AI'}
              </button>
              {history?.answers.some((answer) =>
                pending.includes(answer.status),
              ) && (
                <button
                  type="button"
                  onClick={() => {
                    const answer = history.answers.findLast((item) =>
                      pending.includes(item.status),
                    );
                    if (answer)
                      void call(`/answers/${answer.id}/cancel`, {})
                        .then(refresh)
                        .catch(invalidate);
                  }}
                >
                  Dừng
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </section>
  );
  return portalTarget === undefined
    ? content
    : portalTarget && active
      ? createPortal(content, portalTarget)
      : null;
}
