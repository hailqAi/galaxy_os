'use client';
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { api, ApiError } from '../../app/lib/api';
import { createCommandKey } from '../../app/lib/create-command-key';

export type MemorySource = {
  kind: string;
  id: string;
  version: string;
  locator: Record<string, unknown>;
};
export type MemoryNote = {
  id: string;
  revisionId: string;
  version: number;
  visibility: string;
  kind: string;
  content: string | null;
  category: string | null;
  verification: string | null;
  provenance: { kind: string; editorId: string; createdAt: string } | null;
  sources: MemorySource[];
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
  sourceStatus?: 'SOURCE_UNAVAILABLE';
};
export type MemoryDraft = { content: string; source: MemorySource };
type Page = {
  items: MemoryNote[];
  nextCursor: string | null;
  canPublish?: boolean;
};
const categories = [
  ['NOTE', 'Ghi chú'],
  ['REQUIREMENT', 'Yêu cầu'],
  ['TECHNICAL', 'Thông số kỹ thuật'],
  ['DECISION', 'Thông tin quyết định'],
  ['ISSUE', 'Vấn đề tồn tại'],
];
const verified = (value: string | null) =>
  value === 'USER_CONFIRMED'
    ? 'Người dùng xác nhận ghi chú'
    : value === 'SOURCE_CONFIRMED'
      ? 'Đã đối chiếu nguồn'
      : 'Chưa xác minh';

export function MemoryCard({
  note,
  onSelect,
  disabled = false,
}: {
  note: MemoryNote;
  onSelect: () => void;
  disabled?: boolean;
}) {
  return (
    <article className="rounded border p-3 break-words">
      <button
        className="w-full text-left"
        onClick={onSelect}
        disabled={disabled}
      >
        <strong>
          {note.content === null
            ? 'Nguồn không còn khả dụng'
            : Array.from(note.content).slice(0, 160).join('')}
        </strong>
        <p className="chat-metadata">
          Bản {note.version} ·{' '}
          {note.visibility === 'PRIVATE' ? 'Riêng của tôi' : 'Dùng chung'} ·{' '}
          {verified(note.verification)}
        </p>
      </button>
    </article>
  );
}

