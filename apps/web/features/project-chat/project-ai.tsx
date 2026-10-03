'use client';
import { createCommandKey } from '../../app/lib/create-command-key';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../../app/lib/api';

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
  adminEnabled: boolean;
  accountVisible: boolean;
  textLiveVerified: boolean;
  revision: string | null;
  capabilities: {
    reasoningModes: string[];
    imageInput: boolean;
    pdfInput: boolean;
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
type History = Conversation & { answers: Answer[] };
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
export const aiStatusLabel = (status: string) =>
  ({
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
  })[status] ?? 'Trạng thái chưa xác định';

export function AiAnswer({
  answer,
  onSource,
  onCancel,
  onRun,
}: {
  answer: Answer;
  onSource: (source: Source) => void;
  onCancel: () => void;
  onRun: () => void;
}) {
  return (
    <article className="grid gap-2 rounded border p-3">
      {answer.status !== 'ACCESS_REVOKED' && answer.question && (
        <h3 className="whitespace-pre-wrap font-semibold">{answer.question}</h3>
      )}
      <p role="status">{aiStatusLabel(answer.errorCode ?? answer.status)}</p>
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
}: {
  projectId: string;
  actorId: string;
  group: string;
  onRevoked: () => void;
  canConfigure?: boolean;
}) {
  const [models, setModels] = useState<ModelChoice[]>([]);
  const [model, setModel] = useState('');
  const [reasoning, setReasoning] = useState('default');
  const [pilotConfirmed, setPilotConfirmed] = useState(false);
  const [settings, setSettings] = useState<ModelChoice[]>();
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
  const indexScope = useRef<string | undefined>(undefined);
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
        conversationId?: string;
      }
    | undefined
  >(undefined);
  const [retryPin, setRetryPin] = useState<(typeof requestKey)['current']>();
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
      setLoadError((cause as Error).message);
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
                }>(`/index?scope=${encodeURIComponent(selectedScope)}`)
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
        setError((cause as Error).message);
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
      if (!text || !pilotConfirmed || (!retry && !chosenModel?.available))
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
        setError((cause as Error).message);
        setRetryPin(requestKey.current);
      }
    }
  };
  return (
    <section aria-label="Hỏi AI" className="grid gap-3 rounded border p-4">
      <h2 className="text-xl">Hỏi AI</h2>
      <p>
        Tra cứu riêng trong nguồn được cấp quyền. Câu trả lời không tự gửi vào
        phòng chat.
      </p>
      {provider === 'NOT_CONFIGURED' && (
        <p role="status">
          Chưa cấu hình khóa thay thế hoặc chưa cấp phép dữ liệu. Bạn vẫn có thể
          xem lịch sử; nháp chưa được gửi ra ngoài.
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
                .catch((cause) => setError((cause as Error).message));
          }}
        >
          <summary>Cấu hình nhà cung cấp và hạn mức</summary>
          <p>
            Khóa thay thế nhập tại terminal local của máy chủ, input ẩn. Chỉ hồ
            sơ và phiên bản nguồn giả/công khai được quản trị duyệt mới được
            gửi.
          </p>
          {settings?.map((item) => (
            <p key={item.id}>
              {item.label} · {item.host} ·{' '}
              {item.credentialConfigured
                ? 'Đã cấu hình khóa thay thế'
                : 'Chưa có khóa thay thế'}{' '}
              · {item.adminEnabled ? 'Đã bật' : 'Chưa bật'} ·{' '}
              {item.accountVisible
                ? 'Đã xác minh quyền model'
                : 'Chưa xác minh quyền model'}{' '}
              ·{' '}
              {item.limits.requestsPerDay === null
                ? 'Không đặt trần lượt/ngày'
                : `${item.limits.requestsPerDay} lượt/ngày`}{' '}
              · {item.limits.concurrent} lượt đồng thời · tối đa{' '}
              {item.limits.outputTokens} token đầu ra/lượt ·{' '}
              {item.textLiveVerified ? 'Live văn bản đạt' : 'Live chưa đạt'}
            </p>
          ))}
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
                {scopes.find(([value]) => value === conversation.scope)?.[1]} ·{' '}
                {conversation.createdAt
                  ? new Date(conversation.createdAt).toLocaleString('vi-VN')
                  : i + 1}
              </option>
            ))}
          </select>
        </label>
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
            }>('/index', { scope: chosen });
            if (
              !controller.current?.signal.aborted &&
              document.visibilityState === 'visible'
            ) {
              indexScope.current = chosen;
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
    </section>
  );
}
