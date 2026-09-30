'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../../app/lib/api';

type Source = {
  handle: string;
  label: string;
  version: string;
  provenance: string;
  startLine: number;
  endLine: number;
};
type Answer = {
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
      <p role="status">{aiStatusLabel(answer.status)}</p>
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
                  {source.label} · bản {source.version} · dòng{' '}
                  {source.startLine}–{source.endLine}
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

export function ProjectAi({
  projectId,
  actorId,
  group,
  onRevoked,
}: {
  projectId: string;
  actorId: string;
  group: string;
  onRevoked: () => void;
}) {
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
    sources: { id: string; label: string; status: string }[];
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
        conversationId?: string;
      }
    | undefined
  >(undefined);
  const base = `/project-chat/projects/${projectId}/ai`;
  const call = useCallback(
    <T,>(path = '', body?: object) =>
      api<T>(base + path, {
        signal: AbortSignal.any([
          ...(controller.current ? [controller.current.signal] : []),
          AbortSignal.timeout(body === undefined ? 15000 : 45000),
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
    [onRevoked],
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
    requestKey.current = undefined;
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
            call<{ provider: string; conversations: Conversation[] }>(),
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
                  sources: { id: string; label: string; status: string }[];
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
    [call, invalidate],
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
      }
    } finally {
      sending.current = false;
      if (!controller.current?.signal.aborted) {
        setBusy(false);
        await refresh();
      }
    }
  };
  const run = async (id: string) => {
    await call(`/answers/${id}/run`, {});
  };
  const ask = () =>
    act(async () => {
      const text = question.trim();
      if (!text) return;
      if (
        !requestKey.current ||
        requestKey.current.question !== text ||
        requestKey.current.scope !== scope
      )
        requestKey.current = {
          conversationKey: crypto.randomUUID(),
          clientKey: crypto.randomUUID(),
          question: text,
          scope,
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
        { clientKey: key.clientKey, question: key.question },
      );
      if (controller.current?.signal.aborted) return;
      setQuestion('');
      requestKey.current = undefined;
      await refresh();
      await run(answer.id);
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
          Chưa cấu hình API AI hoặc hạn mức. Bạn vẫn có thể lưu câu hỏi và xem
          lịch sử.
        </p>
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
              sources: { id: string; label: string; status: string }[];
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
                {item.label}: {aiStatusLabel(item.status)}
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
            void act(() => run(answer.id));
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
            Bản {source.version} · dòng {source.startLine}–{source.endLine} ·{' '}
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
        <button disabled={busy || !question.trim()}>
          {busy ? 'Đang tìm nguồn / xử lý…' : 'Hỏi AI'}
        </button>
      </form>
    </section>
  );
}
