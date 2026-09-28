'use client';

import React, {
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import Link from 'next/link';
import { Actor, api, ApiError, apiUrl } from '../../app/lib/api';
import { ChatManagement, ReleasePanel, ReleaseList } from './chat-controls';
import { projectDomainLabel } from '../projects/project-domain-labels';

type Attachment = {
  id: string;
  originalFilename: string;
  origin: string;
  version: number;
};
type Message = {
  id: string;
  sequence: number;
  body: string;
  authorId: string;
  createdAt: string;
  attachments: Attachment[];
};
type Room = {
  id: string;
  title: string;
  group: string;
  audience: string;
  locked: boolean;
  grantId: string;
  actions: string[];
};
type RoomPage = {
  project: { id: string; name: string };
  rooms: Room[];
  authorityActions: string[];
};
type History = {
  locked: boolean;
  links: {
    task: {
      id: string;
      title: string;
      status: string;
      dueDate: string | null;
      assignees: { user: { displayName: string } }[];
    } | null;
    productLine: {
      id: string;
      code: string;
      lifecycleStatus: string;
      blocker: string | null;
      nextAction: string | null;
    } | null;
  };
  items: Message[];
  nextBefore: number | null;
  nextAfter: number | null;
  hasMore: boolean;
  viewerId: string;
  grantId: string;
  scopeToken: string;
};
// (History carries a digest of effective intervals; it is not an authorization token.)
const groups = [
  ['CONSULTING', 'Tư vấn & báo giá'],
  ['COMMERCIAL', 'Hợp đồng & tài chính'],
  ['SUPPLY', 'Cung ứng & giao hàng'],
  ['AFTER_SALES', 'Thi công & hậu mãi'],
] as const;
const denied = (error: unknown) =>
  error instanceof ApiError && [401, 403, 404, 412].includes(error.status);
export const mergeMessages = (before: Message[], incoming: Message[]) =>
  [...new Map([...before, ...incoming].map((m) => [m.id, m])).values()].sort(
    (a, b) => a.sequence - b.sequence,
  );

export function ChatComposer({
  value,
  disabled,
  reason,
  sending,
  onChange,
  onSubmit,
}: {
  value: string;
  disabled: boolean;
  reason: string;
  sending: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <form
      className="grid gap-2"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <label>
        Tin nhắn
        <textarea
          aria-label="Tin nhắn"
          className="w-full"
          rows={3}
          maxLength={8000}
          value={value}
          disabled={disabled || sending}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
      {reason && <p role="status">{reason}</p>}
      <button type="submit" disabled={disabled || sending || !value.trim()}>
        {sending ? 'Đang gửi…' : 'Gửi tin'}
      </button>
    </form>
  );
}

export function ProjectChatIndex() {
  const [projects, setProjects] = useState<{ id: string; name: string }[]>();
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    api<{ id: string; name: string }[]>('/project-chat/projects', {
      signal: controller.signal,
    })
      .then(setProjects)
      .catch((e) => {
        if (!controller.signal.aborted) setError((e as Error).message);
      });
    return () => controller.abort();
  }, []);
  return (
    <section className="panel grid gap-4">
      <h1 className="text-2xl">Làm việc trong dự án</h1>
      {error && <p role="alert">{error}</p>}
      {!projects && !error && <p>Đang kiểm tra quyền…</p>}
      {projects?.length === 0 && <p>Chưa có cuộc trao đổi được cấp quyền.</p>}
      {projects?.map((p) => (
        <Link className="underline" key={p.id} href={`/projects/${p.id}/work`}>
          {p.name}
        </Link>
      ))}
    </section>
  );
}