type MemoryProps = {
  projectId: string;
  actorId: string;
  conversationId?: string;
  initialDraft?: MemoryDraft;
  onMemoryChanged?: () => void;
};
export function ProjectAiMemory(props: MemoryProps) {
  return (
    <MemorySession
      key={JSON.stringify([
        props.actorId,
        props.projectId,
        props.conversationId,
        props.initialDraft?.source.id,
      ])}
      {...props}
    />
  );
}
function MemorySession({
  projectId,
  actorId,
  conversationId,
  initialDraft,
  onMemoryChanged,
}: MemoryProps) {
  const [visibility, setVisibility] = useState<'PRIVATE' | 'SHARED'>('PRIVATE');
  const [items, setItems] = useState<MemoryNote[]>([]),
    [cursor, setCursor] = useState<string | null>(null);
  const [canPublish, setCanPublish] = useState(false),
    [loading, setLoading] = useState(true);
  const [query, setQuery] = useState(''),
    [search, setSearch] = useState('');
  const [note, setNote] = useState<MemoryNote>(),
    [revisions, setRevisions] = useState<Page>();
  const [editing, setEditing] = useState(!!initialDraft),
    [preview, setPreview] = useState(false);
  const [content, setContent] = useState(initialDraft?.content ?? ''),
    [category, setCategory] = useState('NOTE');
  const [verification, setVerification] = useState('UNVERIFIED');
  const [sources, setSources] = useState<MemorySource[]>(
    initialDraft ? [initialDraft.source] : [],
  );
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false);
  const [remove, setRemove] = useState(false);
  const [suspended, setSuspended] = useState(false);
  const draft = useRef({ editing, note, sources });
  useLayoutEffect(() => {
    draft.current = { editing, note, sources };
  }, [editing, note, sources]);
  const controller = useRef<AbortController | null>(null),
    reading = useRef(0),
    working = useRef(false);
  const command = useRef<{ payload: string; key: string } | undefined>(
      undefined,
    ),
    generation = useRef(0);
  const base = `/project-chat/projects/${projectId}/ai/memory`;
  const request = useCallback(
    <T,>(path = '', init?: RequestInit) =>
      api<T>(base + path, {
        ...init,
        headers: { 'X-Chat-Actor': actorId, ...init?.headers },
        signal: AbortSignal.any([
          ...(controller.current ? [controller.current.signal] : []),
          AbortSignal.timeout(15000),
        ]),
      }),
    [base, actorId],
  );
  const failed = useCallback((cause: unknown) => {
    if (controller.current?.signal.aborted) return;
    if (
      cause instanceof ApiError &&
      (cause.status === 401 || cause.status === 404)
    ) {
      setItems([]);
      setNote(undefined);
      setRevisions(undefined);
      setContent('');
      setEditing(false);
      setPreview(false);
    }
    setError(
      cause instanceof ApiError && cause.status === 409
        ? 'Phiên bản hoặc nguồn đã thay đổi. Bản nháp vẫn giữ; tải bản mới rồi đối chiếu trước khi lưu.'
        : cause instanceof ApiError && cause.status === 403
          ? 'Bạn chưa có quyền thực hiện thao tác này. Bản nháp vẫn giữ.'
          : 'Không đọc hoặc lưu được bộ nhớ. Kiểm tra quyền và thử lại.',
    );
  }, []);
  const load = useCallback(
    async (next?: string) => {
      const epoch = ++reading.current;
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams({
          visibility,
          limit: '20',
          ...(search ? { query: search } : {}),
          ...(next ? { cursor: next } : {}),
        });
        const result = await request<Page>('?' + params);
        if (controller.current?.signal.aborted || epoch !== reading.current)
          return;
        setItems((previous) =>
          next ? [...previous, ...result.items] : result.items,
        );
        setCursor(result.nextCursor);
        setCanPublish(result.canPublish === true);
        return true;
      } catch (cause) {
        if (epoch === reading.current) failed(cause);
      } finally {
        if (!controller.current?.signal.aborted && epoch === reading.current)
          setLoading(false);
      }
    },
    [request, visibility, search, failed],
  );
  useEffect(() => {
    const lifetime = new AbortController();
    controller.current = lifetime;
    const clear = (preserveDraft = false) => {
      ++reading.current;
      ++generation.current;
      setItems([]);
      setRevisions(undefined);
      setPreview(false);
      setSuspended(preserveDraft);
      if (!preserveDraft || !draft.current.editing) {
        setNote(undefined);
        setContent('');
        setEditing(false);
      }
    };
    const resume = async () => {
      const epoch = generation.current;
      if (
        !(await load()) ||
        lifetime.signal.aborted ||
        epoch !== generation.current
      )
        return;
      try {
        const current = draft.current;
        if (current.editing && current.note)
          await request<MemoryNote>('/' + current.note.id);
        else if (current.editing && current.sources.length) {
          const history = await api<{
            answers: { status: string; memorySource?: MemorySource }[];
          }>(
            `/project-chat/projects/${projectId}/ai/conversations/${conversationId}`,
            { headers: { 'X-Chat-Actor': actorId }, signal: lifetime.signal },
          );
          if (
            !current.sources.every((source) =>
              history.answers.some(
                (answer) =>
                  answer.status === 'COMPLETED' &&
                  answer.memorySource?.kind === source.kind &&
                  answer.memorySource.id === source.id &&
                  answer.memorySource.version === source.version,
              ),
            )
          )
            throw new ApiError('Nguồn không còn khả dụng', 404);
        }
        if (!lifetime.signal.aborted && epoch === generation.current)
          setSuspended(false);
      } catch (cause) {
        if (!lifetime.signal.aborted && epoch === generation.current)
          failed(cause);
      }
    };
    const visibilityChanged = () => {
      if (document.visibilityState === 'hidden') clear(true);
      else void resume();
    };
    const forget = () => clear();
    document.addEventListener('visibilitychange', visibilityChanged);
    window.addEventListener('galaxy-auth-changed', forget);
    const readingRef = reading,
      generationRef = generation;
    queueMicrotask(() => {
      if (!lifetime.signal.aborted) void load();
    });
    return () => {
      lifetime.abort();
      ++readingRef.current;
      ++generationRef.current;
      document.removeEventListener('visibilitychange', visibilityChanged);
      window.removeEventListener('galaxy-auth-changed', forget);
    };
  }, [load, request, failed, actorId, projectId, conversationId]);
  const choose = async (selected: MemoryNote) => {
    if (working.current) return;
    const epoch = ++reading.current;
    setError('');
    setNotice('');
    setEditing(false);
    setPreview(false);
    setRemove(false);
    setRevisions(undefined);
    setContent('');
    setNote(undefined);
    if (selected.content === null) {
      setNote(selected);
      return;
    }
    try {
      const result = await request<MemoryNote>('/' + selected.id);
      if (!controller.current?.signal.aborted && epoch === reading.current)
        setNote(result);
    } catch (cause) {
      if (epoch === reading.current) failed(cause);
    }
  };
  const edit = (current?: MemoryNote) => {
    ++reading.current;
    setLoading(false);
    setNote(current);
    setContent(current?.content ?? '');
    setCategory(current?.category ?? 'NOTE');
    setVerification(
      current?.verification === 'USER_CONFIRMED'
        ? 'USER_CONFIRMED'
        : 'UNVERIFIED',
    );
    setSources(current?.sources ?? []);
    setEditing(true);
    setPreview(false);
    setRemove(false);
    setRevisions(undefined);
    setNotice('');
    setError('');
    command.current = undefined;
  };
  const write = async (kind: 'SAVE' | 'PUBLISH' | 'INACTIVE') => {
    if (working.current) return;
    const epoch = generation.current,
      lifetime = controller.current;
    const update =
      !!note &&
      (kind === 'SAVE' || (kind === 'PUBLISH' && note.visibility === 'SHARED'));
    const payload =
      kind === 'INACTIVE'
        ? { expectedVersion: note!.version }
        : {
            content: content.trim(),
            category,
            verification,
            sourceRefs: sources,
            ...(update
              ? { expectedVersion: note!.version }
              : kind === 'PUBLISH'
                ? {
                    visibility: 'SHARED',
                    ...(note?.visibility === 'PRIVATE'
                      ? {
                          publishFrom: {
                            memoryId: note.id,
                            version: note.version,
                          },
                        }
                      : {}),
                  }
                : { visibility: 'PRIVATE' }),
          };
    const serialized = JSON.stringify([kind, note?.id ?? null, payload]);
    if (command.current?.payload !== serialized)
      command.current = { payload: serialized, key: createCommandKey() };
    working.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await request<MemoryNote>(
        kind === 'INACTIVE' || update ? '/' + note!.id : '',
        {
          method: kind === 'INACTIVE' ? 'DELETE' : update ? 'PATCH' : 'POST',
          body: JSON.stringify({ ...payload, clientKey: command.current.key }),
        },
      );
      if (lifetime?.signal.aborted || epoch !== generation.current) return;
      setNote(kind === 'INACTIVE' ? undefined : result);
      setEditing(false);
      setPreview(false);
      setRemove(false);
      setRevisions(undefined);
      setContent('');
      setNotice(
        kind === 'INACTIVE'
          ? 'Đã vô hiệu hóa. Lịch sử phiên bản và audit vẫn được giữ.'
          : kind === 'PUBLISH'
            ? 'Đã công bố ghi chú dùng chung theo quyền nguồn.'
            : 'Đã lưu ghi chú.',
      );
      onMemoryChanged?.();
      await load();
    } catch (cause) {
      if (!lifetime?.signal.aborted && epoch === generation.current)
        failed(cause);
    } finally {
      working.current = false;
      if (!lifetime?.signal.aborted) setBusy(false);
    }
  };
  const history = async (next?: string) => {
    if (!note) return;
    const epoch = ++reading.current;
    try {
      const result = await request<Page>(
        `/${note.id}/revisions?${new URLSearchParams({ limit: '10', ...(next ? { cursor: next } : {}) })}`,
      );
      if (!controller.current?.signal.aborted && epoch === reading.current)
        setRevisions((previous) => ({
          ...result,
          items: next
            ? [...(previous?.items ?? []), ...result.items]
            : result.items,
        }));
    } catch (cause) {
      if (epoch === reading.current) failed(cause);
    }
  };
  const reloadDraft = async () => {
    if (working.current) return;
    const epoch = generation.current,
      lifetime = controller.current;
    working.current = true;
    setBusy(true);
    try {
      const latest = note
        ? await request<MemoryNote>('/' + note.id)
        : undefined;
      if (lifetime?.signal.aborted || epoch !== generation.current) return;
      if (latest) {
        setNote(latest);
        setSources(latest.sources);
        setRevisions(undefined);
      }
      await load();
    } catch (cause) {
      if (!lifetime?.signal.aborted && epoch === generation.current)
        failed(cause);
    } finally {
      working.current = false;
      if (!lifetime?.signal.aborted) setBusy(false);
    }
  };
  if (suspended)
    return (
      <section aria-label="Quản lý bộ nhớ dự án">
        <p role="status">Đang kiểm tra lại quyền và nguồn bộ nhớ…</p>
        {error && <p role="alert">{error}</p>}
      </section>
    );
  return (
    <section aria-label="Quản lý bộ nhớ dự án" className="grid gap-3 min-w-0">
      <p>
        Ghi chú riêng chỉ thuộc bạn trong dự án này. Công bố dùng chung cần
        quyền và xác nhận; đây không phải phê duyệt nghiệp vụ.
      </p>
      <div className="flex flex-wrap gap-2" aria-label="Phạm vi bộ nhớ">
        {(['PRIVATE', 'SHARED'] as const).map((value) => (
          <button
            key={value}
            disabled={busy}
            aria-pressed={visibility === value}
            onClick={() => {
              setVisibility(value);
              setNote(undefined);
              setEditing(false);
              setPreview(false);
              setContent('');
              setRevisions(undefined);
              setItems([]);
              setCursor(null);
              setNotice('');
            }}
          >
            {value === 'PRIVATE' ? 'Riêng của tôi' : 'Dùng chung'}
          </button>
        ))}
      </div>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setSearch(query.trim());
        }}
      >
        <label className="flex-1 min-w-0">
          Tìm ghi chú
          <input
            className="w-full"
            value={query}
            maxLength={200}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <button disabled={busy}>Tìm</button>
      </form>
      <button disabled={busy} onClick={() => edit()}>
        ＋ Ghi chú riêng mới
      </button>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {loading && <p role="status">Đang đọc bộ nhớ…</p>}
      {items.map((item) => (
        <MemoryCard
          key={item.id}
          note={item}
          disabled={busy || loading}
          onSelect={() => void choose(item)}
        />
      ))}
      {!loading && !items.length && <p>Chưa có ghi chú được phép xem.</p>}
      {cursor && (
        <button disabled={busy || loading} onClick={() => void load(cursor)}>
          Xem thêm ghi chú
        </button>
      )}
      {note && !editing && (
        <section
          aria-label="Chi tiết ghi chú"
          className="rounded border p-3 grid gap-2 break-words"
        >
          <h3>
            Ghi chú · bản {note.version} ·{' '}
            {note.visibility === 'PRIVATE' ? 'Riêng của tôi' : 'Dùng chung'}
          </h3>
          {note.content === null ? (
            <p>
              Nguồn không còn khả dụng. Nội dung đã được ẩn; bạn có thể vô hiệu
              hóa ghi chú.
            </p>
          ) : (
            <>
              <p className="whitespace-pre-wrap">{note.content}</p>
              <p>
                {verified(note.verification)} ·{' '}
                {categories.find((c) => c[0] === note.category)?.[1]}
              </p>
              <p className="chat-metadata">
                {note.provenance?.kind === 'USER_INPUT'
                  ? 'Do người dùng nhập'
                  : 'Có nguồn liên quan'}{' '}
                · {new Date(note.updatedAt).toLocaleString('vi-VN')}
              </p>
              <ul>
                {note.sources.map((source) => (
                  <li key={JSON.stringify(source)}>
                    {source.kind} · bản {source.version} · nguồn {source.id}
                    {Object.keys(source.locator).length > 0
                      ? ` · ${JSON.stringify(source.locator)}`
                      : ''}
                  </li>
                ))}
              </ul>
              <button disabled={busy} onClick={() => void history()}>
                Lịch sử phiên bản
              </button>
              {note.canEdit && (
                <button disabled={busy} onClick={() => edit(note)}>
                  Sửa ghi chú
                </button>
              )}
              {canPublish &&
                note.canEdit &&
                note.visibility === 'PRIVATE' &&
                note.kind === 'NOTE' && (
                  <button
                    disabled={busy}
                    onClick={() => {
                      edit(note);
                      setPreview(true);
                    }}
                  >
                    Xem trước công bố dùng chung
                  </button>
                )}
            </>
          )}
          {note.canEdit && (
            <button disabled={busy} onClick={() => setRemove(true)}>
              Vô hiệu hóa ghi chú
            </button>
          )}
          {remove && (
            <aside>
              <p>
                Ngừng dùng ghi chú trong AI; không xóa lịch sử phiên bản và
                audit.
              </p>
              <button disabled={busy} onClick={() => void write('INACTIVE')}>
                Xác nhận vô hiệu hóa
              </button>
              <button disabled={busy} onClick={() => setRemove(false)}>
                Giữ ghi chú
              </button>
            </aside>
          )}
          {revisions && (
            <section aria-label="Các phiên bản ghi chú">
              {revisions.items.map((revision) => (
                <article
                  key={revision.revisionId}
                  className="rounded border p-2"
                >
                  <h4>
                    Bản {revision.version} · {verified(revision.verification)}
                  </h4>
                  <p className="whitespace-pre-wrap">{revision.content}</p>
                  <p className="chat-metadata">
                    Người cập nhật: {revision.provenance?.editorId} ·{' '}
                    {new Date(
                      revision.provenance?.createdAt ?? revision.updatedAt,
                    ).toLocaleString('vi-VN')}
                  </p>
                </article>
              ))}
              {revisions.nextCursor && (
                <button onClick={() => void history(revisions.nextCursor!)}>
                  Phiên bản trước
                </button>
              )}
            </section>
          )}
        </section>
      )}
      {editing && (
        <form
          aria-label="Soạn ghi chú"
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (note?.visibility === 'SHARED') setPreview(true);
            else void write('SAVE');
          }}
        >
          <label>
            Nội dung ghi chú
            <textarea
              className="w-full"
              required
              maxLength={8000}
              rows={6}
              value={content}
              disabled={busy}
              onChange={(event) => {
                setContent(event.target.value);
                setPreview(false);
              }}
            />
          </label>
          <label>
            Loại ghi chú
            <select
              value={category}
              disabled={busy}
              onChange={(event) => {
                setCategory(event.target.value);
                setPreview(false);
              }}
            >
              {categories.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Xác minh
            <select
              value={verification}
              disabled={busy}
              onChange={(event) => {
                setVerification(event.target.value);
                setPreview(false);
              }}
            >
              <option value="UNVERIFIED">Chưa xác minh</option>
              <option value="USER_CONFIRMED">
                Người dùng xác nhận ghi chú
              </option>
            </select>
          </label>
          {preview ? (
            <aside
              aria-label="Xem trước công bố"
              className="rounded border p-3 break-words"
            >
              <h3>Công bố dùng chung trong dự án này</h3>
              <p className="whitespace-pre-wrap">{content}</p>
              <p>
                {verified(verification)}. Người xem vẫn cần quyền đọc nguồn.
                Cuộc hội thoại riêng không được công bố.
              </p>
              <button
                type="button"
                disabled={busy || !content.trim() || !canPublish}
                onClick={() => void write('PUBLISH')}
              >
                Công bố
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setPreview(false)}
              >
                Quay lại bản nháp
              </button>
            </aside>
          ) : (
            <button disabled={busy || !content.trim()}>
              {note?.visibility === 'SHARED'
                ? 'Xem trước thay đổi dùng chung'
                : 'Lưu riêng'}
            </button>
          )}
          {canPublish && !note && !preview && (
            <button
              type="button"
              disabled={busy || !content.trim()}
              onClick={() => setPreview(true)}
            >
              Xem trước công bố dùng chung
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setEditing(false);
              setPreview(false);
              setContent('');
            }}
          >
            Hủy bản nháp
          </button>
          {error && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void reloadDraft()}
            >
              Tải bản mới, giữ bản nháp
            </button>
          )}
        </form>
      )}
      {conversationId && (
        <p className="chat-metadata">
          Ngữ cảnh hội thoại được giữ riêng; tóm tắt đã dùng nằm trong nguồn câu
          trả lời, không phải ghi chú dùng chung.
        </p>
      )}
    </section>
  );
}
