'use client';
import { createCommandKey } from '../../app/lib/create-command-key';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../../app/lib/api';

export type AiContext = {
  roomId?: string;
  productLineId?: string;
  fileAssetId?: string;
  fileVersion?: number;
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
  reason: string | null;
  credentialConfigured: boolean;
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
  model?: string | null;
  modelLabel?: string | null;
  provider?: string | null;
  providerLabel?: string | null;
  returnedModel?: string | null;
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
type Conversation = { id: string; scope: string; createdAt?: string };
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
    INVALID_CREDENTIAL:
      'Nhà cung cấp từ chối credential; cần thay khóa tại terminal',
    MODEL_NOT_AVAILABLE: 'Model chưa khả dụng với quyền tài khoản này',
    UNSUPPORTED_PARAMETER: 'Nhà cung cấp không hỗ trợ tham số của yêu cầu',
    ACCOUNT_QUOTA_OR_BILLING:
      'Tài khoản nhà cung cấp thiếu hạn mức hoặc cần xử lý thanh toán',
    NETWORK_OR_TLS: 'Không kết nối được nhà cung cấp; cần kiểm tra mạng/TLS',
    EGRESS_POLICY_DENIED:
      'Model đã kết nối, nhưng nguồn này chưa được phép gửi đến nhà cung cấp đã chọn',
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
    <article className="grid gap-2 rounded border p-3">
      {answer.status !== 'ACCESS_REVOKED' && answer.question && (
        <h3 className="whitespace-pre-wrap font-semibold">{answer.question}</h3>
      )}
      <p role="status">
        {aiStatusLabel(
          answer.errorCode ?? answer.status,
          aiStatusLabel(answer.status),
        )}
      </p>
      {answer.model && (
        <p>
          {answer.modelLabel ?? answer.model} ·{' '}
          {answer.providerLabel ?? answer.provider}
          {answer.createdAt
            ? ` · ${new Date(answer.createdAt).toLocaleString('vi-VN')}`
            : ''}
        </p>
      )}
      {answer.status === 'COMPLETED' && answer.usage && (
        <p>
          Token đầu vào: {answer.usage.input_tokens} · đầu ra:{' '}
          {answer.usage.output_tokens}. Chi phí tiền chưa xác định.
        </p>
      )}
      {answer.status === 'COMPLETED' && (
        <>
          <p className="whitespace-pre-wrap">{answer.answer}</p>
          {answer.uncertainty && (
            <p className="whitespace-pre-wrap">{answer.uncertainty}</p>
          )}
          {onDraft && answer.answer && (
            <button onClick={() => onDraft(answer.answer!)}>
              Dùng làm nháp phản hồi
            </button>
          )}
          <ul>
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
        <button onClick={onCancel}>Hủy yêu cầu</button>
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
            {model.reason ? ` — ${aiStatusLabel(model.reason)}` : ''}
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
}: {
  projectId: string;
  actorId: string;
  group: string;
  initialContext?: AiContext;
  roomLabels?: Record<string, string>;
  onRevoked: () => void;
  canConfigure?: boolean;
  onDraft?: (text: string) => void;
}) {
  const panel = useRef<HTMLElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [models, setModels] = useState<ModelChoice[]>([]);
  const [model, setModel] = useState('');
  const [reasoning, setReasoning] = useState('default');
  const [pilotConfirmed, setPilotConfirmed] = useState(false);
  const [settings, setSettings] = useState<ModelChoice[]>();
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
  const modelStorageKey = `galaxy-ai-model:${actorId}:${projectId}`;
  const chosenModel = models.find((m) => m.id === model);
  const [list, setList] = useState<Conversation[]>([]);
  const [provider, setProvider] = useState('LOADING');
  const [selected, setSelected] = useState('');
  const selectedRef = useRef('');
  const [scope, setScope] = useState(group);
  const [history, setHistory] = useState<History>();
  const context = selected ? (history?.context ?? undefined) : initialContext;
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [source, setSource] = useState<SourceDetail>();
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
        requestKey.current = undefined;
        setRetryPin(undefined);
        selectedRef.current = '';
        setSelected('');
        const url = new URL(location.href);
        url.searchParams.delete('ai');
        window.history.replaceState(window.history.state, '', url);
        activePage.current = false;
        refreshAgain.current = false;
        onRevoked();
      }
    },
    [onRevoked, setSource, setQuestion, setRetryPin],
  );
  const select = (id: string) => {
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
    const url = new URL(location.href);
    if (id) url.searchParams.set('ai', id);
    else url.searchParams.delete('ai');
    window.history.replaceState(window.history.state, '', url);
  };
  const refresh = useCallback(
    async function refresh() {
      if (!activePage.current || document.visibilityState !== 'visible') return;
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
          document.visibilityState !== 'visible' ||
          epoch !== reading.current ||
          id !== selectedRef.current
        )
          return;
        setProvider(result.provider);
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
        setList(result.conversations);
        setSelected(id);
        setHistory(detail);
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
    [call, invalidate, modelStorageKey, setSource],
  );
  useEffect(() => {
    controller.current = new AbortController();
    const generation = reading;
    const id = new URL(location.href).searchParams.get('ai');
    if (id && /^[\da-f-]{36}$/i.test(id)) {
      selectedRef.current = id;
    }
    void refresh();
    const clear = () => {
      activePage.current = false;
      ++reading.current;
      sourceKey.current = undefined;
      indexScope.current = undefined;
      requestKey.current = undefined;
      setRetryPin(undefined);
      setQuestion('');
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
      const url = new URL(location.href);
      url.searchParams.set('ai', key.conversationId);
      window.history.replaceState(window.history.state, '', url);
      const answer = await call<Answer>(
        `/conversations/${key.conversationId}/answers`,
        {
          clientKey: key.clientKey,
          question: key.question,
          model: key.model,
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
  return (
    <section
      ref={panel}
      aria-label="Hỏi AI"
      className={`project-ai-panel ${collapsed ? 'is-collapsed' : ''}`}
    >
      <header className="ai-panel-header">
        <div>
          <span className="eyebrow">Galaxy AI · Riêng tư</span>
          <h2 className="mt-1 font-semibold">Hỏi AI</h2>
        </div>
        <div className="flex gap-1">
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
          <button
            aria-label={collapsed ? 'Mở panel AI' : 'Thu gọn panel AI'}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((value) => !value)}
          >
            {collapsed ? '+' : '−'}
          </button>
        </div>
      </header>
      <div className="ai-panel-content grid gap-3" hidden={collapsed}>
        <p className="text-xs text-slate-500">
          Tra cứu riêng trong nguồn được cấp quyền. Câu trả lời không tự gửi vào
          phòng chat.
        </p>
        {provider === 'NOT_CONFIGURED' && (
          <p role="status">
            Chưa có provider sẵn sàng. Xem nguyên nhân riêng ở bộ chọn model;
            lịch sử riêng tư vẫn được giữ.
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <ModelSelector
            models={models}
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
        {chosenModel && (
          <p role="status">
            {chosenModel.reason
              ? aiStatusLabel(chosenModel.reason)
              : 'Model áp dụng cho lượt gửi tiếp theo.'}{' '}
            Văn bản theo nguồn; ảnh/PDF:{' '}
            {chosenModel.capabilities.imageInput ||
            chosenModel.capabilities.pdfInput
              ? 'xem khả năng đã được kiểm chứng'
              : 'chưa được bật/kiểm chứng live'}
            .{' '}
            {chosenModel.textLiveVerified
              ? 'Đã có kiểm thử live văn bản.'
              : 'Chưa kiểm chứng live văn bản.'}
          </p>
        )}
        {canConfigure && (
          <details
            onToggle={(event) => {
              if (event.currentTarget.open)
                void call<{ models: ModelChoice[] }>('/settings')
                  .then((result) => setSettings(result.models))
                  .catch((cause) =>
                    setError(
                      aiStatusLabel(
                        (cause as Error).message,
                        (cause as Error).message,
                      ),
                    ),
                  );
            }}
          >
            <summary>Cấu hình nhà cung cấp và hạn mức</summary>
            <p>
              Khóa thay thế nhập tại terminal local của máy chủ, input ẩn. Chỉ
              hồ sơ và phiên bản nguồn giả/công khai được quản trị duyệt mới
              được gửi.
            </p>
            {settings?.map((item) => (
              <div key={item.id} className="my-3 rounded border p-3 text-xs">
                <strong>{item.label}</strong> · {item.host}
                <p>
                  {item.providerReason
                    ? aiStatusLabel(item.providerReason)
                    : 'API đã nạp credential và provider được bật'}{' '}
                  · revision {item.revision ?? 'chưa có'}
                </p>
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
                <p className="my-2">
                  Kiểm thử quản trị chỉ gửi nguồn tổng hợp cố định: văn bản tối
                  đa 3 câu; ảnh/PDF 1 câu. Không đọc hồ sơ dự án.
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
                            ['COMPLETED', 'FAILED', 'FAILED_UNKNOWN'].includes(
                              result.status,
                            )
                          )
                            activationKeys.current.delete(name);
                          const latest = await call<{ models: ModelChoice[] }>(
                            '/settings',
                          );
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
              disabled={busy || Boolean(selected)}
              onChange={(e) => setScope(e.target.value)}
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
                  {scopes.find(([value]) => value === conversation.scope)?.[1]}{' '}
                  ·{' '}
                  {conversation.createdAt
                    ? new Date(conversation.createdAt).toLocaleString('vi-VN')
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
            Chỉ dùng nguồn có quyền trong chỉ mục hiện hữu; file chưa được gửi
            qua chat/phát hành có thể chưa có nguồn AI. Hội thoại đã lưu giữ
            phạm vi này.
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
        <button
          disabled={busy}
          onClick={() => {
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
              }
            });
          }}
        >
          Cập nhật nguồn trong phạm vi
        </button>
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
          <aside
            aria-label="Nguồn câu trả lời"
            className="grid gap-2 rounded border p-3"
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
            <button
              onClick={() => {
                sourceKey.current = undefined;
                setSource(undefined);
              }}
            >
              Đóng nguồn
            </button>
          </aside>
        )}
        {!busy && retryPin && (
          <aside role="status" className="grid gap-2 rounded border p-3">
            <p>
              Lượt gửi chưa rõ kết quả:{' '}
              {models.find((m) => m.id === retryPin.model)?.label ??
                retryPin.model}{' '}
              · mức {retryPin.reasoning} · {retryPin.sourceIds.length} file. Thử
              lại giữ nguyên câu hỏi, model và nguồn đã chốt.
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
        <form
          className="grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void ask();
          }}
        >
          <label>
            Câu hỏi AI
            <textarea
              aria-label="Câu hỏi AI"
              className="block w-full"
              rows={3}
              maxLength={8000}
              value={question}
              disabled={busy}
              onChange={(e) => setQuestion(e.target.value)}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={pilotConfirmed}
              onChange={(e) => setPilotConfirmed(e.target.checked)}
            />{' '}
            Câu hỏi chỉ chứa dữ liệu giả hoặc công khai được phép; không có dữ
            liệu mật/cá nhân.
          </label>
          <button
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
        </form>
      </div>
    </section>
  );
}
