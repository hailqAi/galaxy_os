'use client';
import { McpReadiness } from './mcp-readiness';
import { createCommandKey } from '../../app/lib/create-command-key';
import { uploadAiFile, type PendingChatUpload } from './project-ai-upload';
import { readAiDraft, type AiRequestPin, type PendingAiFile } from './ai-draft';
import { validateUploadFile } from '../../app/projects/[projectId]/documents/document-upload';

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import conversationEmpty from '../../app/assets/conversation-empty.svg';
import { api, ApiError } from '../../app/lib/api';
import { ChatText, isChatFileUrl } from './chat-text';
import { ChatComposerInput } from './chat-composer-input';
import { SourceDrawer } from '../../app/source-drawer';
import {
  ProjectAiMemory,
  type MemoryDraft,
  type MemorySource,
} from './project-ai-memory';

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
  sourceId?: string;
  handle: string;
  label: string;
  version: string;
  provenance: string;
  page?: number | null;
  sheet?: string;
  range?: string;
  startLine: number;
  endLine: number;
  web?: { url: string; title: string };
  image?: { url: string; filename: string };
};
export function citationGroups(sources: Source[]): Source[][] {
  const groups = new Map<string, Source[]>();
  for (const source of sources) {
    const key = JSON.stringify([
      source.sourceId ?? source.web?.url ?? source.handle,
      source.version,
    ]);
    const group = groups.get(key) ?? [];
    const locator = (source: Source) =>
      JSON.stringify([
        source.page ?? null,
        source.sheet ?? null,
        source.range ?? null,
        source.startLine,
        source.endLine,
      ]);
    if (!group.some((item) => locator(item) === locator(source)))
      group.push(source);
    groups.set(key, group);
  }
  return [...groups.values()];
}
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
    createFormats?: string[];
    officePreview?: boolean;
    nativeWebSearch?: boolean;
    nativeWebSearchBlockReason?: string;
    reasoningModes: string[];
    imageInput: boolean;
    pdfInput: boolean;
    nativeMediaImplemented?: boolean;
  };
  limits: {
    requestsPerDay: number | null;
    concurrent: number;
    outputTokens: number | null;
  };
};
type Answer = {
  clientKey?: string;
  attachments?: {
    sourceId: string;
    filename: string;
    sizeBytes: number;
    mimeType: string;
    version: string;
    status: string;
    downloadUrl: string;
  }[];
  markdownUrl?: string;
  workspaceEvidence?: {
    requestedModel: string;
    configuredModel: string;
    observedModel: null;
    modelEvidenceLevel: string;
    effort: string;
  } | null;
  nativeWebCitations?: { url: string; title: string }[];
  pdfCoverage?: {
    sourceId: string;
    label: string;
    pagesTotal: number | null;
    completeTextPages: number[];
    partialTextPages: number[];
    textCoverage: string;
  }[];
  documentReadIssues?: {
    sourceId: string;
    page: number | null;
    code: string;
  }[];
  xlsxCoverage?: {
    sourceId: string;
    label: string;
    textCoverage: string;
    sheets: {
      name: string;
      rows: number;
      completeRows: number;
      cellsRead: number;
      cellsTotal: number;
      textCoverage: string;
      nextMissingRange: string | null;
    }[];
  }[];
  requestedEffort?: string | null;
  observedEffort?: string | null;
  route?: 'SIWC' | 'WORKSPACE' | 'MCP_EVENTS' | 'GALAXY_DATA';
  requested_executor?: 'AUTO' | 'SIWC' | 'MCP_EVENTS';
  effective_executor?: 'GALAXY_DATA' | 'SIWC' | 'MCP_EVENTS';
  mcpJob?: {
    attempt?: number;
    state: string;
    progress: string | null;
    errorCode: string | null;
    requestedOutputs: string[];
    updatedAt: string;
    phaseStartedAt?: string | null;
    files?: {
      id: string;
      state: string;
      filename: string | null;
      errorCode: string | null;
    }[];
  } | null;
  executionTrace?: {
    request_id?: string | null;
    event_id?: string | null;
    context_duration_ms?: number;
    created_at?: string;
  } | null;
  memorySource?: MemorySource;
  contextBudget?: { status: 'VERIFIED' | 'UNVERIFIED' } | null;
  historyCompleteness?: 'COMPLETE' | 'PARTIAL' | null;
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
  canResume?: boolean;
  toolActivity?: string | null;
  run?: {
    runId: string;
    mode: 'NORMAL' | 'DEEP';
    phase: string;
    deadlineAt: string | null;
    heartbeatAt: string | null;
  } | null;
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
    MCP_PREVIOUS_ARTIFACT_UNAVAILABLE:
      'Tệp gần nhất chưa được lưu về Galaxy. Tiếp tục nhận tệp ở lượt đó hoặc chọn một tệp đã lưu.',
    MCP_PREVIOUS_ARTIFACT_AMBIGUOUS:
      'Có nhiều tệp trong kết quả gần nhất. Chọn tệp cần sửa hoặc nêu tên và loại tệp.',
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
    SIWC_WEB_SEARCH_PRIVACY_UNVERIFIED:
      'Tra cứu web trong chat Project chưa khả dụng vì cần tách truy vấn công khai khỏi dữ liệu riêng.',
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
    HISTORY_SOURCE_CHANGED:
      'Nguồn lịch sử đã thay đổi; câu trả lời chưa được phát hành.',
    MEMORY_SOURCE_CHANGED:
      'Nguồn bộ nhớ đã thay đổi; câu trả lời chưa được phát hành.',
    INPUT_BUDGET_EXCEEDED:
      'Đầu vào vượt ngân sách hiện tại của lượt xử lý. Tệp gốc và câu hỏi vẫn được giữ; cần đọc nguồn theo phần.',
    MEDIA_INPUT_TOO_LARGE:
      'Nội dung ảnh/PDF vượt giới hạn gửi trực tiếp của lượt này. Tệp gốc vẫn được lưu; cần đọc theo trang hoặc vùng.',
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
    PROVIDER_TIMEOUT:
      'Đã hết thời gian xử lý; lượt này đã dừng. Không tự gọi lại provider.',
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
      'Lượt cũ dừng ở giới hạn xử lý của Galaxy. Kết quả đã lưu được giữ.',
    TOOL_ROUND_LIMIT:
      'Lượt cũ dừng ở giới hạn xử lý của Galaxy. Kết quả đã lưu được giữ.',
    RUN_NO_PROGRESS:
      'Công cụ lặp lại cùng dữ liệu mà chưa giải quyết thêm yêu cầu. Tiến độ và file đã lưu được giữ; cần xử lý phần còn thiếu cụ thể.',
    TOOL_CONTEXT_LIMIT:
      'Phạm vi đọc vượt giới hạn lượt này; hãy chọn phần cụ thể hơn.',
    PROJECT_MEMORY_CONTEXT_LIMIT:
      'Bộ nhớ đã xác nhận của Project vượt dung lượng ngữ cảnh của Galaxy AI. Chọn ChatGPT Work để đọc tiếp từng phần; yêu cầu và bộ nhớ vẫn được giữ.',
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
    PARTIAL: 'Kết quả một phần — chưa hoàn tất yêu cầu',
    RUN_READING: 'Đang đọc tài liệu',
    RUN_RETRIEVING: 'Đang truy xuất nguồn',
    RUN_REQUESTING: 'Đang chờ phản hồi AI',
    RUN_TOOLS: 'Đang thực hiện công cụ',
    RUN_VERIFYING: 'Đang kiểm tra và lưu kết quả',
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
    REQUESTED_ARTIFACT_MISSING:
      'Chưa tạo được file được yêu cầu; các phần đã xử lý được giữ.',
    NEEDS_REPORT: 'Câu hỏi tổng hợp cần báo cáo nghiệp vụ đủ dữ liệu',
    ACCESS_REVOKED: 'Không còn quyền xem nội dung phụ thuộc nguồn này',
    READY: 'Bản trích sẵn sàng',
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
  onMemory,
  onClarify,
}: {
  answer: Answer;
  onSource: (source: Source) => void;
  onCancel: () => void;
  onRun: () => void;
  onDraft?: (text: string) => void;
  onMemory?: (draft: MemoryDraft) => void;
  onClarify?: (content: string, operationId: string) => Promise<void>;
}) {
  const [clock, setClock] = useState(() => Date.now());
  const waiting = Boolean(
    answer.mcpJob &&
      [
        'WAITING_NOTIFICATION',
        'NOTIFIED',
        'PROCESSING',
        'RECEIVING_FILES',
      ].includes(answer.mcpJob.state),
  );
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => setClock(Date.now()), 10000);
    return () => clearInterval(timer);
  }, [waiting]);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [clarification, setClarification] = useState('');
  const [clarificationKey, setClarificationKey] = useState<string | null>(null);
  const [clarifying, setClarifying] = useState(false);
  const [clarificationError, setClarificationError] = useState(false);
  const sourceGroups = citationGroups(answer.sources);
  const capacityError =
    answer.mcpJob?.state === 'ERROR' &&
    answer.mcpJob.errorCode?.startsWith('MCP_ARTIFACT_STORAGE_');
  const mcpProgress = answer.mcpJob && (
    <p role="status">
      ChatGPT Work ·{' '}
      {(
        {
          WAITING_SUBSCRIPTION: 'Chờ kết nối hoặc đăng ký theo dõi',
          WAITING_NOTIFICATION: 'Chờ gửi thông báo',
          NOTIFIED: 'Đã gửi thông báo; chờ Work nhận xử lý',
          PROCESSING: 'Đang xử lý',
          RECEIVING_FILES: 'Đang nhận tệp',
          NEEDS_INPUT: 'Cần bổ sung',
          COMPLETED: 'Đã hoàn thành',
          ERROR: 'Gặp lỗi',
          CANCELLED: 'Đã hủy nhận kết quả tại Galaxy',
        } as Record<string, string>
      )[answer.mcpJob.state] ?? answer.mcpJob.state}
      {answer.mcpJob.attempt ? ` · Lần xử lý ${answer.mcpJob.attempt}` : ''}
      {answer.mcpJob.state === 'CANCELLED' &&
        ' · ChatGPT có thể vẫn đang xử lý.'}
      {answer.mcpJob.progress ? ` · ${answer.mcpJob.progress}` : ''}
      {[
        'WAITING_NOTIFICATION',
        'NOTIFIED',
        'PROCESSING',
        'RECEIVING_FILES',
      ].includes(answer.mcpJob.state) &&
        clock - Date.parse(answer.mcpJob.updatedAt) >= 60000 && (
          <span>
            {' '}
            · Mốc gần nhất:{' '}
            {Math.floor(
              (clock - Date.parse(answer.mcpJob.updatedAt)) / 60000,
            )}{' '}
            phút trước. Chưa nhận được cập nhật mới.
          </span>
        )}
    </p>
  );
  return (
    <article className="ai-answer">
      {answer.mode === 'GENERAL' && (
        <p className="chat-metadata">Không sử dụng hồ sơ dự án</p>
      )}
      {answer.status !== 'ACCESS_REVOKED' &&
        mcpProgress &&
        (answer.mcpJob?.state === 'COMPLETED' ? (
          <details>
            <summary>Tiến độ công việc</summary>
            {mcpProgress}
          </details>
        ) : (
          mcpProgress
        ))}
      {answer.status !== 'ACCESS_REVOKED' && answer.question && (
        <h3 className="ai-question">{answer.question}</h3>
      )}
      {answer.status !== 'ACCESS_REVOKED' && !!answer.attachments?.length && (
        <ul className="ai-user-attachments" aria-label="Tệp đã gửi">
          {answer.attachments.map((file) => (
            <li key={file.sourceId}>
              {isChatFileUrl(file.downloadUrl) ? (
                <a href={file.downloadUrl} download>
                  {file.filename}
                </a>
              ) : (
                <span>{file.filename}</span>
              )}
              <span className="chat-metadata">
                {' '}
                · {Math.ceil(file.sizeBytes / 1024)} KiB · Đã tải lên
                {file.status === 'PROCESSING'
                  ? ' · Đang trích nội dung'
                  : file.status === 'READY'
                    ? ' · Bản trích sẵn sàng'
                    : ['FAILED', 'TOO_LARGE', 'FORBIDDEN'].includes(file.status)
                      ? ' · Chưa đọc được nội dung'
                      : ''}
              </span>
              {/^image\/(?:png|jpeg)$/.test(file.mimeType) &&
                isChatFileUrl(file.downloadUrl) && (
                  // Authenticated source images use the same current-authority download route.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={file.downloadUrl}
                    alt={file.filename}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                )}
            </li>
          ))}
        </ul>
      )}
      <div
        className="ai-response-card"
        role="region"
        aria-label="Câu trả lời Galaxy AI"
      >
        <p className="ai-author">
          ✦{' '}
          {answer.route === 'MCP_EVENTS'
            ? 'ChatGPT Work'
            : answer.route === 'GALAXY_DATA'
              ? 'Dữ liệu Galaxy'
              : 'Galaxy AI'}
        </p>
        {answer.status !== 'ACCESS_REVOKED' && capacityError && (
          <p role="status" className="chat-metadata">
            {answer.mcpJob?.errorCode === 'MCP_ARTIFACT_STORAGE_LIMIT'
              ? 'Tệp vượt giới hạn dung lượng cho phép. Giảm kích thước hoặc chia tệp; thử lại sau khi xử lý giới hạn.'
              : answer.mcpJob?.errorCode ===
                  'MCP_ARTIFACT_STORAGE_QUOTA_EXCEEDED'
                ? 'Đã hết hạn mức dung lượng lưu tệp. Liên hệ quản trị để xử lý hạn mức; thử lại sau khi xử lý.'
                : 'Không đủ dung lượng lưu tệp an toàn. Liên hệ quản trị để giải phóng chỗ lưu; thử lại sau khi xử lý.'}
          </p>
        )}
        {(answer.route !== 'MCP_EVENTS' ||
          answer.status === 'ACCESS_REVOKED') && (
          <p role="status" className="chat-metadata">
            {answer.status === 'RUNNING' && answer.run
              ? aiStatusLabel('RUN_' + answer.run.phase, 'Đang xử lý yêu cầu')
              : answer.status === 'RUNNING' && answer.toolActivity
                ? answer.toolActivity
                : aiStatusLabel(
                    answer.errorCode ?? answer.status,
                    aiStatusLabel(answer.status),
                  )}
          </p>
        )}
        {answer.historyCompleteness === 'PARTIAL' && (
          <p role="status" className="chat-metadata">
            Một phần lịch sử hội thoại chưa được đưa vào lượt trả lời này. Bạn
            có thể yêu cầu tìm lại nội dung cũ khi cần đối chiếu.
          </p>
        )}
        <details className="ai-answer-details">
          <summary>Thông tin lượt trả lời</summary>
          <p className="chat-metadata">
            Mã chẩn đoán: {answer.id}{' '}
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(answer.id).catch(() => {});
              }}
            >
              Sao chép mã
            </button>
          </p>
          {answer.executionTrace?.request_id && (
            <p className="chat-metadata">
              Request: {answer.executionTrace.request_id}
            </p>
          )}
          {answer.executionTrace?.event_id && (
            <p className="chat-metadata">
              Event: {answer.executionTrace.event_id}
            </p>
          )}
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
          {answer.workspaceEvidence && (
            <p className="chat-metadata">
              Workspace · requested {answer.workspaceEvidence.requestedModel} ·
              configured {answer.workspaceEvidence.configuredModel} · observed
              chưa có telemetry · {answer.workspaceEvidence.modelEvidenceLevel}{' '}
              · effort {answer.workspaceEvidence.effort}
            </p>
          )}
          {answer.requestedEffort && (
            <p className="chat-metadata">
              Effort yêu cầu: {answer.requestedEffort}; provider báo:{' '}
              {answer.observedEffort ?? 'chưa xác minh'}
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
        {answer.route === 'MCP_EVENTS' &&
          answer.status !== 'ACCESS_REVOKED' &&
          answer.answer && (
            <>
              {answer.status !== 'COMPLETED' && (
                <p role="status" className="chat-metadata">
                  {answer.mcpJob?.state === 'ERROR' &&
                  answer.mcpJob.errorCode?.startsWith('MCP_ARTIFACT')
                    ? answer.mcpJob.requestedOutputs.includes('xlsx')
                      ? 'Đã nhận nội dung trả lời. Chưa tải được tệp Excel về Galaxy.'
                      : 'Đã nhận nội dung trả lời. Chưa lưu được đầy đủ tệp về Galaxy.'
                    : 'Đã nhận nội dung; công việc chưa hoàn tất.'}
                </p>
              )}
              <ChatText
                text={answer.answer ?? ''}
                imageUrls={
                  answer.artifacts
                    ?.filter((file) =>
                      ['png', 'jpg', 'jpeg'].includes(file.format),
                    )
                    .map((file) => file.downloadUrl) ?? []
                }
              />
            </>
          )}
        {answer.status !== 'ACCESS_REVOKED' &&
          !!answer.mcpJob?.files?.some(
            (file) => file.state !== 'AVAILABLE',
          ) && (
            <ul aria-label="Tệp chưa lưu" className="ai-file-chips">
              {answer.mcpJob.files
                .filter((file) => file.state !== 'AVAILABLE')
                .map((file) => (
                  <li key={file.id}>
                    {file.filename ?? 'Tệp đầu ra'} ·{' '}
                    {file.state === 'ERROR'
                      ? 'Chưa lưu được tệp'
                      : 'Đang nhận tệp'}
                  </li>
                ))}
            </ul>
          )}
        {answer.status !== 'ACCESS_REVOKED' && (
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
                  {['png', 'jpg', 'jpeg'].includes(file.format) && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={file.downloadUrl}
                      alt={file.filename}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  )}
                  {['mp4', 'webm', 'mov'].includes(file.format) && (
                    <video
                      controls
                      preload="metadata"
                      src={file.downloadUrl}
                      aria-label={file.filename}
                    >
                      <a href={file.downloadUrl}>Tải video {file.filename}</a>
                    </video>
                  )}
                  {['pdf', 'docx', 'xlsx', 'pptx'].includes(file.format) && (
                    <>
                      <button
                        type="button"
                        aria-expanded={previewId === file.fileAssetId}
                        onClick={() =>
                          setPreviewId((current) =>
                            current === file.fileAssetId
                              ? null
                              : file.fileAssetId,
                          )
                        }
                      >
                        {previewId === file.fileAssetId
                          ? 'Đóng preview'
                          : `Xem trước ${file.filename}`}
                      </button>
                      {previewId === file.fileAssetId && (
                        <iframe
                          title={`Preview ${file.filename}`}
                          sandbox=""
                          src={file.downloadUrl.replace(
                            /\/download$/,
                            '/preview',
                          )}
                          className="ai-artifact-preview"
                        />
                      )}
                    </>
                  )}
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
        )}
        {['COMPLETED', 'PARTIAL'].includes(answer.status) && (
          <>
            {answer.route !== 'MCP_EVENTS' && (
              <ChatText
                text={answer.answer ?? ''}
                citations={answer.sources.flatMap((source) =>
                  source.provenance === 'PUBLIC_WEB' && source.web
                    ? [{ handle: source.handle, ...source.web }]
                    : [],
                )}
                imageUrls={[
                  ...(answer.attachments
                    ?.filter((file) =>
                      /^image\/(?:png|jpeg)$/.test(file.mimeType),
                    )
                    .map((file) => file.downloadUrl) ?? []),
                  ...answer.sources.flatMap((source) =>
                    source.image ? [source.image.url] : [],
                  ),
                ]}
              />
            )}
            {!!answer.nativeWebCitations?.length && (
              <div className="ai-citations" aria-label="Nguồn web">
                {answer.nativeWebCitations.map(
                  (citation, i) =>
                    /^https?:\/\//.test(citation.url) && (
                      <a
                        key={citation.url}
                        href={citation.url}
                        title={citation.title || citation.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {i + 1}. {citation.title || 'Nguồn web'}
                      </a>
                    ),
                )}
              </div>
            )}
            {answer.markdownUrl &&
              /^\/api\/v1\/project-chat\/projects\/[^/]+\/ai\/answers\/[^/]+\/markdown$/.test(
                answer.markdownUrl,
              ) && <a href={answer.markdownUrl}>Tải Markdown</a>}
            {answer.uncertainty && (
              <p className="whitespace-pre-wrap">{answer.uncertainty}</p>
            )}

            {onDraft && answer.answer && (
              <button onClick={() => onDraft(answer.answer!)}>
                Dùng làm nháp phản hồi
              </button>
            )}
            {onMemory && answer.answer && answer.memorySource && (
              <button
                onClick={() =>
                  onMemory({
                    content: answer
                      .answer!.slice(0, 8000)
                      .replace(/[\uD800-\uDBFF]$/, ''),
                    source: answer.memorySource!,
                  })
                }
              >
                Lưu riêng vào bộ nhớ
              </button>
            )}
            {answer.sources.length > 0 && (
              <details>
                <summary>Nguồn trích dẫn ({sourceGroups.length})</summary>
                <ul className="ai-citations">
                  {sourceGroups.map((group) => {
                    const source = group[0]!;
                    return (
                      <li key={source.handle}>
                        <button onClick={() => onSource(source)}>
                          {source.label} · bản {source.version.split(':')[0]}
                        </button>
                        <details>
                          <summary>Vị trí nguồn ({group.length})</summary>
                          {group.map((position) => (
                            <div key={position.handle}>
                              <button onClick={() => onSource(position)}>
                                {position.sheet
                                  ? `${position.sheet}!${position.range}`
                                  : position.page
                                    ? `trang ${position.page}`
                                    : `dòng ${position.startLine}–${position.endLine}`}
                              </button>
                            </div>
                          ))}
                        </details>
                      </li>
                    );
                  })}
                </ul>
              </details>
            )}
          </>
        )}
        {answer.status !== 'ACCESS_REVOKED' && !!answer.pdfCoverage?.length && (
          <details aria-label="Phạm vi đọc PDF">
            <summary>Độ bao phủ dữ liệu PDF</summary>
            {answer.pdfCoverage.map((coverage) => (
              <p key={coverage.sourceId}>
                {coverage.label}:{' '}
                {coverage.pagesTotal === null
                  ? 'độ bao phủ trang chưa xác minh'
                  : `đã trích đủ chữ ${coverage.completeTextPages.length}/${coverage.pagesTotal} trang`}
                {!!coverage.partialTextPages.length &&
                  `; ${coverage.partialTextPages.length} trang mới đọc một phần`}
                . Đây là bản trích chữ; hình ảnh cần được xử lý riêng khi yêu
                cầu cần.
              </p>
            ))}
          </details>
        )}
        {answer.status !== 'ACCESS_REVOKED' &&
          !!answer.xlsxCoverage?.length && (
            <details aria-label="Phạm vi đọc Excel">
              <summary>Độ bao phủ dữ liệu Excel</summary>
              {answer.xlsxCoverage.map((coverage) => (
                <div key={coverage.sourceId}>
                  <p>
                    {coverage.label}:{' '}
                    {coverage.textCoverage === 'UNKNOWN'
                      ? 'độ bao phủ sheet chưa xác minh'
                      : `đã trích đủ ${coverage.sheets.filter((sheet) => sheet.textCoverage === 'FULL').length}/${coverage.sheets.length} sheet, ${coverage.sheets.reduce((sum, sheet) => sum + sheet.cellsRead, 0)}/${coverage.sheets.reduce((sum, sheet) => sum + sheet.cellsTotal, 0)} ô`}
                    . Giá trị lưu sẵn từ nguồn; công thức chưa tính lại.
                  </p>
                  {!!coverage.sheets.length && (
                    <details>
                      <summary>Chi tiết sheet và vùng ô</summary>
                      {coverage.sheets.map((sheet) => (
                        <p key={sheet.name}>
                          {sheet.name}: {sheet.completeRows}/{sheet.rows} hàng;{' '}
                          {sheet.cellsRead}/{sheet.cellsTotal} ô
                          {sheet.nextMissingRange &&
                            `; vùng tiếp theo chưa đọc ${sheet.nextMissingRange}`}
                          .
                        </p>
                      ))}
                    </details>
                  )}
                </div>
              ))}
            </details>
          )}
        {answer.status !== 'ACCESS_REVOKED' &&
          !!answer.documentReadIssues?.length && (
            <div aria-label="Phần tài liệu chưa đọc đủ">
              {answer.documentReadIssues.map((issue) => (
                <p key={issue.sourceId}>
                  {answer.attachments?.find(
                    (file) => file.sourceId === issue.sourceId,
                  )?.filename ?? 'Tài liệu'}
                  {issue.page !== null && ` · trang ${issue.page}`}:{' '}
                  {issue.code === 'PDF_SCAN_REQUIRES_VISION'
                    ? 'Chưa có lớp chữ; cần đọc ảnh hoặc OCR.'
                    : issue.code === 'SOURCE_TEXT_UNAVAILABLE'
                      ? 'Chưa trích được chữ của phần này.'
                      : issue.code === 'XLSX_COVERAGE_PENDING'
                        ? 'Chưa kiểm đủ các sheet và vùng ô của workbook.'
                        : 'Phần còn lại chưa được đọc trong ngân sách lượt này.'}
                </p>
              ))}
            </div>
          )}
        {answer.status === 'QUEUED' &&
          !answer.run &&
          answer.route !== 'WORKSPACE' && (
            <button onClick={onRun}>Tiếp tục yêu cầu đã lưu</button>
          )}
        {['PARTIAL', 'FAILED'].includes(answer.status) && answer.canResume && (
          <button onClick={onRun}>Tiếp tục công việc còn lại</button>
        )}
        {answer.mcpJob &&
          ['ERROR', 'CANCELLED'].includes(answer.mcpJob.state) && (
            <button onClick={onRun}>
              {answer.mcpJob.state === 'ERROR' &&
              answer.mcpJob.errorCode?.startsWith('MCP_ARTIFACT')
                ? 'Thử lại nhận tệp'
                : 'Thử lại công việc'}
            </button>
          )}
        {answer.mcpJob?.state === 'NEEDS_INPUT' && onClarify && (
          <div>
            <label>
              Bổ sung cho công việc này
              <input
                aria-label="Bổ sung cho công việc này"
                value={clarification}
                disabled={clarifying}
                onChange={(event) => {
                  setClarification(event.target.value);
                  setClarificationKey(null);
                  setClarificationError(false);
                }}
              />
            </label>
            <button
              type="button"
              disabled={clarifying || !clarification.trim()}
              onClick={() => {
                const key = clarificationKey ?? crypto.randomUUID();
                setClarificationKey(key);
                setClarifying(true);
                void onClarify(clarification, key)
                  .then(() => {
                    setClarification('');
                    setClarificationKey(null);
                    setClarificationError(false);
                  })
                  .catch(() => setClarificationError(true))
                  .finally(() => setClarifying(false));
              }}
            >
              Gửi bổ sung · Tiếp tục job
            </button>
            {clarificationError && (
              <p role="alert">
                Chưa xác nhận lưu bổ sung. Nội dung được giữ; gửi lại để kiểm
                tra.
              </p>
            )}
          </div>
        )}
        {pending.includes(answer.status) && (
          <button onClick={onCancel}>Dừng yêu cầu</button>
        )}
      </div>
    </article>
  );
}

