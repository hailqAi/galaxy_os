'use client';
import { createCommandKey } from '../../app/lib/create-command-key';

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import conversationEmpty from '../../app/assets/conversation-empty.svg';
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
  artifacts?: {
    sourceId: string;
    fileAssetId: string;
    version: string;
    filename: string;
    format: string;
    sizeBytes: number;
    downloadUrl: string;
    diff?: {
      added: string[];
      removed: string[];
      coverage: string;
      truncated?: boolean;
    } | null;
  }[];
  mode?: 'GENERAL' | 'PROJECT' | 'UNIFIED';
  model?: string | null;
  modelLabel?: string | null;
  provider?: string | null;
  providerLabel?: string | null;
  returnedModel?: string | null;
  cost?: { status: string; value: number | null; source: string | null };
  errorCode?: string | null;
  toolActivity?: string | null;
  createdAt?: string;
  usage?: { input_tokens: number; output_tokens: number } | null;
  id: string;
  status: string;
  question: string | null;
  answer: string | null;
  uncertainty?: string | null;
  sources: Source[];
};
export type Conversation = {
  mode?: 'GENERAL' | 'PROJECT' | 'UNIFIED';
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
  web?: {
    url: string;
    retrievedAt: string;
    kind: 'SNIPPET' | 'PAGE';
    provider: string;
  };
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
    PDF_SCAN_UNSUPPORTED:
      'PDF dạng ảnh chưa có đường đọc đã kiểm chứng. Hãy chọn PDF có text hoặc ảnh PNG/JPG.',
    PDF_SCAN_REQUIRES_VISION:
      'PDF dạng ảnh cần model đọc ảnh. Tối đa 3 trang đầu mỗi lượt.',
    PDF_RENDER_UNAVAILABLE:
      'Chưa chuyển được trang PDF thành ảnh. Thử lại hoặc chọn tệp khác.',
    PDF_TEXT_UNAVAILABLE:
      'Chưa đọc được text PDF. Thử lại hoặc kiểm tra tệp có mật khẩu.',
    PDF_VALIDATION_UNAVAILABLE:
      'Không kiểm tra được PDF; tệp có thể hỏng hoặc được bảo vệ.',
    SOURCE_UNAVAILABLE: 'Nguồn chưa sẵn sàng hoặc phiên bản không còn hợp lệ',
    CONVERSATION_CONTEXT_CHANGED:
      'Phạm vi hội thoại đã được cố định. Tạo chat AI mới để đổi ngữ cảnh.',
    INVALID_CONTEXT: 'Câu hỏi hoặc ngữ cảnh chưa hợp lệ',
    OUTPUT_TOO_LARGE: 'Kết quả vượt giới hạn kiểm tra; chưa được phát hành',
    PROVIDER_REJECTED: 'Nhà cung cấp từ chối yêu cầu; cần kiểm tra cấu hình',
    FILE_NOT_LIVE_VERIFIED:
      'Ảnh/PDF chưa được kiểm chứng live và chưa được bật',
    PDF_PAGE_LIMIT: 'PDF vượt giới hạn 10 trang; cần bản trích trang phù hợp',
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
    NEEDS_PROVIDER_CONFIGURATION_OR_BUDGET:
      'Công cụ này chưa được quản trị bật hoặc cấp hạn mức.',
    PUBLIC_SUBJECT_REQUIRED:
      'Chưa có mục tra cứu công khai phù hợp được cấu hình.',
    PUBLIC_URL_REQUIRED:
      'Chỉ đọc URL công khai hợp lệ được chọn trong lượt này.',
    PUBLIC_PAGE_UNAVAILABLE: 'Trang công khai tạm chưa đọc được.',
    WEB_SEARCH_UNAVAILABLE: 'Tìm kiếm web tạm lỗi; chưa có kết quả xác minh.',
    WEB_BUDGET_LIMIT: 'Đã hết hạn mức tra web trong ngày.',
    TOOL_CALL_LIMIT:
      'Lượt này đã đạt giới hạn công cụ; hãy chia yêu cầu nhỏ hơn.',
    TOOL_CONTEXT_LIMIT:
      'Phạm vi đọc vượt giới hạn lượt này; hãy chọn phần cụ thể hơn.',
    DOCUMENT_LIMIT:
      'Tài liệu vượt giới hạn tạo trong một lượt. Hãy chia nhỏ nội dung.',
    DOCUMENT_IMAGE_UNAVAILABLE: 'Chưa đọc được ảnh được chọn cho tài liệu.',
    DOCUMENT_IMAGE_LIMIT: 'Ảnh quá lớn để đưa vào tài liệu.',
    TOOL_TIMEOUT: 'Công cụ mất quá nhiều thời gian; lượt này đã dừng.',
    WEB_COST_VIOLATION: 'Đường tra web đã dừng do mức sử dụng bất thường.',
    WEB_COST_UNVERIFIED:
      'Chưa xác minh được mức sử dụng web; cần quản trị kiểm tra.',
    TOOL_TOKEN_LIMIT: 'Lượt này đã đạt giới hạn xử lý.',
    TOOL_OUTPUT_TOO_LARGE: 'Kết quả quá lớn; hãy thu hẹp phần cần đọc.',
    TABLE_RANGE_LIMIT: 'Chỉ phân tích tối đa 400 ô trong một lần gọi.',
    SHEET_NOT_FOUND: 'Không tìm thấy sheet được yêu cầu trong file.',

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
      <div
        className="ai-response-card"
        role="region"
        aria-label="Câu trả lời Galaxy AI"
      >
        <p className="ai-author">✦ Galaxy AI</p>
        <p role="status" className="chat-metadata">
          {answer.status === 'RUNNING' && answer.toolActivity
            ? answer.toolActivity
            : aiStatusLabel(
                answer.errorCode ?? answer.status,
                aiStatusLabel(answer.status),
              )}
        </p>
        <details className="ai-answer-details">
          <summary>Thông tin lượt trả lời</summary>
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
        </details>
        {answer.status === 'COMPLETED' && (
          <>
            <ChatText text={answer.answer ?? ''} />
            {answer.uncertainty && (
              <p className="whitespace-pre-wrap">{answer.uncertainty}</p>
            )}
            <ul className="ai-file-chips">
              {answer.artifacts
                ?.filter((file) =>
                  /^\/api\/v1\/project-chat\/projects\/[^/]+\/ai\/files\/[^/]+\/download$/.test(
                    file.downloadUrl,
                  ),
                )
                .map((file) => (
                  <li key={file.fileAssetId}>
                    <a
                      href={file.downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {file.filename} · {Math.ceil(file.sizeBytes / 1024)} KB
                    </a>
                    <p className="chat-metadata">
                      Bản nháp AI · Chưa phê duyệt · Phiên bản{' '}
                      {file.version.split(':')[0]}
                    </p>
                    {file.diff && (
                      <details>
                        <summary>Thay đổi bản nháp</summary>
                        <p>
                          {file.diff.coverage}
                          {file.diff.truncated
                            ? ' Bản đối chiếu đã rút gọn.'
                            : ''}
                        </p>
                        {file.diff.removed.map((line, i) => (
                          <p key={'r' + i}>
                            <del>{line}</del>
                          </p>
                        ))}
                        {file.diff.added.map((line, i) => (
                          <p key={'a' + i}>
                            <ins>{line}</ins>
                          </p>
                        ))}
                      </details>
                    )}
                  </li>
                ))}
            </ul>
            {onDraft && answer.answer && (
              <button onClick={() => onDraft(answer.answer!)}>
                Dùng làm nháp phản hồi
              </button>
            )}
            {answer.sources.length > 0 && (
              <p className="ai-citation-heading">Nguồn trích dẫn</p>
            )}
            <ul className="ai-citations">
              {answer.sources.map((source) => (
                <li key={source.handle}>
                  <button onClick={() => onSource(source)}>
                    {source.label} · bản {source.version.split(':')[0]} ·{' '}
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
      </div>
    </article>
  );
}

export function ChatGptConnection() {
  const description = useId();
  return (
    <section aria-label="Kết nối ChatGPT" className="ai-capability-state">
      <button type="button" disabled aria-describedby={description}>
        Kết nối ChatGPT
      </button>
      <p id={description}>
        Quyền kết nối ChatGPT của ứng dụng Galaxy OS chưa được xác nhận. Chưa có
        tài khoản kết nối hoặc model được cấp. Bạn vẫn có thể xem hồ sơ, công
        việc và lịch sử còn quyền.
      </p>
      <p>
        Các dịch vụ dùng API key đang tạm dừng. Không tự chuyển sang dịch vụ
        tính phí.
      </p>
    </section>
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
        {models
          .filter((model) => model.available)
          .map((model) => (
            <option key={model.id} value={model.id} disabled={!model.available}>
              {model.label} · {model.providerLabel}
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
  onDraft,
  initialContext,
  roomLabels,
  portalTarget,
  active = true,
  presentation = 'docked',
  projectName,
  initialConversationId,
  onSelected,
  onConversations,
  onBrowse,
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
  presentation?:
    | 'docked'
    | 'floating'
    | 'expanded'
    | 'page'
    | 'workspace'
    | 'sidebar';
  projectName?: string;
  initialConversationId?: string;
  onSelected?: (id: string) => void;
  onConversations?: (items: Conversation[]) => void;
  onBrowse?: () => void;
  onScopeChange?: (scope: string) => void;
  onFloat?: () => void;
  onExpand?: () => void;
  onMinimize?: () => void;
  onClose?: () => void;
  onPage?: () => void;
}) {
  const panel = useRef<HTMLElement>(null);
  const workspace = presentation === 'workspace' || presentation === 'page';
  const [started, setStarted] = useState(false);
  const [mobileHistory, setMobileHistory] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [models, setModels] = useState<ModelChoice[]>([]);
  const [planOnly, setPlanOnly] = useState(false);
  const choices = models.filter((item) => item.available);
  const [model, setModel] = useState('');
  const [reasoning, setReasoning] = useState('default');
  const [sourceIds, setSourceIds] = useState<string[]>([]);
  type UploadChip = {
    key: string;
    file: File;
    id?: string;
    status: string;
    error?: string;
  };
  const [uploads, setUploads] = useState<UploadChip[]>([]);
  const uploadItems = useRef<UploadChip[]>([]);
  const uploadJobs = useRef(new Map<string, Promise<void>>());
  const fileInput = useRef<HTMLInputElement>(null);
  const conversationCreation = useRef<
    { key: string; pending?: Promise<string> } | undefined
  >(undefined);
  const [attachmentMenu, setAttachmentMenu] = useState(false);

  const modelInitialized = useRef(false);
  const modelConversation = useRef('');
  const modelStorageKey = `galaxy-ai-model:${actorId}:${projectId}`;
  const chosenModel = choices.find((m) => m.id === model);
  const [list, setList] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState('');
  const selectedRef = useRef('');
  const [scope, setScope] = useState(group);
  const [history, setHistory] = useState<History>();
  const context =
    selected && history?.answers.length
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
  const conversationsCallback = useRef(onConversations);
  useLayoutEffect(() => {
    conversationsCallback.current = onConversations;
  }, [onConversations]);
  const pagePresentation = useRef(presentation === 'page');
  useLayoutEffect(() => {
    selectedCallback.current = onSelected;
    pagePresentation.current =
      active &&
      ['page', 'docked', 'workspace', 'sidebar'].includes(presentation);
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
    window.history.replaceState(null, '', url);
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
      errorCode?: string | null;
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
        reasoning: string;
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
      conversationsCallback.current?.([]);
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
          window.history.replaceState(null, '', url);
        }
        onRevoked(cause.status);
      }
    },
    [onRevoked, setSource, setQuestion, setRetryPin, projectId],
  );
  const select = (id: string) => {
    setStarted(true);
    if (!id) {
      const router = models.find(
        (item) => item.id === 'openrouter/free' && item.available,
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
    uploadItems.current = [];
    uploadJobs.current.clear();
    setUploads([]);
    conversationCreation.current = undefined;
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
              executionPolicy?: string;
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
        const identity = aiSessionKey(projectId, group, initialContext);
        if (
          detail &&
          detail.mode !== 'GENERAL' &&
          detail.mode !== 'UNIFIED' &&
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
        setPlanOnly(result.executionPolicy === 'CHATGPT_PLAN_ONLY');
        setModels(result.models ?? []);
        if (!modelInitialized.current && result.models) {
          modelInitialized.current = true;
          let saved: string | null = null;
          try {
            saved = sessionStorage.getItem(modelStorageKey);
          } catch {
            /* Lựa chọn vẫn dùng được khi trình duyệt chặn storage. */
          }
          const candidate = saved
            ? (result.models.find((m) => m.id === saved && m.available) ??
              result.models.find((m) => m.available))
            : result.models.find(
                (m) => m.provider === 'openrouter' && m.available,
              );
          setModel(candidate?.id ?? '');
          setReasoning(
            candidate?.capabilities.reasoningModes.includes('high')
              ? 'high'
              : 'default',
          );
        }
        conversationsCallback.current?.(result.conversations);
        setList(
          result.conversations.filter(
            (item) =>
              item.mode === 'UNIFIED' ||
              (item.mode === 'GENERAL' && item.scope === group) ||
              aiSessionKey(projectId, item.scope, item.context) === identity,
          ),
        );
        setSelected(id);
        setHistory(detail);
        if (detail?.answers.length) {
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
  const externalSelection = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (
      initialConversationId !== externalSelection.current &&
      !sending.current
    ) {
      externalSelection.current = initialConversationId;
      if (
        initialConversationId &&
        initialConversationId !== selectedRef.current
      ) {
        select(initialConversationId);
        void refresh();
      }
    }
  });
  useEffect(() => {
    controller.current = new AbortController();
    const generation = reading;
    queueMicrotask(() => void refresh());
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
  const ensureConversation = async () => {
    if (selectedRef.current) return selectedRef.current;
    if (conversationCreation.current?.pending)
      return conversationCreation.current.pending;
    const creation: { key: string; pending?: Promise<string> } = {
      key: conversationCreation.current?.key ?? createCommandKey(),
    };
    conversationCreation.current = creation;
    if (!creation.pending)
      creation.pending = call<Conversation>('/conversations', {
        clientKey: creation.key,
        scope,
      })
        .then((value) => {
          if (
            controller.current?.signal.aborted ||
            conversationCreation.current !== creation
          )
            throw new Error('Đã đổi ngữ cảnh.');
          selectedRef.current = value.id;
          setSelected(value.id);
          updateUrl(value.id);
          return value.id;
        })
        .catch((error) => {
          creation.pending = undefined;
          throw error;
        });
    return creation.pending;
  };
  const uploadFile = (item: UploadChip) => {
    const pending = uploadJobs.current.get(item.key);
    if (pending) return pending;
    const signal = controller.current?.signal;
    const update = (value: Partial<UploadChip>) => {
      if (signal?.aborted || !uploadItems.current.includes(item)) return;
      Object.assign(item, value);
      setUploads([...uploadItems.current]);
    };
    const job = (async () => {
      try {
        const conversationId = await ensureConversation();
        if (signal?.aborted || !uploadItems.current.includes(item)) return;
        if (!item.id) {
          update({ status: 'Đang tải', error: undefined });
          const form = new FormData();
          form.append('clientKey', item.key);
          form.append('file', item.file);
          const saved = await api<{ id: string }>(
            `${base}/conversations/${conversationId}/files`,
            {
              method: 'POST',
              body: form,
              headers: { 'X-Chat-Actor': actorId },
              signal: AbortSignal.any([
                ...(signal ? [signal] : []),
                AbortSignal.timeout(110000),
              ]),
            },
          );
          update({ id: saved.id, status: 'Đã lưu' });
        }
        if (signal?.aborted || !uploadItems.current.includes(item)) return;
        update({ status: 'Đang đọc' });
        const indexed = await call<{
          sources: {
            id: string;
            status: string;
            errorCode?: string;
            nativeFile?: boolean;
            label: string;
          }[];
        }>('/index', { scope: 'ALL' });
        const source = indexed.sources.find((source) => source.id === item.id);
        const image = /^image\/(png|jpeg)$/.test(item.file.type);
        if (
          source?.status !== 'READY' &&
          !(
            (image || source?.errorCode === 'PDF_SCAN_REQUIRES_VISION') &&
            chosenModel?.capabilities.imageInput
          )
        )
          throw new Error(
            aiStatusLabel(
              source?.errorCode ??
                (image
                  ? 'FILE_NOT_LIVE_VERIFIED'
                  : (source?.status ?? 'SOURCE_UNAVAILABLE')),
            ),
          );
        update({ status: 'Sẵn sàng', error: undefined });
      } catch (cause) {
        update({
          status: 'Lỗi',
          error: aiStatusLabel(
            (cause as Error).message,
            (cause as Error).message,
          ),
        });
      } finally {
        uploadJobs.current.delete(item.key);
      }
    })();
    uploadJobs.current.set(item.key, job);
    return job;
  };
  const chooseFiles = (files: FileList | null) => {
    setAttachmentMenu(false);
    for (const file of Array.from(files ?? [])) {
      if (uploadItems.current.length + sourceIds.length >= 3) {
        setError('Mỗi lượt chọn tối đa 3 tệp.');
        break;
      }
      const item: UploadChip = {
        key: createCommandKey(),
        file,
        status: 'Đang tải',
      };
      uploadItems.current.push(item);
      setUploads([...uploadItems.current]);
      void uploadFile(item);
    }
  };
  const run = async (id: string) => call<Answer>(`/answers/${id}/run`, {});
  const ask = (retry = false) =>
    act(async () => {
      const text = retry
        ? (requestKey.current?.question ?? '')
        : question.trim() ||
          (uploadItems.current.length || sourceIds.length
            ? 'Đọc và tóm tắt nội dung các tệp đã chọn, nêu rõ phần chưa đọc được.'
            : '');
      if (!text || (!retry && !chosenModel?.available)) return;
      if (requestKey.current && !retry) return;
      if (!retry) {
        await Promise.all(uploadJobs.current.values());
        if (controller.current?.signal.aborted) return;
        if (uploadItems.current.some((item) => item.status !== 'Sẵn sàng')) {
          setError('Tệp chưa đọc được. Thử lại hoặc bỏ tệp trước khi gửi.');
          return;
        }
      }
      if (!requestKey.current)
        requestKey.current = {
          conversationKey: createCommandKey(),
          clientKey: createCommandKey(),
          question: text,
          scope,
          model,
          reasoning,
          sourceIds: [
            ...new Set([
              ...sourceIds,
              ...uploadItems.current.flatMap((item) =>
                item.id ? [item.id] : [],
              ),
            ]),
          ],
          context,
          conversationId: selectedRef.current || undefined,
        };
      const key = requestKey.current;
      if (!key.conversationId) key.conversationId = await ensureConversation();
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
          reasoning: key.reasoning,
          sourceIds: key.sourceIds,
          ...key.context,
        },
      );
      if (controller.current?.signal.aborted) return;
      requestKey.current = undefined;
      setRetryPin(undefined);
      await refresh();
      const result = await run(answer.id);
      if (result.status === 'COMPLETED') {
        setQuestion((current) =>
          current.trim() === key.question ? '' : current,
        );
        uploadItems.current = [];
        setUploads([]);
        setSourceIds([]);
      }
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
      const chosen = 'ALL';
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
  const modelControls = (
    <div className="ai-context-bar">
      {planOnly && <ChatGptConnection />}
      <p className="ai-privacy">
        Ngữ cảnh: {projectName ?? 'Dự án'} · Chỉ dự án này
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
        {chosenModel && chosenModel.capabilities.reasoningModes.length > 1 && (
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
      {!choices.length && (
        <p role="status" className="ai-capability-state">
          Hiện chưa có model có thể nhận yêu cầu. Nội dung của bạn được giữ lại.
        </p>
      )}
    </div>
  );
  const rail = (
    <aside
      className={`ai-workspace-rail ${mobileHistory ? 'is-open' : ''}`}
      aria-label="Nguồn và lịch sử AI"
    >
      {(workspace || presentation === 'sidebar') && modelControls}
      <section className="ai-context-sources">
        <h3>Nguồn tham chiếu</h3>
        {history?.answers
          .filter((a) => a.status === 'COMPLETED')
          .flatMap((a) => a.sources.map((item) => ({ answerId: a.id, item })))
          .filter(
            (entry, i, all) =>
              all.findIndex(
                (other) => other.item.handle === entry.item.handle,
              ) === i,
          )
          .map(({ answerId, item }) => (
            <button
              key={item.handle}
              onClick={() => void openSource(answerId, item)}
            >
              {item.label}
            </button>
          ))}
        {!history?.answers.some(
          (a) => a.status === 'COMPLETED' && a.sources.length,
        ) && (
          <p className="chat-metadata">Nguồn được dùng sẽ xuất hiện tại đây.</p>
        )}
      </section>
      <nav className="ai-thread-history" aria-label="Lịch sử phiên AI">
        <h3>Lịch sử phiên AI</h3>
        <button
          disabled={busy}
          onClick={() => {
            select('');
            setQuestion('');
            setMobileHistory(false);
            if (presentation === 'sidebar') onFloat?.();
          }}
        >
          ＋ Chat AI mới
        </button>
        {list.map((conversation, i) => (
          <button
            key={conversation.id}
            data-conversation-id={conversation.id}
            disabled={busy}
            aria-current={selected === conversation.id ? 'page' : undefined}
            onClick={() => {
              select(conversation.id);
              setMobileHistory(false);
              void refresh();
              if (presentation === 'sidebar') onFloat?.();
            }}
          >
            <strong>
              {scopes.find(([value]) => value === conversation.scope)?.[1] ??
                'Hội thoại AI'}{' '}
              · {i + 1}
            </strong>
            <small>
              {conversation.createdAt
                ? new Date(conversation.createdAt).toLocaleString('vi-VN')
                : 'Hội thoại riêng'}
            </small>
          </button>
        ))}
        {!list.length && (
          <p className="chat-metadata">Chưa có phiên AI đã lưu.</p>
        )}
      </nav>
    </aside>
  );
  const content = (
    <section
      ref={panel}
      aria-label="Hỏi AI"
      data-presentation={presentation}
      data-workspace-state={!selected && !started ? 'empty' : 'selected'}
      className={`project-ai-panel ${workspace ? 'ai-workspace-panel' : ''} ${collapsed && presentation === 'docked' ? 'is-collapsed' : ''}`}
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
        {workspace && (
          <button
            className="ai-mobile-back"
            onClick={onBrowse}
            aria-label="Chọn cuộc trao đổi hoặc dự án"
          >
            ‹
          </button>
        )}
        <div>
          <span className="eyebrow">Galaxy AI · Riêng tư</span>
          <h2 className="mt-1 font-semibold">Galaxy AI</h2>
          {projectName && <p className="ai-project-name">{projectName}</p>}
        </div>
        <div className="flex gap-1">
          {workspace && (
            <button
              aria-label="Mở nguồn và lịch sử AI"
              aria-expanded={mobileHistory}
              onClick={() => setMobileHistory((value) => !value)}
            >
              Lịch sử
            </button>
          )}
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
          {onFloat &&
            (presentation === 'docked' ||
              presentation === 'sidebar' ||
              presentation === 'workspace') && (
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
          {(onMinimize || presentation === 'docked') && (
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
          )}
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
        {verified && (workspace || presentation === 'sidebar') && rail}
        {presentation !== 'sidebar' && (
          <div className="ai-session-content" hidden={!verified}>
            {presentation === 'workspace' && !selected && !started ? (
              <div className="ai-workspace-empty">
                <span className="ai-empty-symbol" aria-hidden="true">
                  <Image
                    src={conversationEmpty}
                    alt=""
                    width={40}
                    height={40}
                  />
                </span>
                <h2>Chọn một cuộc trao đổi để làm việc</h2>
                <p>
                  Mỗi chủ đề có thành viên, công việc và hồ sơ riêng. Bắt đầu
                  một phiên AI riêng trong dự án này.
                </p>
                <button className="chat-send" onClick={() => setStarted(true)}>
                  ＋ Tạo cuộc trao đổi mới
                </button>
              </div>
            ) : (
              <>
                <div
                  className="ai-scroll-body"
                  ref={scrollRef}
                  onScroll={(event) => {
                    const node = event.currentTarget;
                    const nearEnd =
                      node.scrollHeight - node.scrollTop - node.clientHeight <
                      48;
                    scrollPosition.current = { top: node.scrollTop, nearEnd };
                    if (nearEnd) setNewMessages(false);
                  }}
                >
                  {!workspace && modelControls}
                  {!workspace && (
                    <details className="ai-compact-history">
                      <summary>Nguồn và lịch sử</summary>
                      {rail}
                    </details>
                  )}
                  {error && <p role="alert">{error}</p>}
                  {loadError && <p role="alert">{loadError}</p>}
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
                      Nguồn được kiểm tra quyền theo dự án và phiên bản trước
                      mỗi lượt gửi. Hội thoại đã lưu giữ phạm vi này.
                    </p>
                  )}
                  <details className="ai-suggestions">
                    <summary>Gợi ý AI</summary>
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
                  </details>
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
                            {(item.status === 'READY' || item.nativeFile) && (
                              <input
                                type="checkbox"
                                aria-label={`Chọn ${item.label}`}
                                disabled={
                                  busy ||
                                  (item.status !== 'READY' &&
                                    !(item.label
                                      .toLowerCase()
                                      .endsWith('.pdf') &&
                                    item.errorCode !==
                                      'PDF_SCAN_REQUIRES_VISION'
                                      ? chosenModel?.capabilities.pdfInput
                                      : chosenModel?.capabilities.imageInput))
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
                            {item.label}:{' '}
                            {item.status === 'UNSUPPORTED' && item.nativeFile
                              ? 'Cần model đọc ảnh/tài liệu'
                              : aiStatusLabel(item.status)}
                            {item.nativeFile
                              ? item.errorCode === 'PDF_SCAN_REQUIRES_VISION'
                                ? ' · Đọc ảnh tối đa 3 trang đầu.'
                                : ' · Tối đa 3 tệp mỗi lượt; chỉ đọc khi model hỗ trợ.'
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
                  {!busy && retryPin && (
                    <aside
                      role="status"
                      className="grid gap-2 rounded border p-3"
                    >
                      <p>
                        Lượt gửi chưa rõ kết quả:{' '}
                        {models.find((m) => m.id === retryPin.model)?.label ??
                          retryPin.model}{' '}
                        · mức {retryPin.reasoning} · {retryPin.sourceIds.length}{' '}
                        file. Thử lại giữ nguyên câu hỏi, model và nguồn đã
                        chốt.
                      </p>
                      <button type="button" onClick={() => void ask(true)}>
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
                    {planOnly && (
                      <span role="status" className="block text-sm">
                        Chưa kết nối ChatGPT · Quyền ứng dụng chưa được xác
                        nhận.
                      </span>
                    )}
                    <ChatComposerInput
                      aria-label="Câu hỏi AI"
                      value={question}
                      disabled={busy}
                      onChange={setQuestion}
                    />
                  </label>
                  <input
                    ref={fileInput}
                    type="file"
                    aria-label="Tải tệp từ máy"
                    accept=".txt,.md,.pdf,.png,.jpg,.jpeg,.docx,.xlsx"
                    multiple
                    hidden
                    onChange={(event) => {
                      chooseFiles(event.target.files);
                      event.target.value = '';
                    }}
                  />
                  {uploads.length > 0 && (
                    <ul className="ai-file-chips">
                      {uploads.map((item) => (
                        <li key={item.key}>
                          {item.file.name} · {Math.ceil(item.file.size / 1024)}{' '}
                          KB · {item.status}
                          {item.error && (
                            <span role="alert"> · {item.error}</span>
                          )}
                          {item.status === 'Lỗi' && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void uploadFile(item)}
                            >
                              Thử lại tệp
                            </button>
                          )}
                          <button
                            type="button"
                            aria-label={`Bỏ ${item.file.name}`}
                            disabled={busy}
                            onClick={() => {
                              uploadItems.current = uploadItems.current.filter(
                                (entry) => entry !== item,
                              );
                              setUploads([...uploadItems.current]);
                            }}
                          >
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {sourceIds.length > 0 && (
                    <ul className="ai-file-chips">
                      {sourceIds.map((id) => (
                        <li key={id}>
                          {index?.sources.find((item) => item.id === id)
                            ?.label ?? 'Nguồn đã chọn'}
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
                    <div>
                      <button
                        type="button"
                        aria-label="Đính kèm tệp"
                        aria-expanded={attachmentMenu}
                        disabled={busy}
                        onClick={() => setAttachmentMenu((value) => !value)}
                      >
                        ＋
                      </button>
                      {attachmentMenu && (
                        <div role="group" aria-label="Chọn cách đính kèm">
                          <button
                            type="button"
                            onClick={() => {
                              setAttachmentMenu(false);
                              fileInput.current?.click();
                            }}
                          >
                            Tải tệp từ máy
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setAttachmentMenu(false);
                              updateSources();
                            }}
                          >
                            Chọn trong hồ sơ dự án
                          </button>
                        </div>
                      )}
                    </div>
                    <span className="chat-metadata">
                      {chosenModel?.label ?? 'Chưa chọn model'} · Shift+Enter
                      xuống dòng
                    </span>
                    <button
                      className="chat-send"
                      type="submit"
                      disabled={
                        busy ||
                        Boolean(retryPin) ||
                        (!question.trim() &&
                          !uploads.length &&
                          !sourceIds.length) ||
                        !chosenModel?.available
                      }
                    >
                      {busy ? 'Đang xử lý…' : 'Gửi'}
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
              </>
            )}
          </div>
        )}
      </div>
      {verified && source && (
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
            {source.provenance === 'PUBLIC_WEB'
              ? 'Nguồn web công khai'
              : source.provenance === 'AI_DRAFT'
                ? 'Kết quả công cụ — chưa xác nhận nghiệp vụ'
                : source.provenance === 'PUBLISHED'
                  ? 'Nguồn đã phát hành'
                  : 'Trao đổi chưa xác nhận'}
          </p>
          {source.web && /^https?:\/\//.test(source.web.url) && (
            <p>
              <a
                href={source.web.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Mở trang nguồn
              </a>{' '}
              ·{' '}
              {source.web.kind === 'SNIPPET'
                ? 'Snippet tìm kiếm, chưa đọc trang'
                : 'Trang đã đọc'}{' '}
              · {new Date(source.web.retrievedAt).toLocaleString('vi-VN')}
            </p>
          )}
          <pre className="whitespace-pre-wrap">{source.text}</pre>
          {source.downloadUrl?.startsWith('/api/v1/project-chat/') && (
            <a href={source.downloadUrl}>Mở file đúng phiên bản</a>
          )}
        </SourceDrawer>
      )}
    </section>
  );
  return portalTarget === undefined
    ? content
    : portalTarget && active
      ? createPortal(content, portalTarget)
      : null;
}