export function ProjectChat({ projectId }: { projectId: string }) {
  const [snapshot, setData] = useState<RoomPage>();
  const data = snapshot?.project.id === projectId ? snapshot : undefined;
  const [revision, setRevision] = useState(0);
  const [actor, setActor] = useState<Actor>();
  const [selected, setSelected] = useState('');
  const [group, setGroup] = useState('CONSULTING');
  const leaveGuardRef = useRef(() => true);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      api<Actor>('/me', { signal: controller.signal }),
      api<RoomPage>(`/project-chat/projects/${projectId}/rooms`, {
        signal: controller.signal,
      }),
    ])
      .then(([me, rooms]) => {
        if (controller.signal.aborted) return;
        setActor(me);
        setData(rooms);
        setError('');
      })
      .catch((e: Error) => {
        if (controller.signal.aborted) return;
        setData(undefined);
        setActor(undefined);
        setSelected('');
        setError(e.message);
      });
    return () => controller.abort();
  }, [projectId, revision]);
  const revoked = useCallback(() => {
    setSelected('');
    setData(undefined);
    setActor(undefined);
    setRevision((value) => value + 1);
  }, []);
  const room = data?.rooms.find((r) => r.id === selected);
  return (
    <section className="grid gap-4">
      <Link href="/work">← Các dự án được cấp</Link>
      <h1 className="text-2xl">{data?.project.name ?? 'Không gian dự án'}</h1>
      <nav aria-label="Hồ sơ dự án" className="flex flex-wrap gap-4">
        {actor?.permissions.includes('project.read') ? (
          <Link href={`/projects/${projectId}/stage-1`}>Tổng quan</Link>
        ) : (
          <span>Tổng quan — chưa được cấp</span>
        )}
        <strong aria-current="page">Làm việc</strong>
        {actor?.permissions.includes('project.read') ? (
          <Link href={`/projects/${projectId}/products`}>Hạng mục</Link>
        ) : (
          <span>Hạng mục — chưa được cấp</span>
        )}
        {actor?.permissions.includes('file.read') ? (
          <Link href={`/projects/${projectId}/files`}>Hồ sơ & kiến thức</Link>
        ) : (
          <span>Hồ sơ & kiến thức — xem file trong phòng được cấp</span>
        )}
      </nav>
      {error && <p role="alert">{error}</p>}
      {!data && !error && <p>Đang kiểm tra phạm vi…</p>}
      {data && (
        <>
          {actor &&
            data.authorityActions.some((a) =>
              ['CREATE', 'ACCESS_ADMIN'].includes(a),
            ) && (
              <ChatManagement
                key={`${projectId}/${actor.userId}`}
                projectId={projectId}
                actor={actor}
                actions={data.authorityActions}
                onChanged={() => setRevision((v) => v + 1)}
              />
            )}
          <nav aria-label="Nhóm chuyên môn" className="flex flex-wrap gap-2">
            {groups.map(([id, label]) => (
              <button
                key={id}
                aria-pressed={group === id}
                onClick={() => {
                  if (!leaveGuardRef.current()) return;
                  setGroup(id);
                  setSelected('');
                }}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="grid gap-4 md:grid-cols-[15rem_minmax(0,1fr)]">
            <aside
              className={room ? 'hidden md:block' : 'block'}
              aria-label="Cuộc trao đổi"
            >
              {data.rooms
                .filter((r) => r.group === group)
                .map((r) => (
                  <button
                    className="mb-2 block w-full text-left"
                    key={r.id}
                    onClick={() => {
                      if (r.id === selected || leaveGuardRef.current())
                        setSelected(r.id);
                    }}
                  >
                    {r.title}
                    <small className="block">
                      {r.audience === 'CUSTOMER'
                        ? 'Phòng khách/đối tác'
                        : 'Nội bộ Galaxy'}
                      {r.locked ? ' · Đã khóa' : ''}
                    </small>
                  </button>
                ))}
              {!data.rooms.some((r) => r.group === group) && (
                <p>Chưa có phòng được cấp trong nhóm này.</p>
              )}
            </aside>
            {room && actor ? (
              <ChatRoomView
                key={`${actor.userId}/${room.id}/${room.grantId}`}
                room={room}
                projectId={projectId}
                actor={actor}
                authorityActions={data.authorityActions}
                onRevoked={revoked}
                leaveGuardRef={leaveGuardRef}
                onBack={() => {
                  if (leaveGuardRef.current()) setSelected('');
                }}
              />
            ) : (
              <p>Chọn một cuộc trao đổi để làm việc.</p>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function ChatRoomView({
  projectId,
  room,
  actor,
  authorityActions,
  onRevoked,
  onBack,
  leaveGuardRef,
}: {
  projectId: string;
  room: Room;
  actor: Actor;
  authorityActions: string[];
  onRevoked: () => void;
  onBack: () => void;
  leaveGuardRef: React.RefObject<() => boolean>;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [releases, setReleases] = useState<ReleaseList>({
    published: [],
    pending: [],
  });
  const [draft, setDraft] = useState('');
  const [locked, setLocked] = useState(room.locked);
  const [links, setLinks] = useState<History['links']>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [more, setMore] = useState(false);
  const [attachment, setAttachment] = useState<Attachment>();
  const [failed, setFailed] = useState(false);
  const [hasUpload, setHasUpload] = useState(false);
  const alive = useRef(true),
    pane = useRef<HTMLDivElement>(null),
    cursor = useRef(0),
    before = useRef<number | null>(null);
  const pending = useRef<
    | {
        clientKey: string;
        body: string;
        attachmentIds: string[];
      }
    | undefined
  >(undefined);
  const upload = useRef<{ file: File; clientKey: string } | undefined>(
    undefined,
  );
  const aborts = useRef(new Set<AbortController>());
  const scopeToken = useRef<string | undefined>(undefined);
  const clear = useCallback(() => {
    alive.current = false;
    for (const a of aborts.current) a.abort();
    setMessages([]);
    setLinks(undefined);
    setReleases({ published: [], pending: [] });
    setDraft('');
    setAttachment(undefined);
    pending.current = undefined;
    upload.current = undefined;
    onRevoked();
  }, [onRevoked]);
  const accept = useCallback(
    (result: History) => {
      if (
        result.viewerId !== actor.userId ||
        result.grantId !== room.grantId ||
        (scopeToken.current && scopeToken.current !== result.scopeToken)
      ) {
        clear();
        return false;
      }
      scopeToken.current = result.scopeToken;
      if (alive.current) {
        setLinks(result.links);
        setLocked(result.locked);
      }
      return alive.current;
    },
    [actor.userId, room.grantId, clear],
  );
  useEffect(() => {
    alive.current = true;
    const activeAborts = aborts.current;
    let timer: ReturnType<typeof setTimeout>;
    let delay = 1500;
    const controller = new AbortController();
    aborts.current.add(controller);
    async function poll() {
      if (!alive.current) return;
      try {
        if (!document.hidden && navigator.onLine) {
          let next = true;
          while (next && alive.current && !document.hidden) {
            const first = cursor.current === 0;
            const result = await api<History>(
              `/project-chat/rooms/${room.id}/messages${first ? '' : `?after=${cursor.current}`}`,
              {
                signal: controller.signal,
                headers: { 'X-Chat-Actor': actor.userId },
              },
            );
            if (!accept(result)) return;
            const bottom =
              first ||
              Boolean(
                pane.current &&
                  pane.current.scrollHeight -
                    pane.current.scrollTop -
                    pane.current.clientHeight <
                    60,
              );
            setMessages((old) => mergeMessages(old, result.items));
            if (first) {
              before.current = result.nextBefore;
              setMore(result.hasMore);
              cursor.current = Math.max(
                0,
                ...result.items.map((m) => m.sequence),
              );
              next = false;
            } else {
              cursor.current = result.nextAfter ?? cursor.current;
              next = result.hasMore;
            }
            setReady(true);
            if (bottom)
              requestAnimationFrame(() => {
                if (alive.current && pane.current)
                  pane.current.scrollTop = pane.current.scrollHeight;
              });
          }
          delay = 1500;
          if (room.audience === 'CUSTOMER') {
            const value = await api<ReleaseList>(
              `/project-chat/rooms/${room.id}/releases`,
              {
                signal: controller.signal,
                headers: { 'X-Chat-Actor': actor.userId },
              },
            );
            if (alive.current) setReleases(value);
          }
        }
      } catch (e) {
        if (controller.signal.aborted) return;
        if (denied(e)) {
          clear();
          return;
        }
        setError('Không tải được tin mới. Đang thử lại…');
        delay = Math.min(30000, delay * 2);
      }
      if (alive.current) timer = setTimeout(() => void poll(), delay);
    }
    void poll();
    const auth = () => clear();
    const channel =
      typeof BroadcastChannel === 'undefined'
        ? undefined
        : new BroadcastChannel('galaxy-auth');
    if (channel) channel.onmessage = auth;
    window.addEventListener('galaxy-auth-changed', auth);
    return () => {
      alive.current = false;
      clearTimeout(timer);
      for (const a of activeAborts) a.abort();
      activeAborts.clear();
      window.removeEventListener('galaxy-auth-changed', auth);
      channel?.close();
    };
    // Scope changes remount this component using actor/room/grant identity.
  }, [room.id, room.grantId, room.audience, actor.userId, clear, accept]);
  useEffect(() => {
    const unsent = () =>
      Boolean(draft || attachment || upload.current || pending.current);
    const confirm = () =>
      !unsent() ||
      window.confirm(
        'Có nội dung chưa gửi. Rời phòng sẽ bỏ nháp trong tab này. Tiếp tục?',
      );
    leaveGuardRef.current = confirm;
    const warn = (e: BeforeUnloadEvent) => {
      if (unsent()) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    const navigate = (e: MouseEvent) => {
      const anchor = e.target instanceof Element ? e.target.closest('a') : null;
      if (
        !anchor ||
        anchor.target === '_blank' ||
        anchor.hasAttribute('download') ||
        e.ctrlKey ||
        e.metaKey ||
        e.shiftKey ||
        e.altKey
      )
        return;
      const url = new URL(anchor.href, location.href);
      if (url.pathname.startsWith('/api/') || url.href === location.href)
        return;
      if (!confirm()) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', warn);
    document.addEventListener('click', navigate, true);
    return () => {
      leaveGuardRef.current = () => true;
      window.removeEventListener('beforeunload', warn);
      document.removeEventListener('click', navigate, true);
    };
  }, [draft, attachment, leaveGuardRef]);
  async function older() {
    if (busy || !before.current) return;
    setBusy(true);
    const controller = new AbortController();
    aborts.current.add(controller);
    const height = pane.current?.scrollHeight ?? 0,
      top = pane.current?.scrollTop ?? 0;
    try {
      const result = await api<History>(
        `/project-chat/rooms/${room.id}/messages?before=${before.current}`,
        { signal: controller.signal },
      );
      if (!accept(result)) return;
      before.current = result.nextBefore;
      setMore(result.hasMore);
      setMessages((old) => mergeMessages(old, result.items));
      requestAnimationFrame(() => {
        if (alive.current && pane.current)
          pane.current.scrollTop = top + pane.current.scrollHeight - height;
      });
    } catch (e) {
      if (denied(e)) clear();
      else if (alive.current) setError('Không tải được lịch sử.');
    } finally {
      aborts.current.delete(controller);
      if (alive.current) setBusy(false);
    }
  }
  async function attach() {
    if (!upload.current || busy) return;
    setBusy(true);
    setError('');
    const controller = new AbortController();
    aborts.current.add(controller);
    const form = new FormData();
    form.append('clientKey', upload.current.clientKey);
    form.append('file', upload.current.file);
    try {
      const saved = await api<Attachment>(
        `/project-chat/rooms/${room.id}/files`,
        {
          method: 'POST',
          body: form,
          signal: controller.signal,
          headers: { 'X-Chat-Actor': actor.userId },
        },
      );
      if (alive.current) {
        setAttachment(saved);
        upload.current = undefined;
        setHasUpload(false);
      }
    } catch (e) {
      if (denied(e)) clear();
      else if (alive.current)
        setError('Upload chưa được xác nhận. Chọn Gửi file để thử lại.');
    } finally {
      aborts.current.delete(controller);
      if (alive.current) setBusy(false);
    }
  }
  async function send() {
    if (busy || !ready || locked || !room.actions.includes('SEND')) return;
    pending.current ??= {
      clientKey: crypto.randomUUID(),
      body: draft,
      attachmentIds: attachment ? [attachment.id] : [],
    };
    setBusy(true);
    setError('');
    const controller = new AbortController();
    aborts.current.add(controller);
    try {
      const sent = await api<Message>(
        `/project-chat/rooms/${room.id}/messages`,
        {
          method: 'POST',
          headers: { 'X-Chat-Actor': actor.userId },
          body: JSON.stringify(pending.current),
          signal: controller.signal,
        },
      );
      if (!alive.current) return;
      if (sent.authorId !== actor.userId) {
        clear();
        return;
      }
      setMessages((old) =>
        mergeMessages(old, [
          { ...sent, attachments: attachment ? [attachment] : [] },
        ]),
      );
      setDraft('');
      setAttachment(undefined);
      pending.current = undefined;
      setFailed(false);
    } catch (e) {
      if (denied(e)) clear();
      else if (alive.current) {
        setFailed(true);
        setError(
          'Chưa xác nhận gửi. Gửi lại giữ nguyên mã yêu cầu và nội dung.',
        );
      }
    } finally {
      aborts.current.delete(controller);
      if (alive.current) setBusy(false);
    }
  }
  const reason = locked
    ? 'Cuộc trao đổi đã khóa gửi'
    : !room.actions.includes('SEND')
      ? 'Bạn chỉ có quyền xem'
      : !ready
        ? 'Đang xác minh quyền và lịch sử'
        : '';
  return (
    <article className="panel min-w-0 grid gap-3">
      <button className="md:hidden" onClick={onBack}>
        ← Danh sách phòng
      </button>
      <h2 className="text-xl">{room.title}</h2>
      {actor.membershipKind !== 'EXTERNAL' && room.actions.includes('LOCK') && (
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              const saved = await api<{ locked: boolean }>(
                `/project-chat/rooms/${room.id}/lock`,
                {
                  method: 'POST',
                  headers: { 'X-Chat-Actor': actor.userId },
                  body: JSON.stringify({ locked: !locked }),
                },
              );
              if (alive.current) setLocked(saved.locked);
            } catch (e) {
              if (denied(e)) clear();
              else if (alive.current) setError((e as Error).message);
            } finally {
              if (alive.current) setBusy(false);
            }
          }}
        >
          {locked ? 'Mở lại gửi tin' : 'Khóa gửi tin'}
        </button>
      )}
      {(links?.task || links?.productLine) && (
        <details>
          <summary>Công việc & hạng mục liên quan</summary>
          {links.task && (
            <div>
              <Link href={`/tasks/${links.task.id}`}>{links.task.title}</Link>
              <p>
                {projectDomainLabel('status', links.task.status)} ·{' '}
                {links.task.assignees
                  .map((a) => a.user.displayName)
                  .join(', ') || 'Chưa phân công'}{' '}
                ·{' '}
                {links.task.dueDate
                  ? new Date(links.task.dueDate).toLocaleDateString('vi-VN')
                  : 'Chưa có hạn'}
              </p>
            </div>
          )}
          {links.productLine && (
            <div>
              <Link href={`/projects/${projectId}/products`}>
                {links.productLine.code}
              </Link>
              <p>
                {links.productLine.lifecycleStatus} ·{' '}
                {links.productLine.blocker} · {links.productLine.nextAction}
              </p>
            </div>
          )}
        </details>
      )}
      <p>
        {room.audience === 'CUSTOMER'
          ? 'Phòng khách/đối tác — tin nhắn không thay phê duyệt nghiệp vụ'
          : 'Nội bộ Galaxy'}
      </p>
      {error && <p role="alert">{error}</p>}
      {room.audience === 'CUSTOMER' && (
        <ReleasePanel
          roomId={room.id}
          actor={actor}
          canPrepare={
            actor.membershipKind !== 'EXTERNAL' &&
            room.actions.includes('UPLOAD')
          }
          canPublish={authorityActions.includes('PUBLISH')}
          canDownload={room.actions.includes('DOWNLOAD')}
          locked={locked}
          list={releases}
          onRevoked={clear}
        />
      )}
      <div
        ref={pane}
        className="max-h-[55vh] min-h-40 overflow-y-auto"
        aria-label="Lịch sử tin nhắn"
      >
        {more && (
          <button disabled={busy} onClick={() => void older()}>
            Tải tin cũ hơn
          </button>
        )}
        {messages.map((m) => (
          <div key={m.id} className="my-3 rounded border p-3">
            <small>
              {m.authorId === actor.userId
                ? 'Bạn'
                : `Thành viên ${m.authorId.slice(0, 8)}`}{' '}
              · {new Date(m.createdAt).toLocaleString('vi-VN')}
            </small>
            <p className="whitespace-pre-wrap break-words">{m.body}</p>
            {m.attachments.map((f) => (
              <p key={f.id}>
                {room.actions.includes('DOWNLOAD') ? (
                  <a
                    className="underline"
                    href={`${apiUrl}/project-chat/rooms/${room.id}/files/${f.id}/download`}
                  >
                    {f.originalFilename}
                  </a>
                ) : (
                  <span>{f.originalFilename} — chưa được cấp tải</span>
                )}
                {f.origin === 'EXTERNAL_UNCONFIRMED' && (
                  <small> · Nguồn khách, chưa được Galaxy xác nhận</small>
                )}
              </p>
            ))}
          </div>
        ))}
      </div>
      {room.actions.includes('UPLOAD') && !locked && (
        <div className="grid gap-2">
          <label>
            File đính kèm
            <input
              type="file"
              accept=".png,.jpg,.pdf,.txt"
              disabled={
                busy ||
                failed ||
                (room.audience === 'CUSTOMER' &&
                  actor.membershipKind !== 'EXTERNAL')
              }
              onChange={(e) => {
                const file = e.target.files?.[0];
                upload.current = file
                  ? { file, clientKey: crypto.randomUUID() }
                  : undefined;
                setHasUpload(Boolean(file));
                setAttachment(undefined);
              }}
            />
          </label>
          <button
            disabled={busy || failed || !hasUpload}
            onClick={() => void attach()}
          >
            Gửi file
          </button>
          {room.audience === 'CUSTOMER' &&
            actor.membershipKind !== 'EXTERNAL' && (
              <p>Hồ sơ nội bộ đi qua phần phát hành hai người ở trên.</p>
            )}
          {attachment && (
            <p>
              Đã lưu file: {attachment.originalFilename}; chưa gửi vào tin nhắn.
            </p>
          )}
        </div>
      )}
      <ChatComposer
        value={draft}
        disabled={Boolean(reason) || failed}
        reason={reason}
        sending={busy}
        onChange={setDraft}
        onSubmit={() => void send()}
      />
      {failed && (
        <button disabled={busy} onClick={() => void send()}>
          Gửi lại tin chưa xác nhận
        </button>
      )}
      {(draft || attachment) && (
        <small>Nháp chỉ giữ trong tab này, không còn sau tải lại trang.</small>
      )}
    </article>
  );
}