export function ChatGptConnection() {
  return (
    <section aria-label="Trạng thái AI" className="ai-capability-state">
      <p>AI chưa được quản trị viên kích hoạt.</p>
      <p>Bạn vẫn có thể xem hồ sơ, công việc và lịch sử còn quyền.</p>
    </section>
  );
}

export function initialAiSelection(
  models: Pick<ModelChoice, 'id' | 'provider' | 'available' | 'capabilities'>[],
  saved: string | null,
  savedEffort: { model: string; reasoning: string } | null,
  preferred?: { model: string; reasoning: string } | null,
) {
  const model =
    saved ||
    preferred?.model ||
    models.find(
      (m) => m.available && ['chatgpt', 'openrouter'].includes(m.provider),
    )?.id ||
    '';
  const choice = models.find((m) => m.id === model);
  const reasoning =
    savedEffort?.model === model
      ? savedEffort.reasoning
      : preferred?.model === model
        ? preferred.reasoning
        : choice?.capabilities.reasoningModes.includes('high')
          ? 'high'
          : 'default';
  return { model, reasoning };
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
        {value && !models.some((m) => m.id === value && m.available) && (
          <option value={value} disabled>
            {models.find((m) => m.id === value)?.label ?? value} · chưa khả dụng
          </option>
        )}
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
  const [searchMode, setSearchMode] = useState<'AUTO' | 'WEB' | 'PROJECT_ONLY'>(
    'AUTO',
  );
  const [runMode, setRunMode] = useState<'NORMAL' | 'DEEP'>('NORMAL');
  const [publicQuery, setPublicQuery] = useState('');
  const [approvedPublicQuery, setApprovedPublicQuery] = useState('');
  const [sourceIds, setSourceIds] = useState<string[]>([]);
  type UploadChip = {
    key: string;
    file: File;
    id?: string;
    status: string;
    error?: string;
    sessionId?: string;
    uploadedBytes?: number;
    transfer?: AbortController;
    coverageNote?: string;
  };
  const [uploads, setUploads] = useState<UploadChip[]>([]);
  const uploadItems = useRef<UploadChip[]>([]);
  const uploadJobs = useRef(new Map<string, Promise<void>>());
  const [pendingUploads, setPendingUploads] = useState<PendingChatUpload[]>([]);
  const [restoredFiles, setRestoredFiles] = useState<PendingAiFile[]>([]);
  const restoredFileItems = useRef<PendingAiFile[]>([]);
  const resumeSelection = useRef<PendingAiFile | undefined>(undefined);
  const [recoveryTruncated, setRecoveryTruncated] = useState(false);
  const resumeTarget = useRef<PendingChatUpload | undefined>(undefined);
  const fileInput = useRef<HTMLInputElement>(null);
  const conversationCreation = useRef<
    { key: string; pending?: Promise<string> } | undefined
  >(undefined);
  const [attachmentMenu, setAttachmentMenu] = useState(false);
  const [createMenu, setCreateMenu] = useState(false);

  const modelInitialized = useRef(false);
  const modelConversation = useRef('');
  const modelStorageKey = `galaxy-ai-model:${actorId}:${projectId}`;
  const effortStorageKey = `${modelStorageKey}:effort`;
  const ownerPreference = useRef<{ model: string; reasoning: string } | null>(
    null,
  );
  const searchStorageKey = `galaxy-ai-search:${actorId}:${projectId}`;
  const chosenModel = choices.find((m) => m.id === model);
  const effortChoices = chosenModel?.capabilities.reasoningModes ?? [];
  const [execution, setExecution] = useState<'AUTO' | 'SIWC' | 'MCP_EVENTS'>(
    'SIWC',
  );
  const executorInitialized = useRef(false);
  const [mcpEnabled, setMcpEnabled] = useState(false);
  const modelAvailable =
    execution === 'AUTO'
      ? true
      : execution === 'MCP_EVENTS'
        ? mcpEnabled
        : Boolean(chosenModel && effortChoices.includes(reasoning));
  const [list, setList] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState('');
  const selectedRef = useRef('');
  const [scope, setScope] = useState(group);
  const [history, setHistory] = useState<History>();
  const historyRef = useRef<History | undefined>(undefined);
  const [pendingSubmission, setPendingSubmission] = useState<{
    clientKey: string;
    question: string;
    uploading: boolean;
  }>();
  useLayoutEffect(() => {
    historyRef.current = history;
  }, [history]);
  const context =
    selected && history?.answers.length
      ? (history.context ?? undefined)
      : initialContext;
  const presentationActive = useRef(active);
  const [verified, setVerified] = useState(false);
  const [detailVerified, setDetailVerified] = useState(false);
  const [wasActive, setWasActive] = useState(active);
  if (wasActive !== active) {
    setWasActive(active);
    setVerified(false);
    setDetailVerified(false);
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
  const [outputFormat, setOutputFormat] =
    useState<AiRequestPin['outputFormat']>();
  const questionRef = useRef('');
  const selectionIdsRef = useRef<string[]>([]);
  useLayoutEffect(() => {
    questionRef.current = question;
    selectionIdsRef.current = sourceIds;
  }, [question, sourceIds]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [source, setSource] = useState<SourceDetail>();
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [memoryDraft, setMemoryDraft] = useState<MemoryDraft>();
  const memoryDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (
      memoryOpen &&
      active &&
      memoryDialog.current &&
      !memoryDialog.current.open
    )
      memoryDialog.current.showModal();
  }, [memoryOpen, active]);
  const memoryIdentity = JSON.stringify([projectId, actorId]);
  const [memoryScope, setMemoryScope] = useState(memoryIdentity);
  if (memoryScope !== memoryIdentity) {
    setMemoryScope(memoryIdentity);
    setMemoryOpen(false);
    setMemoryDraft(undefined);
  }
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
      rangeRead?: boolean;
      errorCode?: string | null;
      downloadUrl?: string | null;
      coverage?: {
        coverage: string;
        readBytes: number;
        originalBytes: number;
      } | null;
    }[];
  }>();
  const [promotion, setPromotion] = useState<{
    sourceId: string;
    version: string;
    label: string;
    key: string;
    definitionId: string;
    targets: { id: string; label: string; stage: string }[];
    truncated: boolean;
    result?: string;
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
  const requestKey = useRef<AiRequestPin | undefined>(undefined);
  const [retryPin, setRetryPin] = useState<(typeof requestKey)['current']>();
  const draftStorageKey = `galaxy-ai-draft:${actorId}:${aiSessionKey(projectId, group, initialContext)}`;
  const draftLoaded = useRef('');
  const saveDraft = useCallback(() => {
    if (draftLoaded.current !== draftStorageKey) return;
    const ids = [
      ...new Set([
        ...selectionIdsRef.current,
        ...uploadItems.current.flatMap((item) => (item.id ? [item.id] : [])),
      ]),
    ];
    const pendingFiles = [
      ...restoredFileItems.current,
      ...uploadItems.current
        .filter((item) => !item.id)
        .map((item) => ({
          key: item.key,
          sessionId: item.sessionId,
          originalFilename: item.file.name,
          declaredSize: String(item.file.size),
        })),
    ];
    try {
      if (
        !questionRef.current &&
        !outputFormat &&
        !ids.length &&
        !pendingFiles.length &&
        !requestKey.current &&
        !conversationCreation.current
      )
        sessionStorage.removeItem(draftStorageKey);
      else
        sessionStorage.setItem(
          draftStorageKey,
          JSON.stringify({
            version: 1,
            ...(execution !== 'SIWC' ? { execution } : {}),
            conversationId: selectedRef.current || undefined,
            conversationKey: conversationCreation.current?.key,
            question: questionRef.current || requestKey.current?.question || '',
            sourceIds: ids,
            outputFormat,
            ...(pendingFiles.length ? { pendingFiles } : {}),
            request: requestKey.current,
          }),
        );
    } catch {
      /* Khi storage bị chặn, vẫn giữ draft trong phiên hiện tại. */
    }
  }, [draftStorageKey, outputFormat, execution]);
  useEffect(() => {
    if (verified) saveDraft();
  }, [verified, question, sourceIds, uploads, restoredFiles, saveDraft]);
  useEffect(() => {
    if (!selectedRef.current && !requestKey.current) setScope(group);
  }, [group]);
  const base = `/project-chat/projects/${projectId}/ai`;
  const call = useCallback(
    <T,>(path = '', body?: object, durableRun = false) =>
      api<T>(base + path, {
        signal: AbortSignal.any([
          ...(controller.current ? [controller.current.signal] : []),
          AbortSignal.timeout(
            body === undefined
              ? 15000
              : path.endsWith('/run')
                ? durableRun
                  ? 30000
                  : 330000
                : 110000,
          ),
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
      setDetailVerified(false);
      setHistory(undefined);
      setList([]);
      conversationsCallback.current?.([]);
      setSource(undefined);
      setIndex(undefined);
      setPromotion(undefined);
      setLoadError(
        aiStatusLabel((cause as Error).message, (cause as Error).message),
      );
      if (
        cause instanceof ApiError &&
        [401, 403, 404, 412].includes(cause.status)
      ) {
        setModels([]);
        setQuestion('');
        setOutputFormat(undefined);
        setSearchMode('AUTO');
        setPublicQuery('');
        setApprovedPublicQuery('');
        drafts.current.clear();
        draftLoaded.current = '';
        setVerified(false);
        setDetailVerified(false);
        setSourceIds([]);
        uploadItems.current = [];
        setUploads([]);
        restoredFileItems.current = [];
        setRestoredFiles([]);
        resumeSelection.current = undefined;
        resumeTarget.current = undefined;
        conversationCreation.current = undefined;
        try {
          sessionStorage.removeItem(draftStorageKey);
        } catch {
          /* Storage có thể bị chặn. */
        }
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
    [
      onRevoked,
      setSource,
      setQuestion,
      setRetryPin,
      projectId,
      draftStorageKey,
    ],
  );
  const select = (id: string) => {
    setPendingSubmission(undefined);
    setStarted(true);
    setSearchMode((previous) =>
      previous === 'PROJECT_ONLY' ? previous : 'AUTO',
    );
    setPublicQuery('');
    setApprovedPublicQuery('');
    if (!id) {
      const router = models.find(
        (item) =>
          item.available &&
          (item.provider === 'chatgpt' || item.id === 'openrouter/free'),
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
    setOutputFormat(undefined);
    setQuestion(drafts.current.get(id) ?? '');
    ++reading.current;
    sourceKey.current = undefined;
    indexScope.current = undefined;
    selectedRef.current = id;
    setSelected(id);
    setDetailVerified(false);
    setHistory(undefined);
    setSource(undefined);
    setIndex(undefined);
    setPromotion(undefined);
    setSourceIds([]);
    uploadItems.current = [];
    setPendingUploads([]);
    setRecoveryTruncated(false);
    resumeTarget.current = undefined;
    resumeSelection.current = undefined;
    uploadJobs.current.clear();
    setUploads([]);
    restoredFileItems.current = [];
    setRestoredFiles([]);
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
      let id = selectedRef.current;
      let restored;
      if (draftLoaded.current !== draftStorageKey) {
        try {
          restored = readAiDraft(sessionStorage.getItem(draftStorageKey));
        } catch {
          /* Storage có thể bị chặn. */
        }
        if (
          restored?.conversationId &&
          (!id || id === restored.conversationId)
        ) {
          id = restored.conversationId;
          selectedRef.current = id;
          setSelected(id);
        }
      }
      const selectedSource = sourceKey.current;
      const selectedScope = indexScope.current;
      try {
        const [catalog, detailResult, sourceResult, indexResult] =
          await Promise.allSettled([
            call<{
              provider: string;
              executionPolicy?: string;
              mcpEnabled?: boolean;
              conversations: Conversation[];
              models: ModelChoice[];
              preferredSelection?: { model: string; reasoning: string } | null;
            }>(),
            id
              ? call<History>(`/conversations/${id}`)
              : Promise.resolve(undefined),
            selectedSource
              ? call<SourceDetail>(
                  `/answers/${selectedSource.answerId}/sources/${encodeURIComponent(selectedSource.handle)}`,
                )
              : Promise.resolve(undefined),
            selectedScope ||
            restored?.sourceIds.length ||
            restored?.request?.sourceIds.length ||
            selectionIdsRef.current.length ||
            requestKey.current?.sourceIds.length
              ? call<{
                  sources: {
                    id: string;
                    label: string;
                    status: string;
                    version?: string;
                    nativeFile?: boolean;
                    rangeRead?: boolean;
                  }[];
                }>(
                  `/index?${new URLSearchParams({ scope: selectedScope?.scope ?? group, ...contextParams(selectedScope?.context ?? initialContext) })}`,
                )
              : Promise.resolve(undefined),
          ]);
        if (
          controller.current?.signal.aborted ||
          !activePage.current ||
          !presentationActive.current ||
          document.visibilityState !== 'visible' ||
          epoch !== reading.current ||
          id !== selectedRef.current
        )
          return;
        const failures = [
          catalog,
          detailResult,
          sourceResult,
          indexResult,
        ].filter((result) => result.status === 'rejected');
        const revoked = failures.find(
          (result) =>
            result.reason instanceof ApiError &&
            [401, 403, 404, 412].includes(result.reason.status),
        );
        if (revoked) throw revoked.reason;
        if (catalog.status === 'rejected') throw catalog.reason;
        const result = catalog.value;
        setVerified(true);
        setPlanOnly(result.executionPolicy === 'CHATGPT_PLAN_ONLY');
        setMcpEnabled(result.mcpEnabled === true);
        if (!executorInitialized.current) {
          executorInitialized.current = true;
          setExecution(result.mcpEnabled ? 'AUTO' : 'SIWC');
        }
        setModels(result.models ?? []);
        ownerPreference.current = result.preferredSelection ?? null;
        if (!modelInitialized.current && result.models) {
          modelInitialized.current = true;
          let saved: string | null = null;
          let savedEffort: { model: string; reasoning: string } | null = null;
          try {
            saved = sessionStorage.getItem(modelStorageKey);
            const rawEffort = sessionStorage.getItem(effortStorageKey);
            const effort: unknown =
              rawEffort && rawEffort.length <= 400
                ? JSON.parse(rawEffort)
                : null;
            if (
              effort &&
              typeof effort === 'object' &&
              'model' in effort &&
              'reasoning' in effort &&
              typeof effort.model === 'string' &&
              effort.model.length <= 200 &&
              typeof effort.reasoning === 'string' &&
              effort.reasoning.length <= 20
            )
              savedEffort = {
                model: effort.model,
                reasoning: effort.reasoning,
              };
            if (sessionStorage.getItem(searchStorageKey) === 'PROJECT_ONLY')
              setSearchMode('PROJECT_ONLY');
          } catch {
            /* Lựa chọn vẫn dùng được khi trình duyệt chặn storage. */
          }
          const selection = initialAiSelection(
            result.models,
            saved,
            savedEffort,
            result.preferredSelection,
          );
          setModel(selection.model);
          setReasoning(selection.reasoning);
        }
        const detail =
          detailResult.status === 'fulfilled' ? detailResult.value : undefined;
        const currentSource =
          sourceResult.status === 'fulfilled' ? sourceResult.value : undefined;
        const currentIndex =
          indexResult.status === 'fulfilled' ? indexResult.value : undefined;
        if (draftLoaded.current !== draftStorageKey) {
          draftLoaded.current = draftStorageKey;
          if (
            restored &&
            (!restored.conversationId || restored.conversationId === id)
          ) {
            setQuestion(restored.question);
            setExecution(
              restored.execution ?? restored.request?.execution ?? 'SIWC',
            );
            setOutputFormat(restored.outputFormat);
            restoredFileItems.current = restored.pendingFiles ?? [];
            setRestoredFiles(restoredFileItems.current);
            const allowedIds = new Set(
              currentIndex?.sources.map((source) => source.id),
            );
            setSourceIds(restored.sourceIds);
            if (currentIndex)
              setIndex({ hasMore: false, sources: currentIndex.sources });
            if (restored.conversationKey)
              conversationCreation.current = { key: restored.conversationKey };
            if (restored.request) {
              requestKey.current = restored.request;
              setRetryPin(restored.request);
              setModel(restored.request.model);
              setReasoning(restored.request.reasoning);
              setSearchMode(restored.request.searchMode);
              setRunMode(restored.request.runMode ?? 'NORMAL');
              setOutputFormat(
                restored.request.outputFormat ?? restored.outputFormat,
              );
            }
            if (
              restored.sourceIds.some((sourceId) => !allowedIds.has(sourceId))
            )
              setError(
                'Một nguồn trong bản nháp chưa được xác minh lại. Lượt retry giữ nguyên nguồn; kiểm tra quyền trước khi gửi.',
              );
          }
        }
        if (failures.length) throw failures[0]!.reason;
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
          setDetailVerified(false);
          setLoadError('Hội thoại thuộc phạm vi khác; hãy mở đúng ngữ cảnh.');
          return;
        }
        setDetailVerified(true);
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
        setPendingSubmission((current) =>
          current &&
          detail?.answers.some(
            (answer) => answer.clientKey === current.clientKey,
          )
            ? undefined
            : current,
        );
        if (detail?.answers.length) {
          if (modelConversation.current !== id) {
            modelConversation.current = id;
            const latest = detail.answers.at(-1);
            const original = latest?.model;
            setPublicQuery('');
            setApprovedPublicQuery('');
            if (original) {
              setModel(original);
              setReasoning(latest?.requestedEffort ?? 'default');
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
      effortStorageKey,
      searchStorageKey,
      draftStorageKey,
      setModel,
      setReasoning,
      setSearchMode,
      setPublicQuery,
      setApprovedPublicQuery,
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
    const clear = (preserveMemory = false) => {
      setPendingSubmission(undefined);
      activePage.current = false;
      setDetailVerified(false);
      ++reading.current;
      sourceKey.current = undefined;
      indexScope.current = undefined;
      setHistory(undefined);
      setSource(undefined);
      if (!preserveMemory) {
        setMemoryOpen(false);
        setMemoryDraft(undefined);
      }
      setIndex(undefined);
    };
    const visible = () => {
      if (document.visibilityState === 'hidden') clear(true);
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
    const forget = () => {
      setPendingSubmission(undefined);
      clear();
      draftLoaded.current = '';
      setVerified(false);
      setDetailVerified(false);
      setSourceIds([]);
      uploadItems.current = [];
      setUploads([]);
      restoredFileItems.current = [];
      setRestoredFiles([]);
      resumeSelection.current = undefined;
      resumeTarget.current = undefined;
      conversationCreation.current = undefined;
      try {
        sessionStorage.removeItem(draftStorageKey);
      } catch {
        /* Storage có thể bị chặn. */
      }
      requestKey.current = undefined;
      setRetryPin(undefined);
      setQuestion('');
      setOutputFormat(undefined);
      setSearchMode('AUTO');
      setRunMode('NORMAL');
      setPublicQuery('');
      setApprovedPublicQuery('');
      drafts.current.clear();
    };
    const hide = () => clear();
    window.addEventListener('pagehide', hide);
    window.addEventListener('pageshow', restore);
    window.addEventListener('galaxy-auth-changed', forget);
    let refreshTick = 0;
    const timer = setInterval(() => {
      refreshTick++;
      const workActive = historyRef.current?.answers.some(
        (answer) =>
          answer.route === 'MCP_EVENTS' &&
          answer.mcpJob &&
          !['COMPLETED', 'ERROR', 'CANCELLED', 'NEEDS_INPUT'].includes(
            answer.mcpJob.state,
          ),
      );
      if (
        document.visibilityState === 'visible' &&
        (workActive || refreshTick % 3 === 0)
      )
        void refresh();
    }, 1000);
    return () => {
      controller.current?.abort();
      ++generation.current;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('pagehide', hide);
      window.removeEventListener('pageshow', restore);
      window.removeEventListener('galaxy-auth-changed', forget);
    };
  }, [refresh, draftStorageKey]);
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
      key:
        conversationCreation.current?.key ??
        requestKey.current?.conversationKey ??
        createCommandKey(),
    };
    conversationCreation.current = creation;
    saveDraft();
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
          saveDraft();
          return value.id;
        })
        .catch((error) => {
          creation.pending = undefined;
          throw error;
        });
    return creation.pending;
  };
  useEffect(() => {
    if (!active || !selected) return;
    const stop = new AbortController();
    void api<{ items: PendingChatUpload[]; truncated: boolean }>(
      `/uploads/recovery?projectId=${encodeURIComponent(projectId)}&aiConversationId=${encodeURIComponent(selected)}`,
      { signal: stop.signal },
    )
      .then((result) => {
        if (stop.signal.aborted || selectedRef.current !== selected) return;
        setPendingUploads(
          result.items.filter(
            (item) =>
              item.projectId === projectId &&
              item.aiConversationId === selected &&
              !uploadItems.current.some(
                (upload) => upload.sessionId === item.id,
              ) &&
              !restoredFileItems.current.some(
                (file) => file.sessionId === item.id,
              ),
          ),
        );
        setRecoveryTruncated(result.truncated);
      })
      .catch((cause) => {
        if (!stop.signal.aborted) invalidate(cause);
      });
    return () => stop.abort();
  }, [active, selected, projectId, actorId, invalidate]);

  const uploadFile = (item: UploadChip) => {
    if (!detailVerified) return;
    const pending = uploadJobs.current.get(item.key);
    if (pending) return pending;
    const signal = controller.current?.signal;
    const transfer = new AbortController();
    item.transfer = transfer;
    const update = (value: Partial<UploadChip>) => {
      if (signal?.aborted || !uploadItems.current.includes(item)) return;
      Object.assign(item, value);
      setUploads([...uploadItems.current]);
      saveDraft();
    };
    const job = (async () => {
      try {
        const conversationId = await ensureConversation();
        if (signal?.aborted || !uploadItems.current.includes(item)) return;
        if (!item.id) {
          update({ status: 'Đang tải', error: undefined });
          if (
            item.sessionId ||
            item.file.size > 10_485_760 ||
            /\.(csv|pptx)$/i.test(item.file.name)
          ) {
            const saved = await uploadAiFile({
              projectId,
              conversationId,
              key: item.key,
              file: item.file,
              sessionId: item.sessionId,
              signal: AbortSignal.any([
                transfer.signal,
                ...(signal ? [signal] : []),
              ]),
              onSession: (sessionId) => update({ sessionId }),
              onProgress: (uploadedBytes) =>
                update({
                  uploadedBytes,
                  status:
                    uploadedBytes === item.file.size
                      ? 'Đang kiểm tra và lưu'
                      : 'Đang tải',
                }),
            });
            update({ id: saved.sourceId, status: 'Đã tải lên' });
            setPendingUploads((previous) =>
              previous.filter((pending) => pending.id !== saved.sessionId),
            );
          } else {
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
                  transfer.signal,
                  AbortSignal.timeout(110000),
                ]),
              },
            );
            update({ id: saved.id, status: 'Đã tải lên' });
          }
        }
        if (signal?.aborted || !uploadItems.current.includes(item)) return;
        update({ status: 'Đã tải lên', error: undefined });
      } catch (cause) {
        update({
          status: transfer.signal.aborted ? 'Tạm dừng' : 'Lỗi',
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
    if (sending.current || !detailVerified) return;
    setAttachmentMenu(false);
    const resume = resumeTarget.current;
    resumeTarget.current = undefined;
    const selection = resumeSelection.current;
    resumeSelection.current = undefined;
    for (const file of Array.from(files ?? [])) {
      const invalid = validateUploadFile(
        file,
        {
          maxBytes: 10_000_000_000,
          allowedExtensions: [
            '.txt',
            '.md',
            '.csv',
            '.pdf',
            '.png',
            '.jpg',
            '.jpeg',
            '.docx',
            '.xlsx',
            '.pptx',
          ],
        },
        selection ?? resume,
      );
      if (invalid) {
        setError(invalid);
        return;
      }
      if (file.name.length > 200) {
        setError('Tên tệp không được dài quá 200 ký tự.');
        return;
      }
      if (
        execution === 'SIWC' &&
        uploadItems.current.length +
          sourceIds.length +
          restoredFileItems.current.length -
          (selection ? 1 : 0) >=
          3
      ) {
        setError('Mỗi lượt chọn tối đa 3 tệp.');
        break;
      }
      const item: UploadChip = {
        key: selection?.key ?? createCommandKey(),
        file,
        status: 'Đang tải',
        ...(selection?.sessionId
          ? { sessionId: selection.sessionId }
          : resume
            ? { sessionId: resume.id }
            : {}),
      };
      if (selection) {
        restoredFileItems.current = restoredFileItems.current.filter(
          (file) => file.key !== selection.key,
        );
        setRestoredFiles([...restoredFileItems.current]);
      }
      uploadItems.current.push(item);
      setUploads([...uploadItems.current]);
      void uploadFile(item);
      if (resume || selection) {
        setPendingUploads((previous) =>
          previous.filter(
            (pending) => pending.id !== (selection?.sessionId ?? resume?.id),
          ),
        );
        break;
      }
    }
  };
  const run = async (answer: Answer) =>
    call<Answer>(`/answers/${answer.id}/run`, {}, Boolean(answer.run));
  const ask = (retry = false) =>
    act(async () => {
      if (!detailVerified) {
        setError(
          'Chưa tải và xác minh được hội thoại. Thử tải lại trước khi gửi.',
        );
        return;
      }
      const text = retry
        ? (requestKey.current?.question ?? '')
        : question.trim()
          ? question
          : outputFormat
            ? `Tạo file ${outputFormat.toUpperCase()} nháp từ tệp đã chọn, trả file tải trong chat.`
            : uploadItems.current.length || sourceIds.length
              ? 'Đọc và tóm tắt nội dung các tệp đã chọn, nêu rõ phần chưa đọc được.'
              : '';
      if (!text || (!retry && !modelAvailable)) return;
      setAttachmentMenu(false);
      if (
        !retry &&
        execution !== 'MCP_EVENTS' &&
        planOnly &&
        searchMode === 'WEB' &&
        (!publicQuery.trim() || approvedPublicQuery !== publicQuery)
      ) {
        setError('Xác nhận đúng truy vấn công khai trước khi gửi.');
        return;
      }
      if (requestKey.current && !retry) return;
      const submissionKey = requestKey.current?.clientKey ?? createCommandKey();
      setPendingSubmission({
        clientKey: submissionKey,
        question: text,
        uploading: uploadItems.current.some((item) => !item.id),
      });
      if (!retry) {
        if (restoredFileItems.current.length) {
          setPendingSubmission(undefined);
          setError(
            'Tệp đã chọn chưa hoàn tất. Chọn lại để tiếp tục hoặc bỏ tệp trước khi gửi.',
          );
          return;
        }
        await Promise.all(uploadJobs.current.values());
        if (controller.current?.signal.aborted) return;
        if (uploadItems.current.some((item) => !item.id)) {
          setPendingSubmission(undefined);
          setError(
            'Tệp chưa tải xong. Tiếp tục tải hoặc bỏ tệp trước khi gửi.',
          );
          return;
        }
      }
      setPendingSubmission((current) =>
        current ? { ...current, uploading: false } : current,
      );
      if (!requestKey.current)
        requestKey.current = {
          conversationKey: createCommandKey(),
          clientKey: submissionKey,
          question: text,
          ...(execution !== 'SIWC' ? { execution } : {}),
          scope,
          model,
          reasoning,
          ...(outputFormat ? { outputFormat } : {}),
          searchMode,
          ...(planOnly ? { runMode } : {}),
          ...(searchMode === 'WEB' && publicQuery ? { publicQuery } : {}),
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
      saveDraft();
      if (!key.conversationId) key.conversationId = await ensureConversation();
      if (controller.current?.signal.aborted) return;
      selectedRef.current = key.conversationId;
      setSelected(key.conversationId);
      saveDraft();
      const answer = await call<Answer>(
        `/conversations/${key.conversationId}/${key.execution === 'AUTO' ? 'executions' : key.execution === 'MCP_EVENTS' ? 'mcp-jobs' : 'answers'}`,
        {
          clientKey: key.clientKey,
          question: key.question,
          ...(key.execution === 'AUTO' ? { requested_executor: 'AUTO' } : {}),
          ...(key.execution !== 'MCP_EVENTS' &&
            key.model && {
              model: key.model,
              reasoning: key.reasoning,
            }),
          ...(key.outputFormat ? { outputFormat: key.outputFormat } : {}),
          ...(planOnly && key.execution !== 'MCP_EVENTS'
            ? {
                searchMode: key.searchMode,
                ...(key.runMode ? { runMode: key.runMode } : {}),
                ...(key.publicQuery ? { publicQuery: key.publicQuery } : {}),
              }
            : {}),
          sourceIds: key.sourceIds,
          ...key.context,
        },
      );
      if (controller.current?.signal.aborted) return;
      updateUrl(key.conversationId);
      requestKey.current = undefined;
      conversationCreation.current = undefined;
      try {
        sessionStorage.removeItem(draftStorageKey);
      } catch {
        /* Storage có thể bị chặn. */
      }
      setRetryPin(undefined);
      setApprovedPublicQuery('');
      setPublicQuery('');
      setQuestion((current) => (current === key.question ? '' : current));
      setOutputFormat(undefined);
      drafts.current.set(key.conversationId, '');
      uploadItems.current = uploadItems.current.filter(
        (item) => !item.id || !key.sourceIds.includes(item.id),
      );
      setUploads([...uploadItems.current]);
      setSourceIds((current) =>
        current.filter((id) => !key.sourceIds.includes(id)),
      );
      await refresh();
      if (key.execution === undefined && !planOnly && key.sourceIds.length)
        await call('/index', { scope: 'ALL' });
      if (
        answer.route === 'SIWC' ||
        (key.execution === undefined && answer.status !== 'COMPLETED')
      )
        await run(answer);
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
          rangeRead?: boolean;
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
  const visiblePendingUploads = pendingUploads.filter(
    (item) =>
      item.projectId === projectId &&
      item.aiConversationId === selected &&
      !restoredFiles.some((file) => file.sessionId === item.id),
  );
  const modelControls = (
    <div className="ai-context-bar">
      {planOnly && !models.some((m) => m.available) && <ChatGptConnection />}
      <p className="ai-privacy">
        Ngữ cảnh: {projectName ?? 'Dự án'} · Chỉ dự án này
      </p>
      <div className="ai-model-controls">
        {planOnly && (
          <label>
            Chế độ xử lý
            <select
              aria-label="Chế độ xử lý"
              value={runMode}
              disabled={busy || Boolean(retryPin)}
              onChange={(event) =>
                setRunMode(event.target.value as 'NORMAL' | 'DEEP')
              }
            >
              <option value="NORMAL">Thông thường</option>
              <option value="DEEP">Phân tích chuyên sâu</option>
            </select>
          </label>
        )}
        {chosenModel?.capabilities.nativeWebSearchBlockReason && (
          <p role="status">
            {aiStatusLabel(chosenModel.capabilities.nativeWebSearchBlockReason)}
          </p>
        )}
        {planOnly && (
          <label>
            Phạm vi tìm kiếm
            <select
              aria-label="Phạm vi tìm kiếm"
              value={searchMode}
              disabled={busy || Boolean(retryPin)}
              onChange={(e) => {
                const mode = e.target.value as typeof searchMode;
                setSearchMode(mode);
                setApprovedPublicQuery('');
                try {
                  sessionStorage.setItem(
                    searchStorageKey,
                    mode === 'PROJECT_ONLY' ? mode : 'AUTO',
                  );
                } catch {
                  /* The preference still works without storage. */
                }
              }}
            >
              <option value="AUTO">Tự động — Web + dự án + tài liệu</option>
              <option
                value="WEB"
                disabled={!chosenModel?.capabilities.nativeWebSearch}
              >
                Web công khai
              </option>
              <option value="PROJECT_ONLY">Chỉ dự án — không tìm web</option>
            </select>
          </label>
        )}
        {planOnly &&
          searchMode === 'WEB' &&
          chosenModel?.capabilities.nativeWebSearch && (
            <div>
              <label>
                Truy vấn công khai
                <input
                  aria-label="Truy vấn công khai"
                  value={publicQuery}
                  maxLength={400}
                  disabled={busy || Boolean(retryPin)}
                  onChange={(e) => {
                    setPublicQuery(e.target.value);
                    setApprovedPublicQuery('');
                  }}
                />
              </label>
              <p>
                Chỉ nội dung truy vấn này được đưa vào pha tìm kiếm web. Hãy
                kiểm tra trước khi cho phép công bố.
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={
                    Boolean(publicQuery.trim()) &&
                    approvedPublicQuery === publicQuery
                  }
                  disabled={!publicQuery.trim() || busy || Boolean(retryPin)}
                  onChange={(e) =>
                    setApprovedPublicQuery(e.target.checked ? publicQuery : '')
                  }
                />{' '}
                Cho phép công bố đúng truy vấn này
              </label>
            </div>
          )}
        <ModelSelector
          models={choices}
          value={model}
          onChange={(value) => {
            setModel(value);
            setPublicQuery('');
            setApprovedPublicQuery('');
            const selection = initialAiSelection(
              models,
              value,
              null,
              ownerPreference.current,
            );
            setReasoning(selection.reasoning);
            try {
              sessionStorage.setItem(modelStorageKey, value);
              sessionStorage.setItem(
                effortStorageKey,
                JSON.stringify(selection),
              );
            } catch {
              /* Không lưu secret tại browser. */
            }
          }}
        />
        {model && effortChoices.length > 0 && (
          <label>
            Mức suy luận{' '}
            <select
              aria-label="Mức suy luận"
              value={reasoning}
              onChange={(e) => {
                setReasoning(e.target.value);
                try {
                  sessionStorage.setItem(
                    effortStorageKey,
                    JSON.stringify({ model, reasoning: e.target.value }),
                  );
                } catch {
                  /* Keep the selection usable without storage. */
                }
              }}
            >
              {!effortChoices.includes(reasoning) && (
                <option value={reasoning} disabled>
                  {reasoning} · chưa khả dụng ở nhánh này
                </option>
              )}
              {effortChoices.map((value) => (
                <option key={value} value={value}>
                  {
                    (
                      {
                        default: 'Mặc định nhà cung cấp',
                        none: 'Tối thiểu',
                        low: 'Thấp',
                        medium: 'Trung bình',
                        high: 'Cao',
                        xhigh: 'Rất cao',
                        max: 'MAX',
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
      {(workspace || presentation === 'sidebar') &&
        execution !== 'MCP_EVENTS' &&
        modelControls}
      <details className="ai-context-sources">
        <summary>Nguồn tham chiếu</summary>
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
      </details>
      <nav className="ai-thread-history" aria-label="Lịch sử phiên AI">
        <h3>Lịch sử phiên AI</h3>
        <button
          disabled={busy}
          onClick={() => {
            select('');
            setQuestion('');
            setOutputFormat(undefined);
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
        <div className="flex flex-wrap gap-1">
          <button
            disabled={!verified}
            aria-label="Bộ nhớ dự án"
            style={{ width: 'auto', fontSize: 14 }}
            onClick={() => {
              setMemoryDraft(undefined);
              setMemoryOpen(true);
            }}
          >
            Bộ nhớ
          </button>
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
              setOutputFormat(undefined);
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
                  {!workspace && execution !== 'MCP_EVENTS' && modelControls}
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
                            {(execution !== 'SIWC' ||
                              item.status === 'READY' ||
                              item.nativeFile ||
                              item.rangeRead) && (
                              <input
                                type="checkbox"
                                aria-label={`Chọn ${item.label}`}
                                disabled={
                                  busy ||
                                  (execution === 'SIWC' &&
                                    item.status !== 'READY' &&
                                    !(item.rangeRead
                                      ? chosenModel?.provider === 'chatgpt'
                                      : item.label
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
                                      ? execution !== 'SIWC'
                                        ? [...current, item.id]
                                        : [...current, item.id].slice(0, 3)
                                      : current.filter((id) => id !== item.id),
                                  )
                                }
                              />
                            )}
                            {item.label}:{' '}
                            {execution === 'MCP_EVENTS'
                              ? 'File gốc được cấp theo quyền khi ChatGPT Work nhận việc'
                              : item.rangeRead
                                ? 'Chỉ đọc range được chọn; chưa trích toàn bộ file'
                                : item.status === 'UNSUPPORTED' &&
                                    item.nativeFile
                                  ? 'Cần model đọc ảnh/tài liệu'
                                  : aiStatusLabel(item.status)}
                            {item.nativeFile
                              ? item.errorCode === 'PDF_SCAN_REQUIRES_VISION'
                                ? ' · Đọc ảnh tối đa 3 trang đầu.'
                                : execution === 'MCP_EVENTS'
                                  ? ' · File gốc được cung cấp theo quyền của công việc.'
                                  : ' · Tối đa 3 tệp mỗi lượt; chỉ đọc khi model hỗ trợ.'
                              : ''}
                            {item.coverage?.coverage === 'PARTIAL' && (
                              <span role="status">
                                {' '}
                                · Đã trích {item.coverage.readBytes} /{' '}
                                {item.coverage.originalBytes} bytes; phần còn
                                lại chưa đọc.
                              </span>
                            )}
                            {item.downloadUrl?.startsWith('/api/v1/') && (
                              <a href={item.downloadUrl}>
                                Tải bản gốc đúng phiên bản
                              </a>
                            )}
                            {item.version &&
                              item.downloadUrl?.startsWith(
                                `/api/v1${base}/files/`,
                              ) && (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() =>
                                    void act(async () => {
                                      const conversation = selectedRef.current;
                                      const targets = await call<{
                                        items: {
                                          id: string;
                                          label: string;
                                          stage: string;
                                        }[];
                                        truncated: boolean;
                                      }>(`/files/${item.id}/promote-targets`);
                                      if (
                                        !controller.current?.signal.aborted &&
                                        selectedRef.current === conversation
                                      )
                                        setPromotion({
                                          sourceId: item.id,
                                          version: item.version!,
                                          label: item.label,
                                          key: createCommandKey(),
                                          definitionId:
                                            targets.items[0]?.id ?? '',
                                          targets: targets.items,
                                          truncated: targets.truncated,
                                        });
                                    })
                                  }
                                >
                                  Đưa vào hồ sơ nháp
                                </button>
                              )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {promotion && (
                    <section aria-label="Đưa tệp vào hồ sơ nháp">
                      <p>
                        {promotion.label} · Lưu đúng bản gốc; hồ sơ tạo ra chưa
                        được phê duyệt.
                      </p>
                      {promotion.targets.length ? (
                        <label>
                          Hồ sơ đích
                          <select
                            aria-label="Hồ sơ đích"
                            disabled={busy || Boolean(promotion.result)}
                            value={promotion.definitionId}
                            onChange={(event) =>
                              setPromotion({
                                ...promotion,
                                definitionId: event.target.value,
                                key: createCommandKey(),
                              })
                            }
                          >
                            {promotion.targets.map((target) => (
                              <option key={target.id} value={target.id}>
                                {target.label} · {target.stage}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : (
                        <p role="status">
                          Chưa có hồ sơ nháp phù hợp với quyền hiện tại. Tạo mục
                          hồ sơ trong dự án rồi chọn lại tệp.
                        </p>
                      )}
                      {promotion.truncated && (
                        <p role="status">Hiển thị 100 hồ sơ đích đầu tiên.</p>
                      )}
                      {promotion.result && (
                        <p role="status">
                          {promotion.result}{' '}
                          <a href={`/projects/${projectId}/documents`}>
                            Mở hồ sơ dự án
                          </a>
                        </p>
                      )}
                      <button
                        type="button"
                        disabled={
                          busy ||
                          !promotion.definitionId ||
                          Boolean(promotion.result)
                        }
                        onClick={() =>
                          void act(async () => {
                            const conversation = selectedRef.current;
                            const saved = await call<{
                              version: number;
                              status: string;
                            }>(`/files/${promotion.sourceId}/promote`, {
                              definitionId: promotion.definitionId,
                              sourceVersion: promotion.version,
                              clientKey: promotion.key,
                            });
                            if (
                              !controller.current?.signal.aborted &&
                              selectedRef.current === conversation
                            )
                              setPromotion({
                                ...promotion,
                                result: `Đã lưu bản nháp v${saved.version}; chưa phê duyệt.`,
                              });
                          })
                        }
                      >
                        Lưu nháp vào hồ sơ
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setPromotion(undefined)}
                      >
                        Đóng
                      </button>
                    </section>
                  )}
                  {history?.answers.map((answer) => (
                    <AiAnswer
                      key={answer.id}
                      answer={answer}
                      onDraft={onDraft}
                      onMemory={(draft) => {
                        setMemoryDraft(draft);
                        setMemoryOpen(true);
                      }}
                      onSource={(item) => {
                        void openSource(answer.id, item);
                      }}
                      onRun={() => {
                        void act(async () => {
                          if (answer.route === 'MCP_EVENTS') {
                            await call(`/answers/${answer.id}/mcp/retry`, {});
                            await refresh();
                          } else await run(answer);
                        });
                      }}
                      onClarify={async (content, operationId) => {
                        await call(`/answers/${answer.id}/mcp/clarify`, {
                          content,
                          operation_id: operationId,
                          attempt: answer.mcpJob?.attempt,
                        });
                        await refresh();
                      }}
                      onCancel={() => {
                        void call(
                          `/answers/${answer.id}/${answer.route === 'MCP_EVENTS' ? 'mcp/cancel' : 'cancel'}`,
                          {},
                        )
                          .then(refresh)
                          .catch(invalidate);
                      }}
                    />
                  ))}
                  {pendingSubmission &&
                    !history?.answers.some(
                      (answer) =>
                        answer.clientKey === pendingSubmission.clientKey,
                    ) && (
                      <article
                        className="ai-answer"
                        data-client-key={pendingSubmission.clientKey}
                      >
                        <h3 className="ai-question">
                          {pendingSubmission.question}
                        </h3>
                        <div className="ai-response-card" role="status">
                          {busy
                            ? pendingSubmission.uploading
                              ? 'Đang tải tệp lên.'
                              : 'Galaxy đang lưu yêu cầu.'
                            : 'Chưa xác nhận Galaxy đã lưu yêu cầu. Thử lại giữ nguyên yêu cầu.'}
                        </div>
                      </article>
                    )}
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
                      <button
                        type="button"
                        disabled={!detailVerified}
                        onClick={() => void ask(true)}
                      >
                        Thử lại lượt đã chốt
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          requestKey.current = undefined;
                          setPendingSubmission(undefined);
                          setRetryPin(undefined);
                          saveDraft();
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
                    {execution === 'SIWC' &&
                      planOnly &&
                      !models.some((m) => m.available) && (
                        <span role="status" className="block text-sm">
                          AI chưa được quản trị viên kích hoạt.
                        </span>
                      )}
                    <ChatComposerInput
                      aria-label="Câu hỏi AI"
                      value={question}
                      disabled={busy}
                      onChange={setQuestion}
                    />
                  </label>
                  {mcpEnabled && (
                    <label>
                      Thực hiện bằng{' '}
                      <select
                        aria-label="Thực hiện bằng"
                        value={execution}
                        disabled={busy || Boolean(retryPin)}
                        onChange={(event) =>
                          setExecution(
                            event.target.value as
                              | 'AUTO'
                              | 'SIWC'
                              | 'MCP_EVENTS',
                          )
                        }
                      >
                        <option value="AUTO">Tự động</option>
                        <option value="SIWC">Galaxy AI (SIWC)</option>
                        <option value="MCP_EVENTS">ChatGPT Work</option>
                      </select>
                    </label>
                  )}
                  {(execution === 'MCP_EVENTS' || execution === 'AUTO') && (
                    <McpReadiness projectId={projectId} actorId={actorId} />
                  )}
                  <input
                    ref={fileInput}
                    type="file"
                    disabled={busy || !detailVerified}
                    aria-label="Tải tệp từ máy"
                    accept=".txt,.md,.csv,.pdf,.png,.jpg,.jpeg,.docx,.xlsx,.pptx"
                    multiple
                    hidden
                    onChange={(event) => {
                      chooseFiles(event.target.files);
                      event.target.value = '';
                    }}
                  />
                  {recoveryTruncated && visiblePendingUploads.length > 0 && (
                    <p role="status">
                      Chỉ hiển thị 100 phiên tải dang dở gần nhất.
                    </p>
                  )}
                  {restoredFiles.length > 0 && (
                    <ul className="ai-file-chips">
                      {restoredFiles.map((file) => (
                        <li key={file.key}>
                          {file.originalFilename} · Chưa nhận xác nhận tải
                          <button
                            type="button"
                            disabled={busy || !detailVerified}
                            onClick={() => {
                              resumeSelection.current = file;
                              resumeTarget.current = undefined;
                              fileInput.current?.click();
                            }}
                          >
                            Chọn lại tệp để tiếp tục
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            aria-label={`Bỏ ${file.originalFilename}`}
                            onClick={() => {
                              resumeSelection.current = undefined;
                              restoredFileItems.current =
                                restoredFileItems.current.filter(
                                  (item) => item.key !== file.key,
                                );
                              setRestoredFiles([...restoredFileItems.current]);
                            }}
                          >
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {visiblePendingUploads.length > 0 && (
                    <ul className="ai-file-chips">
                      {visiblePendingUploads.map((pending) => (
                        <li key={pending.id}>
                          {pending.originalFilename} · đã lưu{' '}
                          {pending.uploadedBytes} / {pending.declaredSize} bytes
                          {pending.status === 'VERIFYING' && (
                            <span role="status"> · Đang kiểm tra và lưu</span>
                          )}
                          <button
                            type="button"
                            disabled={busy || !detailVerified}
                            onClick={() => {
                              resumeTarget.current = pending;
                              resumeSelection.current = undefined;
                              fileInput.current?.click();
                            }}
                          >
                            Chọn lại tệp để tiếp tục
                          </button>
                          <button
                            type="button"
                            disabled={busy || pending.status === 'VERIFYING'}
                            onClick={() => {
                              void api(
                                `/uploads/${encodeURIComponent(pending.id)}/abort`,
                                { method: 'POST', body: '{}' },
                              )
                                .then(() =>
                                  setPendingUploads((previous) =>
                                    previous.filter(
                                      (item) => item.id !== pending.id,
                                    ),
                                  ),
                                )
                                .catch((cause) =>
                                  setError((cause as Error).message),
                                );
                            }}
                          >
                            Hủy tải
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {uploads.length > 0 && (
                    <ul className="ai-file-chips">
                      {uploads.map((item) => (
                        <li key={item.key}>
                          {item.file.name} · {Math.ceil(item.file.size / 1024)}{' '}
                          KB · {item.status}
                          {item.uploadedBytes !== undefined && (
                            <progress
                              aria-label={`Tiến độ ${item.file.name}`}
                              max={item.file.size}
                              value={item.uploadedBytes}
                            />
                          )}
                          {item.coverageNote && (
                            <span role="status"> · {item.coverageNote}</span>
                          )}
                          {item.id && (
                            <a
                              href={`/api/v1${base}/files/${item.id}/download`}
                            >
                              Tải bản gốc
                            </a>
                          )}
                          {item.error && (
                            <span role="alert"> · {item.error}</span>
                          )}
                          {['Lỗi', 'Tạm dừng'].includes(item.status) && (
                            <button
                              type="button"
                              disabled={busy || !detailVerified}
                              onClick={() => void uploadFile(item)}
                            >
                              Thử lại tệp
                            </button>
                          )}
                          {item.status === 'Đang tải' && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => item.transfer?.abort()}
                            >
                              Tạm dừng tải
                            </button>
                          )}
                          <button
                            type="button"
                            aria-label={`Bỏ ${item.file.name}`}
                            disabled={busy}
                            onClick={() => {
                              const signal = controller.current?.signal;
                              item.transfer?.abort();
                              const remove = () => {
                                uploadItems.current =
                                  uploadItems.current.filter(
                                    (entry) => entry !== item,
                                  );
                                setUploads([...uploadItems.current]);
                              };
                              void (async () => {
                                await uploadJobs.current.get(item.key);
                                if (signal?.aborted) return;
                                if (item.sessionId && !item.id) {
                                  const path = `/uploads/${encodeURIComponent(item.sessionId)}`;
                                  const current = await api<{ status: string }>(
                                    path,
                                    { signal },
                                  );
                                  if (
                                    !['AVAILABLE', 'VERIFYING'].includes(
                                      current.status,
                                    )
                                  )
                                    await api(`${path}/abort`, {
                                      method: 'POST',
                                      body: '{}',
                                      signal,
                                    });
                                }
                                if (signal?.aborted) return;
                                remove();
                              })().catch(
                                (cause) =>
                                  !signal?.aborted &&
                                  setError((cause as Error).message),
                              );
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
                            ?.label ??
                            history?.answers
                              .flatMap((answer) => answer.attachments ?? [])
                              .find((attachment) => attachment.sourceId === id)
                              ?.filename ??
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
                    <div>
                      <button
                        type="button"
                        aria-expanded={createMenu}
                        disabled={busy || Boolean(retryPin) || !modelAvailable}
                        onClick={() => setCreateMenu((value) => !value)}
                      >
                        Create
                      </button>
                      {createMenu && (
                        <div role="group" aria-label="Chọn tài liệu nháp">
                          {[
                            'Excel (XLSX)',
                            'Word (DOCX)',
                            'PDF',
                            ...(execution === 'MCP_EVENTS' ||
                            chosenModel?.capabilities.createFormats?.includes(
                              'pptx',
                            )
                              ? ['PowerPoint (PPTX)']
                              : []),
                          ].map((format) => (
                            <button
                              key={format}
                              type="button"
                              onClick={() => {
                                setOutputFormat(
                                  format === 'Excel (XLSX)'
                                    ? 'xlsx'
                                    : format === 'Word (DOCX)'
                                      ? 'docx'
                                      : format === 'PDF'
                                        ? 'pdf'
                                        : 'pptx',
                                );
                                setCreateMenu(false);
                                panel.current
                                  ?.querySelector<HTMLTextAreaElement>(
                                    'textarea[aria-label="Câu hỏi AI"]',
                                  )
                                  ?.focus();
                              }}
                            >
                              {format}
                            </button>
                          ))}
                          <button type="button" disabled>
                            Tạo ảnh
                          </button>
                          <p role="status" className="chat-metadata">
                            Tạo ảnh chưa sẵn sàng: cần engine, model, workflow
                            và tài nguyên được kiểm chứng.
                          </p>
                        </div>
                      )}
                      {outputFormat && (
                        <span className="chat-metadata">
                          Đầu ra: {outputFormat.toUpperCase()}{' '}
                          <button
                            type="button"
                            disabled={busy || Boolean(retryPin)}
                            onClick={() => setOutputFormat(undefined)}
                          >
                            Bỏ yêu cầu tạo file
                          </button>
                        </span>
                      )}
                    </div>
                    <div>
                      <button
                        type="button"
                        aria-label="Đính kèm tệp"
                        aria-expanded={attachmentMenu}
                        disabled={busy || !detailVerified}
                        onClick={() => setAttachmentMenu((value) => !value)}
                      >
                        ＋
                      </button>
                      {attachmentMenu && (
                        <div role="group" aria-label="Chọn cách đính kèm">
                          <button
                            type="button"
                            disabled={busy || !detailVerified}
                            onClick={() => {
                              setAttachmentMenu(false);
                              resumeTarget.current = undefined;
                              resumeSelection.current = undefined;
                              fileInput.current?.click();
                            }}
                          >
                            Tải tệp từ máy
                          </button>
                          <button
                            type="button"
                            disabled={busy || !detailVerified}
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
                      {execution === 'AUTO'
                        ? 'Tự động · Galaxy chọn đường phù hợp'
                        : execution === 'MCP_EVENTS'
                          ? 'ChatGPT Work'
                          : (chosenModel?.label ?? 'Chưa chọn model')}{' '}
                      · Shift+Enter xuống dòng
                    </span>
                    <button
                      className="chat-send"
                      type="submit"
                      disabled={
                        !detailVerified ||
                        busy ||
                        restoredFiles.length > 0 ||
                        Boolean(retryPin) ||
                        (!question.trim() &&
                          !uploads.length &&
                          !sourceIds.length) ||
                        !modelAvailable ||
                        (execution === 'SIWC' &&
                          planOnly &&
                          searchMode === 'WEB' &&
                          (!publicQuery.trim() ||
                            approvedPublicQuery !== publicQuery))
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
                            void call(
                              `/answers/${answer.id}/${answer.route === 'MCP_EVENTS' ? 'mcp/cancel' : 'cancel'}`,
                              {},
                            )
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
            {source.sheet
              ? `${source.sheet}!${source.range}`
              : source.page
                ? `trang ${source.page}`
                : `dòng ${source.startLine}–${source.endLine}`}{' '}
            ·{' '}
            {source.kind === 'MEMORY'
              ? 'Bộ nhớ có nguồn — không phải phê duyệt nghiệp vụ'
              : source.kind === 'HISTORY'
                ? 'Lượt trả lời trong hội thoại riêng'
                : source.provenance === 'PUBLIC_WEB'
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
          {isChatFileUrl(source.downloadUrl) && (
            <a href={source.downloadUrl}>Mở file đúng phiên bản</a>
          )}
        </SourceDrawer>
      )}
      {memoryOpen && active && verified && (
        <SourceDrawer
          dialogRef={memoryDialog}
          title="Bộ nhớ dự án"
          className="ai-source-drawer"
          onClose={() => {
            setMemoryOpen(false);
            setMemoryDraft(undefined);
          }}
        >
          <ProjectAiMemory
            key={JSON.stringify([
              actorId,
              projectId,
              selected,
              memoryDraft?.source.id,
            ])}
            projectId={projectId}
            actorId={actorId}
            conversationId={selected || undefined}
            initialDraft={memoryDraft}
            onMemoryChanged={() => void refresh()}
          />
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
